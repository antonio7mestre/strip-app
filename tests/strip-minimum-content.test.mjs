import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { hasScreenfulOfContent, minimumStripHeight, observeStripContent } from "../app/lib/strip-minimum-content.ts";

function fixture(heights, types = heights.map(() => "text"), screenHeight = 760, insets = { dock: 64, top: 0, bottom: 0 }) {
  const probes = new Set();
  const document = {
    body: { appendChild: probe => probes.add(probe) },
    createElement() {
      return {
        style: {}, setAttribute() {},
        getBoundingClientRect: () => ({ height: screenHeight - insets.dock - insets.top - insets.bottom + 48 }),
        remove() { probes.delete(this); },
      };
    },
  };
  const blocks = heights.map((height, i) => ({ id: String(i), type: types[i], content: "Hello", src: "media.jpg" }));
  const children = heights.map((height, i) => ({
    getAttribute: name => name === "data-block-id" ? String(i) : null,
    getBoundingClientRect: () => ({ height: height + 500 }),
    querySelector: selector => selector === ".block-crop-viewport" ? { getBoundingClientRect: () => ({ height }) } : null,
  }));
  const canvas = { ownerDocument: document, children, getBoundingClientRect: () => ({ height: 9000 }) };
  return { canvas, blocks, probes, document, ready: () => hasScreenfulOfContent(canvas, blocks) };
}

test("content needs a short extra beat beyond the bottom toolbar", () => {
  for (const [heights, expected] of [[[90], false], [[350, 343], false], [[350, 346], false], [[350, 394], true], [[1200], true], [[695.5], false], [[750], true]]) {
    const f = fixture(heights);
    assert.equal(f.ready(), expected);
    assert.equal(f.probes.size, 0);
  }
});

test("text, photos and videos contribute their visible heights, including crops", () => {
  assert.equal(fixture([200, 300, 260], ["text", "image", "video"]).ready(), true);
  assert.equal(fixture([200, 240, 250], ["text", "image", "video"]).ready(), false);
  assert.equal(fixture([500], ["video"]).ready(), false, "the crop, not natural height or controls, counts");
});

test("floating stickers, missing sources, tools and footer cannot fill a screen", () => {
  const f = fixture([100, 900, 70, 800, 800], ["text", "sticker", "text", "image", "video"]);
  f.blocks[2].content = " \n\t ";
  f.blocks[3].src = "";
  f.blocks[4].src = "";
  f.canvas.children.push({ getAttribute: () => null, querySelector: () => { throw Error("Footer must not be measured"); } });
  assert.equal(f.ready(), false);
});

test("full-screen mixed strips count colored text blocks even without words", () => {
  for (const content of ["", " \n\t ", "A caption"]) {
    const f = fixture([138.078125, 560], ["text", "image"], 714);
    f.blocks[0].content = content;
    assert.equal(f.ready(), true, "698px of rendered blocks clears the toolbar edge by 48px");
  }
  const short = fixture([71, 240], ["text", "image"], 714);
  short.blocks[0].content = "";
  assert.equal(short.ready(), false, "a small empty block cannot count its canvas padding");
});

test("each tap remeasures after adding, removing or resizing content", () => {
  const f = fixture([380, 400]);
  assert.equal(f.ready(), true);
  f.blocks.pop();
  assert.equal(f.ready(), false, "a departing block still in the DOM does not count");
  f.canvas.children[0].querySelector = () => ({ getBoundingClientRect: () => ({ height: 780 }) });
  assert.equal(f.ready(), true);
  f.canvas.children[0].querySelector = () => ({ getBoundingClientRect: () => ({ height: 600 }) });
  assert.equal(f.ready(), false);
});

test("keyboard height, scroll position, Safari chrome and canvas padding do not change the minimum", () => {
  const f = fixture([500]);
  const original = f.document.body.appendChild;
  f.document.body.appendChild = probe => {
    assert.match(probe.style.cssText, /height:calc\(100vh - .*height:calc\(100svh - /);
    assert.match(probe.style.cssText, /var\(--dock-visible-height, 64px\)/);
    assert.match(probe.style.cssText, /env\(safe-area-inset-top, 0px\)/);
    assert.match(probe.style.cssText, /env\(safe-area-inset-bottom, 0px\)/);
    assert.match(probe.style.cssText, /position:fixed/);
    original(probe);
  };
  for (const height of [300, 400, 760, 820]) {
    globalThis.window = { innerHeight: height, visualViewport: { height, offsetTop: 650 }, scrollY: 9000 };
    assert.equal(f.ready(), false);
  }
  delete globalThis.window;
  assert.equal(f.probes.size, 0);
});

test("iPhone safe areas and the toolbar are not treated as missing content", () => {
  const insets = { dock: 64, top: 62, bottom: 34 };
  assert.equal(fixture([648], ["text"], 760, insets).ready(), true);
  assert.equal(fixture([647.5], ["image"], 760, insets).ready(), true);
  assert.equal(fixture([645], ["video"], 760, insets).ready(), false);
});

test("missing layout and invalid measurements fail safely; probes are always removed", () => {
  assert.equal(hasScreenfulOfContent(null, []), false);
  for (const height of [0, -20, NaN, Infinity]) assert.equal(fixture([1200], ["image"], height).ready(), false);
  for (const height of [NaN, Infinity, -500]) assert.equal(fixture([height]).ready(), false);
  const f = fixture([900]);
  f.canvas.children[0].querySelector = () => null;
  assert.equal(f.ready(), false);
  const original = f.document.createElement;
  f.document.createElement = () => {
    const probe = original();
    probe.getBoundingClientRect = () => { throw Error("layout failed"); };
    return probe;
  };
  assert.throws(() => minimumStripHeight(f.document), /layout failed/);
  assert.equal(f.probes.size, 0);
});

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(name, node = tree) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) return node;
  return ts.forEachChild(node, child => find(name, child));
}
test("Continue gives a gentle notice without losing the draft, selection or scroll, then allows retry", () => {
  const compiled = ts.transpileModule(`export const ${find("continueToPublish").getText(tree)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const view of ["edit", "preview"]) {
    const f = fixture([140]);
    const state = { notice: "", view, selected: "text", editing: "text", tool: "font" };
    const lock = { current: false }, scroll = { current: null }, exports = {};
    runInNewContext(compiled, {
      exports, hasContent: true, blocks: f.blocks, stripCanvasRef: { current: f.canvas }, hasScreenfulOfContent,
      pageTransitionInFlightRef: lock, publishFlowStartScrollRef: scroll, view,
      window: { scrollY: 720 }, coverChoices: [{ kind: "color", key: "blue" }], selectedCover: null,
      setNotice: value => { state.notice = value; },
      showActionNotice: value => { state.notice = value; },
      setSelectedCover: value => { state.cover = value; }, setActiveCoverKey() {}, setCoverStackStarted() {}, setCoverColorPickerOpen() {},
      setEditingTextBlockId: value => { state.editing = value; }, setActiveTextTool: value => { state.tool = value; },
      setInlinePreview() {}, setPublishSetupReturnView: value => { state.returnView = value; },
      setViewInstantly: value => { state.view = value; },
    });
    exports.continueToPublish();
    assert.deepEqual(state, { notice: "Add more content to publish your Strip", view, selected: "text", editing: "text", tool: "font" });
    assert.equal(lock.current, false); assert.equal(scroll.current, null);
    f.canvas.children[0].querySelector = () => ({ getBoundingClientRect: () => ({ height: 900 }) });
    exports.continueToPublish();
    assert.equal(state.view, "publish-setup"); assert.equal(state.returnView, view);
    assert.equal(state.notice, ""); assert.equal(state.cover, "blue");
    assert.equal(scroll.current, 720); assert.equal(lock.current, false);
  }
});

test("the live canvas ref and shared guard are used by Preview and both Continue entry points", () => {
  assert.match(source, /ref=\{stripCanvasRef\}\s+className=\{`strip-canvas/);
  assert.equal((source.match(/onClick=\{continueToPublish\}/g) ?? []).length, 2);
  assert.match(find("toggleInlinePreview").getText(tree), /!inlinePreview && !hasScreenfulOfContent\(stripCanvasRef.current, blocks\)/);
  assert.match(find("continueToPublish").getText(tree), /!hasScreenfulOfContent\(stripCanvasRef.current, blocks\)/);
  assert.doesNotMatch(source, /disabled=\{!hasContent\}/, "empty Strips can tap Continue to see the explanation");
});

test("content feedback readiness follows crop resizing and removes all observers on close", () => {
  const f = fixture([140]), values = [], listeners = new Map(), observers = [];
  class Observer {
    targets = [];
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  }
  f.canvas.querySelectorAll = () => f.canvas.children.map(child => child.querySelector(".block-crop-viewport"));
  globalThis.ResizeObserver = globalThis.MutationObserver = Observer;
  globalThis.window = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  try {
    const dispose = observeStripContent(f.canvas, f.blocks, ready => values.push(ready));
    assert.deepEqual(values, [false]);
    f.canvas.children[0].querySelector = () => ({ getBoundingClientRect: () => ({ height: 900 }) });
    observers[0].callback(); assert.equal(values.at(-1), true);
    f.blocks.pop(); observers[1].callback(); assert.equal(values.at(-1), false);
    assert.equal(listeners.size, 1); assert(listeners.has("resize"));
    dispose(); const before = values.length;
    observers.forEach(observer => observer.callback());
    assert.equal(values.length, before);
    assert(observers.every(observer => !observer.targets.length));
    assert.equal(listeners.size, 0);
    observeStripContent(null, [], ready => assert.equal(ready, false));
  } finally {
    delete globalThis.ResizeObserver; delete globalThis.MutationObserver; delete globalThis.window;
  }
});
