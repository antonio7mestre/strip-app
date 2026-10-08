import { env } from "cloudflare:workers";
import { normalizeStickerOrigin, type StickerOrigin } from "@/app/lib/sticker-origin";
import { normalizeStickerRotation } from "@/app/lib/sticker-rotation";
import { readStripContent } from "@/app/lib/strip-ending";
import { getAuthUser } from "@/app/server/auth";
import { recordStripView } from "@/app/server/view-history";
import { publishedProfileTheme } from "@/app/lib/profile";

export const dynamic = "force-dynamic";

type StoredBlock =
  | {
      id: string;
      type: "text";
      content: string;
      height?: number;
      cropTop?: number;
      cropBottom?: number;
      backgroundColor?: string;
      textColor?: string;
      fontStyle?: string;
      fontSize?: number;
      editedAt?: number;
    }
  | {
      id: string;
      type: "image" | "video";
      objectKey: string;
      alt: string;
      height?: number;
      cropTop?: number;
      cropBottom?: number;
      audioEnabled?: boolean;
      hasAudio?: boolean;
    }
  | {
      id: string;
      type: "sticker";
      objectKey: string;
      alt: string;
      mediaType?: "image" | "video";
      stickerOrigin?: StickerOrigin;
      x: number;
      y: number;
      width: number;
      rotation?: number;
    };

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function mediaPath(stripId: string, blockId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/media/${encodeURIComponent(blockId)}`;
}

function coverPath(stripId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/cover`;
}

function textColorForBackground(color: string) {
  const match = /^#([0-9A-F]{6})$/i.exec(color);
  if (!match) return "#FFFFFF";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155
    ? "#050505"
    : "#FFFFFF";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
      `SELECT s.id, s.owner_id, s.title, s.cover_kind, s.cover_color,
        s.cover_shape, s.cover_alt, s.content_json, s.published_at, u.username,
        p.background AS profile_background, p.accent AS profile_accent, p.font AS profile_font
       FROM strips s
       LEFT JOIN users u ON u.id = s.owner_id
       LEFT JOIN profiles p ON p.user_id = s.owner_id
       WHERE s.id = ?`,
    )
      .bind(id)
      .first<{
          id: string;
          owner_id: string;
          title: string;
          cover_kind: "image" | "color";
          cover_color: string | null;
          cover_shape: "portrait" | "square" | "landscape" | null;
          cover_alt: string | null;
          content_json: string;
          published_at: number;
          username: string | null;
          profile_background: string | null;
          profile_accent: string | null;
          profile_font: string | null;
      }>();
  if (!row) return new Response("Not found", { status: 404 });
  // Published content is public by ID on every app host. The reader and its
  // metadata enforce vanity-URL ownership; a viewer's workspace also needs
  // to load other authors' public Strips for history and story posters.
  const viewer = await getAuthUser(request);
  if (viewer) {
    try {
      await recordStripView(viewer.id, row.id);
    } catch {
      // History should never prevent a published Strip from opening.
    }
  }

  const storedContent = readStripContent(row.content_json);
  const storedBlocks = storedContent.blocks as StoredBlock[];

  let blocks: unknown[] = [];
  for (const block of storedBlocks) {
    if (!block || !ID_PATTERN.test(block.id)) continue;
    if (block.type === "text") {
      blocks.push(block);
      continue;
    }
    if (
      block.type !== "image" &&
      block.type !== "video" &&
      block.type !== "sticker"
    ) {
      continue;
    }
    blocks.push({
      id: block.id,
      type: block.type,
      src: mediaPath(id, block.id),
      alt: block.alt ?? "",
      ...("height" in block && typeof block.height === "number"
        ? { height: block.height }
        : {}),
      ...("cropTop" in block && typeof block.cropTop === "number"
        ? { cropTop: block.cropTop }
        : {}),
      ...("cropBottom" in block && typeof block.cropBottom === "number"
        ? { cropBottom: block.cropBottom }
        : {}),
      ...(block.type === "video"
        ? {
            audioEnabled: block.audioEnabled !== false,
            ...(typeof block.hasAudio === "boolean"
              ? { hasAudio: block.hasAudio }
              : {}),
          }
        : {}),
      ...(block.type === "sticker"
        ? {
            mediaType: block.mediaType === "video" ? "video" : "image",
            stickerOrigin: normalizeStickerOrigin(block.stickerOrigin),
            x: block.x,
            y: block.y,
            width: block.width,
            rotation: normalizeStickerRotation(block.rotation),
          }
        : {}),
    });
  }
  if (blocks.length === 0) {
    blocks =
      row.cover_kind === "image"
        ? [
            {
              id: `cover-${row.id}`,
              type: "image" as const,
              src: coverPath(id),
              alt: row.cover_alt ?? "Strip cover",
            },
          ]
        : [
            {
              id: `cover-${row.id}`,
              type: "text" as const,
              content: row.title || "Untitled",
              backgroundColor: row.cover_color ?? "#2147D9",
              textColor: textColorForBackground(row.cover_color ?? "#2147D9"),
              fontStyle: "sans",
              fontSize: 32,
            },
          ];
  }

  const authorTheme = publishedProfileTheme({
    background: row.profile_background, accent: row.profile_accent, font: row.profile_font,
  });
  return Response.json({
    strip: {
      id: row.id,
      username: row.username,
      viewerIsOwner: viewer?.id === row.owner_id,
      title: row.title,
      ...authorTheme,
      cover:
        row.cover_kind === "image"
          ? {
              kind: "image" as const,
              src: coverPath(id),
              alt: row.cover_alt ?? "Strip cover",
            }
          : {
              kind: "color" as const,
              color: row.cover_color ?? "#2147D9",
              shape:
                row.cover_shape === "portrait" || row.cover_shape === "landscape"
                  ? row.cover_shape
                  : "square",
            },
      publishedAt: row.published_at,
      blocks,
      endingStyle: storedContent.endingStyle,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
