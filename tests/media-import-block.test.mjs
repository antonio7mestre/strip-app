import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exports = {}, require = createRequire(import.meta.url);
runInNewContext(ts.transpileModule(read("app/components/MediaImportBlock.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require });

test("media loading renders one full-width Strip block with an accessible count, not a popup", () => {
  for (const [completed, total, expected] of [[0, 6, 0], [3, 6, 50], [6, 6, 100], [99, 6, 100], [-1, 1, 0]]) {
    const html = renderToStaticMarkup(React.createElement(exports.MediaImportBlock, { progress: { completed, total } }));
    assert.match(html, /<section class="strip-block media-import-block" role="status"/);
    assert.match(html, /aria-live="polite" aria-atomic="true"/);
    assert.match(html, /aria-busy="true"/);
    assert.ok(html.includes(`--media-import-progress:${expected}%`));
    assert.match(html, /<h2>Adding media<\/h2>/);
    assert.doesNotMatch(html, /class="notice|data-block-id|role="dialog"|<button|<img|<video/);
  }
});

test("the loading design stays in flow, reserves a stable height and only animates the progress line", () => {
  const css = read("app/globals.css");
  const block = css.match(/\.media-import-block \{[^}]+\}/)[0];
  assert.match(block, /width: 100%/);
  assert.match(block, /height: 240px/);
  assert.match(block, /background: #d9d9d9/);
  assert.match(block, /pointer-events: none/);
  assert.doesNotMatch(block, /position: fixed|position: absolute|animation|transition|transform|z-index/);
  assert.match(css, /\.media-import-block-fill \{[^}]*transition: width 180ms ease-out/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.media-import-block-fill \{ transition: none; \}/);
});
