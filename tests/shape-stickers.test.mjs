import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SHAPE_STICKERS, SHAPE_STICKER_COLORS, SHAPE_STICKER_DEFAULT_COLOR,
  normalizeShapeColor, shapeColorFromHsl, shapeColorInk, shapeColorPosition, shapeStickerSvg,
} from "../app/lib/shape-stickers.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("../app/components/StickerPicker.tsx", import.meta.url), "utf8");
const pickerCss = readFileSync(new URL("../app/components/StickerPicker.module.css", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("shapes have distinct alpha silhouettes and safe, persistent colors", () => {
  assert.equal(SHAPE_STICKERS.length, 42);
  assert.equal(new Set(SHAPE_STICKERS.map(shape => shape.id)).size, 42);
  assert.equal(new Set(SHAPE_STICKERS.map(shape => shape.name)).size, 42);
  assert.equal(new Set(SHAPE_STICKERS.map(shape => shape.path)).size, 42);
  assert.ok(SHAPE_STICKER_COLORS.some(color => color.value === SHAPE_STICKER_DEFAULT_COLOR));
  assert.equal(normalizeShapeColor("#ff4fa3"), "#FF4FA3");
  assert.equal(normalizeShapeColor('red" onload="alert(1)'), null);
  for (const shape of SHAPE_STICKERS) {
    const svg = shapeStickerSvg(shape, "#ff4fa3");
    assert.match(svg, /viewBox="0 0 256 256"/);
    assert.match(svg, /fill="#FF4FA3"/);
    assert.doesNotMatch(svg, /<script|onload=/i);
  }
  assert.match(shapeStickerSvg(SHAPE_STICKERS[0], "malicious"), /fill="#3155FF"/);
  assert.equal(shapeColorFromHsl(0, 50), "#FF0000");
  assert.equal(Math.round(shapeColorPosition("#FF0000").hue), 0);
  assert.equal(shapeColorInk("#8ACE00"), "#000000");
  assert.equal(shapeColorInk("#3155FF"), "#FFFFFF");
});

test("thirty new shapes extend the original pack without changing existing IDs", () => {
  assert.deepEqual(SHAPE_STICKERS.slice(0, 12).map(shape => shape.id), [
    "sparkle", "heart", "star", "flower", "bolt", "burst", "moon", "cloud",
    "diamond", "drop", "bubble", "squiggle",
  ]);
  assert.equal(SHAPE_STICKERS.slice(12).length, 30);
  for (const id of ["ring", "oval-ring", "wavy-frame"]) {
    assert.match(shapeStickerSvg(SHAPE_STICKERS.find(shape => shape.id === id), "#3155FF"), /fill-rule="evenodd"/);
  }
});

test("all tray stickers are shadow-free while photos retain their slight exposure lift", () => {
  assert.match(pickerCss, /\.shapeButton svg\s*\{[^}]*filter: none;/);
  assert.doesNotMatch(pickerCss, /drop-shadow|box-shadow|text-shadow/);
  assert.match(pickerCss, /\.stickerButton img\s*\{[^}]*filter: brightness\(1\.06\);/);
});

test("shape picks become passive PNG media through the normal sticker path", () => {
  const source = readFileSync(new URL("../app/lib/shape-stickers.ts", import.meta.url), "utf8");
  assert.match(source, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(page, /const addStickerFromShape = async[\s\S]*?renderShapeSticker\(shape, color\)[\s\S]*?placeSticker\(source,/);
  assert.match(page, /shapeColor=\{shapeStickerColor\}/);
  assert.match(page, /localStorage\.getItem\(SHAPE_COLOR_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.setItem\(SHAPE_COLOR_STORAGE_KEY, shapeStickerColor\)/);
  assert.match(picker, /category === "shapes"/);
  assert.match(picker, /SHAPE_STICKERS\.map/);
});

test("shape color controls stay visible while page sampling drops only the sticker tray", () => {
  assert.match(picker, /createPortal\(\s*<footer className=\{`composer-dock selector-dock shape-selector-dock/);
  assert.match(picker, /SHAPE_STICKER_COLORS/);
  assert.match(picker, /full-gradient-picker/);
  assert.match(picker, /ref=\{paletteScrollRef\} className=\{`selector-scroll/);
  assert.match(picker, /<div className="selector-leading">\s*<button type="button" className="dock-icon-button selector-back-button"/);
  assert.match(picker, /startPageSampling/);
  assert.match(picker, /onViewChange\("page-color"\)/);
  assert.match(picker, /const finishShapeColor = \(\) =>/);
  assert.doesNotMatch(pickerCss, /\.shapePalette|\.paletteScroll|\.shapeWheel|\.paletteDone/);
  assert.match(picker, /aria-hidden=\{!shapePaletteOpen\} inert=\{!shapePaletteOpen\}/);
  assert.doesNotMatch(picker, /shapePaletteOpen && typeof document/, "The dock stays mounted for native-style open and close transitions");
  assert.doesNotMatch(css, /\.shape-selector-dock\.is-sampling-page/);
  assert.match(css, /\.main-composer-dock\.is-sticker-picker-page-color\s*\{[^}]*transform: translateY/);
});

test("shapes keep the pack heading and masonry, with the color choice on the left", () => {
  assert.match(picker, /<h2 id="sticker-picker-title">Sticker pack<\/h2>/);
  assert.match(picker, /category === "shapes" \? <div className=\{styles.masonry\}/);
  assert.match(picker, /styles.stickerButton\} \$\{styles.shapeButton\} \$\{stickerSizeClasses\[index % stickerSizeClasses.length\]/);
  assert.doesNotMatch(picker, /Pick a shape|Pick a sticker/);
  assert.match(picker, /aria-hidden="true" \/>Select a color/);
  assert.match(pickerCss, /\.shapeHeading\s*\{[^}]*justify-content: flex-start/);
  assert.doesNotMatch(pickerCss, /\.shapeGrid|\.shapeButton\s*\{[^}]*background:/);
});

test("placed editor stickers have no selection outline or shadow but retain drag controls", () => {
  assert.doesNotMatch(page + css, /editor-sticker-outline|editor-sticker-filters/);
  assert.doesNotMatch(css, /\.sticker-block\.is-editing\.is-selected \.sticker-visual\s*\{/);
  assert.match(css, /\.sticker-block\.is-editing\.is-selected\s*\{[^}]*touch-action: none;/);
  assert.match(page, /aria-label="Delete sticker"/);
  assert.match(css, /\.landing-sticker-button\.is-selected/);
});
