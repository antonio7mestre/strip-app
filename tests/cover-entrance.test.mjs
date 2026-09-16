import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER_MOVE_MS, COVER_FADE_MS, coverEntranceLayout, coverProgressCells, fadeCoverEntrance } from "../app/lib/cover-entrance.ts";

test("portrait, landscape and square covers stay centered, uncropped, with room for the bar", () => {
  for (const [w, h, offset] of [[393, 714, 0], [402, 842, 0], [852, 393, 15], [1440, 900, 0]]) {
    for (const ratio of [0.2, 0.75, 1, 1.5, 5, NaN, 0]) {
      const box = coverEntranceLayout(w, h, offset, ratio);
      assert.ok(Math.abs(box.left + box.width / 2 - w / 2) < 0.01);
      assert.ok(Math.abs(box.top + box.height / 2 - offset - h / 2) < 0.01);
      assert.ok(box.top >= offset && box.left > 0);
      assert.ok(box.top + box.height + 36 < offset + h);
      assert.ok(box.width <= 320 && box.width < w);
      assert.ok(Math.abs(box.width / box.height - (ratio > 0 ? ratio : 1)) < 0.01);
    }
  }
});
test("the square bar is deterministic, monotonic and never full before real completion", () => {
  assert.equal(coverProgressCells(0), 0);
  assert.equal(coverProgressCells(50), 12);
  assert.equal(coverProgressCells(99), 23);
  assert.equal(coverProgressCells(100), 24);
  assert.equal(coverProgressCells(NaN), 0);
  assert.equal(coverProgressCells(-5), 0);
  for (let p = 1; p <= 100; p++) assert.ok(coverProgressCells(p) >= coverProgressCells(p - 1));
});
test("the final crossfade keeps its previous timing, is monotonic, and cleans up", () => {
  assert.equal(COVER_MOVE_MS, 620); assert.equal(COVER_FADE_MS, 650);
  let pending, done = 0;
  globalThis.requestAnimationFrame = callback => { pending = callback; return 7; };
  globalThis.cancelAnimationFrame = () => { pending = null; };
  const host = { dataset: {}, style: { opacity: "1" } };
  const cancel = fadeCoverEntrance(host, () => done++);
  try {
    pending(100); assert.equal(host.style.opacity, "1");
    pending(425); assert.equal(Number(host.style.opacity), 0.5);
    pending(750); assert.equal(host.style.opacity, "0"); assert.equal(done, 1);
    assert.equal(host.dataset.inkPhase, "fading");
    cancel(); assert.equal(pending, null);
  } finally { cancel(); delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
});
test("home click preserves a single portal and cannot navigate away or race a Back gesture", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const open = page.slice(page.indexOf("const openPublishedStrip ="), page.indexOf("const returnToLibraryFromPublished ="));
  assert.match(open, /getBoundingClientRect/);
  assert.match(open, /flushSync/);
  assert.match(open, /Promise.all/);
  assert.match(open, /openingCoverRequestRef.current !== controller/);
  assert.match(open, /signal: controller.signal/);
  assert.doesNotMatch(open, /location.assign|transitionToView/);
  assert.equal((page.match(/\{coverEntranceLayer\}/g) ?? []).length, 2);
  assert.equal((page.match(/<StripEntrance /g) ?? []).length, 1);
  assert.match(page, /openingCoverRequestRef.current\?\.abort\(\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.library-card.is-opening-cover \.library-cover\s*\{\s*visibility: hidden/);
  assert.match(css, /\.library-mode.is-opening-strip \.composer-dock\s*\{[\s\S]*?translate3d\(0, calc\(100%/);
});
