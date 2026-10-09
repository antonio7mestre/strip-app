import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scribbleSurfaceBounds } from "../app/lib/scribble-entrance.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/StoryShareBackdrop.tsx", import.meta.url), "utf8");
test("share pulse uses the full-glass document surface above the white dock", () => {
  assert.match(component, /useLayoutEffect/);
  assert.match(component, /const cleanup = installScribbleSurface\(surface, measurePaint\)/);
  assert.match(component, /cleanup\(\); window.removeEventListener\("resize", measureDock\)/);
  assert.match(component, /const pageHeight = document.documentElement.scrollHeight/);
  assert.match(component, /Math.max\(pageHeight, window.scrollY \+ Math.ceil\(bounds.bottom\)\)/);
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
test("a stationary document-painted bar removes Safari's fixed white fill only while sharing", () => {
  assert.match(component, /const paintDock = mounted && open/);
  assert.match(component, /if \(!paintDock\) return/);
  assert.match(component, /const origin = captureCoverDock\(live\)/);
  assert.match(component, /const display = live.style.display/);
  assert.match(component, /live.style.display = "none"/);
  assert.match(component, /live.style.display = display; dock.remove\(\); dockPaintRef.current = null/);
  for (const property of ["width", "height", "padding", "borderRadius", "boxShadow", "cornerShape"]) {
    assert.ok(component.includes(`origin.${property}`));
  }
  assert.match(component, /dock.setAttribute\("aria-hidden", "true"\)/);
  assert.match(component, /dock.inert = true/);
  assert.match(component, /dock.innerHTML = origin.markup/);
  const copy = css.match(/\.composer-dock\.story-share-document-dock\s*\{([^}]+)\}/)[1];
  assert.match(copy, /position: absolute/);
  assert.match(copy, /transition: none/);
  assert.match(copy, /animation: none/);
  assert.match(copy, /pointer-events: none/);
  assert.doesNotMatch(component, /dropCoverDock|moveCoverDock/);
});
test("only the dimmer fades, never the white toolbar paint", () => {
  assert.match(component, /dock.getBoundingClientRect\(\).top - surface.getBoundingClientRect\(\).top/);
  assert.match(component, /window.addEventListener\("resize", measureDock\)/);
  assert.match(css, /background: linear-gradient\(to bottom, rgba\(0, 0, 0, 0.86\) 0 var\(--story-share-dock-top, 100%\), transparent var\(--story-share-dock-top, 100%\)\)/);
  assert.match(css, /\.story-share-boundary\[data-phase="closing"\] \.story-share-dimmer\s*\{[^}]*animation: story-share-dismiss/);
  assert.doesNotMatch(css, /\.story-share-boundary\[data-phase="closing"\] \.story-share-backdrop\s*\{[^}]*animation/);
  assert.doesNotMatch(css, /\.composer-dock\.story-share-dock-copy/);
});
test("beacon is action-sized with opacity-only motion and no oversized glow", () => {
  assert.match(component, /className="story-share-save-beacon" aria-hidden="true"/);
  assert.match(css, /width: clamp\(60px, calc\(17 \* var\(--page-vw, 1vw\)\), 76px\)/);
  assert.match(css, /left: 39%/);
  assert.match(css, /\.story-share-save-beacon\s*\{[^}]*z-index: 2147483647/);
  const frames = css.match(/@keyframes story-share-beacon-pulse\s*\{([\s\S]*?)\n\}/)[1];
  assert.doesNotMatch(frames, /scale\(|box-shadow/);
  assert.doesNotMatch(css, /\.story-share-save-beacon\s*\{[^}]*animation: none/);
  assert.match(css, /\.story-share-boundary\[data-phase="covered"\] \.story-share-save-beacon\s*\{[^}]*animation: story-share-beacon-pulse 0\.9s/);
  assert.doesNotMatch(css, /prefers-reduced-motion/);
});
