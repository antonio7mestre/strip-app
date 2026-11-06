import assert from 'node:assert/strict';
import test from 'node:test';
import { installKeyboardDockPosition } from '../app/lib/keyboard-dock.ts';
import { installPublishKeyboardDock } from '../app/lib/publish-keyboard-dock.ts';

test('Instagram never installs Safari pan listeners or title dock mutations', () => {
  const events = new Map(), properties = new Map();
  globalThis.window = { addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {
    dataset: { inAppBrowser: 'instagram' },
    style: { setProperty: (name, value) => properties.set(name, value) },
  } };
  window.visualViewport = { addEventListener() { assert.fail('Instagram must not subscribe to Safari viewport movement'); } };
  const classes = new Set();
  document.documentElement.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  assert.equal(installKeyboardDockPosition(), undefined);
  const dock = { style: { setProperty() { assert.fail('Safari pinning must not change the Instagram pill'); } } };
  const cleanup = installPublishKeyboardDock(dock, {});
  assert.equal(events.size, 0);
  assert.equal(properties.size, 0);
  assert.equal(classes.has('publish-title-active'), true);
  cleanup(); assert.equal(classes.size, 0);
});
