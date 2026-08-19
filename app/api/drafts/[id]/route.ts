import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type StoredDraftBlock =
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
    }
  | {
      id: string;
      type: "sticker";
      objectKey: string;
      alt: string;
      x: number;
      y: number;
      width: number;
    };

const OWNER_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function mediaPath(ownerId: string, draftId: string, blockId: string) {
  return `/api/drafts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(blockId)}?ownerId=${encodeURIComponent(ownerId)}`;
}

function readStoredBlocks(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredDraftBlock[]) : [];
  } catch {
    return [];
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerId = new URL(request.url).searchParams.get("ownerId") ?? "";
  const { id } = await context.params;
  if (!OWNER_PATTERN.test(ownerId) || !ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT id, title, content_json, created_at, updated_at
     FROM drafts
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, ownerId)
    .first<{
      id: string;
      title: string;
      content_json: string;
      created_at: number;
      updated_at: number;
    }>();
  if (!row) return new Response("Not found", { status: 404 });

  const blocks = readStoredBlocks(row.content_json).flatMap((block) => {
    if (!block || !ID_PATTERN.test(block.id)) return [];
    if (block.type === "text") return [block];
    if (
      block.type !== "image" &&
      block.type !== "video" &&
      block.type !== "sticker"
    ) return [];
    return [
      {
        id: block.id,
        type: block.type,
        src: mediaPath(ownerId, id, block.id),
        alt: block.alt ?? "",
        ...(block.type === "sticker"
          ? { x: block.x, y: block.y, width: block.width }
          : {}),
      },
    ];
  });

  return Response.json({
    draft: {
      id: row.id,
      title: row.title,
      blocks,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerId = new URL(request.url).searchParams.get("ownerId") ?? "";
  const { id } = await context.params;
  if (!OWNER_PATTERN.test(ownerId) || !ID_PATTERN.test(id)) {
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

  const objectKeys = readStoredBlocks(row.content_json).flatMap((block) =>
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
