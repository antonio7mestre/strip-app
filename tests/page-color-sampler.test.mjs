import assert from "node:assert/strict";
import test from "node:test";
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
