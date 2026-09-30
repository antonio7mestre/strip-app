import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { stickersByCategory } from "../app/lib/sticker-pack.ts";

const root = new URL("../", import.meta.url);
test("Scrap preserves its original materials and adds 20 new pieces with the frame count capped", () => {
  const scraps = stickersByCategory("scrap");
  assert.equal(scraps.length, 44);
  assert.equal(scraps.filter(sticker => sticker.id.endsWith("frame")).length, 8);
  for (const id of ["clear-tape", "frosted-tape", "cobalt-tape", "gingham-tape", "notebook-scrap", "paperclip", "blank-ticket"]) {
    assert.ok(scraps.some(sticker => sticker.id === id), id);
  }
  const prompts = JSON.parse(readFileSync(new URL("docs/sticker-pack-scrap.prompts.json", root), "utf8"));
  const expansion = JSON.parse(readFileSync(new URL("docs/sticker-pack-expansion.prompts.json", root), "utf8"));
  assert.deepEqual([...prompts.assets, ...expansion.assets.filter(asset => asset.category === "scrap")].map(asset => asset.id), scraps.map(sticker => sticker.id));
});

test("all Scrap assets retain alpha transparency and compact upload sizes", () => {
  for (const sticker of stickersByCategory("scrap")) {
    const bytes = readFileSync(new URL(`public${sticker.src}`, root));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", sticker.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", sticker.id);
    assert.equal(bytes.toString("ascii", 12, 16), "VP8X", sticker.id);
    assert.ok(bytes[20] & 0x10, `${sticker.id} has an alpha channel`);
    assert.ok(bytes.length < 150_000, `${sticker.id} is lightweight`);
  }
});

test("frame openings remain clear and frosted tape has genuinely translucent film", async () => {
  for (const sticker of stickersByCategory("scrap").filter(sticker => sticker.id.endsWith("frame") || sticker.id === "frosted-tape")) {
    const { data, info } = await sharp(readFileSync(new URL(`public${sticker.src}`, root)))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = [];
    for (let y = Math.floor(info.height * 0.4); y < info.height * 0.6; y++) {
      for (let x = Math.floor(info.width * 0.4); x < info.width * 0.6; x++) {
        alpha.push(data[(y * info.width + x) * 4 + 3]);
      }
    }
    if (sticker.id.endsWith("frame")) {
      assert.ok(alpha.filter(value => value === 0).length / alpha.length > 0.99, `${sticker.id} has an open center`);
    } else {
      alpha.sort((a, b) => a - b);
      const median = alpha[Math.floor(alpha.length / 2)];
      assert.ok(median > 50 && median < 190, "the underlying photo shows through the film");
    }
  }
});
