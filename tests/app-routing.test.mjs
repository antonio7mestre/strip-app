import assert from "node:assert/strict";
import test from "node:test";
import { accountAppOrigin, baseAppOrigin, publishedStripUrl, routeFromLocation, workspaceRedirect } from "./helpers/app-routing.mjs";

const location = (host, path = "/") => new URL(`https://${host}${path}`);
const privatePaths = ["/", "/drafts", "/history", "/settings", "/edit/draft-12345", "/share/strip-12345"];

test("the canonical signed-in workspace includes all private tools and preserves deep links", () => {
  for (const host of ["striiip.com", "www.striiip.com"]) {
    for (const path of privatePaths) {
      assert.equal(workspaceRedirect(location(host, `${path}?mode=preview#block-123`), "antonio"),
        `https://antonio.striiip.com${path}?mode=preview#block-123`);
      assert.equal(workspaceRedirect(location("antonio.striiip.com", path), "antonio"), null);
    }
  }
});

test("private tools on another person's domain belong to the viewer's session, never the host owner", () => {
  for (const path of privatePaths.slice(1)) {
    assert.equal(workspaceRedirect(location("friend.striiip.com", path), "antonio"), `https://antonio.striiip.com${path}`);
    for (const user of [null, undefined, ""]) {
      assert.equal(workspaceRedirect(location("friend.striiip.com", path), user), `https://striiip.com${path}`);
      assert.equal(workspaceRedirect(location("striiip.com", path), user), null);
    }
  }
});

test("public profiles and readers never send visitors to their own home", () => {
  for (const user of [null, "antonio", "friend"]) {
    for (const path of ["/", "/strip-12345", "/strip/strip-12345"]) {
      assert.equal(workspaceRedirect(location("friend.striiip.com", path), user), null);
    }
    assert.equal(workspaceRedirect(location("striiip.com", "/strip/strip-12345"), user), null);
  }
});

test("all published links use the author, not the signed-in workspace domain", () => {
  for (const host of ["striiip.com", "antonio.striiip.com", "friend.striiip.com"]) {
    assert.equal(publishedStripUrl(location(host), { id: "strip-12345", username: "friend" }), "https://friend.striiip.com/strip-12345");
    assert.equal(publishedStripUrl(location(host), { id: "legacy-12345", username: null }), "https://striiip.com/strip/legacy-12345");
  }
});

test("local and staging environments cannot accidentally send users or drafts to production", () => {
  for (const host of ["localhost:3036", "127.0.0.1:3036", "strip-app-staging.workers.dev", "preview.chatgpt.site"]) {
    const current = location(host);
    assert.equal(accountAppOrigin(current, "antonio"), current.origin);
    assert.equal(baseAppOrigin(current), current.origin);
    assert.equal(publishedStripUrl(current, { id: "strip-12345", username: "antonio" }), `${current.origin}/strip/strip-12345`);
    for (const path of privatePaths) assert.equal(workspaceRedirect(location(host, path), "antonio"), null);
  }
});

test("destination usernames are validated, and lookalike domains are not production", () => {
  for (const value of ["www", "api", "evil.test", "antonio@evil.test", "//evil.test", "antonio/path", "", null]) {
    assert.equal(accountAppOrigin(location("striiip.com"), value), "https://striiip.com");
  }
  for (const host of ["striiip.com.evil.test", "evil.antonio.striiip.com", "other.test"]) {
    assert.equal(workspaceRedirect(location(host), "antonio"), null);
  }
  assert.equal(accountAppOrigin(location("striiip.com"), "ANTONIO"), "https://antonio.striiip.com");
  assert.equal(routeFromLocation("/settings", "antonio.striiip.com").kind, "settings");
});
