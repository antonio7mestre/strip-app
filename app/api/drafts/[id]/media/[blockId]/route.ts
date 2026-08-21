import { env } from "cloudflare:workers";
import { readStripContent } from "@/app/lib/strip-ending";
import { requireAuthUser } from "@/app/server/auth";

export const dynamic = "force-dynamic";

type StoredMediaBlock = {
  id: string;
  type: "image" | "video" | "sticker";
  objectKey: string;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; blockId: string }> },
) {
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const ownerId = auth.user.id;
  const { id, blockId } = await context.params;
  if (
    !ID_PATTERN.test(id) ||
    !ID_PATTERN.test(blockId)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT content_json
     FROM drafts
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, ownerId)
    .first<{ content_json: string }>();
  if (!row) return new Response("Not found", { status: 404 });

  let mediaBlock: StoredMediaBlock | undefined;
  try {
    const { blocks } = readStripContent(row.content_json);
    mediaBlock = (blocks as StoredMediaBlock[]).find(
      (block) =>
        block &&
        block.id === blockId &&
        (block.type === "image" ||
          block.type === "video" ||
          block.type === "sticker") &&
        typeof block.objectKey === "string",
    );
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!mediaBlock) return new Response("Not found", { status: 404 });

  const object = await env.STRIP_MEDIA.get(mediaBlock.objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Cache-Control": "private, max-age=60",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
