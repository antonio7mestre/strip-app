import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { STICKER_PACK } from "../app/lib/sticker-pack.ts";
import * as stickerOrigin from "../app/lib/sticker-origin.ts";
import * as stickerRotation from "../app/lib/sticker-rotation.ts";
import * as stickerSizing from "../app/lib/sticker-sizing.ts";

const root = new URL("../", import.meta.url);
function compile(source, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Uint8Array, URL, atob, btoa, ...globals });
  return exports;
}
const security = compile(readFileSync(new URL("app/server/media-security.ts", root), "utf8"));
function validator(route, name) {
  return compile(readFileSync(new URL(`app/api/${route}/route.ts`, root), "utf8") + `\nexports.validate = ${name};`, {
    require: (id) => id.endsWith("media-security") ? security : id.endsWith("sticker-origin") ? stickerOrigin : id.endsWith("sticker-rotation") ? stickerRotation : id.endsWith("sticker-sizing") ? stickerSizing : {},
  }).validate;
}
const draft = validator("drafts", "prepareDraftBlocks");
const publish = validator("strips", "prepareContentBlocks");
function client(fetch) {
  return compile(readFileSync(new URL("app/lib/sticker-upload.ts", root), "utf8"), {
    fetch, require: () => ({ STICKER_PACK }),
  }).prepareStickerUploads;
}
const sticker = (asset, index = 0) => ({
  id: `sticker-${index}`, type: "sticker", src: asset.src, alt: asset.name,
  mediaType: "image", stickerOrigin: "pack", x: 50, y: 520, width: 32,
  rotation: index % 2 ? -23.5 : 17.25,
});
const file = (src) => readFileSync(new URL(`public${src}`, root));
const imageResponse = (src) => new Response(file(src), { headers: { "Content-Type": "image/webp" } });

test("all pack cutouts save and publish through the real server validators", async () => {
  const prepare = client(async (src) => imageResponse(src));
  // Use category-sized batches, staying within the server's 100-block limit.
  for (let start = 0; start < STICKER_PACK.length; start += 20) {
    const original = STICKER_PACK.slice(start, start + 20).map(sticker);
    const uploaded = await prepare(original);
    assert.equal(draft("owner-qa", "draft-qa", original), null, "Reproduces the original rejection");
    const saved = draft("owner-qa", "draft-qa", uploaded);
    const published = publish("owner-qa", "strip-qa", "draft-qa", uploaded);
    assert.equal(saved.uploads.length, original.length);
    assert.equal(published.uploads.length, original.length);
    for (let i = 0; i < original.length; i++) {
      assert.ok(original[i].src.startsWith("/sticker-pack/"), "Editor source never changes");
      assert.equal(Buffer.compare(Buffer.from(saved.uploads[i].bytes), file(original[i].src)), 0);
      assert.equal(saved.storedBlocks[i].x, original[i].x);
      assert.equal(saved.storedBlocks[i].y, original[i].y);
      assert.equal(saved.storedBlocks[i].width, original[i].width);
      assert.equal(saved.storedBlocks[i].stickerOrigin, "pack");
      assert.equal(published.storedBlocks[i].stickerOrigin, "pack");
      assert.equal(saved.storedBlocks[i].rotation, original[i].rotation);
      assert.equal(published.storedBlocks[i].rotation, original[i].rotation);
    }
    const restored = original.map((block) => ({ ...block, src: `/api/drafts/draft-qa/media/${block.id}` }));
    const resaved = draft("owner-qa", "draft-qa", await prepare(restored));
    const republished = publish("owner-qa", "strip-qa", "draft-qa", await prepare(restored));
    assert.equal(resaved.uploads.length, 0);
    assert.equal(republished.copies.length, original.length);
    assert.deepEqual(Array.from(resaved.storedBlocks, block => block.rotation), original.map(block => block.rotation));
    assert.deepEqual(Array.from(republished.storedBlocks, block => block.rotation), original.map(block => block.rotation));
  }
});

test("repeated saves and duplicate stickers reuse the same small upload without touching photos", async () => {
  let calls = 0;
  const prepare = client(async (src) => { calls++; return imageResponse(src); });
  const photo = { id: "photo-qa", type: "image", src: "data:image/png;base64,AA==" };
  const video = { id: "video-qa", type: "sticker", src: "data:video/mp4;base64,AA==" };
  const blocks = [photo, video, sticker(STICKER_PACK[0]), sticker(STICKER_PACK[0], 1)];
  const result = await prepare(blocks);
  await prepare(blocks);
  assert.equal(calls, 1);
  assert.equal(result[0], photo);
  assert.equal(result[1], video);
  assert.equal(result[2].src, result[3].src);
});

test("enlarged frame stickers keep their exact editor width on both saving and publishing", async () => {
  const frame = STICKER_PACK.find(asset => asset.id === "instant-frame");
  assert.ok(frame);
  const prepare = client(async src => imageResponse(src));
  for (const width of [80.001, 86.625, 90, 92]) {
    const original = { ...sticker(frame), width };
    const uploaded = await prepare([original]);
    const saved = draft("owner-qa", "draft-qa", uploaded);
    const published = publish("owner-qa", "strip-qa", "draft-qa", uploaded);
    assert.equal(saved.storedBlocks[0].width, width, "autosave must not shrink a frame");
    assert.equal(published.storedBlocks[0].width, width, "publishing must not shrink a frame");
    assert.equal(Buffer.compare(Buffer.from(published.uploads[0].bytes), file(frame.src)), 0, "the cutout pixels and aspect ratio are unchanged");
  }
});

test("failed downloads can retry, invalid responses are rejected and arbitrary URLs are never fetched", async () => {
  let calls = 0;
  const prepare = client(async (src) => ++calls === 1 ? new Response("offline", { status: 503 }) : imageResponse(src));
  const blocks = [sticker(STICKER_PACK[0])];
  await assert.rejects(prepare(blocks));
  assert.match((await prepare(blocks))[0].src, /^data:image\/webp;base64,/);
  const external = [{ ...blocks[0], src: "https://example.com/sticker.webp" }];
  assert.equal((await prepare(external))[0], external[0]);
  assert.equal(calls, 2);
  await assert.rejects(client(async () => new Response("<html>oops</html>", { headers: { "Content-Type": "text/html" } }))(blocks));
});

test("draft autosave, legacy migration and publishing all prepare pack media", () => {
  const page = readFileSync(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /prepareStickerUploads\(legacyBlocks\)/);
  assert.match(page, /prepareStickerUploads\(blocks\)\.then/);
  assert.match(page, /const uploadBlocks = await prepareStickerUploads\(blocks\)/);
  assert.equal((page.match(/blocks: uploadBlocks/g) ?? []).length, 3);
});

test("saving and publishing preserve valid sticker origins and ignore unrecognized ones", () => {
  for (const value of ["upload", "pack", "shape", undefined, "invalid", { type: "pack" }]) {
    const block = { ...sticker(STICKER_PACK[0]), src: "data:image/png;base64,AA==", stickerOrigin: value };
    const expected = stickerOrigin.normalizeStickerOrigin(value);
    assert.equal(draft("owner-qa", "draft-qa", [block]).storedBlocks[0].stickerOrigin, expected);
    assert.equal(publish("owner-qa", "strip-qa", null, [block]).storedBlocks[0].stickerOrigin, expected);
  }
});

test("legacy bundled sources gain pack provenance before upload without changing the editor source", async () => {
  const prepare = client(async src => imageResponse(src));
  const original = { ...sticker(STICKER_PACK[0]), stickerOrigin: undefined };
  const [uploaded] = await prepare([original]);
  assert.equal(uploaded.stickerOrigin, "pack");
  assert.equal(original.stickerOrigin, undefined);
  assert.equal(original.src, STICKER_PACK[0].src);
});
