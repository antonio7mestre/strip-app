import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getSafeAreaPaintViewport, shouldUseFooterSafeAreaColor } from "../app/lib/footer-safe-area.ts";

const viewport = { top: 0, bottom: 800 };
const footer = (top) => ({ top, bottom: top + 140 });

test("the bottom color begins only just before the footer enters view", () => {
  for (const top of [1040, 880, 848.01]) {
    assert.equal(shouldUseFooterSafeAreaColor(footer(top), viewport, false), false);
  }
  for (const top of [848, 800, 700, 0]) {
    assert.equal(shouldUseFooterSafeAreaColor(footer(top), viewport, false), true);
  }
});

test("the color stays until the entire footer clears the painted area", () => {
  for (const bounds of [footer(700), footer(800), footer(864), { top: -140, bottom: 1 }, { top: -204, bottom: -64 }]) {
    assert.equal(shouldUseFooterSafeAreaColor(bounds, viewport, true), true);
  }
  assert.equal(shouldUseFooterSafeAreaColor(footer(864.01), viewport, true), false);
  assert.equal(shouldUseFooterSafeAreaColor({ top: -240, bottom: -64.01 }, viewport, true), false);
});

test("fractional edge movement does not flicker between top and bottom colors", () => {
  let active = false;
  const states = [880, 848, 850, 847.5, 857, 864, 865, 860, 851, 848].map((top) => {
    active = shouldUseFooterSafeAreaColor(footer(top), viewport, active);
    return active;
  });
  assert.deepEqual(states, [false, true, true, true, true, true, false, false, false, true]);
});

test("fast jumps work in both directions without an intermediate scroll event", () => {
  assert.equal(shouldUseFooterSafeAreaColor(footer(500), viewport, false), true);
  assert.equal(shouldUseFooterSafeAreaColor(footer(2000), viewport, true), false);
  assert.equal(shouldUseFooterSafeAreaColor(footer(-500), viewport, true), false);
});

test("Safari's smaller visual viewport does not exclude content behind its controls", () => {
  const painted = getSafeAreaPaintViewport(800, 800, { offsetTop: 0, height: 680 });
  assert.deepEqual(painted, viewport);
  assert.equal(shouldUseFooterSafeAreaColor(footer(740), painted, true), true);
  assert.deepEqual(getSafeAreaPaintViewport(780, 800, null), viewport);
  assert.deepEqual(getSafeAreaPaintViewport(760, 780, { offsetTop: 50, height: 760 }), { top: 0, bottom: 810 });
  assert.deepEqual(getSafeAreaPaintViewport(800, 800, { offsetTop: -20, height: 780 }), { top: -20, bottom: 800 });
});

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function effectContaining(marker) {
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && ["useEffect", "useLayoutEffect"].includes(node.expression.getText(tree)) &&
        node.arguments[0]?.getText(tree).includes(marker)) callback = node.arguments[0].getText(tree);
    if (!callback) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callback, "expected safe-area effect");
  return ts.transpileModule("export const effect = " + callback, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const footerEffect = effectContaining("installFooterSafeAreaColor(");
const topEffect = effectContaining('root.matches(".published-bottom-canvas-active');
let previewColorExpression;
function findPreviewColor(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "cleanViewBottomSurfaceColor") {
    previewColorExpression = node.initializer.getText(tree);
  }
  ts.forEachChild(node, findPreviewColor);
}
findPreviewColor(tree);
const helperSource = readFileSync(new URL("../app/lib/footer-safe-area.ts", import.meta.url), "utf8");
const compiledHelper = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ top = 900, reveal = true, view = "published", inlinePreview = false, bottomColor = "#66ff8a", hasSheet = true, hasVisualViewport = true, largeHeight = 800 } = {}) {
  class Target {
    listeners = new Map();
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    emit(name) { this.listeners.get(name)?.(); }
  }
  const frames = new Map();
  let frameId = 0;
  let time = 1000;
  const observers = [];
  class Observer {
    disconnected = false;
    targets = [];
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const classes = new Set();
  const properties = new Map();
  const writes = [];
  const selectors = [];
  const root = {
    clientHeight: 800,
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
    },
    matches(selectors) { return selectors.split(",").some((selector) => classes.has(selector.trim().slice(1))); },
    style: { setProperty(name, value) { properties.set(name, value); } },
  };
  const theme = { setAttribute(name, value) { if (name === "content") writes.push(value); } };
  const sheet = { parentElement: {}, getBoundingClientRect: () => footer(top) };
  const probe = { style: {}, setAttribute() {}, removed: false,
    getBoundingClientRect: () => ({ height: largeHeight }),
    remove() { this.removed = true; } };
  const visual = new Target();
  Object.assign(visual, { height: 680, offsetTop: 0 });
  const window = new Target();
  Object.assign(window, {
    innerHeight: 800, visualViewport: hasVisualViewport ? visual : null,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const bindings = {
    window,
    performance: { now: () => time },
    document: { documentElement: root, body: { append() {} }, createElement: () => probe,
      querySelector: (selector) => { selectors.push(selector); return selector === "#strip-theme-color" ? theme : hasSheet ? sheet : null; } },
    IntersectionObserver: Observer, ResizeObserver: Observer,
    view, inlinePreview, publishedContentCanReveal: reveal,
    visibleEndingStyle: { backgroundColor: bottomColor },
    endingSurfaceColor: "#FFFFFF",
    DEFAULT_BACKGROUND: "#000000", topSafeAreaColor: "#3333ff",
    getSafeAreaPaintViewport, shouldUseFooterSafeAreaColor,
  };
  bindings.cleanViewBottomSurfaceColor = runInNewContext(previewColorExpression, bindings);
  const helperExports = {};
  runInNewContext(compiledHelper, { ...bindings, exports: helperExports });
  bindings.installFooterSafeAreaColor = helperExports.installFooterSafeAreaColor;
  function evaluate(script) {
    const exports = {};
    runInNewContext(script, { ...bindings, exports });
    return exports.effect();
  }
  const cleanup = evaluate(footerEffect);
  return {
    window, visual, root, sheet, probe, classes, properties, writes, frames, observers, selectors,
    active: () => classes.has("published-bottom-canvas-active") || classes.has("published-bottom-sheet-canvas-active") || classes.has("preview-bottom-canvas-active"),
    moveTo(value) { top = value; },
    advance(ms = 16) { time += ms; },
    setLargeHeight(value) { largeHeight = value; },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    runTopEffect: () => evaluate(topEffect),
    cleanup,
  };
}

test("the actual footer effect switches at its bounds, not a page percentage", () => {
  const f = fixture();
  assert.equal(f.active(), false);
  f.moveTo(848);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "switches in the scroll event, before another frame");
  f.flush();
  assert.equal(f.active(), true);
  assert.equal(f.writes.at(-1), "#FFFFFF");
  f.moveTo(863);
  f.window.emit("scroll");
  f.flush();
  assert.equal(f.active(), true);
  f.moveTo(865);
  f.window.emit("scroll");
  f.flush();
  assert.equal(f.active(), false);
  assert.equal(f.writes.at(-1), "#3333ff");
  f.cleanup();
});

test("resize, page restoration, and footer size changes remeasure the boundary", () => {
  const f = fixture();
  f.moveTo(740);
  f.window.emit("pageshow");
  f.flush();
  assert.equal(f.active(), true);
  f.visual.height = 600;
  f.visual.emit("resize");
  f.flush();
  assert.equal(f.active(), true, "still painted under Safari controls");
  f.moveTo(950);
  f.observers.find((observer) => observer.targets.includes(f.sheet.parentElement)).callback();
  f.flush();
  assert.equal(f.active(), false);
  f.window.innerHeight = 960;
  f.root.clientHeight = 960;
  f.window.emit("resize");
  f.flush();
  assert.equal(f.active(), true);
  f.cleanup();
});

test("scroll events update synchronously and an unchanged state never rewrites the theme", () => {
  const f = fixture({ top: 740 });
  const writes = f.writes.length;
  for (let i = 0; i < 10; i++) {
    f.window.emit("scroll");
    f.visual.emit("scroll");
  }
  assert.equal(f.frames.size, 0, "there is no deferred color frame");
  f.flush();
  assert.equal(f.writes.length, writes);
  f.cleanup();
});

test("the later top-color effect cannot overwrite an active bottom color", () => {
  const f = fixture({ top: 740 });
  f.runTopEffect();
  assert.equal(f.writes.at(-1), "#FFFFFF");
  f.moveTo(950);
  f.window.emit("scroll");
  f.flush();
  f.runTopEffect();
  assert.equal(f.writes.at(-1), "#3333ff");
  f.cleanup();
});

test("non-published, hidden, and missing footers never claim the bottom color", () => {
  for (const options of [{ view: "edit" }, { reveal: false }, { hasSheet: false }]) {
    const f = fixture({ top: 740, ...options });
    assert.equal(f.active(), false);
    f.cleanup?.();
  }
});

test("unmount cancels work, removes observers, and restores the top color", () => {
  const f = fixture({ top: 740 });
  f.window.emit("scroll");
  f.cleanup();
  assert.equal(f.frames.size, 0);
  assert.equal(f.window.listeners.size + f.visual.listeners.size, 0);
  assert.ok(f.observers.every((observer) => observer.disconnected));
  assert.equal(f.probe.removed, true);
  assert.equal(f.active(), false);
  assert.equal(f.writes.at(-1), "#3333ff");
});

test("both preview routes paint white under Safari regardless of trailing block color", () => {
  for (const bottomColor of ["#FFFFFF", "#000000"]) {
    for (const options of [{ view: "edit", inlinePreview: true }, { view: "preview" }]) {
      const f = fixture({ ...options, bottomColor, reveal: false, top: 740 });
      assert(f.active());
      assert(f.classes.has("preview-bottom-canvas-active"));
      assert(!f.classes.has("published-bottom-canvas-active"));
      assert.equal(f.properties.get("--bottom-safe-area-color"), "#FFFFFF");
      assert.equal(f.writes.at(-1), "#FFFFFF");
      assert(f.selectors.includes(".is-inline-preview .strip-ending-card, .preview-mode .strip-ending-card"));
      f.runTopEffect();
      assert.equal(f.writes.at(-1), "#FFFFFF", "later top paint cannot overwrite preview");
      f.cleanup();
    }
  }
});

test("preview uses the published entry, full-exit and toolbar-resize boundaries", () => {
  const f = fixture({ view: "edit", inlinePreview: true, bottomColor: "#FFFFFF" });
  assert(!f.active());
  f.moveTo(848); f.window.emit("scroll");
  assert(f.active());
  f.visual.height = 600; f.visual.emit("resize");
  assert(f.active());
  f.moveTo(864); f.window.emit("scroll");
  assert(f.active(), "does not clear before the card fully leaves");
  f.moveTo(865); f.window.emit("scroll");
  assert(!f.active());
  assert.equal(f.writes.at(-1), "#3333ff");
  f.moveTo(740); f.window.emit("scroll");
  assert(f.active());
  f.cleanup();
  f.observers.forEach(observer => observer.callback());
  assert(!f.active(), "exiting preview cannot leave stale paint or callbacks");
  assert.equal(f.properties.get("--bottom-safe-area-color"), "#000000");
  assert.equal(f.window.listeners.size + f.visual.listeners.size, 0);
});

test("preview and published paint share independent top and bottom Safari colors", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const declarationsFor = selector => rules
    .filter(([, selectors]) => selectors.split(",").some(value => value.trim() === selector))
    .map(([, , declarations]) => declarations).join("\n");
  const publishedRoot = declarationsFor("html.published-bottom-sheet-canvas-active");
  const previewRoot = declarationsFor("html.preview-bottom-canvas-active");
  assert.equal(previewRoot, publishedRoot, "both reader modes use the same root paint declarations");
  assert.match(previewRoot, /background-color: var\(--bottom-safe-area-color, var\(--black\)\) !important/);
  assert.match(previewRoot, /background-image: linear-gradient\(\s*to bottom,\s*var\(--bottom-safe-area-color, var\(--black\)\) 0 50%,\s*var\(--top-safe-area-color, var\(--black\)\) 50% 100%\s*\) !important/);
  assert.doesNotMatch(previewRoot, /background-image: none/);
  assert.equal(declarationsFor("html.preview-bottom-canvas-active body"),
    declarationsFor("html.published-bottom-sheet-canvas-active body"));
  assert.match(declarationsFor("html.preview-bottom-canvas-active body"),
    /background-color: var\(--bottom-safe-area-color, var\(--black\)\) !important/);
  for (const options of [{ view: "edit" }, { view: "library", inlinePreview: true }, { view: "edit", inlinePreview: true, hasSheet: false }]) {
    const f = fixture({ ...options, top: 740 });
    assert(!f.active());
    f.cleanup();
  }
});

test("the full painted height includes the large viewport and bottom safe-area probe", () => {
  assert.deepEqual(getSafeAreaPaintViewport(714, 714, { offsetTop: 0, height: 714 }, 788), { top: 0, bottom: 788 });
  const f = fixture({ top: 790, largeHeight: 788 });
  f.window.innerHeight = 714;
  f.root.clientHeight = 714;
  f.window.emit("resize");
  assert.equal(f.active(), true);
  f.moveTo(810);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "keeps bottom color beyond the shrinking Safari viewport");
  f.moveTo(853);
  f.window.emit("scroll");
  assert.equal(f.active(), false, "only clears after the whole painted area plus exit gap");
  f.moveTo(837);
  f.window.emit("scroll");
  assert.equal(f.active(), false);
  f.moveTo(836);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "prepares the color before the footer reaches the screen");
  f.cleanup();
});

test("Safari toolbar expansion cannot turn the bottom color off while the footer remains painted", () => {
  const f = fixture({ top: 740, largeHeight: 788 });
  for (const height of [754, 730, 714, 754, 700]) {
    f.window.innerHeight = height;
    f.root.clientHeight = height;
    f.visual.height = height;
    f.visual.emit("resize");
    assert.equal(f.active(), true);
  }
  f.cleanup();
});

test("a changed full viewport is remeasured, not cached from the old orientation", () => {
  const f = fixture({ top: 900 });
  assert.equal(f.active(), false);
  f.setLargeHeight(920);
  f.observers.find(observer => observer.targets.includes(f.probe)).callback();
  assert.equal(f.active(), true);
  assert.match(f.probe.style.cssText, /height:100lvh/);
  assert.match(f.probe.style.cssText, /padding-bottom:env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(helperSource, /scrollTo|scrollBy|setTimeout|requestAnimationFrame/);
  f.cleanup();
});

test("rapid alternation crosses both boundaries immediately without a queued stale color", () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) {
    f.moveTo(760);
    f.window.emit("scroll");
    assert.equal(f.active(), true);
    assert.equal(f.writes.at(-1), "#FFFFFF");
    f.moveTo(870);
    f.visual.emit("scroll");
    assert.equal(f.active(), false);
    assert.equal(f.writes.at(-1), "#3333ff");
  }
  assert.equal(f.frames.size, 0);
  f.cleanup();
});

test("browsers without VisualViewport still use the footer's actual position", () => {
  const f = fixture({ top: 740, hasVisualViewport: false });
  assert.equal(f.active(), true);
  f.moveTo(900);
  f.window.emit("scroll");
  f.flush();
  assert.equal(f.active(), false);
  f.cleanup();
});

test("an observer callback already queued before cleanup cannot repaint the old footer color", () => {
  const f = fixture({ top: 740 });
  f.cleanup();
  const writes = f.writes.length;
  for (const observer of f.observers) observer.callback();
  assert.equal(f.active(), false);
  assert.equal(f.writes.length, writes);
  assert.equal(f.writes.at(-1), "#3333ff");
});

test("a fast approach prepares the color before Safari advances across the edge", () => {
  const f = fixture({ top: 1200 });
  f.advance();
  f.moveTo(1120);
  f.window.emit("scroll");
  assert.equal(f.active(), false, "the existing 60ms projection does not reach the footer yet");
  f.advance();
  f.moveTo(1040);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "color is ready before the next compositor frames reach the footer");
  f.advance();
  f.moveTo(1035);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "deceleration cannot turn a prepared color back off");
  f.visual.emit("resize");
  assert.equal(f.active(), true, "a duplicate viewport event cannot clear the prepared color");
  f.advance();
  f.moveTo(1040);
  f.window.emit("scroll");
  assert.equal(f.active(), false, "reversing away uses the normal exit edge, not the predictive lead");
  f.cleanup();
});

test("a measured native fast approach prepares color beyond the former 256px ceiling", () => {
  const f = fixture({ top: 1420, largeHeight: 754 });
  f.window.innerHeight = 714;
  f.root.clientHeight = 714;
  assert.equal(shouldUseFooterSafeAreaColor(footer(1021), { top: 0, bottom: 754 }, false, 256), false,
    "the prior ceiling misses this measured native approach");
  f.advance(37);
  f.moveTo(1021);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "399px in 37ms projects about 647px ahead within the painted viewport");
  assert.equal(f.writes.at(-1), "#FFFFFF");
  assert.equal(f.frames.size, 0, "the existing event writes immediately, without another frame");

  const writes = f.writes.length;
  f.visual.emit("resize");
  f.advance(16);
  f.moveTo(1019);
  f.window.emit("scroll");
  f.advance(500);
  f.window.emit("scroll");
  assert.equal(f.active(), true, "duplicate events, deceleration and idle preserve the prepared color");
  assert.equal(f.writes.length, writes, "unchanged state does not rewrite the theme");

  f.advance(16);
  f.moveTo(1021);
  f.window.emit("scroll");
  assert.equal(f.active(), false, "reversal still immediately restores the normal exit margin");
  assert.equal(f.writes.at(-1), "#3333ff");
  f.cleanup();
  const cleanedWrites = f.writes.length;
  f.observers.forEach(observer => observer.callback());
  assert.equal(f.writes.length, cleanedWrites);
  assert.equal(f.window.listeners.size + f.visual.listeners.size, 0);
});

test("fast-approach preparation is capped at one painted viewport with the existing minimum ceiling", () => {
  for (const paintedHeight of [800, 920, 200]) {
    const ceiling = Math.max(256, paintedHeight);
    const threshold = paintedHeight + ceiling;
    const f = fixture({ top: threshold + 1001, largeHeight: paintedHeight });
    f.window.innerHeight = paintedHeight;
    f.root.clientHeight = paintedHeight;
    f.visual.height = paintedHeight;
    f.advance(16);
    f.moveTo(threshold + 1);
    f.window.emit("scroll");
    assert.equal(f.active(), false, "a huge velocity cannot prepare beyond the viewport-relative ceiling");
    f.advance(16);
    f.moveTo(threshold);
    f.window.emit("scroll");
    assert.equal(f.active(), true, "the bounded lead is retained while approaching more slowly");
    assert.equal(f.frames.size, 0);
    f.cleanup();
  }
});

test("slow approaches keep the small entry gap and layout jumps do not create fling speed", () => {
  const f = fixture({ top: 900 });
  for (const top of [890, 880, 870, 860, 850]) {
    f.advance(100);
    f.moveTo(top);
    f.window.emit("scroll");
    assert.equal(f.active(), false);
  }
  f.advance(100);
  f.moveTo(848);
  f.window.emit("scroll");
  assert.equal(f.active(), true);
  f.moveTo(1500);
  f.advance(500);
  f.window.emit("resize");
  f.moveTo(1000);
  f.advance(500);
  f.observers[0].callback();
  assert.equal(f.active(), false, "a later layout change is not treated as a fast swipe");
  f.cleanup();
});
