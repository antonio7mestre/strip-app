import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import * as profile from "../app/lib/profile.ts";
import * as username from "../app/lib/username.ts";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
function compile(source, modules) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Headers, Request, require: name => modules[name] });
  return exports;
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users (id TEXT, username TEXT);
    CREATE TABLE profiles (user_id TEXT, background TEXT);
    CREATE TABLE strips (id TEXT, owner_id TEXT);
    INSERT INTO users VALUES ('one','antonio'),('two','friend'),('three','empty');
    INSERT INTO profiles VALUES ('one','#FF8CCC'),('two','#3155FF');
    INSERT INTO strips VALUES ('strip-antonio','one'),('strip-friend','two'),('strip-empty','three');`);
  const queries = [];
  let user = null, authCalls = 0;
  const { initialPageBackground } = compile(read("app/server/initial-background.ts"), {
    "cloudflare:workers": { env: { DB: { prepare(sql) {
      queries.push(sql);
      return { bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) ?? null }) };
    } } } },
    "@/app/lib/profile": profile, "@/app/lib/username": username,
    "@/app/server/auth": { getAuthUser: async () => { authCalls++; return user; } },
  });
  return { db, queries, authCalls: () => authCalls, user: value => { user = value; },
    load: (path, host = "striiip.com") => initialPageBackground(new Headers({ "x-strip-pathname": path, host })) };
}

test("cold profile and Strip links use the author's background, never the viewer's theme", async () => {
  const f = fixture();
  f.user({ id: "two", username: "friend" });
  assert.equal(await f.load("/", "antonio.striiip.com"), "#FF8CCC");
  assert.equal(await f.load("/strip-antonio", "antonio.striiip.com"), "#FF8CCC");
  assert.equal(await f.load("/strip/strip-antonio", "friend.striiip.com"), "#FF8CCC");
  assert.equal(await f.load("/strip-antonio", "friend.striiip.com"), null);
  assert.equal(await f.load("/strip/strip-empty"), "#000000");
  assert.equal(await f.load("/", "empty.striiip.com"), "#000000");
  assert.equal(await f.load("/", "missing.striiip.com"), null);
  assert.equal(f.authCalls(), 0, "public theme lookup does not depend on the visitor's session");
  assert.ok(f.queries.every(sql => !/phone|content_json|photo|title|SELECT\s+\*/i.test(sql)));
  f.db.close();
});

test("signed-in base and account pages start in the saved theme; signed-out starts cobalt", async () => {
  const f = fixture();
  for (const path of ["/", "/drafts", "/history", "/settings"]) {
    assert.equal(await f.load(path), "#304dff");
  }
  f.user({ id: "one", username: "antonio" });
  for (const path of ["/", "/drafts", "/history", "/settings"]) {
    assert.equal(await f.load(path), "#FF8CCC");
  }
  f.user({ id: "one", username: null });
  assert.equal(await f.load("/"), "#304dff", "username setup shares login background");
  f.db.close();
});

test("editor, share, invalid and failed lookups keep their existing canvas logic", async () => {
  const f = fixture();
  for (const path of ["/edit/draft-12345", "/share/strip-antonio", "/api/profile", "/strip/no", "/not-a-vanity-id"]) {
    assert.equal(await f.load(path), null);
  }
  assert.equal(f.queries.length, 0);
  assert.equal(f.authCalls(), 0);
  f.db.exec("UPDATE profiles SET background = 'url(unsafe)' WHERE user_id = 'one'");
  assert.equal(await f.load("/", "antonio.striiip.com"), "#000000");
  f.db.close();
  assert.equal(await f.load("/", "antonio.striiip.com"), null, "DB failures cannot break rendering");
});

test("request path is overwritten and themed HTML cannot be cached between sessions", () => {
  const { middleware } = compile(read("middleware.ts"), {
    "next/server": { NextResponse: { next: options => ({ ...options, headers: new Headers() }) } },
  });
  const response = middleware({ headers: new Headers({ "x-strip-pathname": "/wrong", host: "striiip.com" }),
    nextUrl: new URL("https://striiip.com/strip/strip-antonio") });
  assert.equal(response.request.headers.get("x-strip-pathname"), "/strip/strip-antonio");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("fresh server theme beats stale profile cache and covers the entire first-paint canvas", () => {
  const { PROFILE_RELOAD_SCRIPT } = compile(read("app/lib/profile-reload.ts"), {});
  const root = { dataset: { initialBackground: "#3155FF" } };
  runInNewContext(PROFILE_RELOAD_SCRIPT, { document: { documentElement: root },
    localStorage: { getItem: () => assert.fail("must not read another profile's saved color") } });
  const layout = read("app/layout.tsx");
  assert.match(layout, /await initialPageBackground\(await headers\(\)\)/);
  assert.match(layout, /data-initial-background=\{background \?\? undefined\}/);
  assert.match(layout, /className=\{background \? "profile-reload-pending"/);
  for (const variable of ["--profile-reload-background", "--top-safe-area-color", "--bottom-safe-area-color"]) {
    assert.ok(layout.includes(`"${variable}": background`));
  }
  assert.match(read("app/globals.css"), /html\.profile-reload-pending,[\s\S]*?body\s*\{\s*background: var\(--profile-reload-background, #000\) !important/);
});
