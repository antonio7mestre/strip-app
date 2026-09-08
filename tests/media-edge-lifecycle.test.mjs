import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as edge from "../app/lib/media-edge.ts";

const compiled = ts.transpileModule(
  readFileSync(new URL("../app/components/MediaEdgeExtension.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function fixture({ frameCallbacks = true } = {}) {
  class Target {
    listeners = new Map();
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    emit(name) { this.listeners.get(name)?.({ target: this }); }
  }
  const frames = new Map();
  const animations = new Map();
  let sequence = 0;
  let paints = 0;
  class Video extends Target {
    videoWidth = 1000;
    videoHeight = 2000;
    readyState = 2;
    paused = false;
    ended = false;
    getBoundingClientRect() { return { top: 0, bottom: 800, height: 800, width: 400 }; }
    requestVideoFrameCallback(callback) { frames.set(++sequence, callback); return sequence; }
    cancelVideoFrameCallback(id) { frames.delete(id); }
  }
  const video = new Video();
  if (!frameCallbacks) video.requestVideoFrameCallback = undefined;
  const viewport = { getBoundingClientRect: () => ({ top: 0, bottom: 800 }) };
  const block = new Target();
  block.querySelector = (selector) => selector === ".block-crop-viewport" ? viewport : video;
  const canvas = {
    width: 300, height: 150, parentElement: block,
    getContext: () => ({ resetTransform() {}, clearRect() {}, setTransform() {}, drawImage() { paints++; } }),
    getBoundingClientRect: () => ({ width: 400, height: 44 }),
  };
  const document = new Target();
  document.hidden = false;
  const effects = [];
  let refs = 0;
  let intersection;
  let resized;
  const exported = {};
  class Observer {
    disconnected = false;
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  runInNewContext(compiled, {
    exports: exported,
    require: (name) => {
      if (name === "react") return {
        useRef: () => ({ current: refs++ === 0 ? canvas : null }),
        useLayoutEffect: (effect) => effects.push(effect),
      };
      if (name === "react/jsx-runtime") return { jsx: () => null };
      if (name === "@/app/lib/media-edge") return edge;
      throw new Error(name);
    },
    HTMLVideoElement: Video,
    window: { devicePixelRatio: 3 },
    document,
    ResizeObserver: class extends Observer { constructor(callback) { super(); resized = this; this.callback = callback; } },
    IntersectionObserver: class extends Observer { constructor(callback) { super(); intersection = this; this.callback = callback; } },
    requestAnimationFrame: (callback) => { animations.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id) => animations.delete(id),
  });
  exported.MediaEdgeExtension({ src: "existing-video.mp4", cropTop: 0 });
  const cleanups = effects.map((effect) => effect());
  return {
    video, document, frames, animations, canvas, block, intersection, resized,
    paints: () => paints,
    cropChanged: effects[1],
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

test("video edge stays synchronized, sleeps offscreen, and cleans up on unmount", () => {
  const f = fixture();
  assert.equal(f.frames.size, 1);
  assert.equal(f.animations.size, 0);
  assert.equal(f.canvas.width, 800, "caps the decorative canvas density");
  const [id, callback] = [...f.frames][0];
  f.frames.delete(id);
  const before = f.paints();
  callback();
  assert.equal(f.paints(), before + 1);
  assert.equal(f.frames.size, 1, "only one pending video callback");
  f.intersection.callback([{ isIntersecting: false }]);
  assert.equal(f.frames.size, 0);
  f.intersection.callback([{ isIntersecting: true }]);
  assert.equal(f.frames.size, 1);
  f.document.hidden = true;
  f.document.emit("visibilitychange");
  assert.equal(f.frames.size, 0);
  f.document.hidden = false;
  f.document.emit("visibilitychange");
  assert.equal(f.frames.size, 1);
  f.video.paused = true;
  f.video.emit("pause");
  assert.equal(f.frames.size, 0);
  f.video.paused = false;
  f.video.emit("playing");
  assert.equal(f.frames.size, 1);
  f.unmount();
  assert.equal(f.frames.size, 0);
  assert.equal(f.video.listeners.size + f.block.listeners.size + f.document.listeners.size, 0);
  assert.ok(f.intersection.disconnected && f.resized.disconnected);
});

test("older video APIs use one cancellable animation loop", () => {
  const f = fixture({ frameCallbacks: false });
  assert.equal(f.frames.size, 0);
  assert.equal(f.animations.size, 1);
  f.video.emit("timeupdate");
  assert.equal(f.animations.size, 1);
  f.unmount();
  assert.equal(f.animations.size, 0);
});

test("crop changes repaint even without CSS transition events", () => {
  const f = fixture();
  const before = f.paints();
  f.cropChanged();
  assert.equal(f.paints(), before + 1);
  f.unmount();
});

test("the extension sits below the source and never intercepts input", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.media-edge-extension \{([^}]+)\}/)[1];
  assert.match(rule, /position: absolute/);
  assert.match(rule, /top: 100%/);
  assert.match(rule, /height: var\(--iphone-panel-radius\)/);
  assert.match(rule, /pointer-events: none/);
  assert.doesNotMatch(css, /margin-top: calc\(-1 \* var\(--iphone-panel-radius\)\)/);
});
