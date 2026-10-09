import test from "node:test";
import assert from "node:assert/strict";
import { stickerHandleTransform } from "../app/lib/sticker-sizing.ts";

test("desktop handle scales and rotates from the initial center without cumulative drift", () => {
  const origin = { width: 30, rotation: 15, distance: 100, angle: 0 };
  assert.deepEqual(stickerHandleTransform(origin, 200, 0), { width: 60, rotation: 15 });
  assert.deepEqual(stickerHandleTransform(origin, 0, 150), { width: 45, rotation: 105 });
  assert.deepEqual(stickerHandleTransform(origin, 100, 0), { width: 30, rotation: 15 });
});

test("desktop handle respects existing resize bounds and wraps rotation", () => {
  const origin = { width: 30, rotation: 170, distance: 100, angle: 0 };
  assert.deepEqual(stickerHandleTransform(origin, 0, 1000), { width: 92, rotation: -100 });
  assert.deepEqual(stickerHandleTransform(origin, 0, 0), { width: 10, rotation: 170 });
  assert.equal(stickerHandleTransform(origin, 86.625, 0).width, 25.9875);
});
