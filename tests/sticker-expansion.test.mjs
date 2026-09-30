import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { STICKER_CATEGORIES, STICKER_PACK } from "../app/lib/sticker-pack.ts";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("docs/sticker-pack-expansion.prompts.json", root), "utf8"));

test("the expansion adds exactly 20 distinct stickers to each existing image section", () => {
  assert.equal(manifest.assets.length, 120);
  assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, 120);
  for (const category of STICKER_CATEGORIES) {
    assert.equal(manifest.assets.filter(asset => asset.category === category).length, 20, category);
  }
  for (const asset of manifest.assets) {
    const sticker = STICKER_PACK.find(sticker => sticker.id === asset.id);
    assert.ok(sticker, asset.id);
    assert.equal(sticker.category, asset.category);
    assert.equal(sticker.name, asset.name);
    assert.ok(asset.prompt.length > 100, `${asset.id} keeps its generation specification`);
  }
});

test("Animals includes the new hummingbird without replacing the orca, panda or existing animals", () => {
  for (const id of ["hummingbird", "orca", "panda", "hamster", "honey-bee", "chrome-dolphin"]) {
    assert.equal(STICKER_PACK.find(sticker => sticker.id === id)?.category, "animals", id);
  }
});

test("the frame count is capped and the remaining Scrap slots contain non-frame materials", () => {
  const scraps = manifest.assets.filter(asset => asset.category === "scrap");
  assert.equal(scraps.filter(asset => asset.id.endsWith("frame")).length, 3);
  for (const id of ["sewing-button", "lavender-tape", "cork-scrap"]) {
    assert.ok(scraps.some(asset => asset.id === id), id);
  }
  for (const id of ["red-wavy-frame", "slide-frame", "scalloped-frame"]) {
    assert.ok(!STICKER_PACK.some(sticker => sticker.id === id), id);
  }
});

test("every new cutout has real transparency, exact reserved dimensions and a compact file", async () => {
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL(`public/sticker-pack/${asset.category}/${asset.id}.webp`, root));
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0;
    let visible = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) clear++;
      if (data[index] > 128) visible++;
    }
    assert.ok(clear > info.width * info.height * 0.01, `${asset.id} has a transparent cutout, not a rectangle`);
    assert.ok(visible > info.width * info.height * 0.01, `${asset.id} contains visible artwork`);
    assert.ok(bytes.length < 150_000, `${asset.id} stays lightweight`);
    const sticker = STICKER_PACK.find(sticker => sticker.id === asset.id);
    assert.equal(sticker.width, info.width, asset.id);
    assert.equal(sticker.height, info.height, asset.id);
  }
});
