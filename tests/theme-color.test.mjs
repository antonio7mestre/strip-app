import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suspendThemeColor } from "../app/lib/theme-color.ts";

function fixture(name = "theme-color") {
  const attrs = new Map([["content", "#3155FF"]]);
  if (name) attrs.set("name", name);
  return {
    getAttribute: key => attrs.get(key) ?? null,
    hasAttribute: key => attrs.has(key),
    removeAttribute: key => attrs.delete(key),
    setAttribute: (key, value) => attrs.set(key, value),
  };
}

test("home leaving cannot restore a white Safari tint while the loader still paints", () => {
  const theme = fixture();
  const leaveHome = suspendThemeColor(theme);
  const leaveLoader = suspendThemeColor(theme);
  theme.setAttribute("content", "#FFFFFF"); // The published footer mounts underneath.
  leaveHome();
  assert.equal(theme.hasAttribute("name"), false);
  leaveHome(); // Cleanup is idempotent.
  assert.equal(theme.hasAttribute("name"), false);
  leaveLoader();
  assert.equal(theme.getAttribute("name"), "theme-color");
  assert.equal(theme.getAttribute("content"), "#FFFFFF", "restore the latest reader color, not stale profile ink");
});

test("back during loading leaves homepage tint disabled and direct loads restore normally", () => {
  const theme = fixture();
  const leaveLoader = suspendThemeColor(theme);
  const leaveHome = suspendThemeColor(theme);
  leaveLoader();
  assert.equal(theme.hasAttribute("name"), false);
  leaveHome();
  assert.equal(theme.getAttribute("name"), "theme-color");
  for (let replay = 0; replay < 2; replay++) {
    const leave = suspendThemeColor(theme);
    assert.equal(theme.hasAttribute("name"), false);
    leave();
    assert.equal(theme.getAttribute("name"), "theme-color");
  }
});

test("missing, externally suppressed, and explicitly changed hints are respected", () => {
  suspendThemeColor(null)();
  const suppressed = fixture(null);
  suspendThemeColor(suppressed)();
  assert.equal(suppressed.hasAttribute("name"), false);
  const changed = fixture();
  const leave = suspendThemeColor(changed);
  changed.setAttribute("name", "another-owner");
  leave();
  assert.equal(changed.getAttribute("name"), "another-owner");
});

test("profile and entrance share tint ownership through the whole handoff", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!homeIsVisible\) return;\s*return suspendThemeColor\(\)/);
  assert.match(loader, /const restoreTheme = suspendThemeColor\(\)/);
  assert.match(loader, /restoreTheme\(\)/);
  assert.doesNotMatch(loader, /setAttribute\("name"/);
});
