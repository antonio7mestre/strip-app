import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moveCoverDock, COVER_DOCK_DROP_MS } from "../app/lib/cover-entrance.ts";

const origin = { left: 0, top: 650, width: 402, height: 284, padding: "12px 20px 222px",
  borderRadius: "44px", cornerShape: "squircle", boxShadow: "none", markup: "" };
const surface = { top: -62, bottom: 820, left: 0 };

for (const direction of ["down", "up"]) {
  for (const fromTop of [undefined, 738]) {
    test(`${direction} motion ${fromTop ? "reverses in place" : "crosses the full safe area"} without moving the page`, () => {
      let pending, done = 0;
      globalThis.document = { timeline: { currentTime: 0 } };
      globalThis.requestAnimationFrame = callback => { pending = callback; return 1; };
      globalThis.cancelAnimationFrame = () => {};
      const dock = { style: { setProperty(name, value) { this[name] = value; } } };
      const cancel = moveCoverDock({ getBoundingClientRect: () => surface }, dock, origin, direction, () => done++, fromTop);
      try {
        let last = fromTop ?? (direction === "down" ? origin.top : 828);
        assert.equal(parseFloat(dock.style.top) + surface.top, last);
        for (let t = 10; t <= COVER_DOCK_DROP_MS; t += 10) {
          pending(t);
          const top = parseFloat(dock.style.top) + surface.top;
          assert.ok(direction === "down" ? top >= last : top <= last);
          assert.notEqual(top, last, "starts on the first frame and keeps moving");
          last = top;
        }
        assert.equal(last, direction === "down" ? 828 : origin.top);
        assert.equal(dock.style.visibility, direction === "down" ? "hidden" : "visible");
        assert.equal(done, 1);
        assert.equal(dock.style.transform, undefined);
        const late = pending;
        cancel(); late(1000);
        assert.equal(done, 1, "a cancelled frame cannot finish twice");
      } finally {
        cancel(); delete globalThis.document;
        delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      }
    });
  }
}

test("preview removes the fixed safe-area paint and shares home motion in both directions", () => {
  const component = readFileSync(new URL("../app/components/PreviewDock.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /<PreviewDock preview=\{inlinePreview\}>[\s\S]+<\/PreviewDock>/);
  assert.match(component, /motion.phase === "idle" && !preview/);
  assert.match(component, /preview \? "down" : "up"/);
  assert.match(component, /flushSync\(\(\) => setMotion/);
  assert.match(component, /cancel\(\); cleanSurface\(\)/);
  assert.match(component, /aria-hidden="true" inert/);
  assert.doesNotMatch(component, /scrollTo|scrollBy|pushState|history\.back/);
  assert.match(css, /\.preview-dock-boundary \{[^}]*overflow: clip;[^}]*overflow-clip-margin: 256px/s);
  assert.match(css, /\.preview-dock-boundary \{[^}]*contain: layout paint/s);
  assert.match(css, /\.composer-dock.preview-motion-dock \{[^}]*position: absolute;[^}]*transform: none/s);
  assert.doesNotMatch(css, /\.main-composer-dock\.is-inline-preview/);
});
