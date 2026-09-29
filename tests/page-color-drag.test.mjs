import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const picker = page.slice(page.indexOf("function TextStyleSelector"), page.indexOf("function TextStyleSelector") + 23000);

test("dragging the editor page-color picker owns touch scrolling only for the active pointer", () => {
  assert.match(picker, /pageColorPointerIdRef\.current = event\.pointerId/);
  assert.match(picker, /const preventPickerTouchScroll = \(event: TouchEvent\) => \{\s*if \(pageColorPointerIdRef\.current !== null && event\.cancelable\) event\.preventDefault\(\);/);
  assert.match(picker, /addEventListener\("touchmove", preventPickerTouchScroll, \{ capture: true, passive: false \}\)/);
  assert.match(picker, /removeEventListener\("touchmove", preventPickerTouchScroll, true\)/);
  assert.match(picker, /pageColorPointerIdRef\.current = null;\s*setPageColorDragging\(false\);/);
});
