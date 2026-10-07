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
    assert.match(html, /<h2>Adding media<span class="media-import-dots" aria-hidden="true"><span>\.<\/span><span>\.<\/span><span>\.<\/span><\/span><\/h2>/);
    assert.doesNotMatch(html, /class="notice|data-block-id|role="dialog"|<button|<img|<video/);
  }
});

test("the loading label holds its position as only the first real photo takes over its size", () => {
  const html = renderToStaticMarkup(React.createElement(exports.MediaImportBlock, {
    progress: { completed: 6, total: 6 }, handoff: "revealing",
  }));
  assert.match(html, /class="strip-block media-import-block is-handoff is-revealing"/);
  const css = read("app/globals.css");
  const handoff = css.match(/\.media-import-block\.is-handoff \{[^}]+\}/)[0];
  assert.doesNotMatch(handoff, /position:|inset:|height:|transform:|z-index:|transition:/);
  assert.match(css, /\.media-import-block\.is-handoff > \* \{ animation: none; transition: opacity 160ms ease-out; \}/);
  assert.match(css, /\.media-import-block\.is-handoff\.is-revealing \{ height: 0; padding-block: 0; \}/);
  assert.match(css, /\.media-import-block\.is-handoff\.is-revealing > \* \{[^}]*position: absolute;[^}]*height: 240px;[^}]*opacity: 0;/);
  assert.match(css, /@keyframes media-import-first-size \{ from \{ height: 240px; \} to \{ height: var\(--media-import-height\); \} \}/);
  assert.match(css, /\.editor-mode \.strip-block\.is-import-ready\.is-import-first \{[^}]*height: var\(--media-import-height\);[^}]*animation: media-import-first-size 360ms/);
  assert.match(css, /\.editor-mode \.strip-block\.is-import-ready\.is-import-first > \.block-crop-viewport \{ animation: media-import-in 360ms/);
  assert.doesNotMatch(css, /\.media-import-block\.is-handoff\.is-leading/);
});

test("the ellipsis animates independently and stays still for reduced motion", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.media-import-dots > span \{ animation: media-import-dot 1200ms/);
  assert.match(css, /\.media-import-dots > span:nth-child\(2\) \{ animation-delay: 160ms; \}/);
  assert.match(css, /\.media-import-dots > span:nth-child\(3\) \{ animation-delay: 320ms; \}/);
  assert.match(css, /\.media-import-dots > span \{ animation: none; opacity: 1; \}/);
});

test("the loading design stays in flow with fixed geometry, a quiet label reveal and progress line", () => {
  const css = read("app/globals.css");
  const block = css.match(/\.media-import-block \{[^}]+\}/)[0];
  assert.match(block, /width: 100%/);
  assert.match(block, /height: 240px/);
  assert.match(block, /background: #d9d9d9/);
  assert.match(block, /pointer-events: none/);
  assert.doesNotMatch(block, /position: fixed|position: absolute|animation|transition|transform|z-index/);
  assert.match(css, /\.media-import-block-fill \{[^}]*transition: width 180ms ease-out/);
  assert.match(css, /\.media-import-block > \* \{ animation: media-import-in 140ms ease-out backwards; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.media-import-block-fill \{ transition: none; \}/);
  assert.match(css, /\.media-import-block > \* \{ animation: none; \}/);
});
