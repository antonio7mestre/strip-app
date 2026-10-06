import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as username from "../app/lib/username.ts";
import * as ending from "../app/lib/strip-ending.ts";
import * as stickerOrigin from "../app/lib/sticker-origin.ts";
import * as stickerRotation from "../app/lib/sticker-rotation.ts";
import * as stickerSizing from "../app/lib/sticker-sizing.ts";
import * as profile from "../app/lib/profile.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Request, Response, Headers, URL, crypto, TextEncoder, btoa, require: name => {
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  } });
  return exports;
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, phone_e164 TEXT, last_seen_at INTEGER);
    CREATE TABLE profiles (user_id TEXT, background TEXT, accent TEXT, font TEXT);
    CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER, last_seen_at INTEGER, expires_at INTEGER);
    CREATE TABLE drafts (id TEXT, owner_id TEXT, title TEXT, content_json TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE strips (id TEXT, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT, cover_shape TEXT, cover_alt TEXT, content_json TEXT, published_at INTEGER);
    INSERT INTO users VALUES ('owner-antonio', 'antonio', '+12025550100', 0), ('owner-friend', 'friend', '+12025550101', 0);
    INSERT INTO profiles VALUES ('owner-antonio', '#3155FF', '#FFFFFF', 'sans'), ('owner-friend', '#FF8CCC', '#330011', 'serif');
    INSERT INTO drafts VALUES ('draft-12345', 'owner-antonio', 'Private', '[]', 1, 1);
    INSERT INTO strips VALUES ('strip-12345', 'owner-friend', 'Public', 'color', '#3155FF', 'square', NULL, '[]', 1);
  `);
  const prepare = sql => {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
    };
  };
  const env = { DB: { prepare, batch: statements => Promise.all(statements.map(statement => statement.run())) } };
  const imports = { "cloudflare:workers": { env }, "@/app/lib/username": username };
  const auth = compile("app/server/auth.ts", imports);
  Object.assign(imports, { "@/app/server/auth": auth, "@/app/lib/strip-ending": ending,
    "@/app/lib/profile": profile,
    "@/app/lib/sticker-rotation": stickerRotation,
    "@/app/lib/sticker-sizing": stickerSizing,
    "@/app/lib/sticker-origin": stickerOrigin, "@/app/server/view-history": { recordStripView: async () => {} },
    "@/app/server/media-security": { isAllowedStoredMediaContentType: () => true } });
  return { db, auth, api: path => compile(path, imports) };
}
const request = (host, cookie, path = "/api/auth/session", init = {}) => new Request(`https://${host}${path}`, {
  ...init, headers: { cookie, ...init.headers },
});

test("one HttpOnly shared session works on the base site and both author domains", async () => {
  const f = fixture();
  const cookie = await f.auth.createSession("owner-antonio", request("striiip.com", ""));
  assert.match(cookie, /Domain=\.striiip.com/);
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.match(cookie, /; Secure/);
  const session = f.api("app/api/auth/session/route.ts");
  for (const host of ["striiip.com", "www.striiip.com", "antonio.striiip.com", "friend.striiip.com"]) {
    const response = await session.GET(request(host, cookie.split(";")[0]));
    assert.equal((await response.json()).user.username, "antonio", "host names never change session ownership");
    assert.match(response.headers.get("set-cookie"), /Domain=\.striiip.com/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  f.db.close();
});

test("host-only sessions migrate before redirect, and signing out invalidates the session on every domain", async () => {
  const f = fixture();
  const cookie = (await f.auth.createSession("owner-antonio", request("striiip.com", ""))).split(";")[0];
  const refreshed = await f.auth.getAuthUserWithSessionRefresh(request("striiip.com", cookie));
  assert.match(refreshed.cookies[0], /Domain=\.striiip.com/);
  const signout = f.api("app/api/auth/signout/route.ts");
  const response = await signout.POST(request("antonio.striiip.com", cookie, "/api/auth/signout", { method: "POST", headers: { origin: "https://antonio.striiip.com" } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.getSetCookie().length, 2, "expire shared and old host-only cookies");
  for (const host of ["striiip.com", "antonio.striiip.com", "friend.striiip.com"]) {
    assert.equal(await f.auth.getAuthUser(request(host, cookie)), null);
  }
  f.db.close();
});

test("subdomains do not weaken same-origin writes or private draft ownership", async () => {
  const f = fixture();
  const antonio = (await f.auth.createSession("owner-antonio", request("striiip.com", ""))).split(";")[0];
  const friend = (await f.auth.createSession("owner-friend", request("striiip.com", ""))).split(";")[0];
  const draft = f.api("app/api/drafts/[id]/route.ts");
  const context = { params: Promise.resolve({ id: "draft-12345" }) };
  for (const host of ["striiip.com", "antonio.striiip.com", "friend.striiip.com"]) {
    assert.equal((await draft.GET(request(host, antonio), context)).status, 200);
    assert.equal((await draft.GET(request(host, friend), context)).status, 404);
    assert.equal((await draft.GET(request(host, ""), context)).status, 401);
  }
  const crossOrigin = request("antonio.striiip.com", antonio, "/api/auth/signout", { method: "POST", headers: { origin: "https://friend.striiip.com" } });
  assert.equal((await f.api("app/api/auth/signout/route.ts").POST(crossOrigin)).status, 403);
  assert.equal((await f.auth.getAuthUser(request("antonio.striiip.com", antonio))).username, "antonio");
  f.db.close();
});

test("other authors' published content supports workspace history/posters without granting edit rights", async () => {
  const f = fixture();
  const cookie = (await f.auth.createSession("owner-antonio", request("striiip.com", ""))).split(";")[0];
  const api = f.api("app/api/strips/[id]/route.ts");
  const context = { params: Promise.resolve({ id: "strip-12345" }) };
  const response = await api.GET(request("antonio.striiip.com", cookie), context);
  const { strip } = await response.json();
  assert.equal(strip.username, "friend");
  assert.equal(strip.viewerIsOwner, false);
  assert.equal(strip.profileBackground, "#FF8CCC", "reload uses the author color, not the viewer color");
  assert.equal(strip.profileTextColor, "#330011", "loading blocks use the author ink, not the viewer ink");
  assert.equal(strip.profileFont, "serif", "loading type uses the author font, not the viewer font");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const clone = await f.api("app/api/strips/[id]/draft/route.ts").POST(request("antonio.striiip.com", cookie, "/api/strips/strip-12345/draft", { method: "POST", headers: { origin: "https://antonio.striiip.com" } }), context);
  assert.equal(clone.status, 404);
  f.db.close();
});

test("Strip reload backgrounds validate old or missing profile colors", async () => {
  const f = fixture();
  const api = f.api("app/api/strips/[id]/route.ts");
  const context = { params: Promise.resolve({ id: "strip-12345" }) };
  for (const background of ["#FF4D00", "#ffffff", "invalid", null]) {
    f.db.prepare("UPDATE profiles SET background = ? WHERE user_id = 'owner-friend'").run(background);
    const { strip } = await (await api.GET(request("striiip.com", ""), context)).json();
    assert.equal(strip.profileBackground, /^#[\da-f]{6}$/i.test(background ?? "") ? background : "#000000");
  }
  f.db.exec("DELETE FROM profiles");
  const { strip } = await (await api.GET(request("striiip.com", ""), context)).json();
  assert.equal(strip.profileBackground, "#000000");
  assert.equal(strip.profileTextColor, "#FFFFFF");
  assert.equal(strip.profileFont, "letter");
  f.db.close();
});

test("reload ink follows the profile's readable accent and safely handles legacy values", async () => {
  const f = fixture();
  const api = f.api("app/api/strips/[id]/route.ts");
  const context = { params: Promise.resolve({ id: "strip-12345" }) };
  for (const accent of ["#330011", "#000000", "#FF8CCC", "invalid", null]) {
    f.db.prepare("UPDATE profiles SET accent = ? WHERE user_id = 'owner-friend'").run(accent);
    const { strip } = await (await api.GET(request("striiip.com", ""), context)).json();
    const valid = /^#[\da-f]{6}$/i.test(accent ?? "") ? accent : "#000000";
    assert.equal(strip.profileTextColor, profile.profileTextColor({ background: "#FF8CCC", accent: valid }));
  }
  f.db.close();
});

test("direct Strip loading accepts every profile font and falls back for invalid or absent fonts", async () => {
  const f = fixture();
  const api = f.api("app/api/strips/[id]/route.ts");
  const context = { params: Promise.resolve({ id: "strip-12345" }) };
  for (const font of [...profile.PROFILE_FONTS.map(({ id }) => id), "invalid", null]) {
    f.db.prepare("UPDATE profiles SET font = ? WHERE user_id = 'owner-friend'").run(font);
    const { strip } = await (await api.GET(request("striiip.com", ""), context)).json();
    assert.equal(strip.profileFont, profile.PROFILE_FONTS.some(({ id }) => id === font) ? font : profile.DEFAULT_PROFILE.font);
  }
  f.db.close();
});
