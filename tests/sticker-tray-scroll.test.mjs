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
  try {
    const cleanup = installStickerTrayScroll(() => scroller);
    assert.ok(classes.has("sticker-tray-open"));
    assert.equal(swipe(sticker, 400, 200), false, "Normal vertical gestures stay native");
    assert.equal(swipe(sticker, 200, 400), false);
    assert.equal(wheel(sticker, 100), false);
    assert.equal(swipe(background, 400, 200), true, "Editor behind the tray cannot move");
    assert.equal(wheel(background, 100), true);
    scroller.scrollTop = 0;
    assert.equal(swipe(sticker, 200, 400), true, "Top boundary cannot chain to the document");
    assert.equal(swipe(sticker, 400, 200), false);
    scroller.scrollTop = 500;
    assert.equal(swipe(sticker, 400, 200), true, "Bottom boundary cannot chain to the document");
    assert.equal(wheel(sticker, 100), true);
    assert.equal(swipe(sticker, 200, 400), false);
    scroller.scrollHeight = 500;
    assert.equal(swipe(sticker, 400, 200), true);
    scroller = null;
    assert.equal(swipe(sticker, 400, 200), true, "The source-choice tray also holds the page still");
    cleanup();
    assert.equal(events.size + classes.size, 0, "Closing/selecting restores page scrolling");
  } finally { delete globalThis.document; globalThis.Node = oldNode; }
});
