// Compare real browser captures at the same viewport and content origin.
// Usage: node tests/helpers/compare-sticker-pixels.mjs /path/results.json /path/captures
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import sharp from "sharp";

const resultPath = process.argv[2];
const captures = process.argv[3] ?? dirname(resultPath);
const results = JSON.parse(readFileSync(resultPath, "utf8"));
const report = [];
for (const key of Object.keys(results).filter(key => key.startsWith("fixed-") && key.endsWith("-editor"))) {
  const publishedKey = key.replace(/-editor$/, "-published");
  if (!results[publishedKey]) continue;
  const editor = results[key], published = results[publishedKey];
  const [a, b] = await Promise.all([key, publishedKey].map(key =>
    sharp(resolve(captures, `sticker-${key}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  assert.equal(a.info.width, b.info.width);
  for (const [index, sticker] of editor.stickers.entries()) {
    const other = published.stickers[index];
    assert.equal(sticker.id, other.id);
    assert.equal(sticker.style, other.style);
    assert.equal(sticker.rotation, other.rotation);
    for (const part of ["box", "visual"]) for (const axis of ["x", "y", "width", "height"])
      assert.ok(Math.abs(sticker[part][axis] - other[part][axis]) < 1 / 64, `${key}: ${sticker.id} ${part}.${axis}`);
    const r = sticker.visual;
    const x0 = Math.max(Math.floor(editor.origin.x), Math.floor(editor.origin.x + r.x));
    const x1 = Math.min(Math.ceil(editor.origin.x + editor.canvas.width), Math.ceil(editor.origin.x + r.x + r.width));
    const editorOrigin = editor.origin.y + editor.scrollY - (editor.captureOriginY ?? 0);
    const publishedOrigin = published.origin.y + published.scrollY - (published.captureOriginY ?? 0);
    const y0 = Math.max(0, Math.floor(editorOrigin + r.y));
    const y1 = Math.ceil(editorOrigin + r.y + r.height);
    const publishedOffsetY = Math.round(publishedOrigin - editorOrigin);
    let pixels = 0, different = 0, significant = 0, maximumChannelDelta = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const offset = (y * a.info.width + x) * 4;
      const otherOffset = ((y + publishedOffsetY) * b.info.width + x) * 4;
      let delta = 0;
      for (let channel = 0; channel < 4; channel++) delta = Math.max(delta, Math.abs(a.data[offset + channel] - b.data[otherOffset + channel]));
      pixels++; different += Number(delta > 0); significant += Number(delta > 1);
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    report.push({ case: key.replace(/-editor$/, ""), sticker: sticker.id, pixels, different, significant, maximumChannelDelta });
  }
}
console.table(report);
// Permit only a one-channel rounding difference from browser antialiasing.
// Position, dimensions and rotation are asserted separately above.
const failures = report.filter(row => row.significant > 0);
console.log(`${report.length} comparisons, ${report.reduce((sum, row) => sum + row.pixels, 0)} pixels, ${failures.length} mismatches`);
if (failures.length) process.exitCode = 1;
