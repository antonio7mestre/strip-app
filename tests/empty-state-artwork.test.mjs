import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { emptyStateControlBounds } from "../app/lib/empty-state-guide.ts";

const source = readFileSync(new URL("../app/lib/empty-state-artwork.ts", import.meta.url), "utf8");
function harness() {
  const images = [], exports = {};
  class Image {
    naturalWidth = 100;
    constructor() { images.push(this); }
    decode() { return new Promise(resolve => { this.decoded = resolve; }); }
  }
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Image });
  return { ...exports, images };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("the lettering and arrow only appear together after both masks decode", async () => {
  const h = harness(); let ready = 0;
  h.watchEmptyStateArtwork("editor", () => ready++);
  assert.deepEqual(h.images.map(image => image.src), ["/empty-states/starting-block.png", "/landing/sticker-help-arrow.png"]);
  h.images[0].onload(); h.images[0].decoded(); await settle();
  assert.equal(ready, 0);
  h.images[1].onload(); await settle(); assert.equal(ready, 0);
  h.images[1].decoded(); await settle(); assert.equal(ready, 1);
});

test("cached navigation does not request or decode the artwork again", async () => {
  const h = harness(); let ready = 0;
  h.watchEmptyStateArtwork("editor", () => ready++);
  for (const image of h.images) { image.onload(); image.decoded(); }
  await settle();
  h.watchEmptyStateArtwork("editor", () => ready++); await settle();
  assert.equal(h.images.length, 2); assert.equal(ready, 2);
  h.watchEmptyStateArtwork("profile", () => ready++);
  assert.equal(h.images.length, 3); assert.equal(h.images[2].src, "/empty-states/create-strip.png");
});

test("unmount cancels the reveal and missing artwork never flashes one half", async () => {
  const h = harness(); let ready = 0;
  const stop = h.watchEmptyStateArtwork("editor", () => ready++);
  stop();
  for (const image of h.images) { image.onload(); image.decoded(); }
  await settle(); assert.equal(ready, 0);
  const missing = harness();
  missing.watchEmptyStateArtwork("editor", () => ready++);
  missing.images[0].onerror(); missing.images[1].onload(); missing.images[1].decoded();
  await settle(); assert.equal(ready, 0);
  missing.watchEmptyStateArtwork("editor", () => ready++);
  assert.equal(missing.images.length, 3, "failed assets can be retried on the next mount");
});

test("toolbar slide-in offsets do not move the guidance from its resting position", () => {
  const previousStyle = globalThis.getComputedStyle, previousMatrix = globalThis.DOMMatrixReadOnly;
  const dock = { transform: "dock" }, controls = { transform: "controls" };
  globalThis.getComputedStyle = surface => surface;
  globalThis.DOMMatrixReadOnly = class {
    constructor(transform) { this.m41 = transform === "controls" ? 8 : 0; this.m42 = transform === "dock" ? 88 : 12; }
  };
  try {
    const bounds = emptyStateControlBounds({ getBoundingClientRect: () => ({ left: 40, top: 700, width: 48, height: 48 }),
      closest: selector => selector === ".composer-dock" ? dock : controls });
    assert.deepEqual(bounds, { left: 32, top: 600, width: 48, height: 48 });
  } finally {
    if (previousStyle) globalThis.getComputedStyle = previousStyle; else delete globalThis.getComputedStyle;
    if (previousMatrix) globalThis.DOMMatrixReadOnly = previousMatrix; else delete globalThis.DOMMatrixReadOnly;
  }
});
