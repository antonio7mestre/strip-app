import { env } from "cloudflare:workers";
import { readStripContent } from "@/app/lib/strip-ending";
import { isSameOrigin, requireAuthUser } from "@/app/server/auth";

export const dynamic = "force-dynamic";

type StoredDraftBlock =
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
      x: number;
      y: number;
      width: number;
    };

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function mediaPath(draftId: string, blockId: string) {
  return `/api/drafts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(blockId)}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const ownerId = auth.user.id;
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT d.id, d.title, d.content_json, d.created_at, d.updated_at,
       EXISTS(
         SELECT 1 FROM strips s
         WHERE s.id = d.id AND s.owner_id = d.owner_id
       ) AS updates_published_strip
     FROM drafts d
     WHERE d.id = ? AND d.owner_id = ?`,
  )
    .bind(id, ownerId)
    .first<{
      id: string;
      title: string;
      content_json: string;
      created_at: number;
      updated_at: number;
      updates_published_strip: number;
    }>();
  if (!row) return new Response("Not found", { status: 404 });

  const storedContent = readStripContent(row.content_json);
  const blocks: unknown[] = [];
  for (const block of storedContent.blocks as StoredDraftBlock[]) {
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
            x: block.x,
            y: block.y,
            width: block.width,
          }
        : {}),
    });
  }

  return Response.json({
    draft: {
      id: row.id,
      title: row.title,
      blocks,
      endingStyle: storedContent.endingStyle,
      publishedStripId: row.updates_published_strip ? row.id : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const ownerId = auth.user.id;
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT content_json
     FROM drafts
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, ownerId)
    .first<{ content_json: string }>();
  if (!row) return new Response(null, { status: 204 });

  const objectKeys = (
    readStripContent(row.content_json).blocks as StoredDraftBlock[]
  ).flatMap((block) =>
    block &&
    (block.type === "image" ||
      block.type === "video" ||
      block.type === "sticker")
      ? [block.objectKey]
      : [],
  );
  await env.DB.prepare("DELETE FROM drafts WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .run();
  await Promise.all(objectKeys.map((objectKey) => env.STRIP_MEDIA.delete(objectKey)));

  return new Response(null, { status: 204 });
}
