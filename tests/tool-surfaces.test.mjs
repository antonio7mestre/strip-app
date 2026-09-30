import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

test("text controls have an opaque, nonanimated join outside the reveal layer", () => {
  assert.match(page, /\{onTextTool \? \(\s*<span className="block-controls-text-join" style=\{style\} aria-hidden="true" \/>\s*\) : null\}\s*<div\s*className=\{`block-controls-reveal/);
  const join = rule(".block-controls-text-join");
  assert.match(join, /top: calc\(100% - 1px\)/);
  assert.match(join, /height: 2px/);
  assert.match(join, /background: var\(--block-controls-surface, var\(--white\)\)/);
  assert.match(join, /position: absolute/);
  assert.match(join, /pointer-events: none/);
  assert.doesNotMatch(join, /opacity:|animation:|transition:|scale\(/);
  assert.match(rule(".block-controls.is-text-tray"), /top: -1px/);
  const motion = rule(".text-block > .block-controls-reveal");
  assert.match(motion, /--block-controls-enter-opacity: 1/);
  assert.match(motion, /--block-controls-exit-opacity: 1/);
  assert.match(css, /opacity: var\(--block-controls-enter-opacity, 0\.55\)/);
  assert.match(css, /opacity: var\(--block-controls-exit-opacity, 0\)/);
});

test("the join fits the same tray width and does not cover its outline", () => {
  assert.match(rule(".block-controls-text-join"), /width: 336px/);
  assert.match(rule(".block-controls.is-text-tray"), /width: 336px/);
  assert.match(rule(".block-controls-text-join"), /max-width: calc\(100vw - 32px\)/);
  assert.match(rule(".block-controls"), /max-width: calc\(100vw - 32px\)/);
  assert.match(rule(".block-controls-text-join"), /z-index: 34/);
  assert.match(rule(".block-controls-under-edge"), /z-index: 35/);
});

test("all bottom bars share one compact shadow instead of per-page treatments", () => {
  assert.match(rule(":root"), /--bottom-bar-shadow: 0 -4px 12px -4px rgba\(0, 0, 0, 0\.18\)/);
  for (const selector of [".composer-dock", ".strip-end-sheet"]) {
    assert.match(rule(selector), /box-shadow: var\(--bottom-bar-shadow\)/, selector);
  }
  // These variants must inherit the base shadow, including during transitions.
  for (const selector of [
    ".app-navigation-dock.composer-dock", ".auth-action-dock.composer-dock",
    ".profile-editor-dock.composer-dock", ".composer-dock.selector-dock",
    ".composer-dock.shape-selector-dock", ".composer-dock.preview-motion-dock",
    ".published-bottom-sheet",
  ]) {
    assert.doesNotMatch(rule(selector), /box-shadow:/, selector);
  }
});

test("published shadow extends above the bar without enlarging the scroll surface", () => {
  const footer = rule(".published-bottom-sheet");
  assert.match(footer, /overflow: visible/);
  assert.doesNotMatch(footer, /clip-path:|contain:|filter:|margin|padding/);
  assert.match(rule(".strip-end-sheet"), /box-shadow: var\(--bottom-bar-shadow\)/,
    "published and preview endings share the same shadow");
});
