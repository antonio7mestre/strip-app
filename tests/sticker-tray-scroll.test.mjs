import assert from "node:assert/strict";
import test from "node:test";
import { installStickerTrayScroll } from "../app/lib/sticker-tray-scroll.ts";

test("only the sticker list scrolls, including containment at both ends and in empty categories", () => {
  const events = new Map(), classes = new Set();
  const oldNode = globalThis.Node;
  globalThis.Node = class {};
  const sticker = new Node(), background = new Node();
  let scroller = {scrollTop: 40, scrollHeight: 1000, clientHeight: 500, contains: target => target === sticker};
  globalThis.document = {
    documentElement: {classList: {add: name => classes.add(name), remove: name => classes.delete(name)}},
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: name => events.delete(name),
  };
  const swipe = (target, start, end) => {
    let prevented = false;
    events.get("touchstart")({target, touches: [{clientY: start}]});
    events.get("touchmove")({target, touches: [{clientY: end}], cancelable: true,
      preventDefault: () => { prevented = true; }});
    events.get("touchend")();
    return prevented;
  };
  const wheel = (target, deltaY) => {
    let prevented = false;
    events.get("wheel")({target, deltaY, cancelable: true, preventDefault: () => { prevented = true; }});
    return prevented;
  };
  const key = (target, key) => {
    let prevented = false;
    events.get("keydown")({target, key, preventDefault: () => { prevented = true; }});
    return prevented;
  };
  try {
    const cleanup = installStickerTrayScroll(() => scroller);
    assert.ok(classes.has("sticker-tray-open"));
    assert.equal(swipe(sticker, 400, 200), false, "Normal vertical gestures stay native");
    assert.equal(swipe(sticker, 200, 400), false);
    assert.equal(wheel(sticker, 100), false);
    assert.equal(swipe(background, 400, 200), true, "Editor behind the tray cannot move");
    assert.equal(wheel(background, 100), true);
    assert.equal(key(background, "PageDown"), true, "Keyboard scroll cannot move the editor behind the tray");
    assert.equal(key(sticker, "ArrowDown"), false);
    scroller.scrollTop = 0;
    assert.equal(swipe(sticker, 200, 400), true, "Top boundary cannot chain to the document");
    assert.equal(swipe(sticker, 400, 200), false);
    scroller.scrollTop = 500;
    assert.equal(swipe(sticker, 400, 200), true, "Bottom boundary cannot chain to the document");
    assert.equal(wheel(sticker, 100), true);
    assert.equal(key(sticker, "ArrowDown"), true);
    assert.equal(swipe(sticker, 200, 400), false);
    scroller.scrollHeight = 500;
    assert.equal(swipe(sticker, 400, 200), true);
    scroller = null;
    assert.equal(swipe(sticker, 400, 200), true, "The source-choice tray also holds the page still");
    cleanup();
    assert.equal(events.size + classes.size, 0, "Closing/selecting restores page scrolling");
  } finally { delete globalThis.document; globalThis.Node = oldNode; }
});

test("category and color rows scroll horizontally without leaking vertical gestures to the Strip", () => {
  const events = new Map();
  const previous = { Node: globalThis.Node, document: globalThis.document };
  globalThis.Node = class {};
  const category = new Node(), swatch = new Node(), sticker = new Node(), page = new Node();
  const horizontal = target => ({ scrollLeft: 40, scrollWidth: 900, clientWidth: 300, contains: node => node === target });
  const categories = horizontal(category), palette = horizontal(swatch);
  const list = { scrollTop: 40, scrollHeight: 900, clientHeight: 300, contains: node => node === sticker };
  globalThis.document = {
    documentElement: { classList: { add() {}, remove() {} } },
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: name => events.delete(name),
  };
  const touch = (target, dx, dy) => {
    let blocked = false;
    events.get("touchstart")({ target, touches: [{ clientX: 200, clientY: 400 }] });
    events.get("touchmove")({ target, touches: [{ clientX: 200 - dx, clientY: 400 - dy }], cancelable: true,
      preventDefault() { blocked = true; } });
    events.get("touchend")();
    return blocked;
  };
  const wheel = (target, dx, dy) => {
    let blocked = false;
    events.get("wheel")({ target, deltaX: dx, deltaY: dy, cancelable: true, preventDefault() { blocked = true; } });
    return blocked;
  };
  let cleanup;
  try {
    cleanup = installStickerTrayScroll(() => list, () => [categories, palette]);
    for (const target of [category, swatch]) {
      assert.equal(touch(target, 120, 8), false, "Native horizontal momentum is allowed");
      assert.equal(touch(target, -120, 8), false);
      assert.equal(wheel(target, 100, 0), false);
      assert.equal(touch(target, 8, 120), true, "Vertical swipes on a row cannot move the page");
      assert.equal(wheel(target, 0, 100), true);
    }
    assert.equal(touch(sticker, 8, 120), false);
    assert.equal(touch(sticker, 120, 8), true);
    assert.equal(touch(page, 120, 8), true);
    events.get("touchstart")({ target: category, touches: [{ clientX: 200, clientY: 400 }] });
    for (const [clientX, clientY] of [[200, 401], [150, 401]]) {
      let blocked = false;
      events.get("touchmove")({ target: category, touches: [{ clientX, clientY }], cancelable: true,
        preventDefault() { blocked = true; } });
      assert.equal(blocked, false, "A tiny vertical wobble cannot lock out a horizontal swipe");
    }
    events.get("touchend")();
    categories.scrollLeft = 0;
    assert.equal(touch(category, -120, 0), true);
    assert.equal(touch(category, 120, 0), false);
    palette.scrollLeft = 600;
    assert.equal(touch(swatch, 120, 0), true);
    assert.equal(touch(swatch, -120, 0), false);
  } finally {
    cleanup?.();
    globalThis.Node = previous.Node;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
  }
});
