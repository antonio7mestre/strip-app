import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/wide-layout.css", import.meta.url), "utf8");
const base = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("desktop profile guidance is hidden and create sits above the pill's right edge", () => {
  const empty = readFileSync(new URL("../app/components/EmptyStripState.module.css", import.meta.url), "utf8");
  assert.match(empty, /@media \(min-width: 900px\) \{\s*\.profile \.guide \{ display: none; \}/);
  assert.match(css, /\.library-add-button \{\s*right: calc\(\(100% - var\(--desktop-pill-width\)\) \/ 2 \+ 12px\);\s*bottom: var\(--desktop-dock-clearance\)/);
});

test("desktop is only a capped mobile document and floating bottom surfaces", () => {
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /--page-max-width: 640px/);
  assert.match(css, /--page-vw: 6.4px/);
  assert.match(css, /\.app-shell,[\s\S]*max-width: var\(--page-max-width\);\s*margin-inline: auto/);
  assert.doesNotMatch(css, /zoom:|scale\(|overflow-y:|position: sticky/);
  assert.match(css, /--desktop-pill-width: 480px/);
  assert.match(css, /\.composer-dock \{[^}]*bottom: 28px;[^}]*border-radius: 40px/);
  assert.match(css, /\.strip-end-sheet \{ --dock-bottom-gap: 2px; \}/);
  assert.doesNotMatch(css, /\.strip-end-sheet \{[^}]*(?:width:|margin:|border-radius:)/);
  assert.match(css, /:is\(\.published-mode, \.preview-mode, \.is-inline-preview\) \.strip-end-sheet \{ padding-bottom: 28px; \}/);
  assert.match(css, /:is\(\.published-mode, \.preview-mode, \.is-inline-preview\) \.strip-end-sheet-controls \{ width: min\(calc\(100% - 20px\), 520px\)/);
});

test("phone sizing and safe-area bleed are unchanged below the desktop breakpoint", () => {
  assert.match(base, /--dock-bleed: 180px/);
  assert.match(base, /--dock-surface-extra: 0px/);
  assert.match(base, /--dock-bottom-gap: 2px/);
  assert.match(base, /font-size: clamp\(68px, calc\(22 \* var\(--page-vw, 1vw\)\), 208px\)/);
  assert.match(css, /--dock-bleed: 0px/);
  assert.match(css, /--dock-surface-extra: 16px/);
  for (const width of [320, 393, 640]) {
    assert.equal(width * 0.22, 22 * width / 100);
  }
});

test("only outside gutters get a neutral, smoothly transitioning theme tone", () => {
  assert.match(css, /width: calc\(\(100% - var\(--page-max-width\)\) \/ 2\)/);
  assert.match(css, /background-color: hsl\(from var\(--top-safe-area-color, #000000\) 0 0 calc\(12 \+ l \* 0.10\)\)/);
  assert.match(css, /transition: background-color 480ms ease/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("measured transition copies keep their own coordinates and menus stay at the bottom", () => {
  assert.match(css, /\.composer-dock.preview-motion-dock,[\s\S]*margin-inline: 0/);
  assert.match(css, /\.composer-dock.story-share-document-dock/);
  assert.doesNotMatch(css, /selector-dock[^}]*left:|grid-template-columns/);
});

test("picker arrows stack in the left gutter, centered opposite the dots", () => {
  assert.match(css, /\.stack-picker-arrows \{[^}]*left: calc\(\(100% - var\(--picker-card-width, 420px\)\) \/ 4\);[^}]*flex-direction: column/);
  assert.match(css, /\.cover-pagination \{[^}]*right: calc\(\(100% - var\(--picker-card-width, 420px\)\) \/ 4\)/);
});

test("desktop controls and notices clear the actual floating pill", () => {
  assert.match(css, /--editor-toolbar-gap: 32px/);
  assert.match(css, /padding-bottom: max\(224px, calc\(var\(--desktop-dock-clearance\) \+ 90px\)\)/);
  assert.match(css, /\.share-shell \{ padding-bottom: var\(--desktop-dock-clearance\)/);
  const presentation = readFileSync(new URL("../app/components/DesktopPresentation.tsx", import.meta.url), "utf8");
  assert.match(presentation, /new ResizeObserver/);
  assert.match(presentation, /dock\?\.offsetHeight/);
  assert.match(presentation, /height \+ 28 \+ 16/);
});
