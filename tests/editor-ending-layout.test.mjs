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

test("reader endings follow content without editor flex space or an automatic margin", () => {
  assert.match(source, /const showsEndingCard = !isEditing && view !== "published";/);
  assert.match(css, /\.editor-mode \.strip-canvas \{\s*display: flex;\s*flex-direction: column;/);
  const rule = css.match(/\.is-strip-reader \.strip-canvas \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /display: block;/);
  assert.match(rule, /min-height: 0;/);
  assert.match(rule, /padding-bottom: 0;/);
  assert.match(rule, /background: var\(--black\);/);
  assert.doesNotMatch(css, /\.strip-canvas\.has-ending-card[^}]*margin-top:\s*auto/);
  assert.doesNotMatch(css, /\.strip-canvas\.has-ending-card\s*>\s*\.strip-ending-card/);
  assert.match(css, /\.is-strip-reader,\s*\.is-strip-reader \.editor-canvas,\s*\.is-strip-reader \.published-strip \{\s*min-height: 0;/);
  assert.match(css, /\.editor-mode \.strip-canvas > \.strip-block:not\(\.sticker-block\) \{\s*flex: 0 0 auto;/);
});

test("empty state shares the canvas instead of adding a second full viewport", () => {
  const rule = css.match(/\.empty-strip \{([^}]+)\}/)[1];
  assert.match(rule, /min-height: 0;/);
  assert.match(rule, /flex: 1 0 auto;/);
  assert.doesNotMatch(rule, /100[lsd]?vh/);
  assert.match(css, /\.editor-canvas \{\s*min-height: 100dvh;/);
  assert.match(css, /\.strip-canvas \{\s*position: relative;\s*min-height: inherit;/);
});

test("all three readers use only the sticker floor while the editor retains its own layout", () => {
  assert.ok(minHeight);
  for (const [view, inlinePreview] of [["edit", true], ["preview", false], ["published", false]]) {
    for (const stickerFloor of [0, 1, 180, 600, 1800]) {
      assert.equal(runInNewContext(minHeight, { stickerFloor, view, inlinePreview, isEditing: false }),
        stickerFloor > 0 ? `${stickerFloor}px` : undefined);
    }
  }
  for (const stickerFloor of [0, 180, 1800]) {
    assert.equal(runInNewContext(minHeight, { stickerFloor, view: "edit", inlinePreview: false, isEditing: true }), undefined);
  }
});

test("published sticker floors and editor toolbar clearance stay unchanged", () => {
  assert.equal(runInNewContext(minHeight, {stickerFloor: 180, view: "published", inlinePreview: false, isEditing: false}), "180px");
  assert.match(css, /\.editor-mode \.strip-canvas \{[^}]*padding-bottom: calc\(148px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.strip-end-sheet \{[^}]*min-height: 0;[^}]*var\(--dock-bottom-gap\) - var\(--ending-paint-overlap\)/);
  assert.doesNotMatch(css, /\.editor-mode \.strip-ending-card \{/);
});

test("keyboard scroll room preserves the editor's content floor", () => {
  assert.match(css, /\.editor-mode \.strip-canvas \{[^}]*min-height: var\(--editor-canvas-min-height\);/);
  const rule = css.match(/\.keyboard-settling \.editor-mode:not\(\.is-strip-reader\) \.strip-canvas \{([^}]+)\}/)[1];
  assert.match(rule, /--editor-canvas-min-height: calc\(\s*200dvh \+ var\(--keyboard-inset, 0px\) \+ 32px - 148px/);
  for (const viewport of [600, 714, 852]) for (const keyboard of [0, 280, 340]) {
    const normalContentFloor = viewport - 148;
    const typingMinimum = 2 * viewport + keyboard + 32 - 148;
    const typingPadding = viewport + keyboard + 32;
    assert.equal(typingMinimum - typingPadding, normalContentFloor);
  }
});
