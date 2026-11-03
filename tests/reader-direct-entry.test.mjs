import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('app/page.tsx');
const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(name, node = tree) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) return node;
  return ts.forEachChild(node, child => find(name, child));
}
const evaluate = (name, values) => runInNewContext(find(name).initializer.getText(tree), values);

test('leading textures use the photo safe-area path in edit, preview and published, plain text keeps its color', () => {
  for (const view of ['edit', 'preview', 'published']) {
    for (const textured of [true, false]) {
      const leadingTexture = textured ? { src: '/textures/v1/01-blonde-plywood.webp' } : undefined;
      const usesNativeMediaTop = evaluate('usesNativeMediaTop', { hasLeadingImage: false, leadingTexture, view });
      assert.equal(usesNativeMediaTop, textured);
      const values = { needsAuthOnboarding: false, needsAuthUsername: false, authenticationRequired: false,
        view, editorEntrance: { phase: undefined }, firstVisibleBlock: { type: 'text', backgroundColor: '#304dff' },
        leadingTexture, usesNativeMediaTop, leadingMediaColor: '#e8b785', DEFAULT_BACKGROUND: '#000000' };
      assert.equal(evaluate('topSafeAreaColor', values), textured ? '#e8b785' : '#304dff');
      if (view === 'edit') assert.equal(evaluate('topSafeAreaColor', { ...values, editorEntrance: { phase: 'loading' } }), '#000000');
    }
  }
});

test('direct entries need the visible assets and their edge color, not a cover download', () => {
  for (const content of [false, true]) for (const color of [false, true]) {
    const publishedAssetsReady = evaluate('publishedAssetsReady', {
      publishedContentReady: content, directPublishedEntry: true, publishedCoverReady: false,
    });
    assert.equal(evaluate('publishedContentCanReveal', { publishedAssetsReady,
      directPublishedEntry: true, publishedEdgeReady: color }), content && color);
    assert.equal(evaluate('publishedLoaderIsVisible', { directPublishedEntry: true,
      publishedStripLoadKey: 'strip-1234', publishedContentCanReveal: content && color,
      publishedLoaderDismissedKey: null }), false);
  }
});

test('profile card transitions retain their existing cover readiness and entrance', () => {
  assert.equal(evaluate('directPublishedEntry', { initialPublishedId: 'strip-1234',
    publishedStripLoadKey: 'strip-1234', openingCover: {} }), false);
  assert.equal(evaluate('publishedAssetsReady', { publishedContentReady: true,
    directPublishedEntry: false, publishedCoverReady: false }), false);
  assert.equal(evaluate('publishedLoaderIsVisible', { directPublishedEntry: false,
    publishedStripLoadKey: 'strip-1234', publishedContentCanReveal: true,
    publishedLoaderDismissedKey: null }), true);
});

test('text and failed media settle, but an undecoded image or video cannot reveal its fallback color', () => {
  for (const media of [true, false]) for (const ready of [true, false]) for (const error of [true, false]) {
    assert.equal(evaluate('publishedEdgeReady', { usesNativeMediaTop: media,
      leadingMediaAppearance: { ready }, firstVisibleBlock: { id: 'first' },
      mediaLoadStatus: error ? { first: 'error' } : {} }), !media || ready || error);
  }
});

test('initial hold is released on success or a failed route, and never returns during scrolling', () => {
  const values = { initialPublishedId: 'strip-1234', initialReaderReleased: false,
    initialRouteReady: false, view: 'library', publishedContentCanReveal: false };
  assert.equal(evaluate('initialReaderPending', values), true);
  assert.equal(evaluate('initialReaderPending', { ...values, initialRouteReady: true }), false);
  assert.equal(evaluate('initialReaderPending', { ...values, initialRouteReady: true, view: 'published' }), true);
  assert.equal(evaluate('initialReaderPending', { ...values, initialReaderReleased: true }), false);
});

test('server and client coordinate one ready-pixel reveal under a fading cover', () => {
  const layout = read('app/layout.tsx'), css = read('app/globals.css');
  assert.match(layout, /data-reader-entry-pending=\{initialReader \? "" : undefined\}/);
  assert.match(layout, /initialReader \? \{ backgroundColor: readerEntryColor \}/);
  assert.match(layout, /initialReader && instagramBrowser \? "#FFFFFF" : "#000000"/);
  assert.match(layout, /name=\{profileChrome\?\.showTools \|\| initialLanding \? undefined : "theme-color"\} content=\{background \?\? readerEntryColor\}/);
  const start = page.indexOf('if (!initialPublishedId || initialReaderReleased || initialReaderPending) return;');
  const commit = page.slice(page.lastIndexOf('useLayoutEffect', start), page.indexOf('setInitialReaderReleased(true)', start));
  assert.match(commit, /setAttribute\("content", topSafeAreaColor\)/);
  assert.match(commit, /removeAttribute\("data-reader-entry-pending"\)/);
  assert.doesNotMatch(commit, /requestAnimationFrame|setTimeout|transition/);
  assert.doesNotMatch(css, /html\[data-reader-entry-pending\] \.published-strip-load-gate[^{]*\{[^}]*visibility: hidden/);
  assert.match(layout, /initialReader \? <ReaderEntryCover \/>/);
  assert.match(read('app/components/ReaderEntryCover.tsx'), /className="reader-entry-cover"/);
  assert.match(css, /\.reader-entry-cover \{[^}]*animation: reader-entry-reveal 420ms/);
  assert.match(css, /html\[data-reader-entry-pending\] \.reader-entry-cover \{\s*animation: none;\s*opacity: 1/);
  assert.match(css, /@keyframes reader-entry-reveal \{\s*from \{ opacity: 1; visibility: visible; \}\s*to \{ opacity: 0; visibility: hidden; \}/);
  for (const variable of ['top', 'reader', 'bottom']) {
    assert.ok(css.includes(`--${variable}-safe-area-color: #000000 !important`));
  }
  assert.match(css, /html\[data-reader-entry-pending\] body \{[^}]*background: #000000 !important/);
  assert.match(css, /html\[data-in-app-browser="instagram"\]:not\(\[data-auth-canvas\]\):not\(\[data-reader-entry-pending\]\):has\(\.is-strip-reader\)/,
    'Instagram retains its existing post-reveal backing');
});

test('Instagram alone starts white with black loading text and spinner, without changing reveal timing', () => {
  const css = read('app/globals.css');
  const scope = 'html[data-in-app-browser="instagram"][data-reader-entry-pending]';
  const rule = selector => css.slice(css.indexOf(selector + ' {') + selector.length + 2).split('}')[0];
  for (const variable of ['top', 'reader', 'bottom']) {
    assert.ok(rule(scope + ' body').includes(`--${variable}-safe-area-color: #ffffff !important`));
  }
  assert.match(rule(scope + ' body'), /background: #ffffff !important/);
  assert.match(rule(scope + ' .published-mode'), /background: #ffffff/);
  assert.match(rule(scope + ' .reader-entry-wait'), /color: #000000/);
  assert.match(rule(scope + ' .reader-entry-wait-spinner'), /border-top-color: #000000/);
  assert.doesNotMatch(rule(scope + ' .reader-entry-wait'), /animation|transition|display/);
});

test('photo, video and texture sampling expose readiness only with usable pixels, including unreadable foreign images', async () => {
  const code = ts.transpileModule(read('app/components/useLeadingMediaColor.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const kind of ['image', 'video', 'texture', 'foreign']) {
    let state = { key: '', color: '#000000' }, effect, decode;
    const decoded = new Promise(resolve => { decode = resolve; });
    class Image { complete = true; naturalWidth = 200; decode() { return decoded; } }
    const media = kind === 'video' ? { readyState: 0 } : new Image();
    const listeners = new Map();
    media.addEventListener = (name, fn) => listeners.set(name, fn);
    media.removeEventListener = name => listeners.delete(name);
    const exports = {};
    runInNewContext(code, { exports, HTMLImageElement: Image,
      document: { querySelectorAll: () => [{ dataset: { blockId: 'first' }, querySelector: selector => {
        if (kind === 'texture') assert.match(selector, /\.block-crop-viewport > \.text-block-texture/);
        return media;
      } }] },
      ResizeObserver: class { observe() {} disconnect() {} },
      require: name => name === 'react' ? {
        useState: () => [state, change => { state = change(state); }],
        useLayoutEffect: fn => { effect ??= fn(); },
      } : { sampleLeadingMediaColor: () => kind === 'foreign' || (kind === 'video' && media.readyState < 2) ? null : '#aabbcc' },
    });
    const render = () => exports.useLeadingMediaAppearance(true, { id: 'first', src: '/media' }, 'published');
    assert.equal(render().ready, false);
    if (kind === 'video') { media.readyState = 2; listeners.get('loadeddata')(); }
    else { decode(); await decoded; await Promise.resolve(); }
    assert.equal(render().ready, true);
    assert.equal(render().color, kind === 'foreign' ? '#000000' : '#aabbcc');
    effect();
  }
});

test('slow direct entries show a small delayed status without waiting for hydration or covering content', () => {
  const layout = read('app/layout.tsx'), cover = read('app/components/ReaderEntryCover.tsx'), css = read('app/globals.css');
  assert.match(layout, /initialReader \? <ReaderEntryCover \/>/);
  assert.match(cover, /className="reader-entry-wait" role="status" aria-live="polite"/);
  assert.match(cover, /className="reader-entry-wait-spinner" aria-hidden="true"/);
  assert.match(cover, /<span>sry loading<\/span>/);
  assert.match(css, /\.reader-entry-wait \{\s*display: none;/);
  const rule = css.match(/html\[data-reader-entry-pending\] \.reader-entry-wait \{([^}]+)\}/)[1];
  assert.match(rule, /visibility: hidden/);
  assert.match(rule, /opacity: 0/);
  assert.match(rule, /font-size: 10px/);
  assert.match(rule, /pointer-events: none/);
  assert.match(rule, /animation: reader-entry-wait-in 220ms ease-out 2s forwards/);
  assert.doesNotMatch(rule, /background/);
  assert.match(css, /@keyframes reader-entry-wait-in \{\s*from \{ visibility: visible; opacity: 0; \}\s*to \{ visibility: visible; opacity: 1; \}/);
});
