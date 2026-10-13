import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { installPreviewNoticeDismiss } from "../app/lib/preview-notice.ts";

test("scroll, touch and wheel dismiss immediately without preventing scrolling", () => {
  for (const event of ["scroll", "touchmove", "wheel"]) {
    const originalWindow = globalThis.window;
    const listeners = new Map();
    let calls = 0;
    globalThis.window = {
      scrollX: 0, scrollY: 60,
      addEventListener(name, handler, options) {
        assert.equal(options.passive, true);
        listeners.set(name, handler);
      },
      removeEventListener(name, handler) {
        assert.equal(listeners.get(name), handler);
        listeners.delete(name);
      },
    };
    try {
      const dispose = installPreviewNoticeDismiss(() => calls++);
      listeners.get("scroll")();
      assert.equal(calls, 0, "same-position entry restoration leaves the hint visible");
      listeners.get("wheel")({ deltaX: 0, deltaY: 0 });
      assert.equal(calls, 0);
      if (event === "scroll") window.scrollY = 61;
      listeners.get(event)({ deltaX: 0, deltaY: 1 });
      assert.equal(calls, 1, "no delay or exit-animation timer");
      listeners.get(event)({ deltaX: 0, deltaY: 1 });
      assert.equal(calls, 1);
      dispose();
      assert.equal(listeners.size, 0);
    } finally {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  }
});

test("scroll uses the automatic exit timing and fades from the current paint", () => {
  const originalWindow = globalThis.window;
  const originalStyle = globalThis.getComputedStyle;
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /top-status-notice 3000ms ease both/);
  assert.match(css, /7%, 88% \{ opacity: 1; transform: translate\(-50%, 0\); \}/);
  assert.match(css, /100% \{ opacity: 0; transform: translate\(-50%, -4px\); \}/);
  try {
    for (const animationTime of [100, 1000, 2750]) {
      const listeners = new Map();
      let calls = 0, animations = 0, cancelled = false;
      const exit = { onfinish: null, cancel() { cancelled = true; } };
      globalThis.window = {
        scrollX: 0, scrollY: 0,
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name),
      };
      globalThis.getComputedStyle = () => ({ opacity: "0.6", transform: "matrix(1, 0, 0, 1, -160, -2)" });
      const pill = {
        getAnimations: () => [{ animationName: "top-status-notice", currentTime: animationTime }],
        animate(frames, options) {
          animations++;
          assert.deepEqual(frames, [
            { opacity: "0.6", transform: "matrix(1, 0, 0, 1, -160, -2)" },
            { opacity: "0", transform: "translate(-50%, -4px)" },
          ]);
          assert.deepEqual(options, { duration: 3000 * .12, easing: "ease", fill: "forwards" });
          return exit;
        },
      };
      const dispose = installPreviewNoticeDismiss(() => calls++, pill);
      listeners.get("wheel")({ deltaX: 0, deltaY: 1 });
      listeners.get("touchmove")();
      assert.equal(calls, 0, "pill stays mounted until its fade finishes");
      assert.equal(animations, animationTime >= 2640 ? 0 : 1, "never restart an exit already in progress");
      if (animations) { exit.onfinish(); assert.equal(calls, 1); }
      dispose();
      assert.equal(cancelled, animations > 0);
      assert.equal(exit.onfinish, null);
      assert.equal(listeners.size, 0);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = originalStyle;
  }
});
