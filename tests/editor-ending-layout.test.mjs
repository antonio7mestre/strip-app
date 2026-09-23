import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let minHeight;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "canvasMinHeight") {
    minHeight = node.initializer.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);

test("short previews place the ending at the bottom; edit mode has no card", () => {
  assert.match(source, /const showsEndingCard = !isEditing && view !== "published";/);
  assert.match(css, /\.editor-mode \.strip-canvas,\s*\.strip-canvas\.has-ending-card/);
  assert.match(css, /\.strip-canvas\.has-ending-card \{\s*display: flex;\s*flex-direction: column;/);
  const rule = css.match(/\.editor-mode \.strip-canvas\.has-ending-card > \.strip-ending-card \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /margin-top: auto;/);
  assert.doesNotMatch(rule, /position:\s*(fixed|absolute|sticky)|min-height|height:|transform:/);
  assert.match(css, /\.strip-canvas\.has-ending-card > \.strip-block:not\(\.sticker-block\) \{\s*flex: 0 0 auto;/);
});

test("empty state shares the canvas instead of adding a second full viewport", () => {
  const rule = css.match(/\.empty-strip \{([^}]+)\}/)[1];
  assert.match(rule, /min-height: 0;/);
  assert.match(rule, /flex: 1 0 auto;/);
  assert.doesNotMatch(rule, /100[lsd]?vh/);
  assert.match(css, /\.editor-canvas \{\s*min-height: 100dvh;/);
  assert.match(css, /\.strip-canvas \{\s*position: relative;\s*min-height: inherit;/);
});

test("stickers leave the editor's content height unchanged; previews retain their floor", () => {
  assert.ok(minHeight);
  for (const inlinePreview of [false, true]) {
    for (const stickerFloor of [1, 180, 600, 1800]) {
      assert.equal(runInNewContext(minHeight, {stickerFloor, view: "edit", inlinePreview, isEditing: !inlinePreview}),
        inlinePreview ? `max(var(--editor-canvas-min-height, 100lvh), ${stickerFloor}px)` : undefined);
    }
  }
  assert.equal(runInNewContext(minHeight, {stickerFloor: 0, view: "edit", inlinePreview: false, isEditing: true}), undefined);
});

test("published sticker floors and editor toolbar clearance stay unchanged", () => {
  assert.equal(runInNewContext(minHeight, {stickerFloor: 180, view: "published", inlinePreview: false, isEditing: false}), "180px");
  assert.match(css, /\.editor-mode \.strip-canvas \{[^}]*padding-bottom: calc\(148px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.editor-mode \.strip-ending-card \{\s*min-height: 0;\s*padding-bottom: 12px;/);
});

test("keyboard scroll room stays below the ending instead of collapsing its auto margin", () => {
  assert.match(css, /\.editor-mode \.strip-canvas \{[^}]*min-height: var\(--editor-canvas-min-height\);/);
  const rule = css.match(/\.keyboard-settling \.editor-mode \.strip-canvas \{([^}]+)\}/)[1];
  assert.match(rule, /--editor-canvas-min-height: calc\(\s*200dvh \+ var\(--keyboard-inset, 0px\) \+ 32px - 148px/);
  for (const viewport of [600, 714, 852]) for (const keyboard of [0, 280, 340]) {
    const normalContentFloor = viewport - 148;
    const typingMinimum = 2 * viewport + keyboard + 32 - 148;
    const typingPadding = viewport + keyboard + 32;
    assert.equal(typingMinimum - typingPadding, normalContentFloor);
  }
});
