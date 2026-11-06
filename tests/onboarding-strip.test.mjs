import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const exports = {};
const source = readFileSync(new URL('../app/lib/onboarding-strip.ts', import.meta.url), 'utf8');
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports,
  require: name => name === './sticker-colors' ? { STICKER_COLORS: {} }
    : { initialPackStickerWidth: width => width },
});
const { buildFirstStrip } = exports;
const photo = { id: 'photo', type: 'image', src: 'photo.jpg', alt: 'Photo', width: 400, height: 600 };
const video = { ...photo, id: 'video', type: 'video', src: 'video.mp4' };
const sticker = { id: 'camera', src: 'camera.webp', name: 'Camera', width: 100, height: 100 };
const input = { id: 'draft', createdAt: 1, media: [photo, video], stickers: [sticker],
  message: '  A good day  ', seed: 1, width: 400, textHeight: 120 };

test('onboarding text is first for every seed, preserving media order and sticker seams', () => {
  for (const seed of [1, 7, 42, 111, 4294967295]) {
    const blocks = buildFirstStrip({ ...input, seed }, '#CB8DFF', '#000000');
    assert.deepEqual(Array.from(blocks, block => block.type), ['text', 'image', 'video', 'sticker']);
    assert.equal(blocks[0].content, 'A good day');
    assert.equal(blocks[0].backgroundColor, '#CB8DFF');
    assert.equal(blocks[1].id, 'photo');
    assert.equal(blocks[2].id, 'video');
    assert.equal(blocks[2].audioEnabled, true);
    assert.equal(blocks[3].y, 720, 'sticker stays at the media boundary after the opening text');
  }
});

test('skipping words adds no empty text block', () => {
  const blocks = buildFirstStrip({ ...input, message: '  ' }, '#000000', '#ffffff');
  assert.deepEqual(Array.from(blocks, block => block.type), ['image', 'video', 'sticker']);
  assert.equal(blocks[2].y, 600);
});

test('one-photo stickers stay on the photo below the opening text', () => {
  const blocks = buildFirstStrip({ ...input, media: [photo] }, '#000000', '#ffffff');
  assert.equal(blocks[2].y, 570);
});
