import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { STICKER_PACK } from "../app/lib/sticker-pack.ts";
import { SHAPE_STICKERS } from "../app/lib/shape-stickers.ts";
import * as origin from "../app/lib/sticker-origin.ts";
import * as profile from "../app/lib/profile.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, URL, Response, require: name => {
    assert.ok(name in imports, `Missing test import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const { isCoverMedia } = compile("app/lib/cover-media.ts", {
  "./sticker-pack": { STICKER_PACK }, "./shape-stickers": { SHAPE_STICKERS },
});

test("every pack sticker and generated shape is excluded before and after its source is saved", () => {
  for (const asset of STICKER_PACK) {
    for (const src of [asset.src, "data:image/webp;base64,AA==", "/api/drafts/draft-qa/media/sticker-1", "/api/strips/strip-qa/media/sticker-1"]) {
      assert.equal(isCoverMedia({ type: "sticker", src, alt: asset.name }), false, `${asset.name}: legacy ${src}`);
      assert.equal(isCoverMedia({ type: "sticker", src, alt: "", stickerOrigin: "pack" }), false);
    }
  }
  for (const shape of SHAPE_STICKERS) {
    for (const src of ["data:image/png;base64,AA==", "/api/drafts/draft-qa/media/sticker-1"]) {
      assert.equal(isCoverMedia({ type: "sticker", src, alt: `${shape.name} shape` }), false);
      assert.equal(isCoverMedia({ type: "sticker", src, alt: "", stickerOrigin: "shape" }), false);
    }
  }
});

test("uploaded photos and photo stickers remain covers, including uploads with catalog-like filenames", () => {
  assert.equal(isCoverMedia({ type: "image", src: "/photo.jpg", alt: "Hummingbird" }), true);
  assert.equal(isCoverMedia({ type: "sticker", src: "/photo.jpg", alt: "My picnic" }), true);
  assert.equal(isCoverMedia({ type: "sticker", src: "/photo.jpg", alt: "Hummingbird", stickerOrigin: "upload" }), true);
  assert.equal(isCoverMedia({ type: "sticker", src: "/photo.jpg", alt: "Star shape", stickerOrigin: "upload" }), true);
  for (const type of ["text", "video"]) assert.equal(isCoverMedia({ type }), false);
  assert.equal(isCoverMedia({ type: "sticker", mediaType: "video", stickerOrigin: "upload" }), false);
});

test("draft and published reads retain the sticker's origin after storage URLs replace its source", async () => {
  const blocks = ["pack", "shape", "upload", undefined, "invalid"].map((stickerOrigin, index) => ({
    id: `sticker-${index}`, type: "sticker", alt: "Example", objectKey: `media/${index}`,
    mediaType: "image", stickerOrigin, x: 50, y: 400, width: 32,
  }));
  const row = { id: "draft-qa", owner_id: "owner-qa", title: "Test", content_json: "fixture", cover_kind: "color", cover_color: "#3155FF", username: "test" };
  const imports = {
    "cloudflare:workers": { env: { DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) } } },
    "@/app/lib/sticker-origin": origin,
    "@/app/lib/profile": profile,
    "@/app/lib/strip-ending": { readStripContent: () => ({ blocks }) },
    "@/app/server/auth": { requireAuthUser: async () => ({ user: { id: "owner-qa" } }), getAuthUser: async () => null },
    "@/app/lib/username": { usernameFromHostname: () => null },
    "@/app/server/view-history": {},
  };
  for (const path of ["app/api/drafts/[id]/route.ts", "app/api/strips/[id]/route.ts"]) {
    const api = compile(path, imports);
    const result = await (await api.GET(new Request("https://strip.local/api/test"), { params: Promise.resolve({ id: "draft-qa" }) })).json();
    const returned = (result.draft ?? result.strip).blocks;
    assert.deepEqual(returned.map(block => block.stickerOrigin), ["pack", "shape", "upload", undefined, undefined]);
    assert.equal(isCoverMedia(returned[0]), false);
    assert.equal(isCoverMedia(returned[1]), false);
    assert.equal(isCoverMedia(returned[2]), true);
  }
});

test("cover choices filter pack artwork while retaining custom covers, colors and valid selection fallback", () => {
  const page = read("app/page.tsx");
  assert.match(page, /const visualCoverBlocks = blocks\.filter\([\s\S]*?isCoverMedia\(block\)/);
  assert.match(page, /placeSticker\(sticker\.src, sticker\.name, "image", "pack"\)/);
  assert.match(page, /placeSticker\(source, `\$\{shape\.name\} shape`, "image", "shape"\)/);
  assert.match(page, /stickerOrigin: StickerOrigin = "upload"/);
  assert.match(page, /hasCoverImages = visualCoverBlocks\.length > 0 \|\| Boolean\(customCoverSrc\)/);
  assert.match(page, /selectedCover && availableCovers\.includes\(selectedCover\)/);
  assert.match(page, /key: "custom", kind: "image"/);
  assert.match(page, /\.\.\.coverColors\.map/);
  assert.match(read("app/api/strips/[id]/draft/route.ts"), /clonedBlocks\.push\(\{ \.\.\.block, objectKey \}\)/);
});
