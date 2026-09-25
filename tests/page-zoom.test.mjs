import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { installPageZoomLock, shouldLockPageZoom } from "../app/lib/page-zoom.ts";

test("home, every login step, username setup and editor are locked, not public Strips", () => {
  const signedIn = { view: "published", authenticationRequired: false, authStatus: "signed-in", needsUsername: false };
  for (const view of ["library", "drafts", "history", "settings", "edit"]) {
    assert.equal(shouldLockPageZoom({ ...signedIn, view }), true);
  }
  for (const authStatus of ["loading", "signed-out"]) {
    assert.equal(shouldLockPageZoom({ ...signedIn, authenticationRequired: true, authStatus }), true);
  }
  assert.equal(shouldLockPageZoom({ ...signedIn, needsUsername: true }), true);
  for (const view of ["published", "share", "preview", "publish-setup", "title-setup"]) {
    assert.equal(shouldLockPageZoom({ ...signedIn, view }), false);
  }
});

test("pinch is blocked without swallowing normal scroll, clicks, keyboard or custom sticker gestures", () => {
  const events = new Map(), classes = new Set();
  const original = "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";
  let content = original;
  globalThis.document = {
    documentElement: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    querySelector: () => ({ getAttribute: () => content, setAttribute: (_, value) => { content = value; } }),
    addEventListener: (name, handler, options) => { assert.deepEqual(options, { passive: false, capture: true }); events.set(name, handler); },
    removeEventListener: (name, handler, capture) => { assert.equal(capture, true); assert.equal(events.get(name), handler); events.delete(name); },
  };
  const send = (type, fields = {}) => {
    let prevented = false;
    events.get(type)({ cancelable: true, preventDefault: () => { prevented = true; },
      stopPropagation: () => assert.fail("Sticker/input handlers must still receive the event"), ...fields });
    return prevented;
  };
  try {
    const cleanup = installPageZoomLock();
    assert.ok(classes.has("page-zoom-locked"));
    assert.match(content, /interactive-widget=resizes-content/);
    assert.match(content, /maximum-scale=1, user-scalable=no/);
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) assert.ok(send(type));
    for (const type of ["touchstart", "touchmove"]) {
      assert.equal(send(type, { touches: [{}] }), false);
      assert.equal(send(type, { touches: [{}, {}] }), true);
      assert.equal(send(type, { touches: [{}, {}], cancelable: false }), false);
    }
    assert.equal(send("wheel", { ctrlKey: false }), false);
    assert.equal(send("wheel", { ctrlKey: true }), true);
    assert.equal(events.has("click") || events.has("keydown") || events.has("focus"), false);
    cleanup();
    assert.equal(content, original);
    assert.equal(events.size + classes.size, 0);
  } finally { delete globalThis.document; }
});

test("the lock has no phone-to-code gap and disables double-tap zoom without freezing the collage", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /useLayoutEffect\(\(\) => \{\s*if \(!pageZoomLocked\) return;\s*return installPageZoomLock\(\);\s*\}, \[pageZoomLocked\]\)/);
  assert.match(css, /html\.page-zoom-locked,[\s\S]*?\.library-mode\s*\{\s*touch-action: pan-y;/);
  assert.match(css, /html\.page-zoom-locked :where\(\.auth-mode \*, \.library-mode \*\)/, "Nested scroll/clipping containers must not re-enable double-tap zoom; selected drag rules take precedence");
  assert.match(css, /\.landing-sticker-button\.is-selected\s*\{[^}]*touch-action: none;/);
  assert.match(css, /\.auth-flow-form \.auth-code-native\s*\{[^}]*font-size: 16px;/);
});

test("username uses the same fixed, keyboard-sized layout and inline Continue as phone and code", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const username = page.slice(page.indexOf('if (needsAuthUsername || (authenticationRequired && authStatus !== "signed-in"))'), page.indexOf('const isDraftLibrary ='));
  assert.match(page, /const authFormIsVisible = needsAuthUsername \|\|/);
  assert.match(page, /const topSafeAreaColor =\s*needsAuthUsername \|\|/);
  assert.match(username, /app-shell auth-mode/);
  assert.match(username, /auth-signin-mode/);
  assert.doesNotMatch(username, /top-safe-area-anchor/);
  for (const name of ["auth-flow-stage", "auth-flow-copy", "auth-flow-actions", "auth-continue-button"]) {
    assert.ok(username.includes(`className="${name}"`));
  }
  assert.match(username, /<AuthKeyboardButton\s+inputRef=\{authActiveInputRef\}/);
  assert.doesNotMatch(username, /auth-brand|auth-card/);
  assert.doesNotMatch(username.match(/<input[\s\S]*?\/>/)[0], /disabled=/);
  assert.match(username, /onClick=\{needsAuthUsername \? \(\) => void returnUsernameToPhone\(\)/);
  const back = page.slice(page.indexOf("const returnUsernameToPhone ="), page.indexOf("const beginSignIn ="));
  assert.match(back, /await fetch\("\/api\/auth\/signout"/);
  assert.match(back, /if \(!response.ok\) throw/);
  assert.match(back, /flushSync\(\(\) => \{/);
  assert.match(back, /setAuthStep\("phone"\)/);
  assert.match(back, /authPhoneInputRef.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(back, /setAuthPhone\(/, "Keep the phone number editable when going back");
});

test("signed-in home has no fixed safe-area cap or forced Safari tint", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const library = page.slice(page.indexOf("const isDraftLibrary ="), page.indexOf('if (view === "share" && openedPublishedStrip)'));
  assert.doesNotMatch(library, /top-safe-area-anchor/);
  const effect = page.slice(page.indexOf("const homeIsVisible ="), page.indexOf("const homeIsVisible =") + 650);
  assert.match(effect, /if \(!homeIsVisible\) return/);
  assert.match(effect, /theme\?\.removeAttribute\("name"\)/);
  assert.match(effect, /theme\?\.setAttribute\("name", name\)/);
});
