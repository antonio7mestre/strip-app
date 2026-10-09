import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as edge from "../app/lib/media-edge.ts";
import { HapticActionButton } from "./helpers/haptic-action.mjs";

const compiled = ts.transpileModule(
  readFileSync(new URL("../app/components/MediaEdgeExtension.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ frameCallbacks = true, seamOverlap = 0, image = false, published = false,
  loaded = true, complete = loaded, controlledDecode = false, offsetTop = 0 } = {}) {
  class Target {
    listeners = new Map();
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(callback);
    }
    removeEventListener(name, callback) {
      this.listeners.get(name)?.delete(callback);
      if (this.listeners.get(name)?.size === 0) this.listeners.delete(name);
    }
    emit(name) { this.listeners.get(name)?.forEach(callback => callback({ target: this })); }
  }
  const frames = new Map();
  const animations = new Map();
  const contexts = [];
  const intersections = [];
  const resizes = [];
  const decodes = [];
  let sequence = 0;
  let paints = 0;
  let visiblePaints = 0;
  let modeLookups = 0;
  const mediaBounds = () => ({ top: offsetTop, bottom: offsetTop + 800, height: 800, width: 400 });
  class Video extends Target {
    videoWidth = 1000;
    videoHeight = 2000;
    readyState = 2;
    paused = false;
    ended = false;
    getBoundingClientRect() { return mediaBounds(); }
    requestVideoFrameCallback(callback) { frames.set(++sequence, callback); return sequence; }
    cancelVideoFrameCallback(id) { frames.delete(id); }
  }
  class Image extends Target {
    naturalWidth = loaded ? 1000 : 0;
    naturalHeight = loaded ? 2000 : 0;
    complete = complete;
    src = "existing-photo.jpg";
    currentSrc = "existing-photo-1280.webp";
    decoded = !controlledDecode;
    decode() {
      const source = this.currentSrc || this.src;
      return new Promise((resolve, reject) => {
        const decode = { source,
          resolve: () => {
            if ((this.currentSrc || this.src) === source) this.decoded = true;
            resolve();
          },
          reject: () => reject(new Error("Image decode unavailable")),
        };
        decodes.push(decode);
        if (!controlledDecode) decode.resolve();
      });
    }
    getBoundingClientRect() { return mediaBounds(); }
  }
  const video = new Video();
  if (!frameCallbacks) video.requestVideoFrameCallback = undefined;
  const media = image ? new Image() : video;
  const viewport = { getBoundingClientRect: () => ({ top: offsetTop, bottom: offsetTop + 800 }) };
  const block = new Target();
  block.querySelector = (selector) => selector === ".block-crop-viewport" ? viewport : media;
  block.closest = (selector) => {
    modeLookups++;
    return published && selector === ".published-mode" ? block : null;
  };
  const context = {
    resetTransform() {}, clearRect() {}, setTransform() {},
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    drawImage(source) { paints++; if (!(source instanceof Image) || source.decoded) visiblePaints++; },
  };
  const canvas = {
    width: 300, height: 150, parentElement: block,
    getContext: (type, options) => {
      contexts.push({ type, options: options && { ...options } });
      return context;
    },
    getBoundingClientRect: () => ({ top: offsetTop + 800 - seamOverlap, width: 400, height: 44 + seamOverlap }),
  };
  const document = new Target();
  document.hidden = false;
  const effects = [];
  const dependencies = [];
  let refs = 0;
  const exported = {};
  class Observer {
    disconnected = false;
    targets = [];
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  runInNewContext(compiled, {
    exports: exported,
    require: (name) => {
      if (name === "react") return {
        useRef: () => ({ current: refs++ === 0 ? canvas : null }),
        useLayoutEffect: (effect, deps) => { effects.push(effect); dependencies.push([...deps]); },
      };
      if (name === "react/jsx-runtime") return { jsx: () => null };
      if (name === "@/app/lib/media-edge") return edge;
      throw new Error(name);
    },
    HTMLImageElement: Image,
    HTMLVideoElement: Video,
    window: { devicePixelRatio: 3, innerHeight: 800 },
    document,
    ResizeObserver: class extends Observer { constructor(callback) { super(); resizes.push(this); this.callback = callback; } },
    IntersectionObserver: class extends Observer {
      constructor(callback, options) { super(); intersections.push(this); this.callback = callback; this.options = { ...options }; }
    },
    requestAnimationFrame: (callback) => { animations.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id) => animations.delete(id),
  });
  exported.MediaEdgeExtension({ src: image ? "existing-photo.jpg" : "existing-video.mp4", cropTop: 0 });
  const cleanups = effects.map((effect) => effect());
  return {
    video, media, document, frames, animations, canvas, block, viewport, contexts, intersections, resizes, dependencies, decodes,
    get intersection() { return intersections.at(-1); },
    get resized() { return resizes.at(-1); },
    paints: () => paints,
    visiblePaints: () => visiblePaints,
    modeLookups: () => modeLookups,
    cropChanged: effects[1],
    sourceChanged: () => { cleanups[0]?.(); cleanups[0] = effects[0](); },
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

for (const reader of ["inline preview", "standalone preview", "published"]) {
  const published = reader === "published";

test(`${reader} photos prepaint a 3x edge offscreen without intersection or frame scheduling`, () => {
  const f = fixture({ image: true, published, seamOverlap: 1, offsetTop: 2400 });
  assert.deepEqual(f.contexts, [{ type: "2d", options: { willReadFrequently: true } }]);
  assert.equal(f.canvas.width, 1200);
  assert.equal(f.canvas.height, 135);
  assert.ok(f.paints() > 0, "the edge is painted even when entirely below the viewport");
  assert.equal(f.intersections.length, 0, "scroll visibility cannot allocate or repaint this edge");
  assert.equal(f.modeLookups(), 0, "photo behavior does not depend on a reader mode class");
  assert.deepEqual(f.resized.targets, [f.media, f.viewport, f.canvas]);
  assert.deepEqual(f.dependencies, [["existing-photo.jpg"], [0, undefined]]);

  for (const refresh of [() => f.media.emit("load"), f.cropChanged, () => f.resized.callback()]) {
    const before = f.paints();
    refresh();
    assert.equal(f.paints(), before + 2, "source and reflected seam pixels stay current");
    assert.equal(f.frames.size + f.animations.size, 0, "a still photo does not start a paint loop");
  }
  f.unmount();
  assert.ok(f.resized.disconnected);
  assert.equal(f.media.listeners.size + f.block.listeners.size + f.document.listeners.size, 0);
});

test(`${reader} photos loading offscreen allocate and paint their Retina edge immediately`, () => {
  const f = fixture({ image: true, published, loaded: false, seamOverlap: 1, offsetTop: 2400 });
  assert.equal(f.paints(), 0);
  assert.equal(f.canvas.width, 300, "an unavailable source has not been painted");
  f.media.naturalWidth = 1000;
  f.media.naturalHeight = 2000;
  f.media.complete = true;
  f.media.emit("load");
  assert.equal(f.paints(), 2);
  assert.equal(f.canvas.width, 1200);
  assert.equal(f.canvas.height, 135);
  assert.equal(f.intersections.length, 0);
  assert.equal(f.contexts.length, 1, "the initial non-accelerated context is reused on load");
  assert.equal(f.frames.size + f.animations.size, 0);
  f.unmount();
});

test(`${reader} photo source changes rebuild observation and repaint without adding a visibility path`, () => {
  const f = fixture({ image: true, published, seamOverlap: 1, offsetTop: 2400 });
  const originalResize = f.resized;
  const before = f.paints();
  f.sourceChanged();
  assert.ok(originalResize.disconnected);
  assert.notEqual(f.resized, originalResize);
  assert.equal(f.paints(), before + 2);
  assert.deepEqual(f.contexts, [
    { type: "2d", options: { willReadFrequently: true } },
    { type: "2d", options: { willReadFrequently: true } },
  ]);
  assert.equal(f.intersections.length, 0);
  assert.equal(f.frames.size + f.animations.size, 0);
  f.unmount();
  const after = f.paints();
  f.resized.callback();
  f.cropChanged();
  assert.equal(f.paints(), after, "late callbacks cannot paint a disposed edge");
  assert.ok(f.resizes.every((observer) => observer.disconnected));
});

test(`${reader} still edges respect page visibility without relying on intersection`, () => {
  const f = fixture({ image: true, published });
  f.document.hidden = true;
  const before = f.paints();
  f.media.emit("load");
  f.cropChanged();
  f.resized.callback();
  assert.equal(f.paints(), before);
  f.document.hidden = false;
  f.document.emit("visibilitychange");
  assert.equal(f.paints(), before + 1);
  assert.equal(f.frames.size + f.animations.size, 0);
  f.unmount();
});
}

test("an offscreen photo repaints real pixels when decode completes after its load event", async () => {
  const f = fixture({ image: true, loaded: false, controlledDecode: true, seamOverlap: 1, offsetTop: 2400 });
  assert.equal(f.decodes.length, 0);
  f.media.naturalWidth = 1000;
  f.media.naturalHeight = 2000;
  f.media.complete = true;
  f.media.emit("load");
  assert.equal(f.paints(), 2, "the immediate load paint can run before Safari exposes pixels");
  assert.equal(f.visiblePaints(), 0);
  assert.equal(f.decodes.length, 1);
  assert.equal(f.media.listeners.get("load").size, 1, "one handler owns both refresh and decode");
  f.decodes[0].resolve();
  await tick();
  assert.equal(f.visiblePaints(), 2, "decode completion repaints the original seam and reflected band");
  assert.equal(f.intersections.length, 0);
  assert.equal(f.frames.size + f.animations.size, 0);
  assert.equal(f.decodes.length, 1, "the decoded paint does not request another decode");
  f.unmount();
});

test("initial decoding waits for a complete image with usable dimensions", () => {
  for (const options of [{ loaded: true, complete: false }, { loaded: false, complete: true }]) {
    const f = fixture({ image: true, controlledDecode: true, ...options });
    assert.equal(f.decodes.length, 0);
    f.unmount();
  }
  const ready = fixture({ image: true, controlledDecode: true });
  assert.equal(ready.decodes.length, 1);
  ready.unmount();
});

test("duplicate loads share one pending decode and other refreshes cannot create decode work", async () => {
  const f = fixture({ image: true, controlledDecode: true });
  assert.equal(f.decodes.length, 1);
  for (let index = 0; index < 3; index++) f.media.emit("load");
  for (const event of ["loadeddata", "playing", "pause", "seeked", "ended", "timeupdate"]) f.media.emit(event);
  f.cropChanged();
  f.resized.callback();
  f.document.emit("visibilitychange");
  assert.equal(f.decodes.length, 1);
  const before = f.paints();
  f.decodes[0].resolve();
  await tick();
  assert.equal(f.paints(), before + 1);
  f.cropChanged();
  f.resized.callback();
  f.document.emit("visibilitychange");
  assert.equal(f.decodes.length, 1);
  assert.equal(f.frames.size + f.animations.size, 0);
  f.unmount();
});

test("a new responsive source gets its own decode and an older completion cannot paint it", async () => {
  const f = fixture({ image: true, controlledDecode: true });
  f.media.currentSrc = "replacement-photo-1920.webp";
  f.media.decoded = false;
  f.media.emit("load");
  assert.deepEqual(f.decodes.map(decode => decode.source), [
    "existing-photo-1280.webp", "replacement-photo-1920.webp",
  ]);
  const before = f.paints();
  f.decodes[0].resolve();
  await tick();
  assert.equal(f.paints(), before, "the old source's decode completion is stale");
  f.decodes[1].resolve();
  await tick();
  assert.equal(f.paints(), before + 1);
  assert.equal(f.visiblePaints(), 1);
  assert.equal(f.frames.size + f.animations.size, 0);
  f.unmount();
});

test("a rejected decode is contained and a later load can retry the same source", async () => {
  const f = fixture({ image: true, controlledDecode: true });
  const before = f.paints();
  f.decodes[0].reject();
  await tick();
  assert.equal(f.paints(), before);
  assert.equal(f.frames.size + f.animations.size, 0);
  f.media.emit("load");
  assert.equal(f.decodes.length, 2);
  f.decodes[1].resolve();
  await tick();
  assert.equal(f.visiblePaints(), 1);
  assert.equal(f.decodes.length, 2);
  f.unmount();
});

test("unmount and effect replacement reject stale pending decode paints", async () => {
  const removed = fixture({ image: true, controlledDecode: true });
  removed.unmount();
  const removedPaints = removed.paints();
  removed.decodes[0].resolve();
  await tick();
  assert.equal(removed.paints(), removedPaints);
  assert.equal(removed.media.listeners.size + removed.block.listeners.size + removed.document.listeners.size, 0);
  const replaced = fixture({ image: true, controlledDecode: true });
  replaced.sourceChanged();
  assert.equal(replaced.decodes.length, 2);
  const before = replaced.paints();
  replaced.decodes[0].resolve();
  await tick();
  assert.equal(replaced.paints(), before, "an old effect must not repaint through the new effect's canvas ref");
  replaced.decodes[1].resolve();
  await tick();
  assert.equal(replaced.paints(), before + 1);
  replaced.unmount();
});

test("published video retains the default context, visibility gate, and video frame callbacks", () => {
  const f = fixture({ published: true });
  assert.deepEqual(f.contexts, [{ type: "2d", options: undefined }]);
  assert.equal(f.intersections.length, 1);
  assert.deepEqual(f.intersection.options, { rootMargin: "160px" });
  assert.equal(f.frames.size, 1);
  assert.equal(f.animations.size, 0);
  assert.equal(f.decodes.length, 0, "video never enters the image decode lifecycle");
  f.intersection.callback([{ isIntersecting: false }]);
  assert.equal(f.frames.size, 0);
  f.intersection.callback([{ isIntersecting: true }]);
  assert.equal(f.frames.size, 1);
  f.unmount();
  assert.equal(f.frames.size, 0);
});

test("video edge stays synchronized, sleeps offscreen, and cleans up on unmount", () => {
  const f = fixture();
  assert.equal(f.frames.size, 1);
  assert.equal(f.animations.size, 0);
  assert.equal(f.canvas.width, 1200, "matches the original image on a 3x Retina display");
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

test("a matching source-edge overlap seals the join without moving the footer", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.media-edge-extension \{([^}]+)\}/)[1];
  assert.match(rule, /position: absolute/);
  assert.match(rule, /--media-edge-overlap: 1px/);
  assert.match(rule, /top: calc\(100% - var\(--media-edge-overlap\)\)/);
  assert.match(rule, /height: calc\(var\(--iphone-panel-radius\) \+ var\(--media-edge-overlap\)\)/);
  assert.match(rule, /pointer-events: none/);
  assert.doesNotMatch(css, /margin-top: calc\(-1 \* var\(--iphone-panel-radius\)\)/);
  assert.match(css, /\.strip-end-sheet-surface \{[^}]*box-shadow: var\(--bottom-bar-shadow\);/);
});

test("the seam is repainted with both original and mirrored pixels at fractional positions", () => {
  for (const seamOverlap of [1, 1.25, 1.5]) {
    const f = fixture({ seamOverlap });
    const before = f.paints();
    f.cropChanged();
    assert.equal(f.paints(), before + 2);
    assert.equal(f.canvas.height, Math.round((44 + seamOverlap) * 3));
    f.unmount();
  }
});

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const pageTree = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let found;
  function visit(node) {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(pageTree);
  assert.ok(found, "expected footer source node");
  return found;
}
function evaluate(source, bindings = {}) {
  const exports = {};
  const script = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(script, {
    ...bindings, exports,
    require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }),
  });
  return exports;
}

test("media edges are mounted only for trailing non-editable reader blocks", () => {
  const mounts = [];
  const videoEdgeProps = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageTree) === "MediaEdgeExtension") {
      let parent = node.parent;
      while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
      assert.ok(ts.isConditionalExpression(parent), "each edge mount has an explicit reader guard");
      assert.equal(parent.whenFalse.getText(pageTree), "null");
      mounts.push(parent.condition.getText(pageTree));
    }
    if (ts.isJsxAttribute(node) && node.name.getText(pageTree) === "extendBottomEdge") {
      assert.ok(ts.isJsxExpression(node.initializer));
      videoEdgeProps.push(node.initializer.expression.getText(pageTree));
    }
    ts.forEachChild(node, visit);
  }
  visit(pageTree);
  assert.deepEqual(mounts.sort(), ["!isEditing && trailingFlowBlock?.id === block.id", "extendBottomEdge"]);
  assert.deepEqual(videoEdgeProps, ["!isEditing && trailingFlowBlock?.id === block.id"]);
});

test("preview Publish enters cover setup without selecting an editor block", () => {
  const handler = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(pageTree) === "handlePreviewEndingPublish");
  const actions = findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === "StripEndActions");
  for (const buttonIndex of [1]) {
    let propagationStops = 0;
    const calls = [];
    const evaluated = evaluate(`export const ${handler.getText(pageTree)};\nexport ${actions.getText(pageTree)}`, {
      view: "edit", inlinePreview: true, continueToPublish: () => calls.push("publish"),
      Pencil: "pencil", Plus: "plus", Send: "send", HapticActionButton,
    });
    const tree = evaluated.StripEndActions({
      primaryAction: "edit", primaryLabel: "Edit Strip",
      onPrimary: () => assert.fail("Publish must not select a block"), onPublish: evaluated.handlePreviewEndingPublish,
    });
    const action = tree.props.children[buttonIndex];
    const button = action.type(action.props);
    button.props.onClick({ stopPropagation: () => propagationStops++ });
    assert.equal(propagationStops, 1);
    assert.deepEqual(calls, ["publish"]);
    assert.equal(tree.props.children[buttonIndex].props.children, "Publish");
    assert.equal(button.props["aria-label"], "Publish");
  }
});

test("the preview footer has no editing tools and uses the shared bottom-bar shadow", () => {
  const footer = findNode((node) => ts.isJsxOpeningElement(node) && node.tagName.getText(pageTree) === "StripEndingSheet" && node.attributes.getText(pageTree).includes("preview"));
  const props = footer.attributes.getText(pageTree);
  assert.doesNotMatch(props, /data-block-id|is-selected|onClick|tabIndex/);
  assert.doesNotMatch(pageSource, /renderEndingControls|activeEndingTool|endingIsSelected/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.strip-end-sheet-surface \{[^}]*box-shadow: var\(--bottom-bar-shadow\);/);
});

test("text backing sits under the entire raised surface in preview and live strips", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const backing = css.match(/\.strip-end-sheet-corner-fill \{([^}]+)\}/)[1];
  assert.match(backing, /height: var\(--iphone-panel-radius\)/);
  assert.match(backing, /z-index: 0/);
  assert.match(backing, /pointer-events: none/);
  assert.match(css, /\.strip-end-sheet\[data-touches-block\] > \.strip-end-sheet-corner-fill \{[^}]*var\(--ending-corner-color, transparent\)/);
  const surface = css.match(/\.strip-end-sheet-surface \{([^}]+)\}/)[1];
  assert.match(surface, /z-index: 1/);
  assert.match(surface, /border-radius: inherit/);
  assert.match(surface, /corner-shape: inherit/);
  const style = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(pageTree) === "publishedStripStyle");
  for (const publishedEndsWithText of [false, true]) {
    const result = evaluate(`export const ${style.getText(pageTree)};`, {
      visibleEndingStyle: { backgroundColor: "#66FF8A", buttonColor: "#003BEA" },
      publishedEndsWithText,
      trailingPublishedBlock: { backgroundColor: "#9772FF" },
      DEFAULT_BACKGROUND: "#000000", contrastColor: () => "#000000",
    }).publishedStripStyle;
    assert.equal(result["--ending-corner-color"], publishedEndsWithText ? "#9772FF" : undefined);
    assert.equal(result["--ending-background"], "#FFFFFF", "published actions always sit on white");
  }
});
