import assert from 'node:assert/strict';
import test from 'node:test';
import { clampEditorScrollAfterDelete } from '../app/lib/editor-delete-scroll.ts';

test('deleting bottom media clamps against the new editor even while the root retains its old height', () => {
  const moves = [];
  globalThis.window = { scrollY: 1752, scrollX: 0, innerHeight: 852, scrollTo: value => moves.push(value) };
  globalThis.document = { documentElement: { scrollHeight: 2604 } };
  clampEditorScrollAfterDelete({ getBoundingClientRect: () => ({ bottom: 2113 - window.scrollY }) });
  assert.deepEqual(moves, [{ top: 1261, left: 0, behavior: 'instant' }]);
});

test('deleting the final block returns to zero while an in-range deletion keeps the reading position', () => {
  const moves = [];
  globalThis.window = { scrollY: 800, scrollX: 0, innerHeight: 852, scrollTo: value => moves.push(value) };
  clampEditorScrollAfterDelete({ getBoundingClientRect: () => ({ bottom: 852 - window.scrollY }) });
  assert.equal(moves[0].top, 0);
  moves.length = 0;
  window.scrollY = 300;
  clampEditorScrollAfterDelete({ getBoundingClientRect: () => ({ bottom: 2113 - window.scrollY }) });
  clampEditorScrollAfterDelete(null);
  assert.deepEqual(moves, []);
});
