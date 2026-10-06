import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeStickerWidth, resizeStickerWidth, STICKER_MAX_WIDTH, STICKER_MIN_RESIZE_WIDTH } from "../app/lib/sticker-sizing.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("app/page.tsx");

test("every allowed editor width survives saving exactly, including enlarged frames and fractions", () => {
  assert.equal(STICKER_MAX_WIDTH, 92);
  assert.equal(STICKER_MIN_RESIZE_WIDTH, 10);
  for (const width of [8, 9.5, 10, 32, 79.875, 80, 80.001, 86.625, 90, 91.99999, 92]) {
    assert.equal(normalizeStickerWidth(width), width);
  }
  for (let step = 0; step <= 1000; step++) {
    const width = resizeStickerWidth(step / 7);
    assert.equal(normalizeStickerWidth(width), width, "autosave and publish accept all pinch sizes unchanged");
  }
});

test("invalid inputs stay bounded and legacy numeric values still behave the same", () => {
  for (const input of [undefined, NaN, Infinity, -Infinity, "bad", {}]) assert.equal(normalizeStickerWidth(input), 30);
  for (const input of [-20, 0, null, "", 7]) assert.equal(normalizeStickerWidth(input), 8);
  for (const input of [93, 100, 1000000]) assert.equal(normalizeStickerWidth(input), 92);
  assert.equal(normalizeStickerWidth("86.625"), 86.625);
  assert.equal(resizeStickerWidth(0), 10);
  assert.equal(resizeStickerWidth(200), 92);
  assert.equal(resizeStickerWidth(86.625), 86.625);
});

test("both pinch paths and both persistence paths use the shared sizing rule", () => {
  assert.equal((source.match(/const width = resizeStickerWidth\(transform\.width \* \(distance \/ transform\.distance\)\)/g) ?? []).length, 2);
  for (const path of ["app/api/drafts/route.ts", "app/api/strips/route.ts"]) {
    const route = read(path);
    assert.match(route, /width: normalizeStickerWidth\(block\.width\)/);
    assert.doesNotMatch(route, /width: Math\.min\(80/);
  }
});

test("the actual sticker renderer uses identical fractional geometry in editor, preview, and published views", () => {
  const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "StripStickerBlock");
  assert.ok(component);
  const code = `import { useRef, useState, useEffect, useLayoutEffect } from "react";\nexport ${component.getText(tree)}`;
  const exports = {}, require = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports, require,
    packStickerForSource: () => undefined,
    StickerImage: props => React.createElement("img", props),
  });
  for (const width of [80.001, 86.625, 90, 92]) {
    const styles = [true, false, false].map(isEditing => {
      const html = renderToStaticMarkup(React.createElement(exports.StripStickerBlock, {
        block: { id: "frame-qa", type: "sticker", src: "/frame.webp", x: 47.125, y: 524.5, width, rotation: -17.25 },
        isEditing, isSelected: false, isOverlappingSelection: false,
        onTapSelectedText: () => false, onSelect() {}, onTransform() {}, onLowerBoundaryAttempt() {},
      }));
      return html.match(/<figure[^>]*style="([^"]+)"/)[1];
    });
    assert.equal(styles[0], styles[1]);
    assert.equal(styles[1], styles[2]);
    assert.ok(styles[0].includes(`width:${width}%`));
    assert.ok(styles[0].includes("left:47.125%;top:524.5px"));
    assert.ok(styles[0].includes("--sticker-rotation:-17.25deg"));
  }
});
