import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = tree) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => find(predicate, child));
}
const open = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "openPublishedStrip");
const reset = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "resetTransientNavigationState");
const routeEffect = find(n => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect"
  && n.arguments[0]?.getText(tree).includes("const applyRoute ="));
const compiled = ts.transpileModule(
  `export const ${open.getText(tree)};\nexport const ${reset.getText(tree)};\nexport const installRoutes = ${routeEffect.arguments[0].getText(tree)};`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function harness() {
  const events = [], requests = [], notices = [], exports = {}, listeners = {};
  const gate = { current: false }, opening = { current: null };
  const state = { view: "library", cover: null, strip: null, path: "/", initialReady: false };
  const timers = [];
  let backs = 0;
  const noop = () => {};
  const window = {
    location: { pathname: "/", hostname: "localhost" },
    history: { back: () => { backs++; } },
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimeout: noop, scrollTo: noop,
    addEventListener: (type, callback) => { listeners[type] = callback; },
    removeEventListener: noop,
  };
  const route = path => path.startsWith("/strip/")
    ? { kind: "published", id: path.slice(7) } : { kind: "library" };
  const context = {
    exports, AbortController, window,
    document: { querySelector: () => null, documentElement: { classList: { remove: noop }, style: { removeProperty: noop } } },
    libraryOwnerId: "owner", authStatus: "signed-in", openingStripId: null,
    pageTransitionInFlightRef: gate, openingCoverRequestRef: opening,
    initialRouteHandledRef: { current: false },
    inlinePreviewHistoryEntryRef: { current: false },
    inlinePreviewBasePathRef: { current: null }, inlinePreviewExitLockRef: { current: null },
    captureCoverDock: () => null,
    flushSync: fn => fn(),
    setBrowserPath: path => {
      events.push({ type: "push", cover: state.cover, view: state.view });
      window.location.pathname = state.path = path;
    },
    setOpeningCover: value => { state.cover = value; events.push({ type: "cover", value }); },
    setOpenedPublishedStrip: value => { state.strip = value; },
    setView: value => { state.view = value; },
    setOpeningStripId: noop, setPublishedCoverSettledKey: noop,
    setPublishedLoaderDismissedKey: noop, setMediaLoadStatus: noop, setViewedStrips: noop,
    setAuthenticationRequired: noop, setInitialRouteReady: value => { state.initialReady = value; },
    setNotice: value => notices.push(value), routeFromLocation: route,
    cancelDockTransitionSchedule: noop, setOpeningDraftId: noop,
    setLegacyPageTransition: noop, setOpeningPublishedEditor: noop,
    setDockTransition: noop, setDockTransitionStarted: noop,
    COVER_MOVE_MS: 620, PUBLISHED_MEDIA_LOAD_TIMEOUT_MS: 18000,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  };
  runInNewContext(compiled, context);
  return {
    ...exports, state, gate, opening, events, requests, notices,
    get backs() { return backs; },
    moveComplete() { for (const timer of timers.splice(0)) if (timer.ms === 660) timer.callback(); },
    pop(path) { window.location.pathname = state.path = path; listeners.popstate({ state: null }); },
  };
}
const button = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 10, width: 100, height: 120 }) }) };
const strip = { id: "strip-12345" };
const success = { ok: true, json: async () => ({ strip }) };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("save clean home in history before showing the cover, with just one strip entry", async () => {
  const h = harness();
  const request = h.openPublishedStrip(strip, button);
  assert.deepEqual(h.events[0], { type: "push", cover: null, view: "library" });
  assert.equal(h.state.path, "/strip/strip-12345");
  assert.equal(h.state.cover.strip.id, strip.id);
  h.requests[0].resolve(success); h.moveComplete(); await request;
  assert.equal(h.events.filter(e => e.type === "push").length, 1);
  assert.equal(h.state.view, "published");
});

test("Back cancels an opening cover and ignores its late response", async () => {
  const h = harness(); h.installRoutes();
  const request = h.openPublishedStrip(strip, button);
  const signal = h.requests[0].options.signal;
  h.pop("/");
  assert.equal(signal.aborted, true);
  assert.equal(h.state.cover, null);
  h.requests[0].resolve(success); h.moveComplete(); await request;
  assert.equal(h.state.view, "library"); assert.equal(h.state.strip, null);
  assert.equal(h.events.filter(e => e.type === "push").length, 1);
});

test("failed opening consumes its reserved history entry and blocks retry until Back settles", async () => {
  const h = harness(); h.installRoutes();
  const request = h.openPublishedStrip(strip, button);
  h.requests[0].reject(new Error("Offline")); await request;
  assert.equal(h.state.cover, null); assert.equal(h.backs, 1);
  assert.equal(h.gate.current, true); assert.equal(h.notices.length, 1);
  await h.openPublishedStrip(strip, button);
  assert.equal(h.requests.length, 1);
  h.pop("/");
  assert.equal(h.gate.current, false);
  const retry = h.openPublishedStrip(strip, button);
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(success); h.moveComplete(); await retry;
  assert.equal(h.state.view, "published");
});

test("a delayed Forward request cannot restore its poster after Back to home", async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.installRoutes();
    h.pop("/strip/strip-12345");
    assert.equal(h.requests.length, 1);
    h.pop("/");
    if (fail) h.requests[0].reject(new Error("Offline"));
    else h.requests[0].resolve(success);
    await settle();
    assert.equal(h.state.view, "library");
    assert.equal(h.state.strip, null); assert.equal(h.state.cover, null);
    assert.equal(h.state.path, "/"); assert.deepEqual(h.notices, []);
    assert.equal(h.events.length, 2, "only navigation cleanup clears the cover; no stale history write");
  }
});

test("only the newest route response can mount a strip after rapid navigation", async () => {
  const h = harness(); h.installRoutes();
  h.pop("/strip/strip-12345"); h.pop("/"); h.pop("/strip/strip-67890");
  h.requests[1].resolve({ ok: true, json: async () => ({ strip: { id: "strip-67890" } }) });
  await settle();
  h.requests[0].resolve(success); await settle();
  assert.equal(h.state.view, "published"); assert.equal(h.state.strip.id, "strip-67890");
});
