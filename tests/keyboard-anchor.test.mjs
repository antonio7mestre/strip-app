import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { keyboardInsetForViewport } from "../app/lib/keyboard-inset.ts";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findKeyboardEffect(node = tree) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" &&
    node.arguments[0]?.getText(tree).includes("const queueKeyboardReturn =")) return node.arguments[0];
  return ts.forEachChild(node, findKeyboardEffect);
}
const effect = findKeyboardEffect();
assert.ok(effect, "Test the actual editor keyboard lifecycle, not a separate imitation");
const compiled = ts.transpileModule(`export const install = ${effect.getText(tree)};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(legacy = false) {
  const events = new Map(), viewportEvents = new Map(), timers = new Map();
  const classes = new Set(), styles = new Map(), scrolls = [], corrections = [];
  let clock = 0, sequence = 0;
  class Textarea { closest() { return null; } }
  class Input { type = "text"; closest() { return null; } }
  const document = { activeElement: null, documentElement: {
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    classList: {
      contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
    },
  } };
  const viewport = { height: 844, offsetTop: 0,
    addEventListener: (name, fn) => viewportEvents.set(name, fn), removeEventListener: name => viewportEvents.delete(name),
  };
  const window = { innerHeight: 844, scrollY: 600, visualViewport: viewport,
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { time: clock + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => window.setTimeout(fn, 16),
    scrollTo: options => { scrolls.push(options.top); window.scrollY = options.top; },
  };
  const exports = {};
  const script = legacy ? compiled.replace(
    "keyboardInsetForViewport(layoutHeight, viewport.height, textIsFocused)",
    "(textIsFocused && layoutHeight - viewport.height - viewport.offsetTop > 80 ? layoutHeight - viewport.height - viewport.offsetTop : 0)",
  ) : compiled;
  runInNewContext(script, {
    exports, document, window, HTMLTextAreaElement: Textarea, HTMLInputElement: Input,
    KEYBOARD_SCROLL_SETTLE_MS: 90, KEYBOARD_SCROLL_RELEASE_MS: 420, keyboardInsetForViewport,
    keepFocusedTextBlockVisible: behavior => corrections.push(behavior),
  });
  const cleanup = exports.install();
  return {
    window, document, viewport, classes, styles, scrolls, corrections, timers, events, viewportEvents, cleanup,
    focus() { document.activeElement = new Textarea(); events.get("focusin")(); },
    blur() { document.activeElement = null; events.get("focusout")(); },
    resize(height, offsetTop = 0) { viewport.height = height; viewport.offsetTop = offsetTop; viewportEvents.get("resize")(); },
    advance(ms) {
      const end = clock + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
        if (!next) break;
        timers.delete(next[0]); clock = next[1].time; next[1].fn();
      }
      clock = end;
    },
  };
}

test("keyboard height depends on viewport shrinkage, not Safari's pan toward the last field", () => {
  assert.equal(keyboardInsetForViewport(844, 500, true), 344);
  assert.equal(keyboardInsetForViewport(844, 844, true), 0);
  assert.equal(keyboardInsetForViewport(844, 790, true), 0, "browser chrome alone is not a keyboard");
  assert.equal(keyboardInsetForViewport(844, 500, false), 0);
});

test("regression fixture reproduces the old premature return after Safari pans", () => {
  const f = fixture(true);
  try {
    f.focus(); f.advance(16); f.resize(500); f.advance(100);
    f.window.scrollY = 780;
    f.resize(500, 344); f.advance(600);
    assert.equal(f.classes.has("keyboard-open"), false);
    assert.deepEqual(f.scrolls, [600], "old logic drops the field back to its pre-keyboard position");
  } finally { f.cleanup(); }
});

test("last text box keeps its first keyboard anchor even when Safari pans by the full keyboard height", () => {
  const f = fixture();
  try {
    f.focus(); f.advance(16);
    f.resize(500); f.advance(100);
    f.window.scrollY = 780; // Native initial positioning is already correct.
    assert.deepEqual(f.corrections, ["smooth"]);
    for (const pan of [60, 140, 264, 344, 380, 190, 0]) {
      f.resize(500, pan); f.advance(600);
      assert.equal(f.classes.has("keyboard-open"), true);
      assert.equal(f.classes.has("keyboard-settling"), false);
      assert.equal(f.styles.get("--keyboard-inset"), "344px");
      assert.equal(f.window.scrollY, 780, "no restore to the pre-keyboard position while typing");
      assert.deepEqual(f.scrolls, []);
      assert.deepEqual(f.corrections, ["smooth"], "do not repeatedly re-anchor as Safari pans");
    }
  } finally { f.cleanup(); }
});

test("typing in earlier blocks and growing/shrinking the keyboard do not trigger a return", () => {
  const f = fixture();
  try {
    f.focus(); f.resize(530); f.advance(100);
    for (const [height, pan] of [[500, 0], [460, 110], [510, 250], [530, 0]]) {
      f.resize(height, pan); f.advance(600);
      assert.equal(f.classes.has("keyboard-open"), true);
      assert.equal(f.styles.get("--keyboard-inset"), `${844 - height}px`);
      assert.deepEqual(f.scrolls, []);
    }
  } finally { f.cleanup(); }
});

test("a real keyboard dismissal returns once and keeps the settling space until finished", () => {
  for (const blur of [false, true]) {
    const f = fixture();
    try {
      f.focus(); f.resize(500, 344); f.advance(100); f.window.scrollY = 780;
      if (blur) { f.blur(); f.advance(16); }
      f.resize(844); f.advance(89);
      assert.equal(f.classes.has("keyboard-open"), false);
      assert.equal(f.classes.has("keyboard-settling"), true);
      assert.deepEqual(f.scrolls, []);
      f.advance(1);
      assert.deepEqual(f.scrolls, [600]);
      f.advance(420);
      assert.equal(f.classes.has("keyboard-settling"), false);
      assert.equal(f.window.scrollY, 600);
    } finally { f.cleanup(); }
  }
});

test("focus transfers and leaving the editor cancel stale return timers", () => {
  const f = fixture();
  f.focus(); f.resize(500, 344); f.advance(100);
  f.blur(); f.advance(16);
  f.focus(); f.advance(600);
  assert.deepEqual(f.scrolls, []);
  assert.equal(f.classes.has("keyboard-open"), true);
  f.cleanup();
  assert.equal(f.events.size, 0);
  assert.equal(f.viewportEvents.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.classes.size, 0);
});
