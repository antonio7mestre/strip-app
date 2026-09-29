import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { watchCoverImage } from "../app/lib/cover-entrance.ts";

const source = readFileSync(new URL("../app/components/StickerImage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const require = createRequire(import.meta.url), exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, { exports, require: name => name === "@/app/lib/cover-entrance" ? { watchCoverImage } : require(name) });

test("first paint reserves the exact silhouette before showing undecoded pixels", () => {
  const html = renderToStaticMarkup(React.createElement(exports.StickerImage, {
    src: "/sticker-pack/items/lip-gloss.webp", alt: "", width: 91, height: 512,
    loading: "lazy", decoding: "async", draggable: false,
  }));
  assert.match(html, /width="91" height="512"/);
  assert.match(html, /data-sticker-ready="false"/);
  assert.match(html, /loading="lazy"/);
  assert.match(css, /\.sticker-image-reveal\[data-sticker-ready="false"\] \{ opacity: 0; \}/);
  assert.match(css, /\.sticker-image-reveal\[data-sticker-ready="true"\] \{ animation: sticker-image-in 180ms ease-out backwards; \}/);
  assert.match(css, /@keyframes sticker-image-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
});

test("loading and already-cached stickers both wait for decode and settle exactly once", async () => {
  for (const cached of [false, true]) {
    const events = new Map(); let finishDecode, reveals = 0;
    const image = { complete: cached, naturalWidth: 91,
      decode: () => new Promise(resolve => { finishDecode = resolve; }),
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const dispose = watchCoverImage(image, () => reveals++, () => assert.fail("unexpected image error"));
    if (!cached) events.get("load")();
    assert.equal(reveals, 0);
    finishDecode(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(reveals, 1);
    events.get("load")(); assert.equal(reveals, 1);
    dispose(); assert.equal(events.size, 0);
  }
});

test("switching categories mid-decode cannot reveal an unmounted sticker", async () => {
  let finishDecode, reveals = 0;
  const image = { complete: true, naturalWidth: 91,
    decode: () => new Promise(resolve => { finishDecode = resolve; }),
    addEventListener() {}, removeEventListener() {} };
  const dispose = watchCoverImage(image, () => reveals++, () => reveals++);
  dispose(); finishDecode(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reveals, 0);
});

test("editor placement shares the decoded fade, without replaying on a selection or drag", () => {
  assert.match(source, /return watchDecodedImage\(image,/);
  assert.match(source, /\}, \[src\]\)/);
  assert.match(source, /callbackRef.current = onSettled/);
  assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|scrollTo|transform:/);
  assert.match(page, /<StickerImage\s+src=\{block.src\}/);
  assert.match(page, /onSettled=\{\(loaded\) => \{\s*if \(loaded\) settleStickerWithinBounds\(\);\s*onLoadSettled\?\.\(loaded\)/);
});
