import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = ts.transpileModule(read("app/lib/media-import-reveal.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ reduced = false } = {}) {
  const exports = {}, timers = new Map(), frames = new Map(), controller = new AbortController();
  let id = 0, reveals = 0;
  runInNewContext(code, { exports, DOMException,
    setTimeout: (callback, duration) => { timers.set(++id, { callback, duration }); return id; },
    clearTimeout: key => timers.delete(key),
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    window: { matchMedia: () => ({ matches: reduced }) },
  });
  const blocks = [];
  const canvas = { querySelectorAll: () => blocks };
  function image(blockId) {
    let decodeCount = 0, resolve, reject;
    const decoded = new Promise((yes, no) => { resolve = yes; reject = no; });
    const img = { decode: () => { decodeCount++; return decoded; } };
    blocks.push({ dataset: { blockId }, querySelector: type => type === "img" ? img : null });
    return { resolve, reject, count: () => decodeCount };
  }
  function video(blockId, readyState = 0) {
    const events = new Map();
    const vid = { readyState, error: null,
      addEventListener: (event, callback) => events.set(event, callback),
      removeEventListener: event => events.delete(event) };
    blocks.push({ dataset: { blockId }, querySelector: type => type === "video" ? vid : null });
    return { events, emit: event => events.get(event)?.() };
  }
  async function frame() {
    assert.equal(frames.size, 1);
    const [key, callback] = [...frames][0]; frames.delete(key); callback(); await tick();
  }
  async function timer(duration) {
    const [key, timer] = [...timers].find(([, entry]) => entry.duration === duration) ?? [];
    assert.ok(timer, `missing ${duration}ms timer`); timers.delete(key); timer.callback(); await tick();
  }
  const start = (ids, target = canvas) => exports.revealImportedMedia(target, ids, {
    signal: controller.signal, onReveal: () => { reveals++; },
  });
  const animate = blockId => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    blocks.find(block => block.dataset.blockId === blockId).getAnimations = options => {
      assert.equal(options.subtree, true);
      return [{ animationName: "media-import-first-size", finished },
        { animationName: "unrelated-animation", finished: new Promise(() => {}) }];
    };
    return finish;
  };
  return { ...exports, controller, timers, frames, image, video, frame, timer, start, animate, reveals: () => reveals };
}

test("actual mounted photos decode, paint twice, then reveal as one 360ms batch", async () => {
  const h = harness(), first = h.image("first"), second = h.image("second"), other = h.image("unrelated");
  const pending = h.start(["first", "second"]);
  assert.equal(first.count(), 1); assert.equal(second.count(), 1); assert.equal(other.count(), 0);
  first.resolve(); await tick(); assert.equal(h.frames.size, 0);
  second.resolve(); await tick();
  assert.equal(h.timers.size, 0);
  await h.frame(); assert.equal(h.reveals(), 0);
  await h.frame(); assert.equal(h.reveals(), 1);
  assert.equal(h.timers.size, 1);
  await h.timer(360); await pending;
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
});

test("a rejected image decode does not strand a batch, while video waits for its first frame", async () => {
  const h = harness(), image = h.image("photo"), video = h.video("clip");
  const pending = h.start(["photo", "clip"]);
  image.reject(new Error("decode failed")); await tick();
  assert.equal(h.frames.size, 0);
  video.emit("loadeddata"); await tick(); assert.equal(video.events.size, 0);
  await h.frame(); await h.frame(); await h.timer(360); await pending;
  assert.equal(h.reveals(), 1);
});

test("stalled mounted media has a bounded timeout and no late duplicate reveal", async () => {
  const h = harness(), image = h.image("photo");
  const pending = h.start(["photo"]);
  await h.timer(2000); await h.frame(); await h.frame();
  image.resolve(); await tick(); assert.equal(h.reveals(), 1);
  await h.timer(360); await pending; assert.equal(h.timers.size, 0);
});

test("cancelling during decode, paint, or fade removes every timer and frame", async () => {
  for (const phase of ["decode", "paint", "fade"]) {
    const h = harness(), image = h.image("photo"), video = h.video("clip");
    const pending = h.start(["photo", "clip"]);
    const rejected = assert.rejects(pending, error => error.name === "AbortError");
    if (phase !== "decode") { image.resolve(); video.emit("loadeddata"); await tick(); }
    if (phase === "fade") { await h.frame(); await h.frame(); }
    h.controller.abort(); await rejected;
    image.resolve(); video.emit("loadeddata"); await tick();
    assert.equal(h.reveals(), phase === "fade" ? 1 : 0);
    assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0); assert.equal(video.events.size, 0);
  }
});

test("reduced motion still waits for ready paint but does not hold an animation", async () => {
  const h = harness({ reduced: true }); h.video("ready", 2);
  const pending = h.start(["ready"]); await tick();
  await h.frame(); await h.frame(); await pending;
  assert.equal(h.reveals(), 1); assert.equal(h.timers.size, 0);
});

test("missing canvas does not strand a completed import", async () => {
  const h = harness(); const pending = h.start(["removed"], null); await tick();
  await h.frame(); await h.frame(); await h.timer(360); await pending;
  assert.equal(h.reveals(), 1);
});

test("grow and shrink handoffs wait for the actual CSS finish rather than a shorter wall clock", async () => {
  const h = harness(), image = h.image("first"), finish = h.animate("first");
  let settled = false;
  const pending = h.start(["first"]).then(() => { settled = true; });
  image.resolve(); await tick(); await h.frame(); await h.frame();
  assert.equal(h.reveals(), 1);
  assert.equal(settled, false);
  assert.deepEqual([...h.timers.values()].map(timer => timer.duration), [600], "only the bounded safety fallback runs while CSS is animating");
  finish(); await pending;
  assert.equal(settled, true); assert.equal(h.timers.size, 0);
});

test("a stalled animation remains bounded and cancellation clears its fallback", async () => {
  for (const abort of [false, true]) {
    const h = harness(), image = h.image("first"); h.animate("first");
    const pending = h.start(["first"]);
    image.resolve(); await tick(); await h.frame(); await h.frame();
    if (abort) {
      const rejected = assert.rejects(pending, error => error.name === "AbortError");
      h.controller.abort(); await rejected;
    } else { await h.timer(600); await pending; }
    assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
  }
});

test("waiting photos stay hidden and only the first selected photo morphs from the loader", () => {
  const css = read("app/globals.css"), page = read("app/page.tsx");
  assert.match(css, /\.editor-mode \.strip-block\.is-import-revealing:not\(\.is-import-ready\) \{ display: none; \}/);
  assert.doesNotMatch(css, /\.editor-mode \.strip-block\.is-import-revealing \{|\.strip-block\.is-import-revealing[^{}]*\{[^}]*background|\.strip-block\.is-import-revealing > :not/);
  assert.match(css, /is-import-ready\.is-import-first \{[^}]*height: var\(--media-import-height\)/);
  assert.match(page, /mediaImportProgress\?\.visible && mediaBatchRevealIds\[0\] === block.id \? " is-import-first"/);
  assert.match(page, /"--media-import-height": `\$\{block.height\}px`/);
  assert.match(page, /importFirst=\{Boolean\(mediaImportProgress\?\.visible && mediaBatchRevealIds\[0\] === block.id\)\}/);
  assert.match(page, /importReady=\{mediaBatchRevealStarted\}/);
  assert.doesNotMatch(page, /importOverlay/);
  assert.match(page, /<MediaImportBlock key="pending-media-import"[^\n]+mediaImportProgress\?\.afterId, mediaBatchRevealIds\[0\]/);
  assert.equal(harness().MEDIA_IMPORT_REVEAL_MS, 360);
});
