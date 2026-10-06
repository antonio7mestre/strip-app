import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { HapticActionButton } from "./helpers/haptic-action.mjs";

const require = createRequire(import.meta.url);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = tree) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => find(predicate, child));
}
const handler = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "editPublishedStripFromReader");
const reset = find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === "resetTransientNavigationState");
const actions = find(n => ts.isFunctionDeclaration(n) && n.name?.text === "StripEndActions");
const compiled = ts.transpileModule(`export const ${handler.getText(tree)};\nexport const ${reset.getText(tree)};\nexport ${actions.getText(tree)}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness({ owner = true, signedIn = true, origin = "https://antonio.striiip.com" } = {}) {
  const events = [], requests = [], notices = [], navigations = [], paths = [], views = [], exports = {};
  const gate = { current: false };
  const request = { current: null }, state = {};
  const setters = Object.fromEntries([
    "OpeningPublishedEditor", "CurrentDraftId", "CurrentDraftCreatedAt", "EditingPublishedStripId",
    "Blocks", "EndingStyle", "StripTitle", "SelectedBlockId", "EditingTextBlockId", "ActiveTextTool",
    "HeightCropSession", "StickerPickerOpen", "SelectedCover", "ActiveCoverKey", "CustomCoverSrc",
    "CustomCoverColors", "CoverColorShape", "OpenedPublishedStrip",
  ].map(key => [`set${key}`, value => { state[key] = value; events.push(`set:${key}`); }]));
  const icon = () => createElement("svg", { "aria-hidden": true });
  runInNewContext(compiled, {
    require, exports, AbortController, Pencil: icon, HapticActionButton, ...setters,
    authStatus: signedIn ? "signed-in" : "signed-out",
    authUser: { username: "antonio" },
    openedPublishedStrip: { id: "published-123", viewerIsOwner: owner, title: "Published title",
      blocks: [{ id: "published-image", type: "image", src: "/api/strips/published-123/media/published-image" }], endingStyle: "white" },
    DEFAULT_STRIP_ENDING_STYLE: "white",
    pageTransitionInFlightRef: gate,
    publishedEditorRequestRef: request,
    mediaImportRequestRef: { current: null },
    storyShareAttemptRef: { current: 0 }, storyShareInFlightRef: { current: false }, setStoryShareSheetOpen() {}, setStoryShareConfirmation() {},
    openingCoverRequestRef: { current: null }, setOpeningCover() {},
    flushSync: callback => { callback(); events.push("paint-committed"); },
    showEditorDockEntry: () => events.push("editor-dock-entry"),
    setViewInstantly: (...args) => { views.push(args); events.push(`view:${args[0]}`); },
    setBrowserPath: path => paths.push(path),
    fetch: (url, options) => {
      events.push("request");
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
    accountAppOrigin: (_location, username) => `https://${username}.striiip.com`,
    window: { scrollY: 650, location: { origin, assign: url => navigations.push(url) } },
    setNotice: message => notices.push(message),
    document: { documentElement: { classList: { remove() {} }, style: { removeProperty() {} } } },
    cancelDockTransitionSchedule() {}, setOpeningStripId() {}, setOpeningDraftId() {},
    setLegacyPageTransition() {}, setDockTransition() {}, setDockTransitionStarted() {},
  });
  return { ...exports, events, requests, notices, navigations, paths, views, gate, request, state,
    get pending() { return state.OpeningPublishedEditor; } };
}
const success = { ok: true, json: async () => ({ draft: { id: "published-123" } }) };
const draft = { id: "published-123", createdAt: 42, publishedStripId: "published-123",
  title: "Unsaved draft title", endingStyle: "white", blocks: [{ id: "draft-text", type: "text", content: "Keep my unsaved changes" }] };
const draftSuccess = { ok: true, json: async () => ({ draft }) };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function finish(h, opening) {
  h.requests[0].resolve(success); await tick();
  h.requests[1].resolve(draftSuccess); await opening;
}

test("published Edit opens the loaded editor before any network response, without reloading", async () => {
  const h = harness();
  const opening = h.editPublishedStripFromReader();
  assert.ok(h.events.indexOf("view:edit") < h.events.indexOf("request"));
  assert.deepEqual(h.views, [["edit", 0, false]]);
  assert.equal(h.pending, true);
  assert.equal(h.state.CurrentDraftId, null, "autosave stays off until the server draft exists");
  assert.equal(h.state.Blocks[0].id, "published-image", "loaded content is present immediately");
  assert.equal(h.gate.current, true);
  assert.equal(h.navigations.length, 0);
  assert.equal(h.paths.length, 0, "the URL stays reload-safe while preparing");
  assert.equal(h.requests[0].url, "/api/strips/published-123/draft");
  assert.equal(h.requests[0].options.method, "POST");
  await h.editPublishedStripFromReader();
  assert.equal(h.requests.length, 1, "repeated taps cannot create duplicate requests");
  await finish(h, opening);
  assert.equal(h.requests[1].url, "/api/drafts/published-123");
  assert.equal(h.requests[1].options.cache, "no-store");
  assert.deepEqual(h.paths, ["/edit/published-123"]);
  assert.deepEqual(h.navigations, [], "no new document, loader, or second editor entry");
  assert.equal(h.pending, false); assert.equal(h.gate.current, false);
  assert.equal(h.state.CurrentDraftId, draft.id);
  assert.equal(h.state.CurrentDraftCreatedAt, draft.createdAt);
  assert.equal(h.state.EditingPublishedStripId, draft.id);
  assert.equal(h.state.StripTitle, draft.title);
  assert.deepEqual(h.state.Blocks, draft.blocks, "existing unsaved draft content is preserved");
  assert.equal(h.state.OpenedPublishedStrip, null);
  assert.equal(h.views.length, 1, "draft readiness does not reset scroll again");
});

test("failed preparation returns to the reader at its original position and permits retry", async () => {
  for (const failure of ["network", "response", "json", "draft-response", "draft-json"]) {
    const h = harness();
    const opening = h.editPublishedStripFromReader();
    if (failure === "network") h.requests[0].reject(new Error("Offline"));
    else if (failure.startsWith("draft")) {
      h.requests[0].resolve(success); await tick();
      h.requests[1].resolve({ ok: failure !== "draft-response", json: async () => { throw new Error("Invalid response"); } });
    } else h.requests[0].resolve({ ok: failure !== "response", json: async () => { throw new Error("Invalid response"); } });
    await opening;
    assert.equal(h.pending, false); assert.equal(h.gate.current, false);
    assert.equal(h.notices.length, 1); assert.equal(h.navigations.length, 0);
    assert.deepEqual(h.views.at(-1), ["published", 650, false]);
    assert.equal(h.state.CurrentDraftId, null); assert.equal(h.paths.length, 0);
    const count = h.requests.length;
    const retry = h.editPublishedStripFromReader();
    assert.equal(h.requests.length, count + 1); assert.equal(h.pending, true);
    h.requests[count].resolve(success); await tick();
    h.requests[count + 1].resolve(draftSuccess); await retry;
    assert.equal(h.paths.length, 1);
  }
});

test("visitors and signed-out readers cannot start an owner edit", async () => {
  for (const options of [{ owner: false }, { signedIn: false }]) {
    const h = harness(options); await h.editPublishedStripFromReader();
    assert.deepEqual(h.events, []); assert.equal(h.pending, undefined);
  }
});

test("browser Back cancels preparation and prevents stale responses from reopening the editor", async () => {
  const h = harness(); const opening = h.editPublishedStripFromReader();
  h.resetTransientNavigationState();
  assert.equal(h.pending, false); assert.equal(h.gate.current, false);
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(success); await opening;
  assert.equal(h.requests.length, 1); assert.equal(h.paths.length, 0);
  assert.equal(h.state.CurrentDraftId, null); assert.equal(h.notices.length, 0);
  assert.match(page, /if \(event.persisted\) resetTransientNavigationState\(\)/);
});

test("an older host forwards to the owner's canonical workspace once its draft is ready", async () => {
  const h = harness({ origin: "https://striiip.com" });
  const opening = h.editPublishedStripFromReader();
  assert.equal(h.views[0][0], "edit");
  await finish(h, opening);
  assert.deepEqual(h.navigations, ["https://antonio.striiip.com/edit/published-123"]);
  assert.equal(h.paths.length, 0);
});

test("Edit keeps the original two-button footer without an opening message", () => {
  const h = harness();
  const props = { primaryAction: "edit", primaryLabel: "Edit Strip", onPrimary() {}, onShare() {} };
  const idle = h.StripEndActions(props);
  assert.equal(idle.props.children.length, 2);
  assert.match(renderToStaticMarkup(idle), /Edit Strip/);
  assert.doesNotMatch(renderToStaticMarkup(idle), /disabled|aria-busy|strip-end-sheet-spinner/);
  assert.doesNotMatch(page, /Opening editor|primaryPending/);
  assert.match(page, /<main\s+inert=\{openingPublishedEditor\}\s+aria-busy=\{openingPublishedEditor \|\| undefined\}\s+className=\{`app-shell editor-mode/);
});
