// Real Cloudflare runtime and local R2/D1. No production credentials or data.
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
async function fixture() {
  const bundle = await build({ bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
    absWorkingDir: root, external: ["cloudflare:workers"],
    stdin: { resolveDir: root, contents: `
      import { PUT, GET as media } from './app/api/drafts/[id]/media/[blockId]/route.ts';
      import { POST } from './app/api/drafts/route.ts';
      import { GET as draft, DELETE as removeDraft } from './app/api/drafts/[id]/route.ts';
      import { POST as publish } from './app/api/strips/route.ts';
      import { GET as published } from './app/api/strips/[id]/route.ts';
      import { GET as publishedMedia } from './app/api/strips/[id]/media/[blockId]/route.ts';
      import { GET as publishedCover } from './app/api/strips/[id]/cover/route.ts';
      import { POST as editPublished } from './app/api/strips/[id]/draft/route.ts';
      export default { fetch(request) {
        const parts = new URL(request.url).pathname.split('/');
        const context = { params: Promise.resolve({ id: parts[3], blockId: parts[5] }) };
        if (parts[2] === 'strips') {
          if (parts.length === 3) return publish(request);
          if (parts[4] === 'media') return publishedMedia(request, context);
          if (parts[4] === 'cover') return publishedCover(request, context);
          if (parts[4] === 'draft') return editPublished(request, context);
          return published(request, context);
        }
        if (parts.length === 3) return POST(request);
        if (request.method === 'DELETE') return removeDraft(request, context);
        return parts[4] === 'media' ? (request.method === 'PUT' ? PUT(request, context) : media(request, context)) : draft(request, context);
      } };
    ` },
    plugins: [{ name: "isolated-auth", setup(build) {
      // This fixture exercises stored image covers, not generated OG artwork.
      build.onResolve({ filter: /^next\/og$/ }, () => ({ path: "unused-og", namespace: "qa-og" }));
      build.onLoad({ filter: /.*/, namespace: "qa-og" }, () => ({ contents: `
        export class ImageResponse { constructor() { throw new Error('Generated cover outside this fixture'); } }
      ` }));
      build.onResolve({ filter: /^@\/app\/server\/auth$/ }, () => ({ path: "test-auth", namespace: "qa" }));
      build.onLoad({ filter: /.*/, namespace: "qa" }, () => ({ contents: `
        export const isSameOrigin = r => !r.headers.get('origin') || r.headers.get('origin') === new URL(r.url).origin;
        export const requireAuthUser = async r => r.headers.get('x-test-user')
          ? { user: { id: r.headers.get('x-test-user'), username: 'test-user' } }
          : { response: new Response('Unauthorized', { status: 401 }) };
        export const getAuthUser = async r => (await requireAuthUser(r)).user ?? null;
      ` }));
    } }],
  });
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"], r2Buckets: ["STRIP_MEDIA"], });
  const db = await mf.getD1Database("DB");
  await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE profiles (user_id TEXT, background TEXT, accent TEXT, font TEXT);
    CREATE TABLE drafts (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT, cover_block_id TEXT, content_json TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE strips (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT, cover_shape TEXT, cover_object_key TEXT, cover_alt TEXT, content_json TEXT, published_at INTEGER);
    INSERT INTO users VALUES ('owner-test', 'test-user');
    INSERT INTO profiles VALUES ('owner-test', '#304DFF', '#FFFFFF', 'letter');`);
  const request = (path, init = {}, user = "owner-test") => mf.dispatchFetch(`http://localhost${path}`, {
    ...init, headers: { ...(user ? { "x-test-user": user } : {}), origin: "http://localhost", ...init.headers },
  });
  return { mf, db, request };
}

test("real streaming R2 uploads: seven 20 MB files save, reload, range-read and publish without a giant JSON body", async () => {
  const f = await fixture();
  const urls = [];
  try {
    const original = new Uint8Array(20 * 1024 * 1024); original[0] = 17; original[original.length - 1] = 29;
    const blocks = [];
    for (let i = 0; i < 7; i++) {
      const src = URL.createObjectURL(new Blob([original], { type: "video/quicktime" })); urls.push(src);
      blocks.push({ id: `video-test-${i}`, type: "video", src, alt: `Video ${i}`, height: 640, cropTop: i, audioEnabled: true });
    }
    const exports = {}, requests = [], address = await f.mf.ready;
    runInNewContext(ts.transpileModule(readFileSync(resolve(root, "app/lib/draft-save.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, AbortController, setTimeout, clearTimeout, fetch: (url, options) => {
      if (url.startsWith("blob:")) return fetch(url);
      requests.push({ url, ...options });
      // Use HTTP, not dispatchFetch, so Blob length is supplied by the network
      // stack exactly as it is for a browser's forbidden Content-Length header.
      return fetch(new URL(url, address), { ...options, headers: {
        ...options.headers, origin: address.origin, "x-test-user": "owner-test",
      } });
    } });
    const queue = exports.createDraftSaveQueue();
    const input = { id: "videos-test", title: "Seven camera-roll videos", blocks };
    const saved = await queue.save(input);
    assert.equal(saved.draft.id, input.id);
    assert.equal(requests.filter(r => r.method === "PUT").length, 7);
    assert(requests.at(-1).body.length < 3000);
    await queue.save({ ...input, title: "Renamed" });
    assert.equal(requests.filter(r => r.method === "PUT").length, 7);
    const restored = (await (await f.request("/api/drafts/videos-test")).json()).draft;
    assert.deepEqual(restored.blocks.map(b => b.id), blocks.map(b => b.id));
    assert.equal(restored.blocks[6].cropTop, 6);
    const media = await f.request(restored.blocks[0].src, { headers: { Range: "bytes=0-15" } });
    assert.equal(media.status, 206); assert.equal(media.headers.get("content-range"), `bytes 0-15/${original.length}`);
    assert.equal(new Uint8Array(await media.arrayBuffer())[0], 17);
    assert.equal((await f.request(restored.blocks[0].src, {}, "other-test")).status, 404);
    const publish = await f.request("/api/strips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      id: "published-videos-test", draftId: "videos-test", title: "Seven videos", blocks: restored.blocks,
      cover: { kind: "color", color: "#304DFF", shape: "square" },
    }) });
    assert.equal(publish.status, 201, await publish.text());
  } finally { urls.forEach(url => URL.revokeObjectURL(url)); await f.mf.dispose(); }
});

test("old drafts and reopened publications hand posters durable media before deleting the draft", async () => {
  const f = await fixture();
  try {
    const id = "poster-draft-test", stripId = "poster-published-test";
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
    const input = [
      { id: "image-poster-test", type: "image", src: png, alt: "Cover", height: 510, cropTop: 12 },
      { id: "text-poster-test", type: "text", content: "Older draft", backgroundColor: "#3155FF", backgroundTexture: "17-indigo-denim", textAlign: "right" },
      { id: "sticker-poster-test", type: "sticker", src: png, mediaType: "image", alt: "Sticker", x: 52.3, y: 410.7, width: 61.2, rotation: 19.4 },
      { id: "video-poster-test", type: "video", src: "data:video/mp4;base64,AQIDBA==", alt: "Clip" },
    ];
    const post = (path, body) => f.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post("/api/drafts", { id, title: "Older draft", blocks: input })).status, 200);
    let draft = (await (await f.request(`/api/drafts/${id}`)).json()).draft;
    let previousCover, previousMedia;
    for (const [pass, publishedAt] of [1, 2].entries()) {
      if (pass) {
        assert.equal((await f.request(`/api/strips/${stripId}/draft`, { method: "POST" })).status, 201);
        draft = (await (await f.request(`/api/drafts/${stripId}`)).json()).draft;
        assert.equal(draft.publishedStripId, stripId);
      }
      assert.ok(draft.blocks.filter(b => b.src).every(b => b.src.startsWith("/api/drafts/")));
      assert.equal(draft.blocks[1].backgroundTexture, "17-indigo-denim");
      const response = await post("/api/strips", {
        id: stripId, draftId: draft.id, title: "Poster reliability", publishedAt,
        cover: { kind: "image", src: draft.blocks[0].src, alt: "Cover" }, blocks: draft.blocks,
      });
      assert.equal(response.status, pass ? 200 : 201);
      const fresh = (await response.json()).strip;
      assert.equal(fresh.viewerIsOwner, true);
      assert.equal(fresh.profileBackground, "#304DFF");
      assert.equal(fresh.blocks[0].cropTop, 12);
      assert.equal(fresh.blocks[1].backgroundTexture, "17-indigo-denim");
      assert.equal(fresh.blocks[2].rotation, 19.4);
      assert.equal(fresh.blocks[2].width, 61.2);
      assert.ok(fresh.blocks.every(b => !("objectKey" in b)));
      assert.ok(fresh.blocks.filter(b => b.src).every(b => b.src.startsWith(`/api/strips/${stripId}/media/`)));
      assert.equal((await f.request(`/api/drafts/${draft.id}`, { method: "DELETE" })).status, 204);
      assert.equal((await f.request(draft.blocks[0].src)).status, 404, "old poster source is now invalid");
      for (const src of [fresh.cover.src, ...fresh.blocks.filter(b => b.src).map(b => b.src)]) {
        const asset = await f.request(src);
        assert.ok(asset.ok, "every poster asset survives draft cleanup");
        assert.ok((await asset.arrayBuffer()).byteLength > 0);
      }
      const reloaded = (await (await f.request(`/api/strips/${stripId}`)).json()).strip;
      assert.deepEqual(reloaded.blocks, fresh.blocks, "first share and later share use the exact same committed content");
      assert.deepEqual(reloaded.cover, fresh.cover);
      if (pass) {
        assert.notEqual(fresh.cover.src, previousCover, "republishing invalidates the immutable cover cache");
        assert.notEqual(fresh.blocks[0].src, previousMedia, "republishing invalidates the media cache");
      }
      previousCover = fresh.cover.src; previousMedia = fresh.blocks[0].src;
    }
  } finally { await f.mf.dispose(); }
});

test("uploads enforce ownership, origin, file type and size; incomplete manifests cannot replace a saved draft", async () => {
  const f = await fixture();
  try {
    const path = "/api/drafts/secure-test/media/video-test", good = { method: "PUT", body: "video", headers: { "Content-Type": "video/quicktime", "Content-Length": "5" } };
    assert.equal((await f.request(path, good, null)).status, 401);
    assert.equal((await f.request(path, { ...good, headers: { ...good.headers, origin: "https://other.example" } })).status, 403);
    assert.equal((await f.request(path, { ...good, headers: { ...good.headers, "Content-Type": "image/svg+xml" } })).status, 415);
    const oversized = new Uint8Array(80 * 1024 * 1024 + 1);
    assert.equal((await f.request(path, { ...good, body: oversized, headers: { ...good.headers, "Content-Length": String(oversized.length) } })).status, 413);
    const text = { id: "text-test", type: "text", content: "Do not lose me" };
    const save = blocks => f.request("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "secure-test", blocks }) });
    assert.equal((await save([text])).status, 200);
    assert.equal((await f.request(path, good, "other-test")).status, 404);
    assert.equal((await save([text, { id: "video-test", type: "video", src: path }])).status, 409);
    const draft = (await (await f.request("/api/drafts/secure-test")).json()).draft;
    assert.equal(draft.blocks.length, 1); assert.equal(draft.blocks[0].content, text.content);
    assert.equal((await f.request(path, good)).status, 204);
    assert.equal((await save([text, { id: "video-test", type: "video", src: path }])).status, 200);
  } finally { await f.mf.dispose(); }
});
