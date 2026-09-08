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

function fixture({ frameCallbacks = true, seamOverlap = 0 } = {}) {
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
    getBoundingClientRect: () => ({ top: 800 - seamOverlap, width: 400, height: 44 + seamOverlap }),
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
  assert.match(css, /\.strip-end-sheet \{[^}]*box-shadow: none;/);
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

test("both footer buttons select on first click and warn only after selection", () => {
  const handler = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(pageTree) === "handleEditorEndingAction");
  const actions = findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === "StripEndActions");
  for (const buttonIndex of [0, 1]) {
    for (const endingIsSelected of [false, true]) {
      let selections = 0;
      let propagationStops = 0;
      const notices = [];
      const evaluated = evaluate(`export const ${handler.getText(pageTree)};\nexport ${actions.getText(pageTree)}`, {
        endingIsSelected,
        selectEndingBlock: () => selections++,
        setNotice: (message) => notices.push(message),
        Pencil: "pencil", Plus: "plus", Send: "send",
      });
      const tree = evaluated.StripEndActions({
        primaryAction: "edit", primaryLabel: "Edit this Strip",
        onPrimary: evaluated.handleEditorEndingAction, onShare: evaluated.handleEditorEndingAction,
      });
      tree.props.children[buttonIndex].props.onClick({ stopPropagation: () => propagationStops++ });
      assert.equal(propagationStops, 1, "the same click must not also activate the container");
      assert.equal(selections, endingIsSelected ? 0 : 1);
      assert.deepEqual(notices, endingIsSelected ? ["Publish to use these buttons."] : []);
    }
  }
});

test("the footer suppresses its shadow only for its own selection or the final text selection", () => {
  const footer = findNode((node) => ts.isJsxOpeningElement(node) && node.tagName.getText(pageTree) === "section" && node.attributes.getText(pageTree).includes("strip-ending-card strip-end-sheet"));
  const className = footer.attributes.properties.find((property) => property.name?.getText(pageTree) === "className");
  const expression = className.initializer.expression.getText(pageTree);
  for (const [isEditing, endingFollowsText, selectedBlockId, expected] of [
    [true, true, "last-text", true],
    [true, true, "other-text", false],
    [true, false, "last-text", false],
    [false, true, "last-text", false],
  ]) {
    const result = evaluate(`export const className = ${expression};`, {
      isEditing, endingFollowsText, selectedBlockId, endingIsSelected: false,
      trailingFlowBlock: { id: "last-text" },
    });
    assert.equal(result.className.includes("is-after-selected-text"), expected);
  }
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.strip-ending-card\.is-selected,\s*\.strip-ending-card\.is-after-selected-text\s*\{\s*box-shadow: none;/);
});

test("text corner fill is confined to the rounded cutouts in editor and live strips", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.strip-canvas\.has-trailing-text > \.strip-ending-card::after,\s*\.published-strip\.has-trailing-text > \.published-bottom-sheet::after \{([^}]+)\}/)[1];
  assert.match(rule, /inset: 0/);
  assert.match(rule, /clip-path: inset\(0\)/);
  assert.match(rule, /border-radius: inherit/);
  assert.match(rule, /corner-shape: inherit/);
  assert.match(rule, /var\(--ending-corner-color\)/);
  assert.match(rule, /pointer-events: none/);
  const style = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(pageTree) === "publishedStripStyle");
  for (const publishedEndsWithText of [false, true]) {
    const result = evaluate(`export const ${style.getText(pageTree)};`, {
      visibleEndingStyle: { backgroundColor: "#66FF8A", buttonColor: "#003BEA" },
      publishedEndsWithText,
      trailingPublishedBlock: { backgroundColor: "#9772FF" },
      DEFAULT_BACKGROUND: "#000000", contrastColor: () => "#000000",
    }).publishedStripStyle;
    assert.equal(result["--ending-corner-color"], publishedEndsWithText ? "#9772FF" : undefined);
    assert.equal(result["--ending-background"], "#66FF8A", "the footer keeps its own color");
  }
});
