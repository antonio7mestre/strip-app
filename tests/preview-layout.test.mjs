import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preparePreviewLayout } from "../app/lib/preview-layout.ts";

function fixture({ before = 1552, after = 1480, scroll = 700, viewport = 852 } = {}) {
  let natural = before, scrollY = scroll, clock = 0, id = 0;
  const frames = new Map(), classes = new Set();
  const footer = { style: { opacity: "" } };
  const boundary = { style: { height: `${before}px` } };
  const strip = { getBoundingClientRect: () => ({ height: natural }), querySelector: () => footer };
  const canvas = {
    style: { minHeight: "" },
    getBoundingClientRect: () => ({ height: Math.max(natural, parseFloat(canvas.style.minHeight) || 0) }),
    querySelector: () => strip,
    closest: () => ({ getBoundingClientRect: () => ({ bottom: canvas.getBoundingClientRect().height - scrollY }) }),
  };
  globalThis.document = {
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    timeline: { get currentTime() { return clock; } },
    querySelector: () => boundary,
  };
  globalThis.window = { innerHeight: viewport, get scrollY() { return scrollY; } };
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const paint = () => {
    // A document-positioned copy must not keep an obsolete scroll floor alive.
    const height = Math.max(canvas.getBoundingClientRect().height, parseFloat(boundary.style.height));
    scrollY = Math.min(scrollY, Math.max(0, height - viewport));
    return { height, y: scrollY, opacity: footer.style.opacity };
  };
  return {
    canvas, footer, boundary, classes, frames, paint,
    commit() { natural = after; },
    setNatural(value) { natural = value; },
    tick(time) {
      clock = time;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(time));
      return paint();
    },
    dispose() {
      delete globalThis.document; delete globalThis.window;
      delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    },
  };
}

for (const hz of [60, 120]) {
  test(`bottom preview settles continuously at ${hz} Hz without the initial scroll clamp`, () => {
    const f = fixture();
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      f.commit();
      assert.equal(f.paint().y, 700, "outgoing range survives the DOM commit");
      transition.start(true);
      assert.equal(f.paint().y, 700, "the first painted frame stays exactly in place");
      assert.equal(f.footer.style.opacity, "0");
      let last = 700;
      for (let t = 1000 / hz; t < 420; t += 1000 / hz) {
        const { y, opacity } = f.tick(t);
        assert.ok(y <= last && last - y < 10, `no abrupt jump: ${last} -> ${y}`);
        assert.ok(Number(opacity) >= 0 && Number(opacity) <= 1);
        last = y;
      }
      assert.equal(f.tick(420).y, 628);
      assert.equal(f.canvas.style.minHeight, "");
      assert.equal(f.footer.style.opacity, "");
      assert.equal(f.classes.size, 0);
      assert.equal(f.frames.size, 0);
      assert.equal(f.boundary.style.height, "1480px");
    } finally { transition.cancel(); f.dispose(); }
  });
}

test("mid-page previews never move the reader's scroll position", () => {
  const f = fixture({ scroll: 240 });
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit(); transition.start(true);
    for (const time of [0, 16, 100, 250, 420]) assert.equal(f.tick(time).y, 240);
  } finally { transition.cancel(); f.dispose(); }
});

test("short previews and returning editor clearance do not shrink their canvas", () => {
  for (const [before, after] of [[852, 852], [1480, 1552]]) {
    const f = fixture({ before, after, scroll: before - 852 });
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      f.commit(); transition.start(false);
      for (const time of [0, 16, 210, 420]) assert.equal(f.tick(time).y, before - 852);
      assert.equal(f.footer.style.opacity, "", "no entrance animation on exit");
    } finally { transition.cancel(); f.dispose(); }
  }
});

test("quick reversal starts at the current painted height and cancels stale frames", () => {
  const f = fixture();
  let current = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit(); current.start(true); f.tick(90);
    const before = f.canvas.getBoundingClientRect().height;
    const late = [...f.frames.values()][0];
    current = preparePreviewLayout(f.canvas, current, 420);
    assert.equal(f.canvas.getBoundingClientRect().height, before);
    f.setNatural(1552); current.start(false);
    const expected = f.canvas.style.minHeight;
    late(420);
    assert.equal(f.canvas.style.minHeight, expected);
    f.tick(510);
    assert.equal(f.frames.size, 0);
    assert.equal(f.classes.size, 0);
  } finally { current.cancel(); f.dispose(); }
});

test("route cleanup restores styles and prevents a late repaint", () => {
  const f = fixture();
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit(); transition.start(true);
    const late = [...f.frames.values()][0];
    transition.cancel(); late(180);
    assert.equal(f.canvas.style.minHeight, "");
    assert.equal(f.footer.style.opacity, "");
    assert.equal(f.classes.size, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(preparePreviewLayout(null, transition, 420), null);
  } finally { f.dispose(); }
});

test("layout reserve is prepared before every inline preview commit", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/prepareInlinePreviewLayout\(\);\s*flushSync/g) ?? []).length, 4);
  assert.match(source, /previewLayoutRef\.current\?\.start\(inlinePreview\)/);
  const helper = readFileSync(new URL("../app/lib/preview-layout.ts", import.meta.url), "utf8");
  assert.doesNotMatch(helper, /scrollTo|scrollBy|\.style\.transform|\.animate\(/,
    "layout settles natively without fighting touch or promoting the media");
});
