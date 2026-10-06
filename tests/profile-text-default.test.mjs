import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { DEFAULT_PROFILE, PROFILE_COLORS, profileInk } from "../app/lib/profile.ts";
import { readStripContent, writeStripContent } from "../app/lib/strip-ending.ts";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definitions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) definitions.set(node.name.text, node.getText(tree));
  if (ts.isVariableDeclaration(node)) definitions.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  ts.forEachChild(node, visit);
}
visit(tree);
const code = ["nearestTextBlock", "contrastColor", "addText"].map(name => definitions.get(name)).join("\n");

function fixture(background, blocks = [], selected = null) {
  const exports = {}, profile = { ...DEFAULT_PROFILE, background };
  const state = { blocks, selected, editing: "old", tool: "background" };
  let id = 0;
  runInNewContext(ts.transpileModule(`${code}\nexport { addText };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, stripProfile: { profile },
    // An unrelated public profile must never supply the creator's color.
    visibleProfile: { ...DEFAULT_PROFILE, background: "#FF0099" },
    selectedBlockId: selected, DEFAULT_FONT_SIZE: 18,
    DEFAULT_BLOCK_BACKGROUND: "#3155FF", makeId: () => `new-${++id}`,
    setBlocks: update => { state.blocks = update(state.blocks); },
    setSelectedBlockId: value => { state.selected = value; },
    setEditingTextBlockId: value => { state.editing = value; },
    setActiveTextTool: value => { state.tool = value; },
  });
  return { ...exports, state, profile };
}

test("the first text block uses the account background with readable black/white ink for every profile color", () => {
  for (const background of [...PROFILE_COLORS.map(color => color.value), "#123456", "#F4F0E9", "#9a6021"]) {
    const h = fixture(background);
    h.addText();
    const block = h.state.blocks[0];
    assert.equal(block.backgroundColor, background);
    assert.equal(block.textColor, profileInk(background));
    assert.equal(block.content, "");
    assert.equal(block.fontStyle, "sans");
    assert.equal(block.fontSize, 18);
    assert.equal(h.state.selected, block.id);
    assert.equal(h.state.editing, null);
    assert.equal(h.state.tool, null);
  }
});

test("media-first Strips use the same personal color without moving or changing the media", () => {
  const image = { id: "photo", type: "image", src: "/photo.jpg" };
  const video = { id: "video", type: "video", src: "/video.mp4" };
  for (const selected of [null, "photo", "video"]) {
    const h = fixture("#BFFF00", [image, video], selected);
    h.addText();
    const position = selected === "photo" ? 1 : 2;
    assert.equal(h.state.blocks[position].backgroundColor, "#BFFF00");
    assert.equal(h.state.blocks[position].textColor, "#000000");
    assert.strictEqual(h.state.blocks[0], image);
    assert.strictEqual(h.state.blocks[selected === "photo" ? 2 : 1], video);
  }
});

test("intentional nearby text styling still wins over the profile default and old blocks are not recolored", () => {
  const existing = { id: "text", type: "text", content: "My words", backgroundColor: "#98004F", textColor: "#BFFF00", fontStyle: "shrikhand", fontSize: 32 };
  const image = { id: "photo", type: "image", src: "/photo.jpg" };
  for (const blocks of [[existing, image], [image, existing]]) {
    for (const selected of [null, "photo", "text"]) {
      const h = fixture("#3155FF", blocks, selected);
      h.addText();
      const added = h.state.blocks.find(block => block.id === "new-1");
      for (const key of ["backgroundColor", "textColor", "fontStyle", "fontSize"]) assert.equal(added[key], existing[key]);
      assert.strictEqual(h.state.blocks.find(block => block.id === "text"), existing);
      assert.equal(existing.content, "My words");
    }
  }
});

test("each fresh Strip reads the current account color, not a captured/global cobalt default", () => {
  const h = fixture("#FF4D00");
  h.addText();
  h.profile.background = "#8500FF";
  h.addText();
  assert.equal(h.state.blocks[0].backgroundColor, "#FF4D00");
  assert.equal(h.state.blocks[1].backgroundColor, "#FF4D00", "a Strip keeps its local design when the profile changes");
  h.state.blocks = [];
  h.addText();
  assert.equal(h.state.blocks[0].backgroundColor, "#8500FF", "the next empty Strip starts in the updated account color");
  assert.equal(h.state.blocks[0].textColor, "#FFFFFF");
});

test("the chosen default becomes saved block data, surviving draft/publish/reload without following later profile edits", () => {
  const h = fixture("#FF4D00");
  h.addText();
  const saved = writeStripContent(h.state.blocks);
  h.profile.background = "#000000";
  const block = readStripContent(saved).blocks[0];
  assert.equal(block.backgroundColor, "#FF4D00");
  assert.equal(block.textColor, "#000000");
  assert.equal(block.fontStyle, "sans");
  assert.equal(block.fontSize, 18);
});
