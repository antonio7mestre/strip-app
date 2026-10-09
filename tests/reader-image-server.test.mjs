import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const nativeRequire = createRequire(import.meta.url);
const originalBytes = new Uint8Array(readFileSync(new URL("public/apple-messages.jpg", root)));
const helperPath = "app/server/reader-image.ts";
const constantsPath = "app/lib/reader-image.ts";

function loadModule(path, bindings = {}, mocks = {}) {
  const exports = {};
  const source = readFileSync(new URL(path, root), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Request, Response, Headers, URL, Blob, ReadableStream, Uint8Array,
    ArrayBuffer, TextEncoder, TextDecoder, crypto: globalThis.crypto, console,
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) return loadModule(`${specifier.slice(2)}.ts`, bindings, mocks);
      return nativeRequire(specifier);
    },
    ...bindings,
  }, { filename: path });
  return exports;
}

function sourceObject({ contentType = "image/jpeg", size = originalBytes.length,
  etag = '"source-a"', range, bytes = originalBytes, chunks } = {}) {
  const response = new Response(chunks ? new ReadableStream({
    start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); },
  }) : bytes);
  return {
    body: response.body, size, httpEtag: etag,
    httpMetadata: { contentType }, ...(range ? { range } : {}),
    arrayBuffer: () => response.arrayBuffer(),
    writeHttpMetadata(headers) { headers.set("Content-Type", contentType); },
  };
}

function fixture({ failTransform = false, failCache = false, outputStatus = 200 } = {}) {
  const entries = new Map(), keys = [], transforms = [], outputs = [], inputs = [];
  const cache = {
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      keys.push(key);
      if (failCache) throw new Error("Cache unavailable");
      return entries.get(key)?.clone();
    },
    async put(request, response) {
      if (failCache) throw new Error("Cache unavailable");
      entries.set(typeof request === "string" ? request : request.url, response.clone());
    },
  };
  const images = {
    input(stream) {
      const input = new Response(stream).arrayBuffer().then(value => new Uint8Array(value));
      inputs.push(input);
      return { transform(options) {
        transforms.push({ ...options });
        return { async output(options) {
          outputs.push({ ...options });
          await input;
          if (failTransform) throw new Error("Decode failed after reading the source");
          return { response: () => new Response("display-sized-webp", {
            status: outputStatus, headers: { "Content-Type": "image/webp" },
          }) };
        } };
      } };
    },
  };
  const bindings = { caches: { default: cache } };
  const constants = loadModule(constantsPath);
  const helper = loadModule(helperPath, bindings);
  const width = constants.READER_IMAGE_WIDTHS[1];
  const request = (query = `reader-version=${constants.READER_IMAGE_VERSION}&reader-width=${width}`,
    headers = {}) => new Request(`https://author.striiip.com/api/strips/strip-123/media/image-123?${query}`, { headers });
  const serve = (options = {}) => helper.serveReaderImage({
    request: request(), object: sourceObject(), width, scope: "public", images,
    loadOriginal: async () => sourceObject(), ...options,
  });
  return { ...helper, ...constants, width, request, serve, images, cache, keys, entries, transforms, outputs, inputs };
}

test("reader widths accept only the explicit recipe and permitted width buckets", () => {
  const h = fixture();
  for (const width of h.READER_IMAGE_WIDTHS) {
    assert.equal(h.readReaderImageWidth(h.request(`reader-version=${h.READER_IMAGE_VERSION}&reader-width=${width}`)), width);
  }
  for (const query of ["", `reader-width=${h.width}`, `reader-version=unknown&reader-width=${h.width}`,
    `reader-version=${h.READER_IMAGE_VERSION}`, `reader-version=${h.READER_IMAGE_VERSION}&reader-width=-1`,
    `reader-version=${h.READER_IMAGE_VERSION}&reader-width=NaN`, `reader-version=${h.READER_IMAGE_VERSION}&reader-width=999999`,
    `reader-version=${h.READER_IMAGE_VERSION}&reader-width=${h.width}.5`,
    `reader-version=${h.READER_IMAGE_VERSION}&reader-width=0${h.width}`]) {
    assert.equal(h.readReaderImageWidth(h.request(query)), null, query);
  }
});

test("a JPEG derivative consumes the whole source and preserves aspect ratio and automatic orientation", async () => {
  const h = fixture();
  const response = await h.serve();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "display-sized-webp");
  assert.deepEqual(await h.inputs[0], originalBytes);
  assert.deepEqual(h.transforms, [{ width: h.width, fit: "scale-down", metadata: "none" }]);
  assert.deepEqual(h.outputs, [{ format: "image/webp", quality: 88 }]);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("accept-ranges"), null);
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
});

test("repeat derivatives reuse cached output while source, width, owner, and host remain isolated", async () => {
  const h = fixture();
  const first = await h.serve();
  const initialEtag = first.headers.get("etag");
  await h.serve();
  assert.equal(h.transforms.length, 1, "a cache hit must not re-encode the source");
  const changedSource = await h.serve({ object: sourceObject({ etag: '"source-b"' }) });
  const changedWidth = await h.serve({ width: h.READER_IMAGE_WIDTHS[2] });
  const ownerA = await h.serve({ scope: "draft-owner-a", isPrivate: true });
  await h.serve({ scope: "draft-owner-b", isPrivate: true });
  await h.serve({ request: new Request(h.request().url.replace("author.striiip.com", "other.striiip.com")) });
  assert.equal(h.transforms.length, 6);
  assert.notEqual(changedSource.headers.get("etag"), initialEtag);
  assert.notEqual(changedWidth.headers.get("etag"), initialEtag);
  assert.equal(ownerA.headers.get("cache-control"), "private, max-age=60");
  assert.equal(new Set(h.keys).size, 6);
  assert.ok(h.keys.every(key => new URL(key).pathname.startsWith("/__strip-reader-image-cache/")));
  for (const response of h.entries.values()) {
    assert.match(response.headers.get("cache-control"), /public.*immutable/);
  }
});

test("unsupported, animated-capable, and oversized sources pass through completely without caching", async () => {
  for (const input of [
    { contentType: "image/gif" }, { contentType: "image/webp" },
    { contentType: "image/png" }, { contentType: "image/avif" },
    { contentType: "video/mp4" }, { size: 20_000_001 },
  ]) {
    const h = fixture();
    const response = await h.serve({ object: sourceObject(input) });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originalBytes);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("content-type"), input.contentType ?? "image/jpeg");
    assert.equal(h.transforms.length, 0);
    assert.equal(h.entries.size, 0);
  }
});

test("JPEG sniffing handles split stream chunks and does not transform a falsely labeled animation", async () => {
  const h = fixture();
  await h.serve({ object: sourceObject({ chunks: [
    originalBytes.slice(0, 1), originalBytes.slice(1, 2), originalBytes.slice(2),
  ] }) });
  assert.deepEqual(await h.inputs[0], originalBytes);
  const mislabeled = fixture();
  const bytes = new TextEncoder().encode("GIF89a-original-animation-bytes");
  const response = await mislabeled.serve({ object: sourceObject({ bytes, size: bytes.length }) });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(mislabeled.transforms.length, 0);
  assert.equal(mislabeled.entries.size, 0);
});

test("browser revalidation returns 304 only for the current source derivative", async () => {
  const h = fixture();
  const first = await h.serve();
  const etag = first.headers.get("etag");
  await first.arrayBuffer();
  const request = h.request(undefined, { "If-None-Match": etag });
  const unchanged = await h.serve({ request });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
  assert.equal(unchanged.headers.get("content-length"), null);
  assert.equal(h.transforms.length, 1);
  const replaced = await h.serve({ request, object: sourceObject({ etag: '"source-replaced"' }) });
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.headers.get("etag"), etag);
  assert.equal(await replaced.text(), "display-sized-webp");
});

test("cache-added range headers never leak into complete variants or 304 responses", async () => {
  const h = fixture();
  const first = await h.serve();
  const etag = first.headers.get("etag");
  await first.arrayBuffer();
  for (const cached of h.entries.values()) {
    cached.headers.set("Accept-Ranges", "bytes");
    cached.headers.set("Content-Range", "bytes 0-16/18");
  }
  const complete = await h.serve({ request: h.request(undefined, { Range: "bytes=0-16" }) });
  assert.equal(complete.status, 200);
  assert.equal(await complete.text(), "display-sized-webp");
  assert.equal(complete.headers.get("accept-ranges"), null);
  assert.equal(complete.headers.get("content-range"), null);
  const unchanged = await h.serve({ request: h.request(undefined, { "If-None-Match": etag }) });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("accept-ranges"), null);
  assert.equal(unchanged.headers.get("content-range"), null);
  assert.equal(h.transforms.length, 1);
});

test("a consumed or failed transform still returns every original byte and cannot poison the cache", async () => {
  for (const options of [{ failTransform: true }, { outputStatus: 503 }]) {
    const h = fixture(options);
    const response = await h.serve();
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originalBytes);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(h.entries.size, 0);
  }
});

test("an unavailable cache does not prevent a derivative from loading", async () => {
  const h = fixture({ failCache: true });
  const response = await h.serve();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "display-sized-webp");
});

test("a source removed during failed transformation returns an uncached 404", async () => {
  const h = fixture({ failTransform: true });
  const response = await h.serve({ loadOriginal: async () => null });
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

function routeFixture({ draft = false, cover = false, type = "image",
  authenticated = true, found = true, ranged = false } = {}) {
  const events = [], gets = [], served = [], binds = [];
  const h = fixture();
  const source = () => sourceObject(ranged
    ? { bytes: originalBytes.slice(0, 8), range: { offset: 0, length: 8 } }
    : {});
  const env = {
    DB: { prepare() { return { bind(...values) {
      binds.push(values);
      return { async first() {
        events.push("database");
        if (!found) return null;
        return cover ? { cover_kind: "image", cover_object_key: "cover-original" }
          : { content_json: JSON.stringify([{ id: "image-123", type, objectKey: "stored-original" }]) };
      } };
    } }; } },
    STRIP_MEDIA: { async get(key, options) {
      events.push("source"); gets.push({ key, options }); return source();
    } },
    IMAGES: h.images,
  };
  const mocks = {
    "cloudflare:workers": { env },
    "@/app/server/auth": { async requireAuthUser() {
      events.push("authentication");
      return authenticated ? { user: { id: "owner-a" } }
        : { user: null, response: new Response("Unauthorized", { status: 401 }) };
    } },
    "@/app/server/reader-image": {
      readReaderImageWidth: h.readReaderImageWidth,
      async serveReaderImage(options) {
        events.push("derivative"); served.push(options);
        return new Response("reader-derivative");
      },
    },
    "next/og": { ImageResponse: Response },
  };
  const path = cover ? "app/api/strips/[id]/cover/route.ts"
    : `app/api/${draft ? "drafts" : "strips"}/[id]/media/[blockId]/route.ts`;
  const route = loadModule(path, {}, mocks);
  const request = (query = `reader-version=${h.READER_IMAGE_VERSION}&reader-width=${h.width}`, headers = {}) =>
    new Request(`https://author.striiip.com/api/${draft ? "drafts" : "strips"}/strip-123/${cover ? "cover" : "media/image-123"}?${query}`, { headers });
  const get = (input = request()) => route.GET(input, {
    params: Promise.resolve({ id: "strip-123", blockId: "image-123" }),
  });
  return { ...h, get, request, events, gets, served, binds };
}

test("draft derivatives require authentication and an owned database record before any cached media lookup", async () => {
  const unauthenticated = routeFixture({ draft: true, authenticated: false });
  assert.equal((await unauthenticated.get()).status, 401);
  assert.deepEqual(unauthenticated.events, ["authentication"]);
  const missing = routeFixture({ draft: true, found: false });
  assert.equal((await missing.get()).status, 404);
  assert.deepEqual(missing.events, ["authentication", "database"]);
  assert.deepEqual(missing.binds, [["strip-123", "owner-a"]]);
  const owned = routeFixture({ draft: true });
  assert.equal(await (await owned.get()).text(), "reader-derivative");
  assert.deepEqual(owned.events, ["authentication", "database", "source", "derivative"]);
  assert.match(owned.served[0].scope, /owner-a/);
});

test("public media and cover derivatives check the current database record before cache handling", async () => {
  for (const cover of [false, true]) {
    const missing = routeFixture({ cover, found: false });
    assert.equal((await missing.get()).status, 404);
    assert.deepEqual(missing.events, ["database"]);
    const h = routeFixture({ cover });
    assert.equal(await (await h.get()).text(), "reader-derivative");
    assert.deepEqual(h.events, ["database", "source", "derivative"]);
    assert.match(h.served[0].scope, /^public-strip:strip-123:/);
    assert.equal(h.gets[0].options?.range, undefined, "the transformer receives an entire source object");
  }
});

test("sticker and video blocks ignore reader derivative parameters", async () => {
  for (const draft of [false, true]) {
    for (const type of ["sticker", "video"]) {
      const h = routeFixture({ draft, type });
      const response = await h.get();
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originalBytes);
      assert.equal(h.served.length, 0);
    }
  }
});

test("reader photo requests never transform partial source bytes even when a Range header is supplied", async () => {
  for (const draft of [false, true]) {
    const h = routeFixture({ draft });
    const response = await h.get(h.request(undefined, { Range: "bytes=0-7" }));
    assert.equal(await response.text(), "reader-derivative");
    assert.equal(h.gets[0].options?.range, undefined);
    assert.deepEqual(new Uint8Array(await new Response(h.served[0].object.body).arrayBuffer()), originalBytes);
  }
});

test("original photo requests preserve full bytes, cache policy, and byte-range responses", async () => {
  for (const draft of [false, true]) {
    const h = routeFixture({ draft });
    const response = await h.get(h.request(""));
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originalBytes);
    assert.equal(response.headers.get("etag"), '"source-a"');
    assert.equal(response.headers.get("cache-control"), draft
      ? "private, max-age=60" : "public, max-age=31536000, immutable");
    assert.equal(h.served.length, 0);
    const range = routeFixture({ draft, ranged: true });
    const partial = await range.get(range.request("", { Range: "bytes=0-7" }));
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("accept-ranges"), "bytes");
    assert.equal(partial.headers.get("content-range"), `bytes 0-7/${originalBytes.length}`);
    assert.equal(partial.headers.get("content-length"), "8");
    assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), originalBytes.slice(0, 8));
    assert.equal(range.gets[0].options.range.get("Range"), "bytes=0-7");
    assert.equal(range.served.length, 0);
  }
});
