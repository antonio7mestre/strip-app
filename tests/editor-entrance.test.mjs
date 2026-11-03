import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as profile from "../app/lib/profile.ts";
import * as stripEntrance from "../app/lib/strip-entrance.ts";
import * as textures from "../app/lib/text-textures.ts";
import * as scribbleEntrance from "../app/lib/scribble-entrance.ts";

const require = createRequire(import.meta.url);
const hookSource = readFileSync(new URL("../app/components/useEditorEntrance.ts", import.meta.url), "utf8");
const fadeMs = Number(hookSource.match(/EDITOR_ENTRANCE_FADE_MS = (\d+)/)[1]);
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
function harness({ reduced = false, keyboard = false, autoCount = true, requiredIds } = {}) {
  const cells = [], effects = [], timers = new Map(), fontLoads = [];
  const viewportListeners = new Set();
  const viewport = { height: keyboard ? 420 : 800,
    addEventListener: (_, listener) => viewportListeners.add(listener),
    removeEventListener: (_, listener) => viewportListeners.delete(listener) };
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
      : name === "@/app/lib/strip-entrance" ? stripEntrance
      : name === "@/app/lib/text-textures" ? textures
      : name === "./useReaderViewport" ? { useReaderViewport: (key, assetKey, canvas, status, locked, layoutReady) => ({
        ids: key ? requiredIds ?? assetKey.split('|').filter(Boolean) : [], measured: Boolean(key && layoutReady),
      }) } : require(name),
    performance: { now: () => now },
    document: { fonts: { load: font => new Promise(resolve => fontLoads.push({ font, resolve })) } },
    window: { setTimeout: schedule, matchMedia: () => ({ matches: reduced }), innerHeight: 800, visualViewport: viewport },
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
      if (autoCount && result.percent === 100) result.completeCount(result.request);
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
    resize(height) { viewport.height = height; viewportListeners.forEach(listener => listener()); render(); },
    async fontsReady() { fontLoads.splice(0).forEach(({ resolve }) => resolve([])); await tick(); render(); } };
}

test("waits for draft data, profile font and every first-screen image, video and sticker", async () => {
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
  h.advance(fadeMs - 1); assert.equal(h.value.active, true);
  h.advance(1); assert.equal(h.value.active, false);
});

test("a first-screen text texture decodes before the editor reveals", async () => {
  const h = harness(); const request = h.value.start(); h.render(); h.value.resolve(request);
  const blocks = [{ id: 'texture', type: 'text', backgroundTexture: '17-indigo-denim' }];
  h.render([blocks, {}, 'sans', false]);
  await h.fontsReady(); h.advance(1000);
  assert.equal(h.value.phase, 'loading');
  h.render([blocks, { texture: 'loaded' }, 'sans', false]);
  h.advance(16); assert.equal(h.value.phase, 'revealing');
});

test("offscreen photos, videos and stickers no longer hold the editor entrance open", async () => {
  const h = harness({ requiredIds: ['photo', 'sticker'] });
  const request = h.value.start(); h.render(); h.value.resolve(request);
  const blocks = [{ id: 'photo', type: 'image' }, { id: 'sticker', type: 'sticker' },
    { id: 'far-photo', type: 'image' }, { id: 'far-video', type: 'video' }, { id: 'far-sticker', type: 'sticker' }];
  h.render([blocks, { photo: 'loaded' }, 'sans', false]);
  await h.fontsReady(); h.advance(1000);
  assert.equal(h.value.phase, 'loading', 'visible sticker still has to decode');
  h.render([blocks, { photo: 'loaded', sticker: 'loaded' }, 'sans', false]);
  assert.equal(h.value.percent, 100);
  h.advance(16); assert.equal(h.value.phase, 'revealing');
  h.advance(fadeMs); assert.equal(h.value.active, false);
});

test("a first-screen video must decode its first frame but distant video errors do not block", async () => {
  const h = harness({ requiredIds: ['video'] });
  const request = h.value.start(); h.render(); h.value.resolve(request);
  const blocks = [{ id: 'video', type: 'video' }, { id: 'far-video', type: 'video' }];
  h.render([blocks, { 'far-video': 'error' }, 'sans', false]);
  await h.fontsReady(); h.advance(1000); assert.equal(h.value.phase, 'loading');
  h.render([blocks, { video: 'loaded', 'far-video': 'error' }, 'sans', false]);
  h.advance(16); assert.equal(h.value.phase, 'revealing');
});

test("a fast cached or empty Strip gets one intentional entrance instead of a flash", async () => {
  const h = harness(); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render(); await h.fontsReady();
  h.advance(279); assert.equal(h.value.phase, "loading");
  h.advance(17); assert.equal(h.value.phase, "revealing");
  h.advance(fadeMs); assert.equal(h.value.active, false);
});

test("failed assets use the existing error fallback and do not deadlock the whole editor", async () => {
  const h = harness(); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render([[{ id: "broken", type: "image" }], { broken: "error" }, "letter", false]);
  await h.fontsReady(); h.advance(296 + fadeMs); assert.equal(h.value.active, false);
});

test("Back cancels timers and stale font or draft completions cannot reveal the next entry", async () => {
  const h = harness(); const first = h.value.start(); h.render();
  h.value.resolve(first); h.render();
  h.value.cancel(); h.render();
  assert.equal(h.value.isCurrent(first), false);
  const second = h.value.start(); h.render();
  h.value.resolve(first); await h.fontsReady(); h.advance(1000);
  assert.equal(h.value.phase, "loading");
  h.value.resolve(second); h.render(); await h.fontsReady(); h.advance(16 + fadeMs);
  assert.equal(h.value.active, false);
});

test("the same crossfade completes even when the device requests reduced motion", async () => {
  const h = harness({ reduced: true }); const request = h.value.start(); h.render();
  h.value.resolve(request); h.render(); await h.fontsReady();
  h.advance(296); assert.equal(h.value.phase, "revealing");
  h.advance(fadeMs); assert.equal(h.value.active, false);
});

test("onboarding keeps its color until decoded content and keyboard geometry are ready without waiting for a visible counter", async () => {
  const h = harness({ keyboard: true, autoCount: false });
  const request = h.value.start({ handoffColor: '#CB8DFF' }); h.render();
  h.value.resolve(request);
  h.render([[{ id: 'photo', type: 'image' }], {}, 'sans', false]);
  await h.fontsReady(); h.advance(300);
  assert.equal(h.value.handoffColor, '#CB8DFF');
  assert.equal(h.value.phase, 'loading');
  h.render([[{ id: 'photo', type: 'image' }], { photo: 'loaded' }, 'sans', false]);
  h.advance(100); assert.equal(h.value.phase, 'loading', 'keyboard still covers the dock');
  h.resize(800); h.advance(90); h.resize(790);
  h.advance(99); assert.equal(h.value.phase, 'loading', 'wait for viewport motion to settle');
  h.advance(17); assert.equal(h.value.phase, 'revealing');
  h.advance(fadeMs); assert.equal(h.value.active, false);
  assert.equal(h.value.handoffColor, undefined);
});

test("a missing keyboard resize cannot strand onboarding and a later regular entry stays unchanged", async () => {
  const h = harness({ keyboard: true, autoCount: false });
  const request = h.value.start({ handoffColor: '#000000' }); h.render();
  h.value.resolve(request); h.render(); await h.fontsReady();
  h.advance(1016); assert.equal(h.value.phase, 'revealing');
  h.value.cancel(); h.render();
  h.value.start(); h.render();
  h.advance(2000);
  assert.equal(h.value.phase, 'loading');
  assert.equal(h.value.handoffColor, undefined);
});

test("first-Strip handoff opens immediately and fades the editor over the same colored surface", () => {
  const finish = page.slice(page.indexOf('const finishFirstStripOnboarding'), page.indexOf('const returnBackgroundToUsername'));
  assert.doesNotMatch(finish, /await beforeReveal|await.*save|new Image/);
  assert.ok(finish.indexOf('transferMedia()') < finish.indexOf('setBlocks(firstBlocks)'));
  assert.match(finish, /editorEntrance.start\(\{ handoffColor: authBackground \}\)/);
  assert.match(finish, /editorEntrance.resolve\(entranceRequest\)/);
  assert.match(page, /editorEntrance.handoffColor \?\? DEFAULT_BACKGROUND/);
  assert.match(css, /\.editor-entrance.is-onboarding-handoff \{ z-index: 100; \}/);
  const onboardingCss = readFileSync(new URL('../app/components/OnboardingStrip.module.css', import.meta.url), 'utf8');
  assert.match(onboardingCss, /transition: opacity 180ms ease/);
  assert.match(onboardingCss, /\.leaving > \.footer \{ opacity: 0; pointer-events: none/);
});

function renderComponentModule(file, imports = {}) {
  const source = readFileSync(new URL(`../app/components/${file}.tsx`, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => imports[name] ?? require(name) });
  return exports;
}

const topStatus = renderComponentModule("TopStatusPill", {
  "./AnimatedEllipsis": renderComponentModule("AnimatedEllipsis"),
});

test("Preview uses a light top status pill separate from bottom errors", () => {
  const html = renderToStaticMarkup(createElement(topStatus.TopStatusPill));
  assert.match(html, /top-status-pill is-temporary/);
  assert.match(html, /Preview mode/);
  assert.match(html, /Tap any block to edit/);
  assert.doesNotMatch(html, /<svg|progressbar|aria-valuenow|class="notice/);
  assert.match(css, /\.top-status-copy\s*\{[^}]*display: flex;[^}]*white-space: nowrap/);
  assert.match(css, /\.top-status-copy > span\s*\{ font-size: 14px; font-weight: 400; color: inherit;/);
  assert.match(css, /\.top-status-pill\s*\{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 6px\)/);
  assert.match(css, /\.top-status-pill\s*\{[^}]*background: #ffffff/);
  assert.match(css, /\.top-status-pill\s*\{[^}]*pointer-events: none/);
  assert.match(page, /notice === PREVIEW_MODE_NOTICE \? <TopStatusPill/);
});

test("loader shares Preview typography with animated dots and a right-side count, leaving tools outside the fade", () => {
  const component = readFileSync(new URL("../app/components/EditorEntrance.tsx", import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => name === "@/app/lib/strip-entrance" ? stripEntrance
      : name === "@/app/lib/scribble-entrance" ? scribbleEntrance
      : name === "./TopStatusPill" ? topStatus : require(name) });
  const html = renderToStaticMarkup(createElement(exports.EditorEntrance, {
    revealing: false,
  }));
  assert.doesNotMatch(component, /profileFont|readProfilePresentation|normalizedFontSize|progressStyle/);
  assert.doesNotMatch(html, /font-family|font-size/);
  assert.doesNotMatch(html, /<svg|top-status-spinner/);
  assert.match(css, /\.top-status-copy strong,\s*\.top-status-label,\s*\.top-status-progress\s*\{ font-size: 14px; font-weight: 700;/);
  assert.match(html, /top-status-pill is-loading/);
  assert.match(html, /Strip loading<span class="media-import-dots"/);
  assert.doesNotMatch(html, /editor-entrance-square|%/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /data-waiting="true"/);
  assert.ok(html.indexOf("top-status-label") < html.indexOf("top-status-progress"), "number follows the label on the right");
  assert.match(css, /\.top-status-progress\s*\{[^}]*margin-left: auto;[^}]*text-align: right/);
  assert.match(css, /\.editor-mode\.is-editor-loading > \.editor-canvas\s*\{[^}]*pointer-events: none/);
  assert.match(page, /if \(!editorEntrance.active && !editorTargetIsLoading\(event.target\)\) return;/);
  assert.match(page, /showEditorLoadingNotice\(editorEntrance.active \? "Strip is loading" : "Images loading"\)/);
  assert.match(page, /onKeyDownCapture=\{\(event\) => \{\s*if \(\(!editorEntrance.active/);
  assert.match(page, /!loaded \|\|\s*publishing \|\|\s*editorEntrance.active \|\|/, "autosave waits for the real draft");
});

test("one gentle fade reveals fully painted content and the safe area on the same clock", () => {
  const component = readFileSync(new URL("../app/components/EditorEntrance.tsx", import.meta.url), "utf8");
  assert.match(component, /installScribbleSurface\(surface, \(\) => \{\}, \{ suspendTheme: true \}\)/);
  assert.match(component, /<section ref=\{surfaceRef\}/);
  const entranceCss = css.slice(css.indexOf("/* Decode in the mounted canvas"), css.indexOf(".top-status-pill {"));
  assert.match(entranceCss, /\.editor-mode > \.editor-canvas \{\s*opacity: 1;\s*\}/);
  assert.doesNotMatch(entranceCss, /\.editor-mode.is-editor-loading > \.editor-canvas \{[^}]*(?:opacity: 0|visibility: hidden)/,
    "decoded media stays painted beneath the fading cover");
  assert.match(entranceCss, /\.editor-mode.is-editor-revealing > \.editor-canvas \{\s*opacity: 1;/);
  assert.doesNotMatch(entranceCss, /will-change|transform:|display: none|visibility: hidden|prefers-reduced-motion/);
  assert.match(entranceCss, /position: absolute/);
  assert.equal(fadeMs, 600);
  assert.match(entranceCss, /transition: opacity 600ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.equal((entranceCss.match(/transition: opacity/g) ?? []).length, 1,
    "only the opaque cover fades, rather than multiplying two opacity curves");
  assert.match(entranceCss, /\.editor-entrance.is-revealing \{ opacity: 0; \}/);
  const bounds = scribbleEntrance.scribbleSurfaceBounds({
    viewportHeight: 720, screenWidth: 393, screenHeight: 852,
    landscape: false, isPhone: true, safeTop: 0, scrollY: 61,
  });
  assert.ok(bounds.top - 61 < 0, "black cover begins above the visible viewport");
  assert.ok(bounds.height >= 860, "one surface covers the physical glass and rounding overscan");
  assert.doesNotMatch(component, /setProperty.*safe-area|setAttribute.*theme|scrollTo/, "the loader does not switch colors or scroll on unmount");
});
