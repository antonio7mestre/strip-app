import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/reader-bottom-anchor.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture({ enabled = true, ios = true, width = 393, top = 3200 } = {}) {
  const events = new Map(), visualEvents = new Map(), calls = [], exports = {};
  const visual = { height: 800, offsetTop: 0, scale: 1,
    addEventListener: (name, fn) => visualEvents.set(name, fn),
    removeEventListener: name => visualEvents.delete(name),
  };
  const root = { scrollHeight: 4000 };
  const document = { scrollingElement: root, documentElement: root, activeElement: { matches: () => false } };
  const window = { innerHeight: 800, innerWidth: width, scrollY: top, scrollX: 0, visualViewport: visual,
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
    scrollTo: options => { calls.push(options); window.scrollY = Math.min(options.top, root.scrollHeight - window.innerHeight); events.get("scroll")?.(); },
  };
  runInNewContext(compiled, { exports, window, document,
    navigator: { userAgent: ios ? "iPhone Safari" : "Macintosh Chrome", platform: ios ? "iPhone" : "MacIntel", maxTouchPoints: ios ? 5 : 0 } });
  const cleanup = exports.installReaderBottomAnchor(enabled);
  return { window, visual, document, root, events, visualEvents, calls, cleanup,
    resize(height, event = "resize") { window.innerHeight = visual.height = height; events.get(event)?.(); },
    scroll(top) { window.scrollY = top; events.get("scroll")?.(); },
  };
}

test("the first Safari toolbar expansion carries the ending up in the same event", () => {
  for (const event of ["resize", "scroll"]) {
    const f = fixture();
    for (const height of [792, 780, 754, 730, 714]) {
      f.resize(height, event);
      assert.equal(f.window.scrollY + height, 4000);
      assert.equal(f.calls.at(-1).behavior, "auto");
    }
    assert.equal(f.calls.length, 5);
    f.visualEvents.get("resize")();
    assert.equal(f.calls.length, 5, "duplicate browser events do not scroll again");
    f.cleanup();
  }
});

test("visual viewport resizing first does not lose the bottom anchor before layout catches up", () => {
  const f = fixture();
  f.visual.height = 714; f.visualEvents.get("resize")();
  assert.equal(f.calls.at(-1).top, 3286);
  assert.equal(f.window.scrollY, 3200, "native scroll range can still be the old size");
  f.window.innerHeight = 714; f.events.get("resize")();
  assert.equal(f.window.scrollY, 3286);
  f.cleanup();
});

test("reading above the ending and scrolling away never get pulled to the bottom", () => {
  for (const top of [0, 2400, 3190]) {
    const f = fixture({ top }); f.resize(714); assert.equal(f.calls.length, 0); f.cleanup();
  }
  const f = fixture(); f.scroll(3150); f.resize(714); assert.equal(f.calls.length, 0); f.cleanup();
  const g = fixture(); g.window.scrollY = 3150; g.resize(714); assert.equal(g.calls.length, 0); g.cleanup();
});

test("collapse, rotation, keyboard, zoom and content changes do not trigger a correction", () => {
  for (const prepare of [
    f => { f.window.innerWidth = 852; },
    f => { f.document.activeElement.matches = () => true; },
    f => { f.visual.scale = 1.5; },
    f => { f.root.scrollHeight += 200; },
  ]) {
    const f = fixture(); prepare(f); f.resize(714); assert.equal(f.calls.length, 0); f.cleanup();
  }
  const keyboard = fixture(); keyboard.resize(400); assert.equal(keyboard.calls.length, 0); keyboard.cleanup();
  const grow = fixture(); grow.resize(850); assert.equal(grow.calls.length, 0); grow.cleanup();
});

test("ordinary desktop and editor layouts install nothing, and cleanup ignores late events", () => {
  for (const options of [{ enabled: false }, { ios: false }, { width: 1024 }]) {
    const f = fixture(options); assert.equal(f.events.size + f.visualEvents.size, 0);
  }
  const f = fixture(), late = f.visualEvents.get("resize"); f.cleanup();
  f.window.innerHeight = f.visual.height = 714; late();
  assert.equal(f.calls.length, 0); assert.equal(f.events.size + f.visualEvents.size, 0);
  assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|preventDefault|style\.|classList\./);
});

test("only revealed publication and clean preview enable the shared reader anchor", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /installReaderBottomAnchor\(\s*\(view === "published" && publishedContentCanReveal\) \|\| cleanViewBottomSurfaceColor !== null/);
});
