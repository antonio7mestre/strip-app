import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { hasScreenfulOfContent, minimumStripHeight } from "../app/lib/strip-minimum-content.ts";

function fixture(heights, types = heights.map(() => "text"), screenHeight = 760) {
  const probes = new Set();
  const document = {
    body: { appendChild: probe => probes.add(probe) },
    createElement() {
      return {
        style: {}, setAttribute() {},
        getBoundingClientRect: () => ({ height: screenHeight }),
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

test("short content is blocked; one screen and longer content pass", () => {
  for (const [heights, expected] of [[[90], false], [[350, 400], false], [[350, 410], true], [[1200], true], [[759.5], true]]) {
    const f = fixture(heights);
    assert.equal(f.ready(), expected);
    assert.equal(f.probes.size, 0);
  }
});

test("text, photos and videos contribute their visible heights, including crops", () => {
  assert.equal(fixture([200, 300, 260], ["text", "image", "video"]).ready(), true);
  assert.equal(fixture([200, 250, 250], ["text", "image", "video"]).ready(), false);
  assert.equal(fixture([500], ["video"]).ready(), false, "the crop, not natural height or controls, counts");
});

test("empty text, floating stickers, missing sources, tools and footer cannot fill a screen", () => {
  const f = fixture([100, 900, 800, 800, 800], ["text", "sticker", "text", "image", "video"]);
  f.blocks[2].content = " \n\t ";
  f.blocks[3].src = "";
  f.blocks[4].src = "";
  f.canvas.children.push({ getAttribute: () => null, querySelector: () => { throw Error("Footer must not be measured"); } });
  assert.equal(f.ready(), false);
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
    assert.match(probe.style.cssText, /height:100vh;height:100svh;/);
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
      setSelectedCover: value => { state.cover = value; }, setActiveCoverKey() {}, setCoverStackStarted() {}, setCoverColorPickerOpen() {},
      setEditingTextBlockId: value => { state.editing = value; }, setActiveTextTool: value => { state.tool = value; },
      setInlinePreview() {}, setPublishSetupReturnView: value => { state.returnView = value; },
      setViewInstantly: value => { state.view = value; },
    });
    exports.continueToPublish();
    assert.deepEqual(state, { notice: "Add a little more to fill one screen.", view, selected: "text", editing: "text", tool: "font" });
    assert.equal(lock.current, false); assert.equal(scroll.current, null);
    f.canvas.children[0].querySelector = () => ({ getBoundingClientRect: () => ({ height: 900 }) });
    exports.continueToPublish();
    assert.equal(state.view, "publish-setup"); assert.equal(state.returnView, view);
    assert.equal(state.notice, ""); assert.equal(state.cover, "blue");
    assert.equal(scroll.current, 720); assert.equal(lock.current, false);
  }
});

test("the live canvas ref and shared guard are used by both Continue entry points", () => {
  assert.match(source, /ref=\{stripCanvasRef\}\s+className=\{`strip-canvas/);
  assert.equal((source.match(/onClick=\{continueToPublish\}/g) ?? []).length, 2);
});
