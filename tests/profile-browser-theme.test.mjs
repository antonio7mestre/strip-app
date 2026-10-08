import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("loading and loaded toolbars hand off Safari sampling without restoring the profile tint", () => {
  const exports = {}, attributes = new Map([["name", "theme-color"]]);
  const theme = { removeAttribute: key => attributes.delete(key), setAttribute: (key, value) => attributes.set(key, value) };
  runInNewContext(compile("../app/lib/profile-browser-theme.ts"), { exports, document: { getElementById: () => theme } });
  const releaseLoading = exports.retainProfileBrowserTheme();
  assert.equal(attributes.has("name"), false);
  const releaseLoaded = exports.retainProfileBrowserTheme();
  releaseLoading();
  assert.equal(attributes.has("name"), false, "no tint flash at the skeleton handoff");
  releaseLoaded();
  assert.equal(attributes.get("name"), "theme-color", "Strip/auth routes regain their normal color handling");
});

test("the first-paint toolbar rule is private-profile only and also works with a server-resolved theme", () => {
  const module = {};
  runInNewContext(compile("../app/lib/profile-reload.ts"), { exports: module });
  for (const [pathname, hostname, owner, expected] of [
    ["/", "antonio.striiip.com", "user-one", true],
    ["/drafts", "antonio.striiip.com", "user-one", true],
    ["/", "localhost", "user-one", true],
    ["/", "friend.striiip.com", "user-one", false],
    ["/", "antonio.striiip.com", "public:antonio", false],
    ["/strip/abc", "antonio.striiip.com", "user-one", false],
    ["/edit/abc", "antonio.striiip.com", "user-one", false],
  ]) {
    const attributes = new Map([["name", "theme-color"]]);
    const theme = { removeAttribute: key => attributes.delete(key), setAttribute: (key, value) => attributes.set(key, value) };
    runInNewContext(module.PROFILE_RELOAD_SCRIPT, {
      location: { pathname, hostname },
      localStorage: { getItem: () => JSON.stringify({ owner, background: "#BFFF00", pages: {}, presentation: { username: "antonio" } }) },
      document: { getElementById: () => theme, documentElement: { dataset: { initialBackground: "#BFFF00" } } },
    });
    assert.equal(!attributes.has("name"), expected, `${owner} ${hostname}${pathname}`);
  }
});
