import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type StoredBlock =
  | {
      id: string;
      type: "text";
      content: string;
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
    };

const OWNER_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function mediaPath(ownerId: string, stripId: string, blockId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/media/${encodeURIComponent(blockId)}?ownerId=${encodeURIComponent(ownerId)}`;
}

function coverPath(ownerId: string, stripId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/cover?ownerId=${encodeURIComponent(ownerId)}`;
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
  const ownerId = new URL(request.url).searchParams.get("ownerId") ?? "";
  const { id } = await context.params;
  if ((ownerId && !OWNER_PATTERN.test(ownerId)) || !ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = ownerId
    ? await env.DB.prepare(
        `SELECT id, owner_id, title, cover_kind, cover_color, cover_alt,
          content_json, published_at
         FROM strips
         WHERE id = ? AND owner_id = ?`,
      )
        .bind(id, ownerId)
        .first<{
          id: string;
          owner_id: string;
          title: string;
          cover_kind: "image" | "color";
          cover_color: string | null;
          cover_alt: string | null;
          content_json: string;
          published_at: number;
        }>()
    : await env.DB.prepare(
        `SELECT id, owner_id, title, cover_kind, cover_color, cover_alt,
          content_json, published_at
         FROM strips
         WHERE id = ?`,
      )
        .bind(id)
        .first<{
          id: string;
          owner_id: string;
          title: string;
          cover_kind: "image" | "color";
          cover_color: string | null;
          cover_alt: string | null;
          content_json: string;
          published_at: number;
        }>();
  if (!row) return new Response("Not found", { status: 404 });

  let storedBlocks: StoredBlock[] = [];
  try {
    const parsed = JSON.parse(row.content_json) as unknown;
    if (Array.isArray(parsed)) storedBlocks = parsed as StoredBlock[];
  } catch {
    storedBlocks = [];
  }

  let blocks = storedBlocks.flatMap((block) => {
    if (!block || !ID_PATTERN.test(block.id)) return [];
    if (block.type === "text") return [block];
    if (block.type !== "image" && block.type !== "video") return [];
    return [
      {
        id: block.id,
        type: block.type,
        src: mediaPath(row.owner_id, id, block.id),
        alt: block.alt ?? "",
      },
    ];
  });
  if (blocks.length === 0) {
    blocks =
      row.cover_kind === "image"
        ? [
            {
              id: `cover-${row.id}`,
              type: "image" as const,
              src: coverPath(row.owner_id, id),
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

  return Response.json({
    strip: {
      id: row.id,
      title: row.title,
      publishedAt: row.published_at,
      blocks,
    },
  });
}
