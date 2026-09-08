import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { entranceLoadPercent, makeEntrancePalette, normalizeEntranceColor, paletteFromPixels, sampleEntranceMedia, startEntranceCounter } from "../app/lib/strip-entrance.ts";
import { startScribble } from "../app/lib/scribble-entrance.ts";

test("normalizes authored colors without accepting arbitrary CSS", () => {
  assert.equal(normalizeEntranceColor("#3af"), "#33AAFF");
  assert.equal(normalizeEntranceColor(" aBcDeF "), "#ABCDEF");
  for (const value of ["url(https://example.com)", "red", "#12345", ""]) assert.equal(normalizeEntranceColor(value), null);
});
test("uses actual dominant pixels while ignoring transparent edges, black, and white glare", () => {
  const pixels = [...Array(20).fill([30, 100, 170, 255]).flat(), ...Array(10).fill([220, 90, 30, 255]).flat(),
    ...Array(40).fill([0, 255, 0, 0]).flat(), ...Array(50).fill([255, 255, 255, 255]).flat(),
    ...Array(30).fill([0, 0, 0, 255]).flat()];
  assert.deepEqual(paletteFromPixels(pixels), ["#1E64AA", "#DC5A1E"]);
});
test("near-identical colors do not crowd out another color in the strip", () => {
  assert.deepEqual(makeEntrancePalette(["#00FF00", "#00FE00"], ["#FF0000", "#0000FF"]), ["#00FF00", "#FF0000", "#0000FF"]);
});
test("authored accents come first and default neutral footer colors do not replace the photos", () => {
  assert.deepEqual(makeEntrancePalette(["#FFFFFF", "#000000"], ["#884422", "#336688", "#99CC44"]), ["#884422", "#336688", "#99CC44"]);
  assert.equal(makeEntrancePalette(["#FF3366"], ["#336688"])[0], "#FF3366");
});
test("single-color, monochrome, empty, and invalid strips always have three usable tones", () => {
  for (const colors of [["#000000"], ["#FFFFFF"], ["#3155FF"], [], ["bad"]]) {
    const palette = makeEntrancePalette(colors, []);
    assert.equal(palette.length, 3);
    for (const color of palette) assert.match(color, /^#[0-9A-F]{6}$/);
    assert.ok(new Set(palette).size >= 2);
  }
});
test("unready media never needs a canvas or blocks the loader", () => {
  assert.deepEqual(sampleEntranceMedia({ naturalWidth: 0, naturalHeight: 0 }), []);
  assert.deepEqual(sampleEntranceMedia({ videoWidth: 0, videoHeight: 0 }), []);
});
test("sampling stays bounded to 32 pixels square and canvas failure is harmless", () => {
  let canvas;
  globalThis.document = { createElement: () => canvas = { getContext: () => ({
    drawImage: (...args) => assert.deepEqual(args.slice(1), [0, 0, 32, 32]),
    getImageData: () => ({ data: [120, 160, 200, 255] }),
  }) } };
  try {
    assert.deepEqual(sampleEntranceMedia({ videoWidth: 4000, videoHeight: 3000 }), ["#78A0C8"]);
    assert.equal(canvas.width, 32);
    assert.equal(canvas.height, 32);
    globalThis.document.createElement = () => { throw new Error("cross origin"); };
    assert.deepEqual(sampleEntranceMedia({ naturalWidth: 1000, naturalHeight: 800 }), []);
  } finally { delete globalThis.document; }
});

const componentSource = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const exports = {};
runInNewContext(ts.transpileModule(componentSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, { exports, require: name => name === "@/app/lib/strip-entrance"
  ? { entranceLoadPercent, makeEntrancePalette, sampleEntranceMedia, startEntranceCounter } : name === "@/app/lib/scribble-entrance"
    ? { startScribble } : require(name) });
test("renders one accessible status and one flat ink canvas, without ribbons or extra media", () => {
  const html = renderToStaticMarkup(React.createElement(exports.StripEntrance, {
    cover: { kind: "color", color: "#FF3366" }, blocks: [],
    endingStyle: { backgroundColor: "#FFFFFF", buttonColor: "#000000" },
    mediaReady: true, revealing: false, onCoverSettled() {}, onExitComplete() {},
    settledAssets:97,totalAssets:100,
  }));
  assert.equal((html.match(/<canvas/g) ?? []).length, 1);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  assert.match(html, /--entrance-a:#FF3366/);
  assert.match(html, /aria-label="Loading Strip"/);
  assert.match(html, /STRIP LOADING\.\.\./);
  assert.match(html, /data-load-progress="97"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, />0%<\/span>/);
  assert.doesNotMatch(html, /<video|orb|ribbon|wordmark/);
});
test("readiness and timeout preserve the loading contract", () => {
  assert.match(page, /publishedAssetsReady && publishedMinimumElapsed/);
  assert.match(page, /PUBLISHED_MEDIA_LOAD_TIMEOUT_MS/);
  assert.match(page, /onExitComplete=\{\(\) => setPublishedLoaderDismissedKey\(publishedStripLoadKey\)\}/);
  assert.doesNotMatch(page, /PUBLISHED_LOADING_RELEASE_MS/);
  assert.match(componentSource, /cancelAnimationFrame\(frame\)/);
  assert.match(componentSource, /if \(!mounted.current\) return/);
  assert.match(componentSource, /if \(revealing\) frozen.current = true/);
  assert.doesNotMatch(componentSource, /scrollTo|scrollBy|new Image|fetch\(/);
});

test("the percentage follows completed assets and never rounds unfinished loading to 100", () => {
  assert.equal(entranceLoadPercent(0,10),0);
  assert.equal(entranceLoadPercent(1,4),25);
  assert.equal(entranceLoadPercent(97,100),97);
  assert.equal(entranceLoadPercent(999,1000),99);
  assert.equal(entranceLoadPercent(1000,1000),100);
  assert.equal(entranceLoadPercent(0,0),100);
  assert.equal(entranceLoadPercent(-1,10),0);
  assert.equal(entranceLoadPercent(NaN,10),0);
  assert.equal(entranceLoadPercent(1,Infinity),0);
  for(let i=1;i<=100;i++) assert.ok(entranceLoadPercent(i,100)>=entranceLoadPercent(i-1,100));
  assert.match(page,/settledAssets=\{publishedAssetIds.filter/);
  assert.match(page,/openedPublishedStrip.cover.kind === "image" && publishedCoverReady/);
  assert.match(componentSource,/entranceLoadPercent\(settledAssets, totalAssets\)/);
  assert.match(css,/height: calc\(100lvh \+ env\(safe-area-inset-top\) \+ env\(safe-area-inset-bottom\) \+ 8px\)/);
  assert.match(css,/font-variant-numeric: tabular-nums/);
  const readoutCss=css.slice(css.indexOf('.strip-entrance-progress {'),css.indexOf('.strip-entrance-percent {'));
  assert.match(readoutCss,/color: #fff;/);
  assert.match(readoutCss,/text-shadow: 0 1px 3px rgba\(0, 0, 0, 0.2\)/);
  assert.doesNotMatch(readoutCss,/mix-blend-mode/);
  assert.match(componentSource,/ready=\{revealing && displayPercent === 100\}/);
});

test("the readout counts every percentage once, pauses at real progress, and cleans up", () => {
  const queue=new Map(),seen=[]; let id=0;
  globalThis.requestAnimationFrame=fn=>{queue.set(++id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>queue.delete(id);
  const tick=now=>{const tasks=[...queue.values()];queue.clear();tasks.forEach(fn=>fn(now));};
  const counter=startEntranceCounter(value=>seen.push(value));
  try {
    counter.setTarget(25);
    for(let t=0;t<=1200;t+=16) tick(t);
    assert.deepEqual(seen,Array.from({length:25},(_,i)=>i+1));
    assert.equal(queue.size,0);
    tick(90000);assert.equal(seen.length,25);
    counter.setTarget(97); tick(90016);
    assert.equal(seen.at(-1),26);
    counter.setTarget(100);
    for(let t=90032;t<95000;t+=16)tick(t);
    assert.deepEqual(seen,Array.from({length:100},(_,i)=>i+1));
    assert.equal(queue.size,0);
    counter.dispose();counter.setTarget(100);tick(100000);
    assert.equal(seen.length,100);
  } finally {counter.dispose();delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});
test("the reveal only animates the overlay, never the actual strip or footer", () => {
  const entranceCss = css.slice(css.indexOf(".published-strip-load-gate {"), css.indexOf(".sticker-block {"));
  assert.doesNotMatch(entranceCss, /published-strip-orb/);
  assert.match(entranceCss, /\.published-strip-load-gate \{[\s\S]*?visibility: visible;[\s\S]*?opacity: 1;/);
  assert.doesNotMatch(entranceCss, /gradient|box-shadow|filter:|ribbon|@keyframes/);
  assert.match(componentSource, /animation.dispose\(\)/);
  assert.match(componentSource, /controller.current\?\.setReady\(ready\)/);
  assert.match(entranceCss, /--entrance-safe-top: env\(safe-area-inset-top\)/);
  assert.doesNotMatch(entranceCss, /html.published-content-loading[^}]*background:/);
  assert.match(componentSource, /installScribbleSurface\(surface\)/);
});

test("text-first reader ink owns the edge only until its actual overlay is removed", () => {
  assert.match(css, /html:has\(\.published-mode\.has-leading-text \.strip-entrance\) body\s*\{\s*background: #000 !important;/);
  assert.match(css, /\.published-mode\.has-leading-text:has\(\.strip-entrance\) > \.top-safe-area-anchor\s*\{\s*display: none;/);
  assert.match(css, /padding-top: calc\(var\(--leading-image-inset\) \+ env\(safe-area-inset-top\)\)/);
  assert.match(page, /hasLeadingImage \|\| \(view === "published" && hasLeadingText\)/);
  const anchorEffect = page.slice(page.indexOf("const calculateLeadingImageOffset"), page.indexOf("const calculateLeadingImageOffset") + 2500);
  assert.doesNotMatch(anchorEffect, /publishedLoaderIsVisible|publishedContentCanReveal/);
});

test("no vibration API, native switch proxy, or selection haptic remains", () => {
  const ink = readFileSync(new URL("../app/lib/scribble-entrance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page + css + ink, /navigator\.vibrate|createScribbleHaptics|triggerSelectionHaptic|selection-haptic-proxy|safariHapticSwitch/);
});

test("a saved editor color never leaks into public Strip startup", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const literal = layout.match(/const initialThemeColorScript = (`[\s\S]*?`);/)[1];
  const script = runInNewContext(literal);
  for (const [hostname, pathname, expected] of [
    ["striiip.com", "/strip/1788883180526-yblku5", 0],
    ["striiip.com", "/share/1788883180526-yblku5", 0],
    ["antonio.striiip.com", "/1788883180526-yblku5", 0],
    ["localhost", "/strip/1788883180526-yblku5", 0],
    ["striiip.com", "/edit/draft-123", 1],
  ]) {
    let reads = 0, writes = 0;
    runInNewContext(script, {
      window: { location: { hostname, pathname }, localStorage: { getItem: () => { reads++; return '[{"type":"text","backgroundColor":"#FF00FF"}]'; } } },
      document: { getElementById: () => ({ setAttribute() { writes++; } }), documentElement: { style: { setProperty() {} } } },
    });
    assert.equal(reads, expected, pathname); assert.equal(writes, expected, pathname);
  }
});
