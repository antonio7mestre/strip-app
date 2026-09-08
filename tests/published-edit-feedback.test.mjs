import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
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
function harness({ owner = true, signedIn = true } = {}) {
  const events = [], requests = [], notices = [], navigations = [], exports = {};
  const gate = { current: false };
  let pending = false;
  const icon = () => createElement("svg", { "aria-hidden": true });
  runInNewContext(compiled, {
    require, exports, Pencil: icon, Plus: icon, Send: icon,
    authStatus: signedIn ? "signed-in" : "signed-out",
    openedPublishedStrip: { id: "published-123", viewerIsOwner: owner },
    pageTransitionInFlightRef: gate,
    setOpeningPublishedEditor: value => { pending = value; events.push(`pending:${value}`); },
    flushSync: callback => { callback(); events.push("paint-committed"); },
    fetch: (url, options) => {
      events.push("request");
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
    mainAppOrigin: () => "https://striiip.com",
    window: { location: { assign: url => navigations.push(url) } },
    setNotice: message => notices.push(message),
    document: { documentElement: { classList: { remove() {} }, style: { removeProperty() {} } } },
    cancelDockTransitionSchedule() {}, setOpeningStripId() {}, setOpeningDraftId() {},
    setLegacyPageTransition() {}, setDockTransition() {}, setDockTransitionStarted() {},
  });
  return { ...exports, events, requests, notices, navigations, gate, get pending() { return pending; } };
}
const success = { ok: true, json: async () => ({ draft: { id: "published-123" } }) };

test("published Edit commits immediate feedback before waiting for any network response", async () => {
  const h = harness();
  const opening = h.editPublishedStripFromReader();
  assert.deepEqual(h.events, ["pending:true", "paint-committed", "request"]);
  assert.equal(h.pending, true);
  assert.equal(h.gate.current, true);
  assert.equal(h.navigations.length, 0);
  assert.equal(h.requests[0].url, "/api/strips/published-123/draft");
  assert.equal(h.requests[0].options.method, "POST");
  await h.editPublishedStripFromReader();
  assert.equal(h.requests.length, 1, "repeated taps cannot create duplicate requests");
  h.requests[0].resolve(success);
  await opening;
  assert.deepEqual(h.navigations, ["https://striiip.com/edit/published-123"]);
  assert.equal(h.pending, true, "feedback stays visible through document navigation");
});

test("failed opening restores the button, reports an error, and permits retry", async () => {
  for (const failure of ["network", "response", "json"]) {
    const h = harness();
    const opening = h.editPublishedStripFromReader();
    if (failure === "network") h.requests[0].reject(new Error("Offline"));
    else h.requests[0].resolve({ ok: failure !== "response", json: async () => { throw new Error("Invalid response"); } });
    await opening;
    assert.equal(h.pending, false); assert.equal(h.gate.current, false);
    assert.equal(h.notices.length, 1); assert.equal(h.navigations.length, 0);
    const retry = h.editPublishedStripFromReader();
    assert.equal(h.requests.length, 2); assert.equal(h.pending, true);
    h.requests[1].resolve(success); await retry;
    assert.equal(h.navigations.length, 1);
  }
});

test("visitors and signed-out readers cannot start an owner edit", async () => {
  for (const options of [{ owner: false }, { signedIn: false }]) {
    const h = harness(options); await h.editPublishedStripFromReader();
    assert.deepEqual(h.events, []); assert.equal(h.pending, false);
  }
});

test("Safari back-cache restoration clears the pending state and request gate", async () => {
  const h = harness(); const opening = h.editPublishedStripFromReader();
  h.requests[0].resolve(success); await opening;
  h.resetTransientNavigationState();
  assert.equal(h.pending, false); assert.equal(h.gate.current, false);
  assert.match(page, /if \(event.persisted\) resetTransientNavigationState\(\)/);
});

test("pending feedback keeps the same footer structure with disabled accessible buttons", () => {
  const h = harness();
  const props = { primaryAction: "edit", primaryLabel: "Edit this Strip", onPrimary() {}, onShare() {} };
  const idle = h.StripEndActions(props);
  const busy = h.StripEndActions({ ...props, primaryPending: true });
  assert.equal(idle.props.children.length, busy.props.children.length);
  for (const button of busy.props.children) assert.equal(button.props.disabled, true);
  assert.equal(busy.props.children[0].props["aria-busy"], true);
  const html = renderToStaticMarkup(busy);
  assert.match(html, /Opening editor…/); assert.match(html, /strip-end-sheet-spinner/);
  assert.match(html, /aria-live="polite"/);
  assert.match(renderToStaticMarkup(idle), /Edit this Strip/);
  assert.doesNotMatch(renderToStaticMarkup(idle), /disabled|aria-busy|strip-end-sheet-spinner/);
  assert.match(page, /primaryPending=\{publishedViewerCanEdit && openingPublishedEditor\}/);
  assert.match(css, /\.strip-end-sheet-spinner\s*\{[^}]*width: 18px;\s*height: 18px;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.strip-end-sheet-spinner \{ animation: none; \}/);
});
