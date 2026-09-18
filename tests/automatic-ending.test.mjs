import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { automaticStripEndingStyle, readStripContent, writeStripContent } from "../app/lib/strip-ending.ts";

const black = { backgroundColor: "#000000", buttonColor: "#FFFFFF" };
const white = { backgroundColor: "#FFFFFF", buttonColor: "#000000" };
const text = (color) => ({ id: "text", type: "text", backgroundColor: color });

test("the last text background chooses a high-contrast monochrome card", () => {
  for (const color of ["#000000", "#003BEA", "#3155FF", "#222", "#ff0000"]) {
    const expected = color === "#ff0000" ? black : white;
    assert.deepEqual(automaticStripEndingStyle([text(color)]), expected, color);
  }
  for (const color of ["#FFFFFF", "#66FF8A", "#9772FF", "#FFFF00", "#ff5500", "#fff"]) {
    assert.deepEqual(automaticStripEndingStyle([text(color)]), black, color);
  }
});

test("only the last in-flow block counts, never an overlaid sticker", () => {
  const blocks = [text("#fff"), { ...text("#000"), id: "last" }, { id: "sticker", type: "sticker" }];
  assert.deepEqual(automaticStripEndingStyle(blocks), white);
  assert.equal(blocks[0].backgroundColor, "#fff", "does not reorder source blocks");
  assert.deepEqual(automaticStripEndingStyle([]), black);
  assert.deepEqual(automaticStripEndingStyle([{ id: "sticker", type: "sticker" }]), black);
});

test("photos and videos use their sampled edge, with stable missing-media fallback", () => {
  for (const type of ["image", "video"]) {
    const blocks = [text("#fff"), { id: "media", type }];
    assert.deepEqual(automaticStripEndingStyle(blocks, { media: "#f4f4f4" }), black);
    assert.deepEqual(automaticStripEndingStyle(blocks, { media: "#101010" }), white);
    assert.deepEqual(automaticStripEndingStyle(blocks), white);
    assert.deepEqual(automaticStripEndingStyle(blocks, { media: "invalid" }), white);
  }
});

test("legacy ending records remain readable but cannot override automatic colors", () => {
  const saved = writeStripContent([text("#000000")], { backgroundColor: "#66ff8a", buttonColor: "#003bea" });
  const parsed = readStripContent(saved);
  assert.deepEqual(parsed.endingStyle, { backgroundColor: "#66FF8A", buttonColor: "#003BEA" });
  assert.deepEqual(automaticStripEndingStyle(parsed.blocks), white);
});

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function initializer(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) result = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result, name);
  return result;
}

test("edit mode never mounts the ending, while both preview routes retain it", () => {
  const gate = initializer("showsEndingCard");
  for (const [view, isEditing, expected] of [["edit", true, false], ["edit", false, true], ["preview", false, true], ["published", false, false]]) {
    assert.equal(runInNewContext(gate, { view, isEditing }), expected);
  }
  assert.match(source, /\{showsEndingCard \? \(\s*<section/);
  assert.match(source, /extendBottomEdge=\{!isEditing && trailingFlowBlock\?\.id === block\.id\}/);
  assert.match(source, /\{!isEditing && trailingFlowBlock\?\.id === block\.id \? \(\s*<MediaEdgeExtension/);
});

test("published and preview colors derive from their own blocks and drive the safe area too", () => {
  const expression = initializer("visibleEndingStyle");
  const bindings = { automaticStripEndingStyle, blocks: [text("#fff")], openedPublishedStrip: { blocks: [text("#000")] }, imageTrayColors: {} };
  assert.deepEqual(runInNewContext(expression, { ...bindings, view: "published" }), white);
  assert.deepEqual(runInNewContext(expression, { ...bindings, view: "edit" }), black);
  assert.deepEqual(runInNewContext(expression, { ...bindings, view: "preview" }), black);
  assert.match(source, /bottomColor: visibleEndingStyle\.backgroundColor/);
  assert.match(source, /const cleanViewBottomSurfaceColor =[\s\S]*?\? visibleEndingStyle\.backgroundColor/);
});

function renderFixture(blocks, isEditing) {
  const exports = {};
  const code = ts.transpileModule(`export const renderStrip = ${initializer("renderStrip")}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const stub = () => null;
  runInNewContext(code, {
    exports,
    require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }),
    blocks, visibleEndingStyle: automaticStripEndingStyle(blocks),
    view: "edit", inlinePreview: !isEditing,
    mediaLoadStatus: Object.fromEntries(blocks.map(block => [block.id, "loaded"])),
    selectedBlockId: null, editingTextBlockId: null, heightCropSession: null,
    resolveBlockHeightCrop: () => null,
    trackBlockTapGesture: stub, cancelBlockTapGesture: stub,
    renderBlockControls: stub, recordBlockHeight: stub, BlockHeightReporter: stub,
    DEFAULT_BACKGROUND: "#000000", DEFAULT_FONT_SIZE: 24, FONT_STACKS: { sans: "Arial" },
    contrastColor: color => color === "#FFFFFF" ? "#000000" : "#FFFFFF",
    installEndingContact: stub, StripEndActions: stub, handlePreviewEndingAction: stub,
    MediaEdgeExtension: "media-edge-extension",
  });
  return exports.renderStrip(isEditing);
}

test("actual renderer removes the editor card and its extra paint for empty, text and photo strips", () => {
  for (const blocks of [[], [{ ...text("#9772FF"), content: "Hello" }], [{ id: "photo", type: "image", src: "/test.jpg", alt: "Test" }]]) {
    const edit = JSON.stringify(renderFixture(blocks, true));
    assert.doesNotMatch(edit, /strip-ending-card|has-ending-card|media-edge-extension|ending-background/);
    const preview = JSON.stringify(renderFixture(blocks, false));
    assert.match(preview, /strip-ending-card/);
    assert.match(preview, /ending-background/);
    assert.doesNotMatch(preview, /data-block-id":"strip-ending"|is-selected/);
    if (blocks[0]?.type === "image") assert.match(preview, /media-edge-extension/);
  }
});
