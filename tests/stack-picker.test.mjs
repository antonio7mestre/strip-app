import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { stackCardStyle, stackSwipeProgress, stackSwipeTarget } from "../app/lib/stack-picker.ts";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const cover = read("../app/page.tsx"), poster = read("../app/components/SharePosterPicker.tsx"), css = read("../app/globals.css");
const style = (position, dragProgress = 0) => stackCardStyle({ relativePosition: position, dragProgress,
  cardHeight: 400, cardWidth: 250, selectedHeight: 400, stageHeight: 500, centerPercent: 50 });

test("covers and posters share drag, release, card travel, scaling, and dimming implementations", () => {
  for (const source of [cover, poster]) for (const fn of ["stackSwipeProgress", "stackSwipeTarget", "stackCardStyle"]) {
    assert.match(source, new RegExp(`${fn}\\(`));
  }
  assert.match(css, /\.cover-option,\s*\.poster-option\s*\{\s*transition:\s*top 420ms cubic-bezier\(0.16, 1, 0.3, 1\)/);
  assert.match(css, /\.cover-card-stage.is-dragging \.cover-option,\s*\.poster-picker.is-dragging \.poster-option\s*\{\s*transition: none/);
});
test("the extracted cover geometry retains its exact keyframes and continuous interpolation", () => {
  assert.deepEqual(style(0), { top: "50%", opacity: 1, transform: "translate(-50%, -50%) scale(1)", zIndex: 3, "--cover-dim": 0 });
  assert.deepEqual(style(1), { top: "74%", opacity: .62, transform: "translate(-50%, -50%) scale(0.62)", zIndex: 2, "--cover-dim": .54 });
  assert.equal(style(-1).top, "26%");
  assert.equal(style(2).top, "82%");
  assert.equal(style(-2).top, "18%");
  const midway = style(0, .5);
  assert.equal(midway.top, "38%"); assert.equal(midway.opacity, .81); assert.equal(midway["--cover-dim"], .27);
  assert.equal(midway.transform, "translate(-50%, -50%) scale(0.81)");
  for (const width of [120, 220, 350, 560]) {
    const next = stackCardStyle({ relativePosition: 1, dragProgress: 0, cardHeight: 600, cardWidth: width, selectedHeight: 600, stageHeight: 800, centerPercent: 42 });
    assert.equal(next.transform, `translate(-50%, -50%) scale(${Math.min(.62, 220 / width)})`);
  }
});
test("short pulls spring back, committed pulls move one card, and both ends resist equally", () => {
  for (const count of [2, 10, 30]) {
    for (const delta of [-1000, -150, -36, -35, 0, 35, 36, 150, 1000]) {
      const index = Math.floor(count / 2), p = stackSwipeProgress(500, 500 - delta, index, count);
      assert.ok(Math.abs(p) <= .95);
      const target = stackSwipeTarget(index, p, count);
      assert.ok(target >= 0 && target < count && Math.abs(target - index) <= 1);
    }
    assert.equal(stackSwipeProgress(500, 650, 0, count), -.2);
    assert.equal(stackSwipeProgress(500, 350, count - 1, count), .2);
    assert.equal(stackSwipeTarget(0, -.95, count), 0);
    assert.equal(stackSwipeTarget(count - 1, .95, count), count - 1);
  }
  assert.equal(stackSwipeTarget(3, .2399, 10), 3);
  assert.equal(stackSwipeTarget(3, .24, 10), 4);
  assert.equal(stackSwipeTarget(3, -.24, 10), 2);
});
test("posters reuse cover dots and four corner marks without changing shared artwork", () => {
  assert.match(poster, /className="cover-pagination"/);
  assert.match(poster, /className=\{`cover-selection-corners/);
  for (const corner of ["top-left", "top-right", "bottom-right", "bottom-left"]) assert.match(poster, new RegExp(`className="is-${corner}"`));
  assert.match(poster, /aria-current=\{i === index \? "true" : undefined\}/);
  assert.match(poster, /onClick=\{\(\) => \{ cancel\(\); onSelect\(i\); \}\}/);
  assert.match(poster, /onLostPointerCapture=\{cancel\}/);
  assert.match(poster, /releasePointerCapture\(event.pointerId\)/);
  assert.doesNotMatch(read("../app/lib/share-posters.ts"), /cover-pagination|cover-selection-corners/);
});
