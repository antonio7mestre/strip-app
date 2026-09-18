import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {installEndingContact} from "../app/lib/ending-contact.ts";

function fixture({ gap = 100, empty = false } = {}) {
  const callbacks = [], observers = [], events = new Map(), viewportEvents = new Map();
  class Observer {
    targets = [];
    constructor(callback) { this.callback = callback; callbacks.push(callback); observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  }
  globalThis.ResizeObserver = Observer;
  globalThis.MutationObserver = Observer;
  globalThis.window = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    visualViewport: {
      addEventListener: (name, fn) => viewportEvents.set(name, fn),
      removeEventListener: name => viewportEvents.delete(name),
    },
  };
  const block = (bottom = 200, sticker = false) => ({
    classList: { contains: name => name === "strip-block" || (sticker && name === "sticker-block") },
    getBoundingClientRect: () => ({ bottom }),
  });
  const first = block(), attributes = new Set();
  let endingTop = 200 + gap;
  const ending = {
    classList: { contains: name => name === "strip-block" },
    getBoundingClientRect: () => ({ top: endingTop }),
    toggleAttribute: (name, on) => on ? attributes.add(name) : attributes.delete(name),
    removeAttribute: name => attributes.delete(name),
  };
  const canvas = { children: [...(empty ? [] : [first]), ending] };
  ending.parentElement = canvas;
  const dispose = installEndingContact(ending);
  return {
    canvas, ending, first, block, callbacks, observers, events, viewportEvents,
    touching: () => attributes.has("data-touches-block"),
    setTop: value => { endingTop = value; },
    resize: () => callbacks[0](),
    mutate: () => callbacks[1](),
    cleanup() {
      dispose();
      delete globalThis.ResizeObserver; delete globalThis.MutationObserver; delete globalThis.window;
    },
  };
}

test("corner fill starts hidden with a gap and appears only at physical contact", () => {
  const f = fixture();
  try {
    assert.equal(f.touching(), false);
    for (const [top, expected] of [[240,false],[201.1,false],[200.5,true],[200,true],[198,false],[490,false]]) {
      f.setTop(top); f.resize(); assert.equal(f.touching(), expected);
    }
  } finally { f.cleanup(); }
});

test("empty editors and floating stickers cannot claim contact", () => {
  const f = fixture({empty:true, gap:0});
  try {
    assert.equal(f.touching(), false);
    f.canvas.children.unshift(f.block(200,true)); f.mutate();
    assert.equal(f.touching(), false);
  } finally { f.cleanup(); }
});

test("adding and removing blocks rebinds observation and clears the fill immediately", () => {
  const f = fixture({gap:100});
  try {
    const last = f.block(300);
    f.canvas.children.splice(1,0,last); f.mutate();
    assert.equal(f.touching(), true);
    assert(f.observers[0].targets.includes(f.first));
    assert(f.observers[0].targets.includes(last));
    f.canvas.children.splice(1,1); f.mutate();
    assert.equal(f.touching(), false);
    assert(!f.observers[0].targets.includes(last));
  } finally { f.cleanup(); }
});

test("viewport and earlier block resizing update contact without scroll listeners", () => {
  const f = fixture();
  try {
    assert(f.observers[0].targets.includes(f.first));
    assert(!f.events.has("scroll"));
    f.setTop(200); f.viewportEvents.get("resize")(); assert(f.touching());
    f.setTop(400); f.events.get("resize")(); assert(!f.touching());
  } finally { f.cleanup(); }
});

test("ref cleanup cancels observers, listeners, and late callbacks", () => {
  const f = fixture({gap:0});
  assert(f.touching()); f.cleanup();
  f.callbacks.forEach(callback=>callback());
  assert(!f.touching());
  assert.equal(f.events.size+f.viewportEvents.size,0);
  assert(f.observers.every(observer=>observer.targets.length===0));
});

test("only the editor card requires contact; the published in-flow footer is unchanged", () => {
  const css = readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  const page = readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(css,/\.strip-ending-card\[data-touches-block\]::after,/);
  assert.doesNotMatch(css,/\.strip-canvas\.has-trailing-text > \.strip-ending-card::after/);
  assert.match(css,/\.published-strip\.has-trailing-text > \.published-bottom-sheet::after/);
  assert.match(page,/<section\s+ref=\{installEndingContact\}\s+className=\{`strip-block strip-ending-card/);
});
