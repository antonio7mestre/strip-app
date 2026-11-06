import assert from 'node:assert/strict';
import test from 'node:test';
import { pageScrollTop, pageScrollHeight, pageViewportHeight, scrollPageTo, scrollPageBy } from '../app/lib/editor-scroll.ts';

test('Instagram content scrolling never moves the root document', () => {
  const rootMoves = [], contentMoves = [];
  const content = { scrollTop: 420, scrollHeight: 2400, clientHeight: 720,
    scrollTo: value => contentMoves.push(['to', value]), scrollBy: value => contentMoves.push(['by', value]) };
  globalThis.document = { documentElement: { dataset: { inAppBrowser: 'instagram' }, scrollHeight: 720 }, querySelector: () => content };
  globalThis.window = { scrollY: 0, innerHeight: 720,
    scrollTo: value => rootMoves.push(value), scrollBy: value => rootMoves.push(value) };
  assert.equal(pageScrollTop(), 420);
  assert.equal(pageScrollHeight(), 2400);
  assert.equal(pageViewportHeight(), 720);
  scrollPageTo({ top: 300, behavior: 'instant' });
  scrollPageBy({ top: 80, behavior: 'smooth' });
  assert.deepEqual(rootMoves, []);
  assert.deepEqual(contentMoves, [['to', { top: 300, behavior: 'instant' }], ['by', { top: 80, behavior: 'smooth' }]]);
});

test('Safari and Instagram routes without the editor keep native document scrolling', () => {
  for (const instagram of [false, true]) {
    const moves = [];
    globalThis.document = { documentElement: { dataset: instagram ? { inAppBrowser: 'instagram' } : {}, scrollHeight: 2400 }, querySelector: () => null };
    globalThis.window = { scrollY: 300, innerHeight: 720, scrollTo: value => moves.push(value) };
    assert.equal(pageScrollTop(), 300);
    assert.equal(pageScrollHeight(), 2400);
    scrollPageTo({ top: 0, behavior: 'instant' });
    assert.deepEqual(moves, [{ top: 0, behavior: 'instant' }]);
  }
});
