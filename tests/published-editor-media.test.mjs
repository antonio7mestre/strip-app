import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/published-editor-media.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const exports = {}, media = [], timers = new Map(); let id = 0;
  class Media {
    constructor() { this.events = new Map(); this.complete = false; this.naturalWidth = 0; media.push(this); }
    addEventListener(name, listener) { this.events.set(name, listener); }
    removeEventListener(name) { this.events.delete(name); }
    removeAttribute() { this.src = null; }
  }
  class Image extends Media {
    decode() { return new Promise(resolve => { this.decoded = resolve; }); }
    load() { this.complete = true; this.naturalWidth = 100; void this.events.get("load")?.(); }
  }
  class Video extends Media {}
  runInNewContext(compiled, { exports, DOMException, Image, HTMLImageElement: Image, HTMLVideoElement: Video,
    document: { createElement: () => new Video() },
    setTimeout: (callback, duration) => { timers.set(++id, { callback, duration }); return id; },
    clearTimeout: key => timers.delete(key),
  });
  const controller = new AbortController();
  return { prepare: exports.preparePublishedEditorMedia, media, timers, controller };
}
test("draft photos and image stickers decode before they are marked ready", async () => {
  const h = harness(); let settled = false;
  const result = h.prepare([{ id: "text", type: "text" }, { id: "photo", type: "image", src: "/draft/photo" },
    { id: "sticker", type: "sticker", src: "/draft/sticker" }], h.controller.signal).then(value => { settled = true; return value; });
  assert.equal(h.media.length, 2); assert.equal(h.media[0].src, "/draft/photo");
  h.media.forEach(image => image.load()); await tick();
  assert.equal(settled, false);
  h.media.forEach(image => image.decoded());
  assert.deepEqual({ ...await result }, { photo: "loaded", sticker: "loaded" });
  assert.equal(h.timers.size, 0); assert.ok(h.media.every(image => image.events.size === 0));
});
test("a failed image is settled and a slow image is bounded without a false loaded state", async () => {
  const h = harness();
  const result = h.prepare([{ id: "failed", type: "image", src: "/bad" }, { id: "slow", type: "image", src: "/slow" }], h.controller.signal);
  h.media[0].events.get("error")();
  const timer = [...h.timers.values()][0]; assert.equal(timer.duration, 2000); timer.callback();
  assert.deepEqual({ ...await result }, { failed: "error" }); assert.equal(h.timers.size, 0);
});
test("video warms its first frame rather than waiting for the full file", async () => {
  const h = harness(); const result = h.prepare([{ id: "video", type: "video", src: "/video" }], h.controller.signal);
  assert.equal(h.media[0].preload, "auto"); assert.equal(h.media[0].muted, true);
  h.media[0].events.get("loadeddata")();
  assert.deepEqual({ ...await result }, { video: "loaded" }); assert.equal(h.timers.size, 0);
});
test("cancelling preparation clears listeners and ignores stale image decode", async () => {
  const h = harness(); const result = h.prepare([{ id: "image", type: "image", src: "/draft/photo" }], h.controller.signal);
  h.media[0].load(); h.controller.abort();
  await assert.rejects(result, { name: "AbortError" }); h.media[0].decoded(); await tick();
  assert.equal(h.timers.size, 0); assert.equal(h.media[0].events.size, 0); assert.equal(h.media[0].src, null);
});
