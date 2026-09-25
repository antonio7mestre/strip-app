import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const editor = page.slice(page.lastIndexOf('key="persistent-composer-dock"'));
const transition = editor.match(/transition:\s*\n\s*"([^"]+)"/)[1];

test("only intentional tool-size changes animate, not Safari's scroll-driven dock height", () => {
  assert.match(transition, /^--sticker-dock-visible-height 360ms/);
  assert.doesNotMatch(transition, /(?:^|,\s*)(?:all|height|bottom|padding|translate)\s/);
  assert.match(transition, /transform 220ms/);
  assert.match(transition, /opacity 160ms/);
  assert.match(css, /@property --sticker-dock-visible-height\s*\{\s*syntax: "<length>";\s*inherits: false;\s*initial-value: 64px;/);
});

test("browser chrome cancels instantly between bottom, height and padding at every tray size", () => {
  assert.match(css, /bottom: calc\(-180px - var\(--dock-browser-extension\)\)/);
  assert.match(editor, /calc\(var\(--sticker-dock-visible-height\) \+ 180px \+ env\(safe-area-inset-bottom\) \+ var\(--dock-browser-extension\)\)/);
  assert.match(css, /182px \+ env\(safe-area-inset-bottom\) \+ var\(--dock-browser-extension\)/);
  for (const visible of [64, 80, 320, 560, 720]) {
    for (const safeArea of [0, 21, 34]) {
      const tops = [0, 8, 42, 96, 120, 96, 42, 0].map(extension => {
        const bottom = -180 - extension;
        const height = visible + 180 + safeArea + extension;
        return 844 - bottom - height;
      });
      assert.ok(tops.every(top => top === 844 - visible - safeArea));
    }
  }
});

test("keyboard compensation and the existing source/pack sizing remain unchanged", () => {
  assert.match(css, /translate: 0 var\(--keyboard-dock-pan, 0px\)/);
  assert.match(editor, /"min\(78dvh, 720px\)"\s*:\s*"80px"/);
  assert.match(editor, /: "var\(--dock-visible-height\)"/);
});
