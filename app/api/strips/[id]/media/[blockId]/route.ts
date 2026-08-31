import { env } from "cloudflare:workers";
import { readStripContent } from "@/app/lib/strip-ending";
import { applyPublicMediaSecurityHeaders } from "@/app/server/media-security";

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
  const { id, blockId } = await context.params;
  if (
    !ID_PATTERN.test(id) ||
    !ID_PATTERN.test(blockId)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT content_json
     FROM strips
     WHERE id = ?`,
  )
    .bind(id)
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

  const object = await env.STRIP_MEDIA.get(mediaBlock.objectKey, {
    range: request.headers,
  });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  applyPublicMediaSecurityHeaders(headers);
  if (object.range) {
    const range = object.range as {
      offset?: number;
      length?: number;
      suffix?: number;
    };
    const length = Math.min(
      object.size,
      range.suffix ?? range.length ?? object.size,
    );
    const offset = range.suffix
      ? Math.max(0, object.size - length)
      : Math.max(0, range.offset ?? 0);
    headers.set("Content-Length", String(length));
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}
