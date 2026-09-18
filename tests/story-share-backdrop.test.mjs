import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scribbleSurfaceBounds } from "../app/lib/scribble-entrance.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/StoryShareBackdrop.tsx", import.meta.url), "utf8");
test("share pulse uses the full-glass document surface above the white dock", () => {
  assert.match(component, /useLayoutEffect/);
  assert.match(component, /const cleanup = installScribbleSurface\(surface\)/);
  assert.match(component, /cleanup\(\); window.removeEventListener\("resize", measureDock\)/);
  assert.match(component, /boundary.style.height = document.documentElement.scrollHeight/);
  const boundary = css.match(/\.story-share-boundary\s*\{([^}]+)\}/)[1];
  assert.match(boundary, /z-index: 2147483647/);
  assert.match(boundary, /contain: layout/);
  assert.match(boundary, /overflow: visible/);
  assert.doesNotMatch(css, /html:has\(\.story-share[^}]*\.share-dock\s*\{[^}]*display: none/);
  assert.match(css, /html:has\(\.story-share-boundary\) body\s*\{[^}]*overflow: hidden/);
  assert.match(css, /html:has\(\.story-share-boundary\) body\s*\{[^}]*background: #000 !important/);
  const surface = css.match(/\.story-share-backdrop\s*\{([^}]+)\}/)[1];
  assert.match(surface, /position: absolute/);
  assert.match(surface, /z-index: 1/);
  assert.doesNotMatch(surface, /position: fixed/);
  for (const viewportHeight of [680, 780, 852]) {
    const bounds = scribbleSurfaceBounds({ viewportHeight, screenWidth: 393, screenHeight: 852, landscape: false, isPhone: true, safeTop: 0, scrollY: 0 });
    assert.ok(bounds.height >= 860);
    assert.ok(bounds.top < 0);
  }
});
test("the dimmer stops above the existing white bar and safe area, without moving or replacing them", () => {
  assert.match(component, /dock.getBoundingClientRect\(\).top - surface.getBoundingClientRect\(\).top/);
  assert.match(component, /window.addEventListener\("resize", measureDock\)/);
  assert.match(css, /background: linear-gradient\(to bottom, rgba\(0, 0, 0, 0.72\) 0 var\(--story-share-dock-top, 100%\), transparent var\(--story-share-dock-top, 100%\)\)/);
  assert.doesNotMatch(component, /captureCoverDock|story-share-dock-copy|dropCoverDock|moveCoverDock/);
  assert.doesNotMatch(css, /\.composer-dock\.story-share-dock-copy/);
});
test("beacon is action-sized with opacity-only motion and no oversized glow", () => {
  assert.match(component, /className="story-share-save-beacon" aria-hidden="true"/);
  assert.match(css, /width: clamp\(60px, 17vw, 76px\)/);
  assert.match(css, /left: 39%/);
  const frames = css.match(/@keyframes story-share-beacon-pulse\s*\{([\s\S]*?)\n\}/)[1];
  assert.doesNotMatch(frames, /scale\(|box-shadow/);
  assert.doesNotMatch(css, /\.story-share-save-beacon\s*\{[^}]*animation: none/);
  assert.match(css, /\.story-share-boundary\[data-phase="covered"\] \.story-share-save-beacon\s*\{[^}]*animation: story-share-beacon-pulse 1\.6s/);
  // Only this cue opts out; reduced-motion dismissal remains immediate.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.story-share-boundary\[data-phase="closing"\] \.story-share-backdrop \{ animation-duration: 0ms; \}/);
});
