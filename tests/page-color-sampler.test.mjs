import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compositePagePixels, mediaSourcePoint } from "../app/lib/page-color-sampler.ts";

test("opaque stickers win over media and background underneath", () => {
  assert.equal(compositePagePixels([[255, 20, 100, 1], [0, 255, 0, 1]]), "#FF1464");
});
test("transparent sticker cutouts reveal underlying media", () => {
  assert.equal(compositePagePixels([[255, 0, 0, 0], [0, 80, 255, 1]]), "#0050FF");
  assert.equal(compositePagePixels([]), null);
});
test("translucent scrap tape blends with the visible color below", () => {
  assert.equal(compositePagePixels([[255, 0, 0, 0.5], [0, 0, 255, 1]]), "#800080");
  assert.equal(compositePagePixels([[255, 0, 0, 0.5], [0, 255, 0, 0.5], [0, 0, 255, 1]]), "#804040");
});
test("contained stickers respect aspect ratio and blank space", () => {
  assert.equal(mediaSourcePoint(50, 5, 100, 100, 200, 100, "contain"), null);
  assert.deepEqual(mediaSourcePoint(25, 50, 100, 100, 200, 100, "contain"), { x: 50, y: 50 });
});
test("covered and offset photos sample their visible crop, not their entire image", () => {
  assert.deepEqual(mediaSourcePoint(0, 50, 100, 100, 200, 100, "cover"), { x: 50, y: 50 });
  assert.deepEqual(mediaSourcePoint(0, 50, 100, 100, 200, 100, "cover", "100% 50%"), { x: 100, y: 50 });
  assert.equal(mediaSourcePoint(10, 10, 0, 100, 200, 100, "contain"), null);
});
test("top-aligned textures include the toolbar extension in the visible crop", () => {
  assert.deepEqual(mediaSourcePoint(10, 120, 320, 295, 160, 320, "cover", "50% 0%"), { x: 5, y: 60 });
  assert.deepEqual(mediaSourcePoint(10, 220, 320, 295, 160, 320, "cover", "50% 0%"), { x: 5, y: 110 });
});
test("shared sampler includes texture and canvas artwork, then checks text before backgrounds", () => {
  const source = readFileSync(new URL("../app/lib/page-color-sampler.ts", import.meta.url), "utf8");
  assert.match(source, /const ARTWORK = "[^"\n]*\.sticker-block canvas[^"\n]*\.text-block-texture/);
  assert.match(source, /element instanceof HTMLCanvasElement/);
  assert(source.indexOf("add(textPixel(element") < source.indexOf("add(backgroundPixel(getComputedStyle(element)"));
  assert.match(source, /const textPaints = new WeakMap<Text, TextPaint>/);
});
