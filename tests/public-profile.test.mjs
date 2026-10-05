import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as username from "../app/lib/username.ts";
import * as profile from "../app/lib/profile.ts";
import { publishedStripUrl, routeFromLocation, workspaceRedirect } from "./helpers/app-routing.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source, globals = {}) => {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, { exports, Response, Request, console, ...globals });
  return exports;
};
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE, phone_e164 TEXT);
    CREATE TABLE profiles (user_id TEXT, title TEXT, font TEXT, background TEXT, accent TEXT, photo_key TEXT, revision INTEGER);
    CREATE TABLE strips (id TEXT, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT, cover_shape TEXT, cover_alt TEXT, published_at INTEGER, content_json TEXT, cover_object_key TEXT);
    CREATE TABLE drafts (id TEXT, owner_id TEXT, title TEXT);
    INSERT INTO users VALUES ('owner-one', 'antonio', 'private-phone'), ('owner-two', 'friend', 'other-phone'), ('owner-three', 'empty', 'third-phone');
    INSERT INTO profiles VALUES ('owner-one', 'My little world', 'serif', '#FF8CCC', '#3155FF', 'private/photo', 7);
    INSERT INTO strips VALUES ('strip-older', 'owner-one', 'Older', 'color', '#FF8CCC', 'square', NULL, 10, 'private-content', 'private-key');
    INSERT INTO strips VALUES ('strip-newer', 'owner-one', 'Newest', 'image', NULL, NULL, 'My photo', 20, 'private-content', 'private-key');
    INSERT INTO strips VALUES ('strip-other', 'owner-two', 'Another person', 'color', '#000000', 'portrait', NULL, 30, 'other-content', NULL);
    INSERT INTO drafts VALUES ('draft-private', 'owner-one', 'Not published');
  `);
  const queries = [];
  const env = { DB: { prepare(sql) {
    queries.push(sql);
    return { bind(...args) { return {
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }; } };
  } } };
  const { GET } = compile(read("app/api/profiles/[username]/route.ts"), {
    require: (name) => ({ "cloudflare:workers": { env }, "@/app/lib/username": username, "@/app/lib/profile": profile })[name],
  });
  return { db, queries, get: (name, cookie = "") => GET(
    new Request(`https://antonio.striiip.com/api/profiles/${encodeURIComponent(name)}`, { headers: { cookie } }),
    { params: Promise.resolve({ username: name }) },
  ) };
}

test("public profile exposes its exact theme and only that user's published covers", async () => {
  const api = fixture();
  const response = await api.get("antonio");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.deepEqual(data.profile, { title: "My little world", font: "serif", background: "#FF8CCC", accent: "#3155FF", photoUrl: null, revision: 0 });
  assert.deepEqual(data.strips.map(s => s.id), ["strip-newer", "strip-older"]);
  assert.equal(data.strips[0].cover.src, "/api/strips/strip-newer/cover");
  assert.equal(data.strips[1].cover.shape, "square");
  assert.ok(data.strips.every(s => s.username === "antonio"));
  assert.doesNotMatch(JSON.stringify(data), /private|phone|owner-|draft|content_json|object_key/);
  assert.ok(api.queries.every(sql => !/SELECT\s+\*|drafts|auth_sessions/i.test(sql)));
  assert.deepEqual(await (await api.get("antonio", "strip_session=someone-else")).json(), data);
  api.db.close();
});

test("unconfigured and empty profiles work, missing and invalid usernames do not become a login page", async () => {
  const api = fixture();
  const friend = await (await api.get("friend")).json();
  assert.deepEqual(friend.profile, profile.DEFAULT_PROFILE);
  assert.equal(friend.strips.length, 1);
  const empty = await (await api.get("empty")).json();
  assert.deepEqual(empty.strips, []);
  for (const input of ["missing", "www", "api", "a", "evil.name", "' OR 1=1 --"]) {
    assert.equal((await api.get(input)).status, 404, input);
  }
  assert.equal((await api.get("ANTONIO")).status, 200);
  api.db.close();
});

const page = read("app/page.tsx");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (predicate, node = tree) => predicate(node) ? node : ts.forEachChild(node, child => find(predicate, child));
const routeEffect = find(n => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect" && n.arguments[0]?.getText(tree).includes("const applyRoute ="));

test("only a valid username subdomain root opens a profile; existing routes stay intact", () => {
  assert.equal(routeFromLocation("/", "antonio.striiip.com").kind, "profile");
  assert.equal(routeFromLocation("/", "ANTONIO.striiip.com").username, "antonio");
  for (const host of ["striiip.com", "www.striiip.com", "api.striiip.com", "localhost", "evil.antonio.striiip.com", "antonio.striiip.com.evil.test"]) {
    assert.equal(routeFromLocation("/", host).kind, "library", host);
  }
  assert.equal(routeFromLocation("/strip-newer", "antonio.striiip.com").username, "antonio");
  for (const path of ["/strip/strip-newer", "/edit/draft-12345", "/share/strip-newer", "/drafts", "/history", "/settings"]) {
    assert.notEqual(routeFromLocation(path, "antonio.striiip.com").kind, "profile");
  }
});

function routeHarness(user, fetch, options = {}) {
  const state = { publicProfile: null, authRequired: false, ready: false, view: "library", opened: null };
  const listeners = {};
  const redirects = [];
  const hostname = options.hostname ?? "antonio.striiip.com";
  const window = { location: { pathname: options.pathname ?? "/", hostname, origin: `https://${hostname}`, search: options.search ?? "", hash: options.hash ?? "", replace: url => redirects.push(url) }, scrollTo() {},
    history: { replaceState(_state, _title, path) { window.location.pathname = path; } },
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {},
  };
  const no = () => {};
  const { install } = compile(`export const install = ${routeEffect.arguments[0].getText(tree)};`, {
    window, fetch, routeFromLocation, workspaceRedirect, URL,
    migrateLegacyDraft: options.migrateLegacyDraft ?? (async () => true),
    publicStripUrl: strip => publishedStripUrl(window.location, strip),
    ...username, DEFAULT_PROFILE: profile.DEFAULT_PROFILE,
    authStatus: options.authStatus ?? (user ? "signed-in" : "signed-out"), authUser: user, libraryOwnerId: user?.id ?? "", needsAuthUsername: options.needsAuthUsername ?? false, needsAuthBackground: false,
    initialRouteHandledRef: { current: false }, prepareLibrarySummaries: async items => items,
    setPublicProfile: value => { state.publicProfile = typeof value === "function" ? value(state.publicProfile) : value; },
    setAuthenticationRequired: value => { state.authRequired = value; },
    setInitialRouteReady: value => { state.ready = value; }, setView: value => { state.view = value; },
    setOpenedPublishedStrip: value => { state.opened = value; },
    setPublishedCoverSettledKey: no, setPublishedLoaderDismissedKey: no, setNotice: no,
    setBrowserPath: path => { window.location.pathname = path; }, resetTransientNavigationState: no,
    inlinePreviewHistoryEntryRef: { current: false }, inlinePreviewBasePathRef: { current: null }, inlinePreviewExitLockRef: { current: null },
  });
  install();
  return { state, redirects, pop(path) { window.location.pathname = path; listeners.popstate({ state: null }); } };
}
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
test("only the signed-in owner gets the full workspace on their personal domain", async () => {
  const api = fixture();
  for (const user of [null, { id: "owner-two", username: "friend" }, { id: "owner-one", username: "antonio" }]) {
    const requests = [];
    const h = routeHarness(user, url => { requests.push(url); return api.get("antonio"); });
    await settle();
    assert.equal(h.state.authRequired, false);
    if (user?.username === "antonio") {
      assert.deepEqual(h.redirects, []);
      assert.equal(h.state.ready, true);
      assert.equal(h.state.publicProfile, null);
      assert.deepEqual(requests, []);
    } else {
      assert.deepEqual(h.redirects, []);
      assert.equal(h.state.ready, true);
      assert.equal(h.state.publicProfile.status, "ready");
      assert.equal(h.state.publicProfile.profile.title, "My little world");
      assert.deepEqual(requests, ["/api/profiles/antonio"]);
    }
  }
  api.db.close();
});

test("owner forwarding waits for the session and completed username onboarding", async () => {
  for (const options of [{ authStatus: "loading" }, { needsAuthUsername: true }]) {
    const h = routeHarness({ id: "owner-one", username: "antonio" }, () => assert.fail("must wait for auth"), options);
    await settle();
    assert.deepEqual(h.redirects, []);
    assert.equal(h.state.ready, false);
  }
});

test("the base site forwards to the owner's workspace, but individual published Strips stay on their domain", async () => {
  const user = { id: "owner-one", username: "antonio" };
  for (const hostname of ["striiip.com", "www.striiip.com", "localhost"]) {
    const h = routeHarness(user, () => assert.fail("main profile needs no public fetch"), { hostname });
    await settle();
    assert.deepEqual(h.redirects, hostname === "localhost" ? [] : ["https://antonio.striiip.com/"]);
    assert.equal(h.state.ready, hostname === "localhost");
    assert.equal(h.state.view, "library");
  }
  for (const pathname of ["/strip-newer", "/strip/strip-newer"]) {
    const h = routeHarness(user, async () => Response.json({ strip: { id: "strip-newer", username: "antonio" } }), { pathname });
    await settle();
    assert.deepEqual(h.redirects, []);
    assert.equal(h.state.view, "published");
    h.pop("/");
    await settle();
    assert.deepEqual(h.redirects, [], "Back stays in the owner's personal workspace");
    assert.equal(h.state.ready, true);
    assert.equal(h.state.publicProfile, null);
    assert.equal(h.state.view, "library");
  }
});

test("Back restores the public profile and a late Strip response cannot overwrite it", async () => {
  const api = fixture();
  let completeStrip;
  const h = routeHarness(null, url => url.includes("/profiles/") ? api.get("antonio") : new Promise(resolve => { completeStrip = resolve; }));
  await settle();
  h.pop("/strip-newer");
  h.pop("/");
  assert.equal(h.state.publicProfile.profile.background, "#FF8CCC", "keep the loaded theme during Back");
  await settle();
  completeStrip(Response.json({ strip: { id: "strip-newer", username: "antonio" } }));
  await settle();
  assert.equal(h.state.view, "library");
  assert.equal(h.state.opened, null);
  assert.equal(h.state.authRequired, false);
  api.db.close();
});

test("canonical workspace redirects wait for legacy drafts and never reserve an extra history entry", async () => {
  let finish;
  const h = routeHarness({ id: "owner-one", username: "antonio" }, () => assert.fail("redirect before fetching the editor"), {
    hostname: "striiip.com", pathname: "/edit/draft-12345", search: "?preview=1", hash: "#block-12345",
    migrateLegacyDraft: () => new Promise(resolve => { finish = resolve; }),
  });
  await settle();
  assert.deepEqual(h.redirects, []);
  finish(true); await settle();
  assert.deepEqual(h.redirects, ["https://antonio.striiip.com/edit/draft-12345?preview=1#block-12345"]);
  assert.equal(h.state.ready, false);
  const blocked = routeHarness({ id: "owner-one", username: "antonio" }, () => assert.fail("no fetch"), {
    hostname: "striiip.com", migrateLegacyDraft: async () => false,
  });
  await settle();
  assert.deepEqual(blocked.redirects, [], "failed local draft migration must not silently leave its origin");
});

test("legacy reader links normalize to the author's personal URL and wrong vanity owners remain rejected", async () => {
  const h = routeHarness({ id: "owner-one", username: "antonio" }, async () => Response.json({ strip: { id: "strip-newer", username: "friend" } }), {
    hostname: "striiip.com", pathname: "/strip/strip-newer", hash: "#hello",
  });
  await settle();
  assert.deepEqual(h.redirects, ["https://friend.striiip.com/strip-newer#hello"]);
  assert.equal(h.state.ready, false);
  const requests = [];
  const invalid = routeHarness(null, async url => {
    requests.push(url);
    return url.includes("/profiles/") ? new Response(null, { status: 404 }) : Response.json({ strip: { id: "strip-newer", username: "friend" } });
  }, { pathname: "/strip-newer" });
  await settle();
  assert.equal(invalid.state.opened, null);
  assert.equal(invalid.state.publicProfile.status, "missing");
  assert.deepEqual(invalid.redirects, []);
});

test("public errors and empty states never fall back to the viewer's private library", async () => {
  for (const response of [new Response(null, { status: 404 }), new Response(null, { status: 500 })]) {
    const h = routeHarness({ id: "other-user", username: "friend" }, async () => response);
    await settle();
    assert.equal(h.state.publicProfile.status, response.status === 404 ? "missing" : "error");
    assert.deepEqual(h.state.publicProfile.strips.length, 0);
    assert.equal(h.state.authRequired, false);
  }
});

test("public header reuses title styling but has no edit controls, divider or private errors", () => {
  const source = read("app/components/ProfileEditor.tsx");
  const { ProfileHeader } = compile(source, { React, require: name => {
    if (name === "react") return React;
    if (name === "@/app/lib/profile") return profile;
    return {};
  } });
  const html = renderToStaticMarkup(React.createElement(ProfileHeader, {
    publicProfile: { ...profile.DEFAULT_PROFILE, title: "Our world" }, username: "antonio",
    controller: { editing: true, pending: false, loadFailed: true, error: "Private failure" },
  }));
  assert.match(html, /<h1[^>]*>Our world<\/h1>/);
  assert.match(html, /@antonio/);
  assert.doesNotMatch(html, /button|textarea|Private failure|divider/);
  assert.match(page, /!viewingPublicProfile && !openingCover \? <footer/);
  assert.match(page, /!viewingPublicProfile && !isSettings && !stripProfile.editing/);
  assert.match(page, /profilePageStyle\(\{ profile: visibleProfile, editing: !viewingPublicProfile && stripProfile.editing \}\)/);
});

test("a public profile's initial safe area cannot be tinted by a local editor draft", () => {
  const layout = read("app/layout.tsx");
  const script = layout.match(/const initialThemeColorScript = `([\s\S]*?)`;/)[1];
  let reads = 0;
  runInNewContext(JSON.parse(JSON.stringify(script)).replaceAll("\\\\", "\\"), {
    window: { location: { hostname: "antonio.striiip.com", pathname: "/" }, localStorage: { getItem() { reads++; return null; } } },
  });
  assert.equal(reads, 0);
});
