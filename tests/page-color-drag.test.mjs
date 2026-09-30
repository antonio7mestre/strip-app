import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installPageColorDrag, pageColorPickerCenter } from "../app/lib/page-color-picker.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const shapes = readFileSync(new URL("../app/components/StickerPicker.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../app/components/ProfileEditor.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("all page samplers start at the center of the visible screen, independent of tray height", () => {
  assert.deepEqual(pageColorPickerCenter({ innerWidth: 390, innerHeight: 844 }), { x: 195, y: 422 });
  assert.deepEqual(pageColorPickerCenter({ innerWidth: 390, innerHeight: 844, visualViewport: { offsetLeft: 8, offsetTop: 60, width: 360, height: 400 } }), { x: 188, y: 260 });
  for (const source of [page, shapes, profile]) assert.match(source, /pageColorPickerCenter\(window\)/);
});

test("shape and regular samplers share dragging, explicit confirmation, and dock layering", () => {
  for (const source of [page, shapes]) assert.match(source, /installPageColorDrag\(/);
  assert.doesNotMatch(shapes, /pageTapRef|shape-page-color-done/);
  assert.match(shapes, /onClick=\{finishShapeColor\}/);
  assert.match(shapes, /const finishShapeColor = \(\) => \{[\s\S]*?setSamplingPage\(false\)[\s\S]*?onViewChange\("pack"\)/);
  assert.match(shapes, /aria-hidden=\{!shapePaletteOpen\} inert=\{!shapePaletteOpen\}/);
  assert.match(shapes, /samplingPage \? undefined : installStickerTrayScroll/);
  assert.match(css, /html\.page-color-picking :is\(\.selector-dock, \.profile-editor-dock\)\s*\{\s*z-index: 81;/);
  assert.match(css, /\.page-color-picker-indicator\s*\{[^}]*position: absolute;[^}]*z-index: 80;/);
});

test("only the handle claims touch gestures, and release never confirms or dismisses sampling", () => {
  const originalDocument = globalThis.document;
  const originalElement = globalThis.Element;
  const listeners = new Map();
  const classes = new Set();
  class FakeElement {
    captures = new Set();
    constructor(kind) { this.kind = kind; }
    closest(selector) {
      return selector === ".page-color-picker-indicator" ? (this.kind === "handle" ? this : null) : (this.kind === "tray" ? this : null);
    }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
  }
  globalThis.Element = FakeElement;
  globalThis.document = {
    documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  let cleanup;
  try {
    const samples = [];
    const dragging = [];
    cleanup = installPageColorDrag({ onSample: (...point) => samples.push(point), onDraggingChange: value => dragging.push(value) });
    const fire = (name, overrides = {}) => {
      const event = { target: new FakeElement("page"), pointerId: 1, pointerType: "touch", clientX: 100, clientY: 200, cancelable: true, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
      listeners.get(name)?.(event);
      return event;
    };
    for (const kind of ["page", "tray"]) {
      assert.equal(fire("pointerdown", { target: new FakeElement(kind) }).prevented, false);
      assert.equal(fire("touchmove").prevented, false);
      assert.equal(fire("pointerup").prevented, false);
    }
    assert.deepEqual(samples, []);
    const handle = new FakeElement("handle");
    assert.equal(fire("pointerdown", { target: handle }).prevented, true);
    assert.equal(handle.hasPointerCapture(1), true);
    assert.equal(fire("touchmove").prevented, true);
    assert.equal(fire("pointerdown", { target: handle, pointerId: 2 }).prevented, false);
    assert.equal(fire("pointermove", { pointerId: 2 }).prevented, false);
    fire("pointermove", { clientX: 130, clientY: 250 });
    fire("pointerup", { clientX: 140, clientY: 260 });
    assert.deepEqual(samples, [[100, 200], [130, 250], [140, 260]]);
    assert.deepEqual(dragging, [true, false]);
    assert.equal(handle.hasPointerCapture(1), false);
    assert.equal(classes.has("page-color-picking"), true, "lifting the finger leaves sampling active");
    assert.equal(fire("touchmove").prevented, false, "native page scrolling resumes after drag");
    for (const ending of ["pointercancel", "lostpointercapture"]) {
      fire("pointerdown", { target: handle });
      fire(ending);
      assert.equal(handle.hasPointerCapture(1), false);
      assert.equal(fire("touchmove").prevented, false);
      assert.equal(classes.has("page-color-picking"), true);
    }
    fire("pointerdown", { target: handle });
    cleanup();
    cleanup = null;
    assert.equal(handle.hasPointerCapture(1), false);
    assert.equal(classes.size, 0);
    assert.equal(listeners.size, 0);
  } finally {
    cleanup?.();
    globalThis.document = originalDocument;
    globalThis.Element = originalElement;
  }
});
