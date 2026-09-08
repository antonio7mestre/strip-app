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
  let time = 0;
  let editorOwns = false;
  const target = (name) => ({
    addEventListener(type, callback, options) {
      assert.equal(options.passive, type !== "touchmove");
      listeners.set(name + ":" + type, callback);
    },
    removeEventListener(type) { listeners.delete(name + ":" + type); },
  });
  const root = {
    style: {
      setProperty(name, value) { styles.set(name, value); },
      removeProperty(name) { styles.delete(name); },
    },
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
    dataset: reload ? { stripReloadScroll: "manual" } : {},
  };
  const document = {
    ...target("document"), documentElement: root,
    querySelector: () => editorOwns ? {} : null,
  };
  const window = {
    ...target("window"), scrollY, innerHeight: 800,
    scrollTo(options) { writes.push(options); this.scrollY = options.top; },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const history = { scrollRestoration: reload ? "manual" : "auto" };
  const exported = {};
  runInNewContext(compiled, { exports: exported, window, document, history, performance: { now: () => time } });
  const cleanup = exported.installLeadingMediaTop({ inset, resetScroll, ownsReloadScroll: reload });
  return {
    window, root, styles, classes, frames, listeners, writes, history, cleanup,
    sample: exported.sampleLeadingMediaReturn,
    remap: exported.scrollAfterLeadingInsetChange,
    blockEditor(value) { editorOwns = value; },
    visualY() { return -window.scrollY + parseFloat(styles.get("--leading-media-return-y") ?? "0"); },
    emit(type, touches = []) {
      const event = {
        touches: touches.map((clientY) => ({ clientY })), cancelable: true, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      };
      listeners.get((type === "scroll" ? "window:" : "document:") + type)?.(event);
      return event;
    },
    frame(ms = 1000 / 60) {
      time += ms;
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(time);
    },
  };
}

test("a photo-first page is genuinely scrolled under the safe area, not moved above the document", () => {
  for (const inset of [47, 54, 59, 62]) {
    const f = fixture({ inset, reload: true });
    assert.equal(f.styles.get("--leading-image-inset"), inset + "px");
    assert.ok(f.classes.has("leading-image-inset-active"));
    assert.equal(f.window.scrollY, inset);
    f.frame();
    assert.equal(f.writes.length, 1);
    assert.equal(f.visualY(), -inset);
    assert.equal(f.history.scrollRestoration, "auto");
    f.cleanup();
  }
});

test("deep native pulls are untouched under the finger and return in one continuous spring", () => {
  for (const depth of [1, 60, 250, 1200]) {
    for (const fps of [30, 60, 120]) {
      const f = fixture();
      f.frame();
      const before = f.writes.length;
      f.emit("touchstart", [100]);
      for (const y of [30, 0, -depth / 2, -depth]) {
        f.window.scrollY = y;
        f.emit("scroll");
        assert.equal(f.emit("touchmove", [100 - y]).defaultPrevented, false);
        f.frame(1000 / fps);
        assert.equal(f.writes.length, before, "native dragging is never clamped");
      }
      const visualAtRelease = f.visualY();
      f.emit("touchend");
      assert.equal(f.visualY(), visualAtRelease, "handoff cannot jump a pixel");
      assert.equal(f.window.scrollY, 59);
      let previous = f.visualY();
      for (let n = 0; n < fps * 2; n++) {
        f.emit("scroll");
        f.emit("scrollend");
        f.frame(1000 / fps);
        assert.ok(f.visualY() <= previous + 1e-9, "no reversal or second checkpoint");
        assert.ok(f.visualY() >= -59, "no overshoot beyond the locked endpoint");
        previous = f.visualY();
      }
      assert.equal(f.visualY(), -59);
      assert.equal(f.writes.length, before + 1, "one coordinate handoff, no subsequent scroll corrections");
      assert.equal(f.frames.size, 0);
      assert.equal(f.styles.has("--leading-media-return-y"), false);
      f.cleanup();
    }
  }
});

test("a release inside the small top gap returns immediately without waiting for scrollend", () => {
  for (const y of [0, 12, 40, 58.5]) {
    const f = fixture();
    f.frame();
    f.emit("touchstart", [100]);
    f.window.scrollY = y;
    f.emit("touchend");
    assert.ok(Math.abs(f.visualY() + y) < 1e-9);
    assert.equal(f.frames.size, 1);
    for (let n = 0; n < 120; n++) f.frame();
    assert.equal(f.visualY(), -59);
    f.cleanup();
  }
});

test("the analytic return has no frame-rate dependence or long-pull overshoot", () => {
  const f = fixture({ inset: 0, resetScroll: false });
  for (const distance of [1, 59, 500, 4000]) {
    assert.equal(f.sample(distance, 0).distance, distance);
    assert.equal(Math.abs(f.sample(distance, 0).velocity), 0);
    let previous = distance;
    for (let time = 0.01; time < 2; time += 0.01) {
      const value = f.sample(distance, time);
      assert.ok(value.distance < previous);
      assert.ok(value.distance >= 0);
      assert.ok(value.velocity <= 0);
      previous = value.distance;
    }
    assert.ok(previous < 0.1);
  }
  assert.equal(f.frames.size + f.listeners.size, 0);
  f.cleanup();
});

test("catching a return freezes it in place and releasing resumes from that exact position", () => {
  const f = fixture();
  f.frame();
  f.emit("touchstart", [100]);
  f.window.scrollY = -500;
  f.emit("touchend");
  f.frame(120);
  const caught = f.visualY();
  f.emit("touchstart", [250]);
  f.frame(500);
  assert.equal(f.visualY(), caught);
  assert.equal(f.emit("touchmove", [300]).defaultPrevented, true);
  assert.ok(f.visualY() > caught);
  const released = f.visualY();
  f.emit("touchend");
  assert.equal(f.visualY(), released);
  for (let n = 0; n < 120; n++) f.frame();
  assert.equal(f.visualY(), -59);
  f.cleanup();
});

test("reversing a caught return hands the remaining upward drag back to scrolling", () => {
  const f = fixture();
  f.frame();
  f.emit("touchstart", [100]);
  f.window.scrollY = -100;
  f.emit("touchend");
  f.frame(200);
  f.emit("touchstart", [400]);
  f.emit("touchmove", [0]);
  assert.ok(f.window.scrollY > 59);
  assert.equal(f.styles.has("--leading-media-return-y"), false);
  f.emit("touchend");
  assert.equal(f.frames.size, 0);
  f.cleanup();
});

test("normal scrolling below the top and Safari viewport changes do not trigger a return", () => {
  const f = fixture();
  f.frame();
  const writes = f.writes.length;
  for (const y of [250, 600, 900, 200]) {
    f.window.scrollY = y;
    for (const event of ["scroll", "resize", "scrollend"]) f.emit(event);
    f.frame();
  }
  assert.equal(f.writes.length, writes);
  assert.equal(f.frames.size, 0);
  f.cleanup();
});

test("editor anchors and keyboard interactions override the return without frozen transforms", () => {
  const f = fixture();
  f.frame();
  f.blockEditor(true);
  f.window.scrollY = 0;
  f.emit("scroll");
  assert.equal(f.frames.size, 0);
  f.blockEditor(false);
  f.emit("scroll");
  assert.equal(f.frames.size, 1);
  f.window.scrollY = 600;
  f.emit("scroll");
  assert.equal(f.frames.size, 0);
  assert.equal(f.visualY(), -600);
  f.cleanup();
});

test("reordering preserves scroll position and does not arm a correction until the next gesture", () => {
  const f = fixture({ scrollY: 20, resetScroll: false });
  f.emit("scroll");
  assert.equal(f.writes.length + f.frames.size, 0);
  for (const [before, after] of [[0, 59], [59, 0], [59, 59]]) {
    assert.equal(f.remap(450, before, after), 450);
  }
  f.cleanup();
});

test("route cleanup cancels frames and removes every listener and temporary style", () => {
  const f = fixture({ reload: true });
  f.emit("touchstart", [100]);
  f.window.scrollY = -400;
  f.emit("touchend");
  f.cleanup();
  f.window.scrollY = 200;
  f.frame();
  assert.equal(f.window.scrollY, 200);
  assert.equal(f.frames.size + f.listeners.size + f.styles.size + f.classes.size, 0);
  assert.equal(f.history.scrollRestoration, "auto");
});

test("forced offset has enough range, and the return never transforms the fixed toolbar", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /html\.leading-image-inset-active \.app-shell\.has-leading-image \{\s*min-height: calc\(100lvh \+ var\(--leading-image-inset\)\)/);
  assert.match(css, /html\.leading-image-inset-active \.has-leading-image \.strip-canvas \{\s*margin-top: 0;\s*padding-top: 0;/);
  assert.match(css, /html\.leading-media-return-active \.has-leading-image > \.editor-canvas,\s*html\.leading-media-return-active \.has-leading-image > \.published-strip/);
  assert.doesNotMatch(css, /leading-media-return-active[^{]*\.composer-dock/);
  assert.doesNotMatch(source, /setTimeout\(|behavior: "smooth"|addEventListener\("scrollend"/);
  assert.doesNotMatch(css, /scroll-snap-type/);
});

test("new input cancels the route-entry retry before it can reposition a live gesture", () => {
  for (const type of ["touchstart", "pointerdown", "wheel", "keydown"]) {
    const f = fixture({ reload: true });
    f.emit(type, [100]);
    f.window.scrollY = -200;
    f.frame();
    assert.equal(f.window.scrollY, -200);
    assert.equal(f.writes.length, 1);
    assert.equal(f.history.scrollRestoration, "auto");
    f.cleanup();
  }
});

test("multi-touch is never prevented, and cancellation returns only after the last finger lifts", () => {
  const f = fixture();
  f.frame();
  f.emit("touchstart", [100, 150]);
  f.window.scrollY = -100;
  assert.equal(f.emit("touchmove", [130, 200]).defaultPrevented, false);
  f.emit("touchend", [130]);
  assert.equal(f.frames.size, 0);
  f.emit("touchcancel");
  assert.equal(f.frames.size, 1);
  for (let n = 0; n < 120; n++) f.frame();
  assert.equal(f.visualY(), -59);
  f.cleanup();
});
