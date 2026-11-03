import { env } from "cloudflare:workers";
import { readStripContent } from "@/app/lib/strip-ending";
import { isSameOrigin, requireAuthUser } from "@/app/server/auth";
import { isAllowedStoredMediaContentType } from "@/app/server/media-security";
import { readReaderImageWidth, serveReaderImage } from "@/app/server/reader-image";
import { LIBRARY_COVER_VERSION } from "@/app/lib/reader-image";

export const dynamic = "force-dynamic";

type StoredMediaBlock = {
  id: string;
  type: "image" | "video" | "sticker";
  objectKey: string;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

/** Upload one original file without parsing a batch of base64 JSON. The object
 * is private and cannot be read until an owned draft references this block. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; blockId: string }> },
) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const { id, blockId } = await context.params;
  if (!ID_PATTERN.test(id) || !ID_PATTERN.test(blockId)) {
    return Response.json({ error: "Invalid draft media." }, { status: 400 });
  }
  const existing = await env.DB.prepare("SELECT owner_id FROM drafts WHERE id = ?")
    .bind(id).first<{ owner_id: string }>();
  if (existing && existing.owner_id !== auth.user.id) {
    return Response.json({ error: "Draft not found." }, { status: 404 });
  }
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (!isAllowedStoredMediaContentType(contentType, "image") && !isAllowedStoredMediaContentType(contentType, "video")) {
    return Response.json({ error: "Choose a photo or video file." }, { status: 415 });
  }
  // Blob requests have a browser-supplied Content-Length. Require it so R2
  // receives a known-length stream and no unbounded body enters worker memory.
  const length = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(length) || length <= 0 || !request.body) {
    return Response.json({ error: "The file is empty or its size is missing." }, { status: 411 });
  }
  if (length > 80 * 1024 * 1024) {
    return Response.json({ error: "Each file must be under 80 MB." }, { status: 413 });
  }
  try {
    await env.STRIP_MEDIA.put(`drafts/${auth.user.id}/${id}/media/${blockId}`, request.body, {
      httpMetadata: { contentType },
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Couldn’t store this file. Please try again." }, { status: 503 });
  }
}

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

  const isCover = new URL(request.url).searchParams.get("reader-version") === LIBRARY_COVER_VERSION;
  const readerWidth = mediaBlock.type === "image" || (mediaBlock.type === "sticker" && isCover)
    ? readReaderImageWidth(request) : null;
  const object = await env.STRIP_MEDIA.get(mediaBlock.objectKey, readerWidth === null ? {
    range: request.headers,
  } : undefined);
  if (!object) return new Response("Not found", { status: 404 });

  if (readerWidth !== null) {
    return serveReaderImage({ request, object, width: readerWidth,
      scope: `draft:${ownerId}:${id}:media:${blockId}`, images: env.IMAGES, isPrivate: true,
      loadOriginal: () => env.STRIP_MEDIA.get(mediaBlock.objectKey),
    });
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
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
