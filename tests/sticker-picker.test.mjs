import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { imageSize } from "image-size";
import {
  STICKER_CATEGORIES,
  STICKER_PACK,
  stickersByCategory,
} from "../app/lib/sticker-pack.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const picker = readFileSync(
  new URL("../app/components/StickerPicker.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/components/StickerPicker.module.css", import.meta.url),
  "utf8",
);

test("the sticker pack has five complete categories plus the added animals", () => {
  assert.deepEqual(STICKER_CATEGORIES, [
    "random",
    "animals",
    "items",
    "nature",
    "clothing",
  ]);
  assert.equal(STICKER_PACK.length, 102);
  assert.equal(new Set(STICKER_PACK.map(sticker => sticker.id)).size, 102);
  assert.equal(new Set(STICKER_PACK.map(sticker => sticker.src)).size, 102);
  for (const category of STICKER_CATEGORIES) {
    assert.equal(stickersByCategory(category).length, category === "animals" ? 22 : 20, category);
  }
});

test("every generated sticker is a compact WebP asset", () => {
  for (const sticker of STICKER_PACK) {
    const asset = new URL(`../public${sticker.src}`, import.meta.url);
    assert.ok(existsSync(asset), sticker.src);
    const size = imageSize(readFileSync(asset));
    assert.equal(size.type, "webp", sticker.src);
    assert.ok(size.width > 80 && size.width <= 512, sticker.src);
    assert.ok(size.height > 80 && size.height <= 512, sticker.src);
  }
});

test("the sticker action offers the pack or the existing camera-roll flow", () => {
  assert.match(page, /setStickerPickerOpen\(true\)/);
  assert.match(page, /<StickerPicker[\s\S]*?onPhotoVideo=/);
  assert.match(page, /stickerInputRef\.current\?\.click\(\)/);
  assert.match(page, /accept="image\/\*,video\/\*"/);
  assert.match(page, /placeSticker\(sticker\.src, sticker\.name\)/);
  assert.match(page, /onPhotoVideo=\{\(\) => \{[\s\S]*?stickerInputRef\.current\?\.click\(\);[\s\S]*?setStickerPickerOpen\(false\);/);
  assert.match(picker, /className=\{styles\.sourceChoice\}[^>]*onClick=\{onPhotoVideo\}/s);
  assert.match(page, /is-sticker-picker-\$\{stickerPickerView\}/);
  assert.match(page, /onViewChange=\{setStickerPickerView\}/);
  assert.match(picker, /Sticker<br \/>pack/);
  assert.match(picker, /Photo or<br \/>video/);
  assert.doesNotMatch(picker, /aria-modal="true"/);
  assert.doesNotMatch(css, /\.backdrop\s*\{/);
});

test("the pack is a dense, scrollable masonry sheet", () => {
  for (const label of ["Random", "Animals", "Items", "Nature", "Clothing"]) {
    assert.match(picker, new RegExp(`${label}`));
  }
  assert.match(css, /\.masonry\s*\{[^}]*columns:\s*3;/s);
  assert.match(css, /\.stickerButton\s*\{[^}]*break-inside:\s*avoid;/s);
  assert.match(css, /\.stickerButton img\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/s);
  assert.match(picker, /stickerSizeClasses\[index % stickerSizeClasses\.length\]/);
  assert.match(css, /\.stickerLarge\s*\{\s*width:\s*100%;\s*\}/);
  assert.match(css, /\.stickerMedium\s*\{\s*width:\s*84%;\s*\}/);
  assert.match(css, /\.stickerSmall\s*\{\s*width:\s*68%;\s*\}/);
  assert.match(css, /\.sourceChoices\s*\{[^}]*grid-template-columns:\s*50px repeat\(2,/s);
  assert.match(css, /\.sourceChoice\s*\{[^}]*aspect-ratio:\s*1;/s);
  assert.match(css, /\.stickerButton\.isPicking img/);
  assert.match(css, /\.categories\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s);
  assert.match(css, /\.masonry\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
  assert.match(css, /brightness\(1\.06\)/);
  assert.match(page, /block\.src\.startsWith\("\/sticker-pack\/"\)[^\n]*brightness\(1\.06\)/);
  assert.match(picker, /sticker\.id\.startsWith\("gummy-bear"\)[\s\S]*?styles\.stickerMedium/);
});
