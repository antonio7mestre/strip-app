import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("app/lib/media-import.ts", root), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const files = count => Array.from({ length: count }, (_, index) => ({ name: `photo-${index}.jpg`, type: "image/jpeg", size: 1024 }));
function preparation() {
  const readers = [], images = [], videos = [], timers = new Map(), exports = {};
  let timerId = 0;
  class FileReader {
    constructor() { readers.push(this); }
    readAsDataURL(file) { this.file = file; }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  class Image {
    naturalWidth = 1200;
    naturalHeight = 1800;
    constructor() { images.push(this); }
    decode() { return new Promise((resolve, reject) => { this.decoded = resolve; this.rejectDecode = reject; }); }
  }
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, FileReader, Image, DOMException,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    document: { createElement: type => {
      assert.equal(type, "video");
      const video = { videoWidth: 1920, videoHeight: 1080, loads: 0,
        load() { this.loads++; }, removeAttribute(name) { delete this[name]; } };
      videos.push(video); return video;
    } },
  });
  async function read(index) {
    const reader = readers[index]; reader.result = `data:${reader.file.type};base64,${reader.file.name}`;
    reader.onload(); await tick();
  }
  async function finish(index) {
    await read(index);
    const image = images.find(image => image.src.endsWith(readers[index].file.name));
    image.onload(); await tick(); image.decoded(); await tick();
  }
  return { ...exports, readers, images, videos, timers, read, finish };
}

test("six photos decode in bounded parallel work and return in the chosen order, not completion order", async () => {
  const h = preparation(), controller = new AbortController(), progress = [];
  const pending = h.prepareMediaFiles(files(6), { signal: controller.signal, onProgress: value => progress.push({ ...value }) });
  assert.equal(h.readers.length, 2);
  await h.finish(1); assert.equal(h.readers.length, 3);
  await h.finish(0); await h.finish(3); await h.finish(2); await h.finish(5); await h.finish(4);
  const result = await pending;
  assert.deepEqual(Array.from(result.media, item => item.alt), files(6).map(file => file.name.replace(/\.jpg$/, "")));
  assert.ok(result.media.every(item => item.width === 1200 && item.height === 1800));
  assert.equal(result.media[0].src, "data:image/jpeg;base64,photo-0.jpg", "the full-quality source is untouched");
  assert.equal(result.failed, 0);
  assert.deepEqual(progress.map(value => value.completed), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(progress.every(value => value.total === 6));
  assert.equal(h.timers.size, 0);
});

test("a photo is not marked prepared until decode completes", async () => {
  const h = preparation(), progress = [];
  let finished = false;
  const pending = h.prepareMediaFiles(files(1), { signal: new AbortController().signal, onProgress: value => progress.push(value.completed) })
    .then(value => { finished = true; return value; });
  await h.read(0); h.images[0].onload(); await tick();
  assert.equal(finished, false); assert.deepEqual(progress, [0]);
  h.images[0].decoded(); await pending; assert.equal(finished, true);
});

test("bad files are reported without losing the valid members of a batch", async () => {
  const h = preparation();
  const pending = h.prepareMediaFiles(files(3), { signal: new AbortController().signal });
  h.readers[0].onerror(); await tick();
  await h.finish(1); await h.read(2); h.images.at(-1).onerror();
  const result = await pending;
  assert.equal(result.failed, 2); assert.equal(result.media.length, 1);
  assert.equal(result.media[0].alt, "photo-1"); assert.equal(h.timers.size, 0);
});

test("cancellation stops reads and decodes without accepting any partial batch", async () => {
  for (const phase of ["read", "decode"]) {
    const h = preparation(), controller = new AbortController();
    const pending = h.prepareMediaFiles(files(6), { signal: controller.signal });
    const rejected = assert.rejects(pending, error => error.name === "AbortError");
    if (phase === "decode") { await h.read(0); h.images[0].onload(); }
    controller.abort(); await rejected;
    assert.equal(h.readers.length, 2, "no later files start after cancellation");
    assert.ok(h.readers[1].aborted); assert.equal(h.timers.size, 0);
    assert.ok(h.readers.every(reader => reader.onload === null));
  }
});

test("videos reserve their real dimensions without playing or leaving metadata resources attached", async () => {
  const h = preparation();
  const pending = h.prepareMediaFiles([{ name: "clip.mp4", type: "video/mp4", size: 2000 }], { signal: new AbortController().signal });
  await h.read(0);
  const video = h.videos[0];
  assert.equal(video.preload, "metadata"); assert.equal(video.muted, true);
  video.onloadedmetadata(); const result = await pending;
  assert.equal(result.media[0].width, 1920); assert.equal(result.media[0].height, 1080);
  assert.equal(result.media[0].type, "video");
  assert.equal(video.src, undefined); assert.equal(video.onloadedmetadata, null); assert.equal(h.timers.size, 0);
});

test("stalled or unsupported images cannot leave the batch loading forever", async () => {
  const h = preparation();
  const pending = h.prepareMediaFiles(files(1), { signal: new AbortController().signal });
  await h.read(0); [...h.timers.values()][0]();
  assert.equal((await pending).failed, 1); assert.equal(h.timers.size, 0);
  for (const file of [
    { name: "active.svg", type: "image/svg+xml", size: 42 },
    { name: "empty.jpg", type: "image/jpeg", size: 0 },
    { name: "huge.jpg", type: "image/jpeg", size: 81 * 1024 * 1024 },
  ]) {
    const invalid = preparation();
    const result = await invalid.prepareMediaFiles([file], { signal: new AbortController().signal });
    assert.equal(result.failed, 1); assert.equal(invalid.readers.length, 0);
  }
});

const page = readFileSync(new URL("app/page.tsx", root), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = ast) { return predicate(node) ? node : ts.forEachChild(node, child => find(predicate, child)); }
const declaration = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).getText(ast);
const handlerCode = ts.transpileModule(`export const ${declaration("addMedia")};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function editor({ selected = "anchor" } = {}) {
  const state = { blocks: [{ id: "anchor", type: "text", content: "Existing" }, { id: "after", type: "text" }],
    sizes: {}, status: {}, progress: null, reveal: [], selected }, request = { current: null }, requests = [], notices = [], timers = [];
  let id = 0, commits = 0;
  const exports = {};
  runInNewContext(handlerCode, {
    exports, AbortController, selectedBlockId: selected, mediaImportRequestRef: request, pageTransitionInFlightRef: { current: false },
    stripCanvasRef: { current: { getBoundingClientRect: () => ({ width: 390 }) } },
    mediaBatchRevealTimerRef: { current: null },
    window: { innerWidth: 390, clearTimeout() {}, setTimeout: callback => { timers.push(callback); return 1; } },
    makeId: () => `new-${++id}`, flushSync: callback => { commits++; callback(); },
    prepareMediaFiles: (files, options) => new Promise((resolve, reject) => {
      options.onProgress({ completed: 0, total: files.length }); requests.push({ files, options, resolve, reject });
    }),
    setBlocks: update => { state.blocks = update(state.blocks); },
    setImportedMediaSizes: update => { state.sizes = update(state.sizes); },
    setMediaLoadStatus: update => { state.status = update(state.status); },
    setMediaBatchRevealIds: value => { state.reveal = value; },
    setSelectedBlockId: value => { state.selected = value; },
    setEditingTextBlockId() {}, setActiveTextTool() {},
    setMediaImportProgress: value => { state.progress = value; },
    setNotice: value => notices.push(value),
  });
  return { ...exports, state, request, requests, notices, timers, commits: () => commits,
    event: { currentTarget: { files: files(6), value: "selected files" } } };
}
const prepared = Array.from({ length: 6 }, (_, index) => ({ type: "image", src: `original-${index}`, alt: `Photo ${index}`, width: 1200, height: 1800 }));

test("the editor inserts six ready photos in one commit, after the captured block, with stable sizes and one selection", async () => {
  const h = editor(), pending = h.addMedia(h.event);
  assert.equal(h.event.currentTarget.value, ""); assert.equal(h.state.blocks.length, 2);
  assert.deepEqual(h.state.progress, { completed: 0, total: 6 });
  await h.addMedia(h.event); assert.equal(h.requests.length, 1, "overlapping batches are blocked");
  h.requests[0].resolve({ media: prepared, failed: 0 }); await pending;
  assert.equal(h.commits(), 1); assert.equal(h.state.blocks.length, 8);
  assert.deepEqual(Array.from(h.state.blocks, block => block.id), ["anchor", "new-1", "new-2", "new-3", "new-4", "new-5", "new-6", "after"]);
  assert.ok(h.state.blocks.slice(1, 7).every(block => block.height === 585));
  assert.equal(h.state.status["new-1"], "loaded"); assert.equal(h.state.status["new-6"], "loaded");
  assert.equal(h.state.sizes["new-1"].width, 1200);
  assert.equal(h.state.selected, "new-1", "focus starts at the beginning, not repeatedly at the end");
  assert.equal(h.state.progress, null); assert.equal(h.request.current, null);
  assert.equal(h.state.reveal.length, 6); h.timers[0](); assert.equal(h.state.reveal.length, 0);
});

test("cancelled imports cannot append to a different draft or move its selection", async () => {
  const h = editor(), pending = h.addMedia(h.event);
  h.request.current.abort();
  h.requests[0].resolve({ media: prepared, failed: 0 }); await pending;
  assert.equal(h.state.blocks.length, 2); assert.equal(h.state.selected, "anchor");
  assert.equal(h.state.progress, null); assert.equal(h.commits(), 0);
  assert.deepEqual(h.notices, [""]);
  assert.match(page, /mediaImportRequestRef\.current\?\.abort\(\); \}, \[currentDraftId, view, inlinePreview, authStatus\]/);
});

test("partial and complete failures show a helpful message and release the import gate", async () => {
  for (const media of [[], prepared.slice(0, 2)]) {
    const h = editor(), pending = h.addMedia(h.event);
    h.requests[0].resolve({ media, failed: 6 - media.length }); await pending;
    assert.equal(h.state.blocks.length, 2 + media.length);
    assert.match(h.notices.at(-1), media.length ? /Some files/ : /Try different photos or videos/);
    assert.equal(h.state.progress, null); assert.equal(h.request.current, null);
  }
});

test("prepared images bypass sequential loading, reserve aspect ratios and cannot trigger another load-time scroll", () => {
  const imageLoad = find(node => ts.isJsxAttribute(node) && node.name.text === "onLoad" && node.getText(ast).includes("focusSelectedBlockWithToolbar"));
  assert.match(imageLoad.getText(ast), /!importedMediaSizes\[block.id\]/);
  assert.match(declaration("shouldLoadMedia"), /if \(importedMediaSizes\[blockId\]\) return true/);
  assert.match(page, /width=\{importedMediaSizes\[block.id\]\?\.width\}/);
  assert.match(page, /height=\{importedMediaSizes\[block.id\]\?\.height\}/);
  assert.match(page, /Adding media \{mediaImportProgress.completed\} \/ \{mediaImportProgress.total\}/);
  const css = readFileSync(new URL("app/globals.css", root), "utf8");
  assert.match(css, /@keyframes media-import-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.editor-mode \.strip-block.is-import-revealing \{ animation: none; \}/);
});
