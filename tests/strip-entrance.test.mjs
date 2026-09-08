import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeEntrancePalette, normalizeEntranceColor, paletteFromPixels, sampleEntranceMedia } from "../app/lib/strip-entrance.ts";

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
  ? { makeEntrancePalette, sampleEntranceMedia } : require(name) });
test("renders one accessible status, three ribbons, and no duplicated videos or orb", () => {
  const html = renderToStaticMarkup(React.createElement(exports.StripEntrance, {
    cover: { kind: "color", color: "#FF3366" }, blocks: [],
    endingStyle: { backgroundColor: "#FFFFFF", buttonColor: "#000000" },
    mediaReady: true, revealing: false, onCoverSettled() {},
  }));
  assert.equal((html.match(/data-lane=/g) ?? []).length, 3);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  assert.match(html, /--entrance-a:#FF3366/);
  assert.match(html, /aria-label="Loading Strip"/);
  assert.doesNotMatch(html, /<video|orb|<canvas/);
});
test("readiness, timeout, and reduced motion preserve the loading contract", () => {
  assert.match(page, /publishedAssetsReady && publishedMinimumElapsed/);
  assert.match(page, /PUBLISHED_MEDIA_LOAD_TIMEOUT_MS/);
  assert.match(page, /prefers-reduced-motion: reduce.*\? 280 : PUBLISHED_LOADING_RELEASE_MS/);
  assert.match(componentSource, /cancelAnimationFrame\(frame\)/);
  assert.match(componentSource, /if \(!mounted.current\) return/);
  assert.match(componentSource, /if \(revealing\) frozen.current = true/);
  assert.doesNotMatch(componentSource, /scrollTo|scrollBy|new Image|fetch\(/);
});
test("the reveal only animates the overlay, never the actual strip or footer", () => {
  const entranceCss = css.slice(css.indexOf(".published-strip-load-gate {"), css.indexOf(".sticker-block {"));
  assert.doesNotMatch(entranceCss, /published-strip-orb/);
  assert.match(entranceCss, /\.published-strip-load-gate \{[\s\S]*?visibility: visible;[\s\S]*?opacity: 1;/);
  assert.match(entranceCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(entranceCss, /strip-entrance-fade 280ms/);
  assert.match(page, /PUBLISHED_LOADING_RELEASE_MS = 1400/);
  assert.match(componentSource, /"--entrance-release": "1400ms"/);
});
