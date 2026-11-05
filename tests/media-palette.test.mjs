import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sampleMediaColor } from '../app/lib/media-palette.ts';
import { STICKER_PACK } from '../app/lib/sticker-pack.ts';
import { STICKER_COLORS } from '../app/lib/sticker-colors.ts';
const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/onboarding-strip.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require: name => name === './sticker-colors' ? { STICKER_COLORS } : {} });
const { colorMatchedStickers } = exports;
test('tiny palette ignores transparent pixels and uses the most common color bucket', () => {
  assert.deepEqual(sampleMediaColor([255,0,0,0, 0,0,240,255, 0,0,242,255, 255,0,0,255]), [0,0,241]);
});
test('matching preserves every sticker once, is stable, and adapts to the media palette', () => {
  const blue = colorMatchedStickers(STICKER_PACK, 123, [[0,0,255]]);
  const red = colorMatchedStickers(STICKER_PACK, 123, [[255,0,0]]);
  assert.equal(new Set(blue.map(item => item.id)).size, STICKER_PACK.length);
  assert.deepEqual(blue, colorMatchedStickers(STICKER_PACK, 123, [[0,0,255]]));
  assert.notEqual(blue[0].id, red[0].id);
  assert.ok(STICKER_PACK.every(item => STICKER_COLORS[item.id]));
});
test('palette matching timing, with no I/O', t => {
  for (let i=0;i<50;i++) colorMatchedStickers(STICKER_PACK, i, [[180,70,30],[30,80,120]]);
  const start = performance.now();
  for (let i=0;i<1000;i++) colorMatchedStickers(STICKER_PACK, i, [[180,70,30],[30,80,120]]);
  t.diagnostic(`Average: ${((performance.now()-start)/1000).toFixed(3)} ms for ${STICKER_PACK.length} stickers`);
});
