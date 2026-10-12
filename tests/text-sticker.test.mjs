import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as profile from "../app/lib/profile.ts";
import * as alignment from "../app/lib/text-alignment.ts";
import * as sizing from "../app/lib/font-sizing.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Intl, ...globals, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const data = compile("app/lib/text-sticker.ts", { "./profile": profile, "./text-alignment": alignment });
const base = { content: "Hello\nhi", fontStyle: "letter", fontSize: 32, textColor: "#FFFFFF", textAlign: "center" };
function renderer() {
  const drawings = [];
  const makeCanvas = () => {
    const ops = [];
    const context = {
      measureText: text => ({ width: [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length * 10,
        actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 8 }),
      scale: (...args) => ops.push(["scale", ...args]),
      fillRect: (...args) => ops.push(["rect", context.fillStyle, ...args]),
      fillText: (...args) => ops.push(["text", context.fillStyle, context.textAlign, ...args]),
    };
    const canvas = { width: 0, height: 0, ops, getContext: () => context, toDataURL: () => "data:image/png;base64,AA==" };
    drawings.push(canvas);
    return canvas;
  };
  const document = { fonts: { load: async () => [] }, createElement: type => {
    assert.equal(type, "canvas"); return makeCanvas();
  } };
  return { ...compile("app/lib/text-sticker-render.ts", {
    "./font-sizing": sizing, "./profile": profile, "./text-sticker": data,
  }, { document }), makeCanvas, drawings };
}

test("metadata accepts plain editable words, validates colors and retains the existing font families", () => {
  for (const value of [null, "", [], {}, { content: 4 }]) assert.equal(data.normalizeTextSticker(value), undefined);
  const result = data.normalizeTextSticker({ content: "a\r\nb\u0000\rc", fontStyle: "missing", fontSize: Infinity,
    textColor: "url(bad)", textAlign: "bad", backgroundColor: "red" });
  assert.equal(result.content, "a\nb\nc");
  assert.equal(result.fontStyle, "letter");
  assert.equal(result.fontSize, 32);
  assert.equal(result.textColor, "#FFFFFF");
  assert.equal(result.textAlign, "left");
  assert.equal(result.backgroundColor, undefined);
  assert.equal(data.normalizeTextSticker({ ...base, fontSize: 999, backgroundColor: "#aabbcc" }).fontSize, 72);
  assert.equal(data.normalizeTextSticker({ ...base, backgroundColor: "#aabbcc" }).backgroundColor, "#AABBCC");
  assert.equal(data.normalizeTextSticker({ ...base, content: "x".repeat(1000) }).content.length, 280);
  for (const font of profile.PROFILE_FONTS) assert.equal(data.normalizeTextSticker({ ...base, fontStyle: font.id }).fontStyle, font.id);
});

test("wrapping preserves explicit new lines and whole emoji sequences", () => {
  const r = renderer(), measure = { measureText: text => ({ width: [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length * 10 }) };
  assert.deepEqual(Array.from(r.textStickerLines(measure, "one two three\n\nfour", 70)), ["one two", "three", "", "four"]);
  assert.deepEqual(Array.from(r.textStickerLines(measure, "👩🏽‍🚀👩🏽‍🚀👩🏽‍🚀", 20)), ["👩🏽‍🚀👩🏽‍🚀", "👩🏽‍🚀"]);
});

test("background is exactly one sharp rectangle fitted to the longest line for every alignment", async () => {
  const r = renderer();
  for (const [textAlign, expectedX] of [["left", 0], ["center", 123], ["right", 246]]) {
    const canvas = r.makeCanvas();
    const result = await r.paintTextSticker(canvas, { ...base, textAlign, backgroundColor: "#FF0066" });
    assert.equal(result.backgroundWidth, 74, "five letters at 10px plus 12px padding each side");
    assert.equal(result.backgroundX, expectedX);
    const rects = canvas.ops.filter(op => op[0] === "rect");
    assert.equal(rects.length, 1);
    assert.deepEqual(rects[0], ["rect", "#FF0066", expectedX, 0, 74, result.height]);
    assert.equal(canvas.ops.filter(op => op[0] === "text").length, 2);
    assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  }
  const plain = r.makeCanvas();
  await r.paintTextSticker(plain, base);
  assert.equal(plain.ops.filter(op => op[0] === "rect").length, 0);
});

test("the export waits for the same normalized font as the on-page editor and bounds large artwork", async () => {
  const r = renderer();
  for (const font of profile.PROFILE_FONTS) {
    const input = { ...base, fontStyle: font.id };
    assert.ok(r.textStickerFont(input).includes(`${sizing.normalizedFontSize(font.id, 32)}px`));
    assert.ok(r.textStickerFont(input).includes(font.family));
  }
  const canvas = r.makeCanvas();
  await r.paintTextSticker(canvas, { ...base, content: "\n".repeat(280), fontSize: 72 });
  assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  await r.renderTextSticker(base);
  const count = r.drawings.length;
  await r.renderTextSticker({ ...base });
  assert.equal(r.drawings.length, count, "autosave reuses identical artwork");
});

test("text uploads keep editable metadata and exact placement, while dropping unfinished empty labels", async () => {
  const r = renderer();
  const upload = compile("app/lib/sticker-upload.ts", {
    "./sticker-pack": { STICKER_PACK: [] }, "./text-sticker": data, "./text-sticker-render": r,
  });
  const block = { id: "words", type: "sticker", src: data.EMPTY_TEXT_STICKER_SRC, textSticker: base, x: 30, y: 220, width: 48, rotation: 23 };
  const result = await upload.prepareStickerUploads([block, { ...block, id: "empty", textSticker: { ...base, content: "  " } }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].stickerOrigin, "text");
  assert.equal(result[0].src, "data:image/png;base64,AA==");
  assert.equal(result[0].textSticker.content, base.content);
  for (const key of ["x", "y", "width", "rotation"]) assert.equal(result[0][key], block[key]);
  assert.equal(block.src, data.EMPTY_TEXT_STICKER_SRC, "the displayed editor source stays untouched");
});

test("text shares the sticker transforms and style picker, with a single pill and counter-rotating icons", () => {
  const page = read("app/page.tsx"), css = read("app/globals.css");
  assert.match(page, /onText=\{addTextSticker\}/);
  assert.match(page, /isTextSticker=\{block.type === "sticker"/);
  assert.doesNotMatch(page, /aria-label="Edit sticker text"/);
  assert.match(page, /textTap && !cancelled && !textTap.moved\) onTextEdit\?\.\(\)/);
  assert.match(css, /\.sticker-block\.is-selected \.text-sticker-visual::after\s*\{[^}]*border: 3px dashed/s);
  for (const selector of [".sticker-block.is-selected .text-sticker-visual::after", ".text-sticker-typing-background"]) {
    const rule = css.slice(css.indexOf(selector)).split("}")[0];
    assert.ok(rule.includes("left: var(--text-sticker-box-left)"));
    assert.ok(rule.includes("width: var(--text-sticker-box-width)"));
  }
  assert.match(page, /Choose sticker background/);
  assert.match(page, /allowTransparentBackground transparentBackground=/);
  assert.match(page, /No sticker background/);
  assert.match(page, /querySelector\("img, video, canvas"\)/);
  assert.match(css, /\.sticker-delete-anchor\.has-text-tools\s*\{[^}]*border-radius: 999px;/s);
  assert.match(css, /\.sticker-delete-control\s*\{[^}]*rotate\(var\(--sticker-counter-rotation/s);
  assert.match(read("app/components/TextStickerVisual.tsx"), /aria-label="Sticker text"/);
});
