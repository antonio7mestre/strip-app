import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scribbleSurfaceBounds } from "../app/lib/scribble-entrance.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/StoryShareBackdrop.tsx", import.meta.url), "utf8");
test("share pulse uses the full-glass document surface above the white dock", () => {
  assert.match(component, /useLayoutEffect/);
  assert.match(component, /const cleanup = installScribbleSurface\(surface\)/);
  assert.match(component, /return cleanup/);
  assert.match(component, /boundary.style.height = document.documentElement.scrollHeight/);
  const boundary = css.match(/\.story-share-boundary\s*\{([^}]+)\}/)[1];
  assert.match(boundary, /z-index: 2147483647/);
  assert.match(boundary, /contain: layout/);
  assert.match(boundary, /overflow: visible/);
  assert.match(css, /\.share-mode\[inert\] \.share-dock\s*\{\s*display: none/);
  assert.match(css, /html:has\(\.story-share-boundary\) body\s*\{[^}]*overflow: hidden/);
  const surface = css.match(/\.story-share-backdrop\s*\{([^}]+)\}/)[1];
  assert.match(surface, /position: absolute/);
  assert.doesNotMatch(surface, /position: fixed/);
  for (const viewportHeight of [680, 780, 852]) {
    const bounds = scribbleSurfaceBounds({ viewportHeight, screenWidth: 393, screenHeight: 852, landscape: false, isPhone: true, safeTop: 0, scrollY: 0 });
    assert.ok(bounds.height >= 860);
    assert.ok(bounds.top < 0);
  }
});
test("beacon is action-sized with opacity-only motion and no oversized glow", () => {
  assert.match(component, /className="story-share-save-beacon" aria-hidden="true"/);
  assert.match(css, /width: clamp\(60px, 17vw, 76px\)/);
  assert.match(css, /left: 39%/);
  const frames = css.slice(css.indexOf("@keyframes story-share-beacon-pulse"), css.indexOf(".poster-picker {"));
  assert.doesNotMatch(frames, /scale\(|box-shadow/);
  assert.match(frames, /animation: none; opacity: 0.85/);
});
