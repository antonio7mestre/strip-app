import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PUBLIC_DOMAIN, usernameFromHostname } from "../app/lib/username.ts";
import { profileTextColor } from "../app/lib/profile.ts";
import { publishedStripUrl, routeFromLocation, workspaceRedirect } from "./helpers/app-routing.mjs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = tree) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => find(predicate, child));
}
const open = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "openPublishedStrip");
const returnToLibrary = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "returnToLibraryFromPublished");
const publicUrl = find(n => ts.isFunctionDeclaration(n) && n.name?.text === "publicStripUrl");
const reset = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "resetTransientNavigationState");
const routeEffect = find(n => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect"
  && n.arguments[0]?.getText(tree).includes("const applyRoute ="));
const compiled = ts.transpileModule(
  `${publicUrl.getText(tree)}\nexport const ${open.getText(tree)};\nexport const ${returnToLibrary.getText(tree)};\nexport const ${reset.getText(tree)};\nexport const installRoutes = ${routeEffect.arguments[0].getText(tree)};`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function harness(needsAuthUsername = false, options = {}) {
  const events = [], requests = [], notices = [], scrolls = [], navigations = [], exports = {}, listeners = {};
  const gate = { current: false }, opening = { current: null };
  const state = { view: "library", cover: null, strip: null, path: "/", initialReady: false };
  const timers = [];
  let backs = 0;
  const noop = () => {};
  const hostname = options.hostname ?? "localhost";
  const window = {
    location: { pathname: "/", hostname, origin: `https://${hostname}`, search: "", hash: "", assign: url => navigations.push(url), replace: url => navigations.push(url) },
    history: { back: () => { backs++; }, replaceState(_state, _title, path) { window.location.pathname = state.path = path; } },
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimeout: noop, scrollTo: options => scrolls.push(options),
    addEventListener: (type, callback) => { listeners[type] = callback; },
    removeEventListener: noop,
    dispatchEvent: event => listeners[event.type]?.(event),
  };
  const context = {
    exports, AbortController, window, PUBLIC_DOMAIN, URL, publishedStripUrl, workspaceRedirect, profileTextColor,
    PopStateEvent: class { constructor(type) { this.type = type; this.state = null; } },
    migrateLegacyDraft: async () => true,
    document: { querySelector: () => null, documentElement: { classList: { remove: noop }, style: { removeProperty: noop } } },
    libraryOwnerId: "owner", authStatus: options.authStatus ?? "signed-in", authUser: { username: "antonio" }, needsAuthUsername, needsAuthBackground: false, openingStripId: null,
    pageTransitionInFlightRef: gate, openingCoverRequestRef: opening,
    storyShareAttemptRef: { current: 0 }, storyShareInFlightRef: { current: false }, setStoryShareSheetOpen: noop, setStoryShareConfirmation: noop,
    initialRouteHandledRef: { current: false },
    inlinePreviewHistoryEntryRef: { current: false },
    inlinePreviewBasePathRef: { current: null }, inlinePreviewExitLockRef: { current: null },
    captureCoverDock: () => null,
    captureCoverOrigin: cover => ({ ...cover.getBoundingClientRect(), snapshot: "existing pixels" }),
    stripProfile: { profile: { background: "#FF8CCC" } },
    publicProfile: null, visibleProfile: { background: "#FF8CCC", accent: "#330011" },
    usernameFromHostname, setPublicProfile: noop,
    flushSync: fn => fn(),
    setBrowserPath: path => {
      events.push({ type: "push", cover: state.cover, view: state.view });
      window.location.pathname = state.path = path;
    },
    setOpeningCover: value => { state.cover = value; events.push({ type: "cover", value }); },
    setOpenedPublishedStrip: value => { state.strip = value; },
    setView: value => { state.view = value; },
    transitionToViewStandard: async value => { state.view = value; },
    setOpeningStripId: noop, setPublishedCoverSettledKey: noop,
    setPublishedLoaderDismissedKey: noop, setMediaLoadStatus: noop, setViewedStrips: noop,
    setAuthenticationRequired: noop, setInitialRouteReady: value => { state.initialReady = value; },
    setNotice: value => notices.push(value), routeFromLocation,
    cancelDockTransitionSchedule: noop, setOpeningDraftId: noop,
    setLegacyPageTransition: noop, setOpeningPublishedEditor: noop,
    publishedEditorRequestRef: { current: null },
    mediaImportRequestRef: { current: null },
    setDockTransition: noop, setDockTransitionStarted: noop,
    COVER_MOVE_MS: 620, PUBLISHED_MEDIA_LOAD_TIMEOUT_MS: 18000,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  };
  runInNewContext(compiled, context);
  return {
    ...exports, state, gate, opening, events, requests, notices, scrolls, navigations,
    get backs() { return backs; },
    moveComplete() { for (const timer of timers.splice(0)) if (timer.ms === 660) timer.callback(); },
    pop(path) { window.location.pathname = state.path = path; listeners.popstate({ state: null }); },
  };
}
const button = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 10, width: 100, height: 120 }) }) };
const strip = { id: "strip-12345" };
const success = { ok: true, json: async () => ({ strip }) };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("owners open their published Strips on their personal domain and keep a clean profile history entry", async () => {
  for (const hostname of ["striiip.com", "www.striiip.com"]) {
    const h = harness(false, { hostname });
    await h.openPublishedStrip({ ...strip, username: "antonio" }, button);
    assert.deepEqual(h.navigations, ["https://antonio.striiip.com/strip-12345"]);
    assert.equal(h.state.path, "/");
    assert.equal(h.state.cover, null);
    assert.equal(h.requests.length, 0);
    assert.equal(h.events.length, 0, "do not snapshot a hidden cover or reserve an intermediate /strip entry");
    await h.openPublishedStrip({ ...strip, username: "antonio" }, button);
    assert.equal(h.navigations.length, 1, "ignore repeated taps while leaving");
    h.resetTransientNavigationState();
    await h.openPublishedStrip({ ...strip, username: "antonio" }, button);
    assert.equal(h.navigations.length, 2, "the existing pageshow reset unlocks the restored profile");
  }
});

test("own profile clicks, public profile clicks and local previews retain their in-page cover transition", async () => {
  for (const [hostname, username, authStatus, expectedPath] of [
    ["antonio.striiip.com", "antonio", "signed-out", "/strip-12345"],
    ["friend.striiip.com", "friend", "signed-in", "/strip-12345"],
    ["antonio.striiip.com", "antonio", "signed-in", "/strip-12345"],
    ["striiip.com", undefined, "signed-in", "/strip/strip-12345"],
    ["localhost", "antonio", "signed-in", "/strip/strip-12345"],
    ["127.0.0.1", "antonio", "signed-in", "/strip/strip-12345"],
    ["preview.workers.dev", "antonio", "signed-in", "/strip/strip-12345"],
  ]) {
    const h = harness(false, { hostname, authStatus });
    const request = h.openPublishedStrip({ ...strip, username }, button);
    assert.deepEqual(h.navigations, [], hostname);
    assert.equal(h.state.path, expectedPath, hostname);
    assert.ok(h.state.cover);
    h.requests[0].resolve(success); h.moveComplete(); await request;
    assert.equal(h.state.view, "published");
  }
});

test("history opens other authors' Strips on their own domain rather than fetching on the viewer's domain", async () => {
  const h = harness(false, { hostname: "antonio.striiip.com" });
  await h.openPublishedStrip({ ...strip, username: "friend" }, button);
  assert.deepEqual(h.navigations, ["https://friend.striiip.com/strip-12345"]);
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.cover, null);
});

test("returning from your personal Strip restores the owner's workspace in place", async () => {
  const owner = harness(false, { hostname: "antonio.striiip.com" });
  owner.installRoutes();
  await owner.returnToLibraryFromPublished();
  assert.deepEqual(owner.navigations, []);
  assert.equal(owner.state.view, "library");
  assert.equal(owner.state.path, "/");
  assert.equal(owner.gate.current, false);
});

test("username onboarding does not apply a route or reset the focused sign-in canvas", () => {
  const h = harness(true);
  h.installRoutes();
  assert.equal(h.scrolls.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.initialReady, false);
});

test("save clean home in history before showing the cover, with just one strip entry", async () => {
  const h = harness();
  const request = h.openPublishedStrip(strip, button);
  assert.deepEqual(h.events[0], { type: "push", cover: null, view: "library" });
  assert.equal(h.state.path, "/strip/strip-12345");
  assert.equal(h.state.cover.strip.id, strip.id);
  assert.equal(h.state.cover.background, "#FF8CCC");
  assert.equal(h.state.cover.ink, "#330011");
  assert.equal(h.state.cover.origin.snapshot, "existing pixels");
  h.requests[0].resolve(success); h.moveComplete(); await request;
  assert.equal(h.state.cover.background, "#FF8CCC", "keep profile color through the reader handoff");
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
