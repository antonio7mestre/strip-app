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
runInNewContext(ts.transpileModule(read("app/components/MediaImportPopup.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require });

test("media loading uses the delete confirmation surface with an accessible progress count", () => {
  for (const [completed, total, expected] of [[0, 6, 0], [3, 6, 50], [6, 6, 100], [99, 6, 100], [-1, 1, 0]]) {
    const html = renderToStaticMarkup(React.createElement(exports.MediaImportPopup, { progress: { completed, total } }));
    assert.match(html, /class="confirmation-backdrop media-import-popup"/);
    assert.match(html, /class="confirmation-card media-import-card" role="status"/);
    assert.match(html, /aria-live="polite" aria-atomic="true"/);
    assert.match(html, /aria-busy="true"/);
    assert.ok(html.includes(`--media-import-progress:${expected}%`));
    assert.match(html, /Adding media<span class="media-import-dots"/);
    assert.doesNotMatch(html, /strip-block|data-block-id|<button|<img|<video/);
  }
});

test("the popup fades out over the ready batch without changing canvas geometry", () => {
  const html = renderToStaticMarkup(React.createElement(exports.MediaImportPopup, {
    progress: { completed: 6, total: 6 }, revealing: true,
  }));
  assert.match(html, /media-import-popup is-revealing/);
  const css = read("app/globals.css"), page = read("app/page.tsx");
  assert.match(css, /\.confirmation-backdrop\.media-import-popup\.is-revealing \{ opacity: 0; \}/);
  assert.match(css, /transition: opacity 200ms ease-out/);
  assert.match(css, /\.confirmation-backdrop \{[^}]*position: fixed;[^}]*place-items: center;/);
  assert.match(css, /\.confirmation-card \{[^}]*width: min\(100%, 360px\);[^}]*border-radius: 22px;/);
  assert.match(page, /createPortal\(\s*<MediaImportPopup/);
  assert.doesNotMatch(page, /withMediaImportBlock|pendingMediaIsLeading|--media-import-height|is-import-first/);
  assert.doesNotMatch(css, /media-import-first-size|media-import-block|media-import-offset/);
});

test("the popup stays readable, animates its dots and keeps existing tool loading feedback", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.media-import-dots > span \{ animation: media-import-dot 1200ms/);
  assert.match(css, /\.media-import-dots > span:nth-child\(2\) \{ animation-delay: 160ms; \}/);
  assert.match(css, /\.media-import-dots > span:nth-child\(3\) \{ animation-delay: 320ms; \}/);
  assert.match(css, /\.confirmation-backdrop\.media-import-popup \{[^}]*pointer-events: none;/);
  assert.match(css, /\.media-import-fill \{[^}]*transition: width 180ms ease-out/);
  assert.doesNotMatch(css, /prefers-reduced-motion/);
});
