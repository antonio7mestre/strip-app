import { READER_IMAGE_VERSION, READER_IMAGE_WIDTHS } from "@/app/lib/reader-image";
import { applyPublicMediaSecurityHeaders } from "@/app/server/media-security";

type MediaObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata(headers: Headers): void;
};

type Images = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; fit: "scale-down"; metadata: "none" }): {
      output(options: { format: "image/webp"; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

const MAX_TRANSFORM_BYTES = 20_000_000;
const INTERNAL_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function readReaderImageWidth(request: Request): number | null {
  const query = new URL(request.url).searchParams;
  if (query.get("reader-version") !== String(READER_IMAGE_VERSION)) return null;
  const value = query.get("reader-width");
  const width = Number(value);
  return value === String(width) && READER_IMAGE_WIDTHS.some((allowed) => allowed === width)
    ? width
    : null;
}

function browserResponse(response: Response, request: Request, isPrivate: boolean) {
  const headers = new Headers(response.headers);
  // Cache API hits may add range headers even though variants always return
  // their complete transformed body, independent of the incoming Range.
  headers.delete("Accept-Ranges");
  headers.delete("Content-Range");
  // The source can change without changing its public path. Revalidate against
  // the source-keyed internal cache instead of pinning a stale browser variant.
  headers.set("Cache-Control", isPrivate ? "private, max-age=60" : "public, max-age=0, must-revalidate");
  const etag = headers.get("ETag");
  const matches = request.headers.get("If-None-Match")?.split(",").map((value) => value.trim());
  if (etag && matches?.some((value) => value === etag || value === "*")) {
    void response.body?.cancel().catch(() => {});
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, { status: 200, headers });
}

function originalFallback(object: MediaObject, body = object.body) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  applyPublicMediaSecurityHeaders(headers);
  return new Response(body, { headers });
}

// Check the actual signature as well as the stored MIME type. This avoids
// flattening an animated upload that was given a JPEG filename or MIME type.
async function inspectJpeg(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const prefix: Uint8Array[] = [];
  const signature: number[] = [];
  let ended = false;
  while (signature.length < 3) {
    const part = await reader.read();
    if (part.done) { ended = true; break; }
    prefix.push(part.value);
    for (const byte of part.value) {
      signature.push(byte);
      if (signature.length === 3) break;
    }
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (prefix.length) { controller.enqueue(prefix.shift()!); return; }
      if (ended) { controller.close(); return; }
      const part = await reader.read();
      if (part.done) { ended = true; controller.close(); }
      else controller.enqueue(part.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { stream, isJpeg: signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff };
}

export async function serveReaderImage({ request, object, width, scope, images, loadOriginal, isPrivate = false }: {
  request: Request;
  object: MediaObject;
  width: number;
  scope: string;
  images: Images;
  loadOriginal: () => Promise<MediaObject | null>;
  isPrivate?: boolean;
}) {
  const contentType = object.httpMetadata?.contentType?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" || object.size > MAX_TRANSFORM_BYTES) return originalFallback(object);

  const key = new URL(request.url);
  key.pathname = `/__strip-reader-image-cache/${encodeURIComponent(scope)}/${encodeURIComponent(object.httpEtag)}/${READER_IMAGE_VERSION}/${width}`;
  key.search = "";
  const cacheRequest = new Request(key, { method: "GET" });
  const cache = typeof caches === "undefined" ? undefined : (caches as CacheStorage & { default?: Cache }).default;
  try {
    const cached = await cache?.match(cacheRequest);
    if (cached) {
      void object.body.cancel().catch(() => {});
      return browserResponse(cached, request, isPrivate);
    }
  } catch { /* Cache availability must not decide whether a photo is visible. */ }

  try {
    const source = await inspectJpeg(object.body);
    if (!source.isJpeg) return originalFallback(object, source.stream);
    // Images applies EXIF orientation before resizing. No manual rotation or
    // crop is needed, and scale-down preserves smaller originals' dimensions.
    const transformed = await images.input(source.stream)
      .transform({ width, fit: "scale-down", metadata: "none" })
      .output({ format: "image/webp", quality: 88 });
    const result = transformed.response();
    if (!result.ok) throw new Error("Reader image transform failed");
    const headers = new Headers(result.headers);
    headers.delete("Content-Range");
    headers.delete("Accept-Ranges");
    headers.delete("Content-Length");
    headers.set("Cache-Control", INTERNAL_CACHE_CONTROL);
    headers.set("ETag", `"reader-${READER_IMAGE_VERSION}-${width}-${object.httpEtag.replace(/^"|"$/g, "")}"`);
    applyPublicMediaSecurityHeaders(headers);
    const response = new Response(result.body, { headers });
    try { await cache?.put(cacheRequest, response.clone()); } catch { /* Serve even if the cache is full. */ }
    return browserResponse(response, request, isPrivate);
  } catch {
    // A failed streaming transform may have consumed its input. Refetch only
    // on that failure so fallback is the complete original, never a tail.
    const original = await loadOriginal();
    return original ? originalFallback(original) : new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
