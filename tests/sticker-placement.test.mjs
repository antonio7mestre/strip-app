import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stickerPlacementInView } from "../app/lib/sticker-placement.ts";

const view = { canvasTop: -600, canvasWidth: 402, contentTop: -600, contentBottom: 1800, viewportTop: 0, viewportHeight: 754, dockTop: 690 };
test("new stickers center on the visible canvas, not a previously selected block", () => {
  const result = stickerPlacementInView(view);
  assert.equal(result.x, 50);
  assert.equal(result.y + view.canvasTop, 345);
  assert.equal(result.width * view.canvasWidth / 100, 132);
});
test("placement accounts for Safari panning and keeps a short strip within content", () => {
  assert.equal(stickerPlacementInView({ ...view, viewportTop: 40, dockTop: 700 }).y + view.canvasTop, 370);
  assert.equal(stickerPlacementInView({ ...view, contentBottom: 120 }).y + view.canvasTop, 120);
  assert.equal(stickerPlacementInView({ ...view, dockTop: undefined }).y + view.canvasTop, 377);
});
test("stickers cannot trigger toolbar reveal scrolling or inflate the editor canvas", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const focus = page.slice(page.indexOf("function focusSelectedBlockWithToolbar"), page.indexOf("function caretOffsetAtPoint"));
  assert.match(focus, /element\.matches\("\.sticker-block/);
  assert.match(page, /const canvasMinHeight = !isEditing && stickerFloor > 0/);
  assert.match(page, /stickerPlacementRef\.current = captureStickerPlacement\(\)/);
  assert.match(page, /stickerPlacementRef\.current \?\? captureStickerPlacement\(\)/);
});
