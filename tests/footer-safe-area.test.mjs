import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getSafeAreaPaintViewport, shouldUseFooterSafeAreaColor } from "../app/lib/footer-safe-area.ts";

const viewport = { top: 0, bottom: 800 };
const footer = (top) => ({ top, bottom: top + 140 });

test("the bottom color begins only just before the footer enters view", () => {
  for (const top of [1040, 850, 816.01]) {
    assert.equal(shouldUseFooterSafeAreaColor(footer(top), viewport, false), false);
  }
  for (const top of [816, 800, 700, 0]) {
    assert.equal(shouldUseFooterSafeAreaColor(footer(top), viewport, false), true);
  }
});

test("the color stays until the entire footer clears the painted area", () => {
  for (const bounds of [footer(700), footer(800), footer(832), { top: -140, bottom: 1 }, { top: -170, bottom: -30 }]) {
    assert.equal(shouldUseFooterSafeAreaColor(bounds, viewport, true), true);
  }
  assert.equal(shouldUseFooterSafeAreaColor(footer(832.01), viewport, true), false);
  assert.equal(shouldUseFooterSafeAreaColor({ top: -200, bottom: -32.01 }, viewport, true), false);
});

test("fractional edge movement does not flicker between top and bottom colors", () => {
  let active = false;
  const states = [850, 816, 818, 815.5, 825, 832, 833, 830, 819, 816].map((top) => {
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
const footerEffect = effectContaining("shouldUseFooterSafeAreaColor(");
const topEffect = effectContaining('root.matches(".published-bottom-canvas-active');

function fixture({ top = 900, reveal = true, view = "published", hasSheet = true, hasVisualViewport = true } = {}) {
  class Target {
    listeners = new Map();
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    emit(name) { this.listeners.get(name)?.(); }
  }
  const frames = new Map();
  let frameId = 0;
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
  const root = {
    clientHeight: 800,
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
    },
    matches(selectors) { return selectors.split(",").some((selector) => classes.has(selector.trim().slice(1))); },
    style: { setProperty(name, value) { properties.set(name, value); } },
  };
  const theme = { setAttribute(name, value) { if (name === "content") writes.push(value); } };
  const sheet = { parentElement: {}, getBoundingClientRect: () => footer(top) };
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
    document: { documentElement: root, querySelector: (selector) => selector === "#strip-theme-color" ? theme : hasSheet ? sheet : null },
    IntersectionObserver: Observer, ResizeObserver: Observer,
    view, publishedContentCanReveal: reveal,
    visibleEndingStyle: { backgroundColor: "#66ff8a" },
    DEFAULT_BACKGROUND: "#000000", topSafeAreaColor: "#3333ff",
    getSafeAreaPaintViewport, shouldUseFooterSafeAreaColor,
  };
  function evaluate(script) {
    const exports = {};
    runInNewContext(script, { ...bindings, exports });
    return exports.effect();
  }
  const cleanup = evaluate(footerEffect);
  return {
    window, visual, root, sheet, classes, properties, writes, frames, observers,
    active: () => classes.has("published-bottom-canvas-active") || classes.has("published-bottom-sheet-canvas-active"),
    moveTo(value) { top = value; },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    runTopEffect: () => evaluate(topEffect),
    cleanup,
  };
}

test("the actual footer effect switches at its bounds, not a page percentage", () => {
  const f = fixture();
  assert.equal(f.active(), false);
  f.moveTo(816);
  f.window.emit("scroll");
  f.flush();
  assert.equal(f.active(), true);
  assert.equal(f.writes.at(-1), "#66ff8a");
  f.moveTo(831);
  f.window.emit("scroll");
  f.flush();
  assert.equal(f.active(), true);
  f.moveTo(833);
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

test("scroll events coalesce and an unchanged state never rewrites the theme", () => {
  const f = fixture({ top: 740 });
  const writes = f.writes.length;
  for (let i = 0; i < 10; i++) {
    f.window.emit("scroll");
    f.visual.emit("scroll");
  }
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.writes.length, writes);
  f.cleanup();
});

test("the later top-color effect cannot overwrite an active bottom color", () => {
  const f = fixture({ top: 740 });
  f.runTopEffect();
  assert.equal(f.writes.at(-1), "#66ff8a");
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
  assert.equal(f.active(), false);
  assert.equal(f.writes.at(-1), "#3333ff");
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

