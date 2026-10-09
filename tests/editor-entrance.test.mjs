import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as profile from "../app/lib/profile.ts";
import * as sizing from "../app/lib/font-sizing.ts";
import * as profileReload from "../app/lib/profile-reload.ts";
import * as stripEntrance from "../app/lib/strip-entrance.ts";

const require = createRequire(import.meta.url);
const hookSource = readFileSync(new URL("../app/components/useEditorEntrance.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

test("brand-new strips skip the content loader and open an empty editor directly", () => {
  const create = page.slice(page.indexOf("const beginNewStrip ="), page.indexOf("const deleteDraft ="));
  assert.match(create, /editorEntrance\.cancel\(\)/);
  assert.match(create, /resetEditorEntry\(\)/);
  assert.match(create, /setBlocks\(\[\]\)/);
  assert.doesNotMatch(create, /startEditorEntry|editorEntrance\.(?:start|resolve)/);
});

// Minimal deterministic hook runner: real effects, cleanup and state, with a
// controllable font promise and clock so no timing assertion sleeps or flakes.
function harness({ reduced = false } = {}) {
  const cells = [], effects = [], timers = new Map(), fontLoads = [];
  let index = 0, dirty = false, now = 0, serial = 0, result;
  let args = [[], {}, "letter", false];
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      cells[i] ??= { value: initial };
      return [cells[i].value, update => {
        const next = typeof update === "function" ? update(cells[i].value) : update;
        if (!Object.is(next, cells[i].value)) { cells[i].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const i = index++; return cells[i] ??= { current: initial }; },
    useCallback(fn, deps) {
      const i = index++;
      if (!depsEqual(cells[i]?.deps, deps)) cells[i] = { value: fn, deps };
      return cells[i].value;
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!depsEqual(cells[i]?.deps, deps)) {
        effects.push(() => { cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const schedule = (fn, ms = 0) => { const id = ++serial; timers.set(id, { at: now + ms, fn }); return id; };
  const exports = {};
  runInNewContext(compiled, {
    exports, require: name => name === "react" ? react : name === "@/app/lib/profile" ? profile
      : name === "@/app/lib/strip-entrance" ? stripEntrance : require(name),
    performance: { now: () => now },
    document: { fonts: { load: font => new Promise(resolve => fontLoads.push({ font, resolve })) } },
    window: { setTimeout: schedule, matchMedia: () => ({ matches: reduced }) },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => schedule(fn, 16), cancelAnimationFrame: id => timers.delete(id),
  });
  function render(nextArgs = args) {
    args = nextArgs;
    do {
      dirty = false; index = 0;
      result = exports.useEditorEntrance(...args);
      effects.splice(0).forEach(fn => fn());
      // The published counter is tested separately. Simulate its completion.
      if (result.percent === 100) result.completeCount(result.request);
    } while (dirty);
    return result;
  }
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); render();
    }
    now = end;
    return result;
  }
  render();
  return { render, advance, fontLoads, get value() { return result; },
    async fontsReady() { fontLoads.splice(0).forEach(({ resolve }) => resolve([])); await tick(); render(); } };
}

test("waits for draft data, profile font, every image, video and sticker", async () => {
  const h = harness(); const request = h.value.start(); h.render();
  assert.equal(h.value.phase, "loading");
  h.advance(1000); assert.equal(h.value.phase, "loading");
  const blocks = [{ id: "text", type: "text", fontStyle: "gloock" }, { id: "photo", type: "image" },
    { id: "video", type: "video" }, { id: "sticker", type: "sticker" }];
  h.value.resolve(request); h.render([blocks, {}, "shrikhand", true]);
  assert.equal(h.fontLoads.length, 0);
  h.render([blocks, { photo: "loaded", video: "loaded" }, "shrikhand", false]);
  assert.equal(h.fontLoads.length, 2);
  await h.fontsReady(); h.advance(1000);
  assert.equal(h.value.phase, "loading", "a sticker is still decoding");
  h.render([blocks, { photo: "loaded", video: "loaded", sticker: "loaded" }, "shrikhand", false]);
  h.advance(16); assert.equal(h.value.phase, "revealing");
  h.advance(319); assert.equal(h.value.active, true);
  h.advance(1); assert.equal(h.value.active, false);
});

test("a fast cached or empty Strip gets one intentional entrance instead of a flash", async () => {
  const h = harness(); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render(); await h.fontsReady();
  h.advance(279); assert.equal(h.value.phase, "loading");
  h.advance(17); assert.equal(h.value.phase, "revealing");
  h.advance(320); assert.equal(h.value.active, false);
});

test("failed assets use the existing error fallback and do not deadlock the whole editor", async () => {
  const h = harness(); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render([[{ id: "broken", type: "image" }], { broken: "error" }, "letter", false]);
  await h.fontsReady(); h.advance(616); assert.equal(h.value.active, false);
});

test("Back cancels timers and stale font or draft completions cannot reveal the next entry", async () => {
  const h = harness(); const first = h.value.start(); h.render();
  h.value.resolve(first); h.render();
  h.value.cancel(); h.render();
  assert.equal(h.value.isCurrent(first), false);
  const second = h.value.start(); h.render();
  h.value.resolve(first); await h.fontsReady(); h.advance(1000);
  assert.equal(h.value.phase, "loading");
  h.value.resolve(second); h.render(); await h.fontsReady(); h.advance(336);
  assert.equal(h.value.active, false);
});

test("the same crossfade completes even when the device requests reduced motion", async () => {
  const h = harness({ reduced: true }); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render(); await h.fontsReady();
  h.advance(296); assert.equal(h.value.phase, "revealing");
  h.advance(320); assert.equal(h.value.active, false);
});

test("loader uses the selected theme color and face, right-aligns text, and leaves tools outside the fade", () => {
  const component = readFileSync(new URL("../app/components/EditorEntrance.tsx", import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => name === "@/app/lib/profile" ? profile : name === "@/app/lib/font-sizing" ? sizing
      : name === "@/app/lib/profile-reload" ? profileReload : name === "@/app/lib/strip-entrance" ? stripEntrance : require(name) });
  const html = renderToStaticMarkup(createElement(exports.EditorEntrance, {
    profile: { ...profile.DEFAULT_PROFILE, background: "#BFFF00", font: "shrikhand" }, revealing: false,
  }));
  assert.match(html, /background-color:#BFFF00/); assert.match(html, /Shrikhand/);
  assert.doesNotMatch(html, />Loading(?: Strip)?</);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(css, /\.editor-entrance-label\s*\{[^}]*text-align: right/);
  assert.match(css, /\.editor-mode\.is-editor-loading > \.editor-canvas\s*\{[^}]*opacity: 0/);
  assert.match(page, /if \(!editorEntrance.active && !imagesAreLoading && !mediaImportRequestRef.current\) return;/);
  assert.match(page, /showEditorLoadingNotice\(editorEntrance.active \? "Strip is loading" : "Images loading"\)/);
  assert.match(page, /onKeyDownCapture=\{\(event\) => \{\s*if \(\(!editorEntrance.active/);
  assert.match(page, /!loaded \|\|\s*editorEntrance.active \|\|/, "autosave waits for the real draft");
});
