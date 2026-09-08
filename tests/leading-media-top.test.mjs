import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/leading-media-top.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ scrollY = 450, inset = 59, resetScroll = true, reload = false } = {}) {
  const frames = new Map();
  const listeners = new Map();
  const styles = new Map();
  const classes = new Set();
  const writes = [];
  let sequence = 0;
  const root = {
    style: {
      setProperty(name, value) { styles.set(name, value); },
      removeProperty(name) { styles.delete(name); },
    },
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
    },
    dataset: reload ? { stripReloadScroll: "manual" } : {},
  };
  const document = {
    documentElement: root,
    addEventListener(type, callback, options) {
      assert.equal(options.passive, true, "initial input must not block native gestures");
      listeners.set(type, callback);
    },
    removeEventListener(type) { listeners.delete(type); },
  };
  const window = {
    scrollY,
    scrollTo(options) { writes.push(options); this.scrollY = options.top; },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const history = { scrollRestoration: reload ? "manual" : "auto" };
  const exported = {};
  runInNewContext(compiled, { exports: exported, window, document, history });
  const cleanup = exported.installLeadingMediaTop({ inset, resetScroll, ownsReloadScroll: reload });
  return {
    window, root, styles, classes, frames, listeners, writes, history, cleanup,
    remap: exported.scrollAfterLeadingInsetChange,
    emit(type) { listeners.get(type)?.({}); },
    frame() {
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback();
    },
  };
}

test("the same image tuck is established in layout, at native scroll zero", () => {
  for (const inset of [47, 54, 59, 62]) {
    const f = fixture({ inset });
    assert.equal(f.styles.get("--leading-image-inset"), `${inset}px`);
    assert.ok(f.classes.has("leading-image-inset-active"));
    assert.equal(f.window.scrollY, 0);
    f.frame();
    assert.equal(f.writes.length, 1, "no extra correction when already at the native top");
    assert.equal(f.writes[0].behavior, "auto");
    assert.equal(f.writes[0].top, 0);
    assert.equal(f.frames.size + f.listeners.size, 0);
    f.cleanup();
  }
});

test("even a very long native bounce is never intercepted or followed by a second scroll", () => {
  const f = fixture();
  f.frame();
  const initialWrites = f.writes.length;
  for (const depth of [1, 60, 250, 1200]) {
    f.emit("touchstart");
    for (const y of [-depth, -depth * 0.8, -depth * 0.4, -depth * 0.1, -0.25, 0]) {
      f.window.scrollY = y;
      for (const type of ["scroll", "touchend", "resize", "scrollend", "scrollend"]) f.emit(type);
      f.frame();
      assert.equal(f.window.scrollY, y, "Safari's subpixel bounce trajectory is untouched");
      assert.equal(f.writes.length, initialWrites);
    }
  }
  assert.equal(f.frames.size + f.listeners.size, 0);
});

test("starting any input before the entry frame cancels pending placement immediately", () => {
  for (const type of ["touchstart", "pointerdown", "wheel", "keydown"]) {
    const f = fixture({ reload: true });
    f.emit(type);
    f.window.scrollY = -400;
    f.frame();
    assert.equal(f.window.scrollY, -400);
    assert.equal(f.writes.length, 1);
    assert.equal(f.frames.size + f.listeners.size, 0);
    assert.equal(f.history.scrollRestoration, "auto");
    assert.equal(f.root.dataset.stripReloadScroll, undefined);
  }
});

test("route-entry retry handles a late route reset, then permanently gives control back", () => {
  const f = fixture({ reload: true });
  f.window.scrollY = 300;
  f.frame();
  assert.equal(f.window.scrollY, 0);
  assert.equal(f.writes.length, 2);
  assert.equal(f.history.scrollRestoration, "auto");
  f.window.scrollY = 830;
  f.emit("pageshow");
  f.emit("scrollend");
  f.frame();
  assert.equal(f.window.scrollY, 830, "history restoration and reading position are not reset later");
});

test("reordering preserves position instead of triggering a top reset", () => {
  const f = fixture({ resetScroll: false });
  assert.equal(f.window.scrollY, 450);
  assert.equal(f.writes.length + f.frames.size + f.listeners.size, 0);
  for (const [before, after] of [[0, 59], [59, 0], [59, 59]]) {
    const y = f.remap(450, before, after);
    assert.equal(-after - y, -before - 450, "visual position is identical after the layout inset changes");
  }
  assert.equal(f.remap(20, 0, 59), 0, "no negative synthetic scroll debt");
});

test("text-first and non-iPhone pages do not gain the media layout or reset", () => {
  const f = fixture({ inset: 0, resetScroll: false });
  assert.equal(f.classes.size, 0);
  assert.equal(f.window.scrollY, 450);
  assert.equal(f.writes.length + f.frames.size + f.listeners.size, 0);
});

test("leaving the route clears the inset, cancels entry work, and restores reload ownership", () => {
  const f = fixture({ reload: true });
  f.cleanup();
  f.window.scrollY = 125;
  f.frame();
  assert.equal(f.window.scrollY, 125);
  assert.equal(f.frames.size + f.listeners.size + f.classes.size + f.styles.size, 0);
  assert.equal(f.history.scrollRestoration, "auto");
});

test("layout keeps native bounce enabled and removes every old forced-settle checkpoint", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(css, /html\.leading-image-inset-active \.has-leading-image \.strip-canvas \{\s*margin-top: calc\(-1 \* var\(--leading-image-inset\)\);\s*padding-top: 0;/);
  assert.match(css, /html\.leading-image-inset-active \.has-leading-image > \.published-strip \{\s*display: flow-root;/);
  assert.match(css, /overscroll-behavior-y: auto/);
  assert.doesNotMatch(css, /min-height: calc\(100lvh \+ var\(--leading-image-inset\)\)/);
  assert.doesNotMatch(page, /settleLeadingImageAtAnchor|scheduleSettleFallback|handleNativeReboundScroll|suppressLeadingImageSettleUntilTouch/);
  assert.doesNotMatch(source, /setTimeout\(|behavior: "smooth"|preventDefault\(|addEventListener\("scroll/);
  assert.doesNotMatch(css, /scroll-snap-type/);
});
