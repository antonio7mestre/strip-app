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
  assert.match(css, /html:has\(\.story-share-dock-copy\) \.share-mode \.share-dock\s*\{\s*display: none/);
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
test("toolbar stays at its captured position below the full-glass dimmer", () => {
  assert.match(component, /captureCoverDock\(document.querySelector<HTMLElement>\("\.share-mode \.share-dock"\)\)/);
  assert.match(component, /top: motion.dock.top \+ motion.dock.scrollY, left: motion.dock.left/);
  assert.match(component, /width: motion.dock.width, height: motion.dock.height, padding: motion.dock.padding/);
  assert.match(component, /story-share-dock-copy" aria-hidden="true" inert/);
  assert.match(component, /__html: motion.dock.markup/);
  assert.match(component, /dock: open \? undefined : motion.dock/);
  const copy = css.match(/\.composer-dock\.story-share-dock-copy\s*\{([^}]+)\}/)[1];
  assert.match(copy, /position: absolute/);
  assert.match(copy, /z-index: 0/);
  assert.match(copy, /transform: none/);
  assert.match(copy, /transition: none/);
  assert.match(copy, /mask-image: linear-gradient\(to bottom, #000 64px, transparent 104px\)/);
  assert.doesNotMatch(component, /dropCoverDock|moveCoverDock/);
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
