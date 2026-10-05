import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as routing from "./helpers/app-routing.mjs";
import { usernameFromHostname } from "../app/lib/username.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (predicate, node = tree) => predicate(node) ? node : ts.forEachChild(node, child => find(predicate, child));
const functions = ["verifySignInCode", "claimUsername", "finishBackgroundOnboarding", "returnBackgroundToUsername", "signOut", "makeOwnStripFromReader", "migrateLegacyDraft"];
const routeEffect = find(n => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect" && n.arguments[0]?.getText(tree).includes("const applyRoute ="));
const sessionEffect = find(n => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect" && n.arguments[0]?.getText(tree).includes("const refreshSession ="));
const source = functions.map(name => `export const ${find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name).getText(tree)};`).join("\n")
  + `\nexport const installRoutes = ${routeEffect.arguments[0].getText(tree)};\nexport const installSession = ${sessionEffect.arguments[0].getText(tree)};`;
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function harness(url = "https://striiip.com/") {
  const redirects = [], requests = [], cleared = [], listeners = {}, exports = {};
  const location = new URL(url);
  location.assign = location.replace = url => redirects.push(url);
  const context = {
    exports, URL, AbortController, DOMException, console, ...routing, usernameFromHostname,
    window: { location, localStorage: { getItem: () => null, removeItem: key => cleared.push(key) }, scrollTo() {},
      addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener() {} },
    authPending: false, authSendingCode: false, authCode: "000000", AUTH_CODE_LENGTH: 6, authPhone: "+12025550100",
    authUsername: "new-person", authUser: null, authStatus: "signed-out", libraryOwnerId: "", needsAuthUsername: false, needsAuthBackground: false,
    ONBOARDING_BACKGROUND: "#304DFF", authBackground: "#304DFF", authStep: "landing",
    authPhoneInputRef: { current: { blur() {} } },
    rememberBackgroundOnboarding: value => { context.backgroundPending = value; },
    backgroundOnboardingPending: id => context.backgroundPending === id,
    stripProfile: { saveBackground: async () => true },
    visitingProfileHost: false, legacyOwnerIdRef: { current: "" }, initialRouteHandledRef: { current: false },
    legacyDraftBlocksRef: { current: null }, legacyDraftMigrationRef: { current: null },
    STORAGE_KEY: "draft", OWNER_STORAGE_KEY: "owner", DEFAULT_STRIP_ENDING_STYLE: {},
    makeId: () => "draft-12345", prepareStickerUploads: async blocks => blocks,
    readProfileReload: () => null, clearProfileReload: () => cleared.push("profile"),
    flushSync: fn => fn(),
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    setBrowserPath: path => { location.pathname = path; },
  };
  for (const name of new Set(source.match(/\bset[A-Z]\w+/g))) {
    const key = name[3].toLowerCase() + name.slice(4);
    context[name] = value => { context[key] = typeof value === "function" ? value(context[key] ?? []) : value; };
  }
  const setUser = context.setAuthUser;
  context.setAuthUser = user => {
    setUser(user); context.needsAuthUsername = !!user && (!user.username || context.authStep === "username");
    context.needsAuthBackground = !!user?.username && context.authStep === "background";
  };
  const setStep = context.setAuthStep;
  context.setAuthStep = value => {
    setStep(value); context.needsAuthBackground = !!context.authUser?.username && value === "background";
    context.needsAuthUsername = !!context.authUser && (!context.authUser.username || value === "username");
  };
  runInNewContext(compiled, context);
  return { ...exports, context, redirects, requests, cleared, listeners };
}
const event = { preventDefault() {} };
const user = { id: "owner-antonio", username: "antonio" };

test("successful code verification forwards returning users to their personal workspace, including pending editor/share links", async () => {
  for (const path of ["/", "/edit/draft-12345", "/share/strip-12345"]) {
    const h = harness(`https://striiip.com${path}`);
    const verify = h.verifySignInCode(event);
    assert.equal(h.requests[0].url, "/api/auth/verify");
    h.requests[0].resolve(Response.json({ user }));
    await verify;
    assert.equal(h.context.authStatus, "signed-in");
    h.installRoutes(); await settle();
    assert.deepEqual(h.redirects, [`https://antonio.striiip.com${path}`]);
    assert.equal(h.context.initialRouteReady, false);
  }
});

test("signup keeps username and background onboarding in place, then redirects only after the color is saved", async () => {
  const h = harness();
  const verify = h.verifySignInCode(event);
  h.requests[0].resolve(Response.json({ user: { ...user, username: null } }));
  await verify;
  h.installRoutes(); await settle();
  assert.equal(h.context.needsAuthUsername, true);
  assert.deepEqual(h.redirects, []);
  const failure = h.claimUsername(event);
  h.requests[1].resolve(Response.json({ error: "That username is taken." }, { status: 409 }));
  await failure;
  assert.equal(h.context.needsAuthUsername, true);
  assert.deepEqual(h.redirects, []);
  const success = h.claimUsername(event);
  h.requests[2].resolve(Response.json({ user: { ...user, username: "new-person" } }));
  await success;
  h.installRoutes(); await settle();
  assert.equal(h.context.needsAuthBackground, true);
  assert.equal(h.context.backgroundPending, user.id);
  assert.equal(h.context.authBackground, "#304DFF");
  assert.deepEqual(h.redirects, []);
  h.context.stripProfile.saveBackground = async () => false;
  await h.finishBackgroundOnboarding();
  assert.equal(h.context.needsAuthBackground, true);
  assert.equal(h.context.backgroundPending, user.id);
  h.context.authBackground = "#FF8CCC";
  h.context.stripProfile.saveBackground = async color => { assert.equal(color, "#FF8CCC"); return true; };
  await h.finishBackgroundOnboarding();
  assert.equal(h.context.backgroundPending, null);
  h.installRoutes(); await settle();
  assert.deepEqual(h.redirects, ["https://new-person.striiip.com/"]);
});

test("a reload resumes the unfinished background step for only the matching account", async () => {
  const h = harness();
  h.context.backgroundPending = user.id;
  h.installSession();
  h.requests[0].resolve(Response.json({ user })); await settle();
  assert.equal(h.context.needsAuthBackground, true);
  h.installRoutes(); await settle();
  assert.deepEqual(h.redirects, []);
});

test("Background Back reviews the reserved username and Continue returns without a second claim or a route change", async () => {
  const h = harness();
  h.context.setAuthUser(user);
  h.context.setAuthStep("background");
  h.context.authBackground = "#FF8CCC";
  h.returnBackgroundToUsername();
  assert.equal(h.context.authStep, "username");
  assert.equal(h.context.authUsername, "antonio");
  assert.equal(h.context.needsAuthUsername, true);
  h.installRoutes(); await settle();
  assert.deepEqual(h.redirects, []);
  await h.claimUsername(event);
  assert.equal(h.requests.length, 0);
  assert.equal(h.context.authStep, "background");
  assert.equal(h.context.authBackground, "#FF8CCC");
});

test("signing back into an unfinished signup still resumes Background after reviewing the phone number", async () => {
  const h = harness();
  h.context.backgroundPending = user.id;
  const verify = h.verifySignInCode(event);
  h.requests[0].resolve(Response.json({ user }));
  await verify;
  assert.equal(h.context.needsAuthBackground, true);
  h.installRoutes(); await settle();
  assert.deepEqual(h.redirects, []);
});

test("Make your own Strip opens the viewer's editor, or a preserved base-site sign-in destination", () => {
  const h = harness("https://friend.striiip.com/strip-12345");
  h.context.authUser = user;
  h.makeOwnStripFromReader();
  assert.deepEqual(h.redirects, ["https://antonio.striiip.com/edit/draft-12345"]);
  h.context.authUser = null;
  h.makeOwnStripFromReader();
  assert.equal(h.redirects[1], "https://striiip.com/edit/draft-12345");
});

test("sign-out returns to the base landing only after the server confirms, and failures preserve the session", async () => {
  const h = harness("https://antonio.striiip.com/settings");
  h.context.authUser = user;
  const fail = h.signOut();
  h.requests[0].resolve(new Response(null, { status: 503 })); await fail;
  assert.equal(h.context.authUser, user);
  assert.deepEqual(h.redirects, []);
  assert.match(h.context.notice, /Couldn’t sign out/);
  const success = h.signOut();
  h.requests[1].resolve(new Response(null, { status: 204 })); await success;
  assert.equal(h.context.authUser, null);
  assert.deepEqual(h.redirects, ["https://striiip.com/"]);
});

test("Back-cache restoration rechecks the shared session and removes stale private state", async () => {
  const h = harness("https://antonio.striiip.com/");
  h.installSession();
  h.requests[0].resolve(Response.json({ user })); await settle();
  assert.equal(h.context.authStatus, "signed-in");
  h.context.draftStrips = [{ id: "private" }];
  h.listeners.pageshow({ persisted: true });
  assert.equal(h.context.authStatus, "loading");
  assert.equal(h.context.initialRouteReady, false);
  h.requests[1].resolve(Response.json({ user: null })); await settle();
  assert.equal(h.context.authUser, null);
  assert.equal(h.context.libraryOwnerId, "");
  assert.equal(h.context.draftStrips.length, 0);
});

test("legacy draft migration shares a single save, retains failed data, and clears it only after success", async () => {
  const h = harness();
  h.context.libraryOwnerId = user.id;
  const blocks = [{ id: "block-12345", type: "text", content: "Keep this" }];
  h.context.legacyDraftBlocksRef.current = blocks;
  const save = h.migrateLegacyDraft();
  assert.equal(h.migrateLegacyDraft(), save);
  await settle();
  h.requests[0].resolve(new Response(null, { status: 503 }));
  assert.equal(await save, false);
  assert.equal(h.context.legacyDraftBlocksRef.current, blocks);
  assert.deepEqual(h.cleared, []);
  const retry = h.migrateLegacyDraft(); await settle();
  assert.deepEqual(JSON.parse(h.requests[1].options.body).blocks, blocks);
  h.requests[1].resolve(Response.json({ draft: { id: "draft-12345" } }));
  assert.equal(await retry, true);
  assert.equal(h.context.legacyDraftBlocksRef.current, null);
  assert.deepEqual(h.cleared, ["draft"]);
});
