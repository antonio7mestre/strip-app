import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preparePreviewLayout } from "../app/lib/preview-layout.ts";

function fixture({ before = 1552, after = 1387, footerHeight = 93, scroll = 700, viewport = 852,
  initialPreview = false, initialOrigin = 0, initialWrapperTop = 0, originalMinimum = "", controlsOpacity = "", hasAnchor = true } = {}) {
  let contentHeight = before, footerVisible = initialPreview, scrollY = scroll, origin = initialOrigin, clock = 0, id = 0;
  let wrapperTop = initialWrapperTop;
  let stripPresent = true;
  const frames = new Map(), classes = new Set(), queries = [];
  const controls = { style: { opacity: controlsOpacity } };
  const footer = { style: { opacity: "" }, getBoundingClientRect: () => ({ height: footerHeight }) };
  const anchor = { isConnected: true, getBoundingClientRect: () => ({ top: origin - scrollY }) };
  const naturalHeight = () => contentHeight + (footerVisible ? footerHeight : 0);
  const boundary = { style: { height: `${wrapperTop + naturalHeight()}px` } };
  const strip = {
    getBoundingClientRect: () => ({ height: contentHeight }),
    querySelector: selector => {
      assert.equal(selector, ".strip-ending-card");
      return null; // The ending is a sibling, never part of the content height.
    },
  };
  const canvas = {
    style: { minHeight: originalMinimum },
    getBoundingClientRect: () => ({ top: wrapperTop - scrollY, height: Math.max(naturalHeight(), parseFloat(canvas.style.minHeight) || 0) }),
    querySelector: selector => {
      queries.push(selector);
      switch (selector) {
        case ".strip-canvas": return stripPresent ? strip : null;
        case ".strip-ending-card": return footerVisible ? footer : null;
        case ".strip-ending-card-inner": return footerVisible ? controls : null;
        case ".strip-block:not(.sticker-block)": return hasAnchor ? anchor : null;
        default: assert.fail(`Unexpected wrapper query: ${selector}`);
      }
    },
    closest: selector => {
      assert.equal(selector, ".editor-mode");
      return { getBoundingClientRect: () => ({ bottom: wrapperTop + canvas.getBoundingClientRect().height - scrollY }) };
    },
  };
  globalThis.document = {
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    timeline: { get currentTime() { return clock; } },
    querySelector: selector => { assert.equal(selector, ".preview-dock-boundary"); return boundary; },
  };
  globalThis.window = { innerHeight: viewport, get scrollY() { return scrollY; } };
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const paint = () => {
    // A document-positioned copy must not keep an obsolete scroll floor alive.
    const height = Math.max(wrapperTop + canvas.getBoundingClientRect().height, parseFloat(boundary.style.height));
    scrollY = Math.min(scrollY, Math.max(0, height - viewport));
    return { height, y: scrollY, opacity: controls.style.opacity, anchorTop: anchor.getBoundingClientRect().top };
  };
  return {
    canvas, strip, footer, controls, anchor, boundary, classes, frames, queries, paint,
    commit({ preview = true, height = after, originDelta = 0, wrapperDelta = 0 } = {}) {
      contentHeight = height;
      footerVisible = preview;
      origin += originDelta;
      wrapperTop += wrapperDelta;
    },
    scrollBy(delta) { scrollY += delta; },
    removeStrip() { stripPresent = false; },
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
  test(`bottom preview settles continuously at ${hz} Hz with its sibling footer included`, () => {
    const f = fixture();
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      f.commit();
      assert.equal(transition.rebase(), 0);
      assert.equal(f.paint().y, 700, "outgoing range survives the DOM commit");
      transition.start(true);
      assert.equal(f.paint().y, 700, "the first painted frame stays exactly in place");
      assert.equal(f.controls.style.opacity, "0");
      assert.equal(f.footer.style.opacity, "", "the opaque footer and corner surface never fade");
      let last = 700;
      for (let t = 1000 / hz; t < 420; t += 1000 / hz) {
        const { y, opacity } = f.tick(t);
        assert.ok(y <= last && last - y < 10, `no abrupt jump: ${last} -> ${y}`);
        assert.ok(Number(opacity) >= 0 && Number(opacity) <= 1);
        last = y;
      }
      assert.equal(f.tick(420).y, 628);
      assert.equal(f.canvas.style.minHeight, "");
      assert.equal(f.controls.style.opacity, "");
      assert.equal(f.classes.size, 0);
      assert.equal(f.frames.size, 0);
      assert.equal(f.boundary.style.height, "1480px", "1387px content plus the 93px sibling ending");
      assert.equal(f.strip.querySelector(".strip-ending-card"), null);
      assert.ok(f.queries.includes(".strip-ending-card-inner"));
    } finally { transition.cancel(); f.dispose(); }
  });
}

test("mid-page previews never move the reader's scroll position", () => {
  const f = fixture({ scroll: 240 });
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit(); transition.rebase(); transition.start(true);
    for (const time of [0, 16, 100, 250, 420]) assert.equal(f.tick(time).y, 240);
  } finally { transition.cancel(); f.dispose(); }
});

for (const [label, safeTop, originDelta] of [["desktop", 0, 0], ["Safari fallback inset", 0, 62], ["Safari reported safe area", 62, 124]]) {
  test(`${label}: rebase uses the measured text origin with env(safe-area-inset-top) ${safeTop}px`, () => {
    const f = fixture();
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      const originalTop = f.paint().anchorTop;
      f.commit({ height: 1387 + originDelta, originDelta });
      const measured = transition.rebase();
      assert.equal(measured, originDelta, "includes the actual margin and padding shift, not merely the configured inset");
      assert.equal(f.canvas.style.minHeight, `${1552 + originDelta}px`);
      assert.equal(f.boundary.style.height, `${1552 + originDelta}px`);
      f.scrollBy(measured); // The page's handoff restores the saved visible text position.
      assert.equal(f.paint().y, 700 + originDelta, "the grown reserve accepts the rebased bottom position without clamping");
      assert.equal(f.paint().anchorTop, originalTop);
      assert.equal(transition.rebase(), 0, "the origin adjustment is applied once");
      transition.start(true);
      assert.equal(f.paint().y, 700 + originDelta);
      assert.equal(f.paint().anchorTop, originalTop);
      assert.equal(f.tick(420).y, 628 + originDelta);
      assert.equal(f.boundary.style.height, `${1480 + originDelta}px`);
    } finally { transition.cancel(); f.dispose(); }
  });
}

test("independent wrapper movement holds the exact rebased document bottom without double-counting", () => {
  for (const [originDelta, wrapperDelta] of [[124, 62], [0, 62], [62, -31]]) {
    const f = fixture({ initialWrapperTop: 31, initialOrigin: 50, scroll: 731 });
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      const before = f.paint();
      assert.equal(before.height, 1583);
      f.commit({ height: 1387 + originDelta - wrapperDelta, originDelta, wrapperDelta });
      assert.equal(transition.rebase(), originDelta, "the caller receives the full content-origin displacement");
      assert.equal(f.canvas.style.minHeight, `${1552 + originDelta - wrapperDelta}px`, "wrapper movement is not also added to its own height");
      assert.equal(f.boundary.style.height, `${before.height + originDelta}px`, "held document bottom moves exactly as far as the content anchor");
      f.scrollBy(originDelta);
      assert.equal(f.paint().y, 731 + originDelta);
      assert.equal(f.paint().anchorTop, before.anchorTop);
      assert.equal(f.paint().height - f.paint().y, 852, "bottom position has neither a clamp nor excess temporary range");
      transition.start(true);
      assert.equal(f.paint().height, before.height + originDelta);
      assert.equal(f.paint().anchorTop, before.anchorTop);
      const settled = f.tick(420);
      assert.equal(settled.height, 1511 + originDelta);
      assert.equal(settled.y, 659 + originDelta);
      assert.equal(f.canvas.style.minHeight, "");
    } finally { transition.cancel(); f.dispose(); }
  }
});

test("independent user scrolling is not mistaken for a document-origin change", () => {
  const f = fixture({ scroll: 240, initialOrigin: 25 });
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit({ height: 1449, originDelta: 62 });
    f.scrollBy(80);
    assert.equal(transition.rebase(), 62, "viewport top plus current scroll measures only layout displacement");
    assert.equal(f.paint().y, 320, "the helper itself never writes the scroll position");
    transition.start(true);
    assert.equal(f.tick(420).y, 320);
  } finally { transition.cancel(); f.dispose(); }
});

test("short reader content settles to content plus footer, without forcing a viewport floor", () => {
  const f = fixture({ before: 852, after: 200, scroll: 0 });
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit(); transition.rebase(); transition.start(true);
    assert.equal(f.paint().height, 852, "only the temporary outgoing reserve is initially held");
    const middle = f.tick(210);
    assert.ok(middle.height < 852 && middle.height > 293);
    assert.equal(middle.y, 0);
    assert.equal(f.tick(420).height, 293);
    assert.equal(f.canvas.style.minHeight, "");
    assert.equal(f.boundary.style.height, "293px");
  } finally { transition.cancel(); f.dispose(); }
});

test("exiting a text-first preview rebases negatively and retains editor clearance without fading", () => {
  for (const originDelta of [0, 62, 124]) {
    const f = fixture({ before: 1387 + originDelta, initialPreview: true, initialOrigin: originDelta, scroll: 628 + originDelta });
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      const originalTop = f.paint().anchorTop;
      f.commit({ preview: false, height: 1552, originDelta: -originDelta });
      const measured = transition.rebase();
      assert.equal(measured, originDelta ? -originDelta : 0);
      f.scrollBy(measured);
      transition.start(false);
      for (const time of [0, 16, 210, 420]) {
        const state = f.tick(time);
        assert.equal(state.y, 628);
        assert.equal(state.height, 1552);
        assert.equal(state.anchorTop, originalTop);
      }
      assert.equal(f.controls.style.opacity, "", "exiting does not animate reader controls");
      assert.equal(f.canvas.style.minHeight, "");
      assert.equal(f.boundary.style.height, "1552px");
    } finally { transition.cancel(); f.dispose(); }
  }
});

test("quick reversal captures the current painted height and cancels stale frames and rebases", () => {
  const f = fixture();
  let current = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit({ height: 1449, originDelta: 62 });
    f.scrollBy(current.rebase()); current.start(true); f.tick(90);
    const before = f.canvas.getBoundingClientRect().height;
    const stale = current;
    const late = [...f.frames.values()][0];
    current = preparePreviewLayout(f.canvas, current, 420);
    assert.equal(f.canvas.getBoundingClientRect().height, before);
    assert.equal(f.controls.style.opacity, "", "previous controls are restored before the new handoff");
    f.commit({ preview: false, height: 1552, originDelta: -62 });
    assert.equal(current.rebase(), -62);
    f.scrollBy(-62); current.start(false);
    const expected = f.canvas.style.minHeight;
    assert.equal(stale.rebase(), 0);
    late(420);
    assert.equal(f.canvas.style.minHeight, expected);
    f.tick(510);
    assert.equal(f.canvas.style.minHeight, "");
    assert.equal(f.frames.size, 0);
    assert.equal(f.classes.size, 0);
    assert.equal(f.boundary.style.height, "1552px");
  } finally { current.cancel(); f.dispose(); }
});

test("missing or detached flow anchors produce no origin compensation", () => {
  for (const hasAnchor of [false, true]) {
    const f = fixture({ hasAnchor });
    const transition = preparePreviewLayout(f.canvas, null, 420);
    try {
      f.commit({ height: 1449, originDelta: 62 });
      f.anchor.isConnected = false;
      assert.equal(transition.rebase(), 0);
      assert.equal(f.canvas.style.minHeight, "1552px");
      transition.start(true);
      f.tick(420);
      assert.equal(f.canvas.style.minHeight, "");
    } finally { transition.cancel(); f.dispose(); }
  }
});

test("route cleanup restores preexisting styles and rejects every late callback", () => {
  const f = fixture({ originalMinimum: "777px", controlsOpacity: "0.35" });
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.commit({ height: 1449, originDelta: 62 }); transition.rebase(); transition.start(true);
    const late = [...f.frames.values()][0];
    transition.cancel(); late(180);
    assert.equal(transition.rebase(), 0);
    transition.start(true);
    assert.equal(f.canvas.style.minHeight, "777px");
    assert.equal(f.controls.style.opacity, "0.35");
    assert.equal(f.footer.style.opacity, "");
    assert.equal(f.classes.size, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(preparePreviewLayout(null, transition, 420), null);
  } finally { f.dispose(); }
});

test("a missing content canvas cancels the reserve without scheduling animation", () => {
  const f = fixture();
  const transition = preparePreviewLayout(f.canvas, null, 420);
  try {
    f.removeStrip(); transition.start(true);
    assert.equal(f.canvas.style.minHeight, "");
    assert.equal(f.classes.size, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(transition.rebase(), 0);
  } finally { transition.cancel(); f.dispose(); }
});

test("layout reserve precedes each commit and rebases before the reader handoff starts", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/prepareInlinePreviewLayout\(\);\s*flushSync/g) ?? []).length, 4);
  assert.match(source, /stripCanvasRef\.current\?\.parentElement \?\? null/);
  assert.match(source, /previewLayoutRef\.current\?\.start\(inlinePreview\)/);
  const rebase = source.indexOf("previewLayoutRef.current?.rebase()");
  const start = source.indexOf("previewLayoutRef.current?.start(inlinePreview)");
  assert.ok(rebase >= 0 && start > rebase, "the measured safe-area origin is applied before the next layout effect measures the handoff");
  const helper = readFileSync(new URL("../app/lib/preview-layout.ts", import.meta.url), "utf8");
  assert.doesNotMatch(helper, /scrollTo|scrollBy|\.style\.transform|\.animate\(/,
    "layout settles natively without fighting touch or promoting the media");
});
