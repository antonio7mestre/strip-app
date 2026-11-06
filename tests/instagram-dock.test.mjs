import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { installInstagramDockViewport } from '../app/lib/instagram-dock.ts';
import { installKeyboardDockPosition } from '../app/lib/keyboard-dock.ts';
import { installPublishKeyboardDock } from '../app/lib/publish-keyboard-dock.ts';

function surface(instagram = true) {
  const events = new Map(), properties = new Map();
  let safeBottom = 34, probes = 0;
  globalThis.window = { innerHeight: 800, innerWidth: 390,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name) };
  globalThis.document = {
    createElement: () => ({ style: {}, getBoundingClientRect: () => ({ height: safeBottom }), remove: () => probes-- }),
    documentElement: { dataset: { inAppBrowser: instagram ? 'instagram' : undefined },
      appendChild: () => probes++, style: {
        getPropertyValue: name => properties.get(name) || '',
        setProperty: (name, value) => properties.set(name, value),
        removeProperty: name => properties.delete(name),
      } },
  };
  return { properties, events, get probes() { return probes; },
    resize(height, safe, width = 390) {
      window.innerHeight = height; window.innerWidth = width; safeBottom = safe; events.get('resize')?.();
    } };
}

test('Instagram keeps viewport and inset fixed through chrome and keyboard changes', () => {
  const s = surface(), cleanup = installInstagramDockViewport();
  const anchor = () => [...s.properties.values()];
  assert.deepEqual(anchor(), ['800px', '34px']);
  for (const [height, inset] of [[860, 0], [740, 21], [430, 0], [800, 34]]) {
    s.resize(height, inset); assert.deepEqual(anchor(), ['800px', '34px']);
  }
  assert.equal(s.events.has('scroll'), false);
  assert.equal(s.probes, 0);
  s.resize(780, 0, 391); assert.deepEqual(anchor(), ['800px', '34px'], 'minor WebView width jitter is not rotation');
  s.resize(390, 21, 800); assert.deepEqual(anchor(), ['390px', '21px']);
  cleanup(); assert.equal(s.events.size + s.properties.size, 0);
});

test('cleanup restores previous values and Safari never gets an Instagram anchor', () => {
  const s = surface(); s.properties.set('--instagram-dock-viewport-height', '700px');
  const cleanup = installInstagramDockViewport(); cleanup();
  assert.deepEqual([...s.properties.values()], ['700px']);
  const safari = surface(false);
  assert.equal(installInstagramDockViewport(), undefined);
  assert.equal(safari.properties.size + safari.events.size + safari.probes, 0);
});

test('flow navigation retains the anchor, compact trays share height, motion copies keep captured geometry', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(page, /useLayoutEffect\(installInstagramDockViewport, \[\]\)/);
  assert.match(css, /html\[data-in-app-browser="instagram"\] \.composer-dock \{\s*--dock-visible-height: 80px;/);
  assert.match(css, /:not\(\.preview-motion-dock\):not\(\.strip-entrance-dock\):not\(\.story-share-document-dock\):not\(\.auth-dock-frozen\)/);
});


test('Instagram never installs Safari pan listeners or title dock mutations', () => {
  const s = surface();
  window.visualViewport = { addEventListener() { assert.fail('Instagram must not subscribe to Safari viewport movement'); } };
  const classes = new Set();
  document.documentElement.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  assert.equal(installKeyboardDockPosition(), undefined);
  const dock = { style: { setProperty() { assert.fail('Safari pinning must not change the Instagram pill'); } } };
  const cleanup = installPublishKeyboardDock(dock, {});
  assert.equal(s.events.size, 0);
  assert.equal(s.properties.size, 0);
  assert.equal(classes.has('publish-title-active'), true);
  cleanup(); assert.equal(classes.size, 0);
});

test('the Instagram container consumes its captured height instead of a resizing percentage', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const layer = css.match(/html\[data-in-app-browser="instagram"\] \.dock-viewport \{([^}]+)\}/)[1];
  assert.match(layer, /height: var\(--instagram-dock-viewport-height, 100svh\)/);
  assert.doesNotMatch(layer, /height: 100%|100dvh|100lvh/);
  assert.match(css, /:where\(html:not\(\[data-in-app-browser="instagram"\]\)\) \.composer-dock \{[^}]*--dock-browser-extension: max/);
});
