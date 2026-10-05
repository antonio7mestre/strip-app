import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as colors from "../app/lib/onboarding-background.ts";
import * as profile from "../app/lib/profile.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source, globals) => {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, console, ...globals });
  return exports;
};

test("cobalt is selected in the top-right, with readable ink for every color", () => {
  assert.equal(colors.ONBOARDING_COLORS[3].value, colors.ONBOARDING_BACKGROUND);
  assert.equal(profile.profileInk(colors.ONBOARDING_BACKGROUND), "#FFFFFF");
  assert.equal(new Set(colors.ONBOARDING_COLORS.map(color => color.value)).size, colors.ONBOARDING_COLORS.length);
  for (const { value } of colors.ONBOARDING_COLORS) {
    assert.ok(profile.profileContrast(value, profile.profileInk(value)) >= 4.5);
  }
});

test("grid uses only complete four-circle rows that fit portrait and landscape screens", () => {
  for (const width of [240, 272, 327, 345, 384]) {
    for (const height of [48, 80, 140, 240, 380, 580, 900]) {
      const { count, size } = colors.onboardingGrid(width, height);
      assert.equal(count % 4, 0);
      assert.ok(count >= 4 && count <= colors.ONBOARDING_COLORS.length);
      assert.ok(size * 4 + 48 <= width);
      assert.ok(count / 4 * size + (count / 4 - 1) * 16 <= height);
      if (count < colors.ONBOARDING_COLORS.length) {
        assert.ok((count / 4 + 1) * size + count / 4 * 16 > height);
      }
    }
  }
});

test("background step can resume only for its account, including blocked storage", () => {
  const memory = new Map();
  globalThis.window = { sessionStorage: {
    getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key),
  } };
  try {
    colors.rememberBackgroundOnboarding("new-owner");
    assert.equal(colors.backgroundOnboardingPending("new-owner"), true);
    assert.equal(colors.backgroundOnboardingPending("other-owner"), false);
    colors.rememberBackgroundOnboarding(null);
    assert.equal(colors.backgroundOnboardingPending("new-owner"), false);
    window.sessionStorage.getItem = window.sessionStorage.setItem = window.sessionStorage.removeItem = () => { throw new Error("Blocked"); };
    assert.doesNotThrow(() => colors.rememberBackgroundOnboarding("new-owner"));
    assert.equal(colors.backgroundOnboardingPending("new-owner"), false);
  } finally { delete globalThis.window; }
});

test("color screen renders selected ring, contrast changes and the shared picker control", () => {
  const component = compile(read("app/components/OnboardingBackground.tsx"), {
    require: name => ({
      react: React, "react/jsx-runtime": jsx,
      "lucide-react": { Check: () => null, Palette: () => null },
      "@/app/lib/onboarding-background": colors, "@/app/lib/profile": profile,
      "@/app/components/GradientColorPicker": { GradientColorPicker: () => null },
      "./OnboardingBackground.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
    })[name],
  }).OnboardingBackground;
  const html = renderToStaticMarkup(React.createElement(component, {
    color: colors.ONBOARDING_BACKGROUND, onChange() {}, onContinue() {}, pending: false, loading: false, error: "", onRetry() {},
  }));
  assert.match(html, /aria-label="Cobalt" aria-pressed="true"/);
  assert.equal((html.match(/class="swatch"/g) || []).length, 4);
  assert.match(html, /--onboarding-ink:#FFFFFF/);
  assert.match(html, /Choose a custom color/);
  const source = read("app/components/OnboardingBackground.tsx");
  assert.match(source, /ResizeObserver\(measure\)/);
  assert.match(source, /<GradientColorPicker color=\{color\}/);
  assert.match(source, /disabled=\{pending \|\| loading\}/);
  const css = read("app/components/OnboardingBackground.module.css");
  assert.match(css, /grid-template-columns: repeat\(4,/);
  assert.match(css, /\.swatch\[aria-pressed="true"\] \{ border: 3px solid var\(--onboarding-ink\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /overflow: hidden/);
});

function saveHarness() {
  const tree = ts.createSourceFile("hook.ts", read("app/components/useStripProfile.ts"), ts.ScriptTarget.Latest, true);
  const find = node => ts.isVariableDeclaration(node) && node.name.getText(tree) === "saveBackground"
    ? node : ts.forEachChild(node, find);
  const requests = [];
  const state = {
    userId: "new-owner", owner: "new-owner", loading: false, loadFailed: false,
    saved: { ...profile.DEFAULT_PROFILE, title: "Keep me", font: "serif", revision: 3 },
    saving: { current: false }, currentUser: { current: "new-owner" },
    profileInk: profile.profileInk,
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
  };
  for (const key of ["Pending", "Error", "Saved"]) state[`set${key}`] = value => { state[key.toLowerCase()] = value; };
  const { saveBackground } = compile(`export const ${find(tree).getText(tree)};`, state);
  return { state, requests, saveBackground };
}

test("background is saved with readable ink and its current revision, without changing the title or font", async () => {
  const h = saveHarness();
  const save = h.saveBackground("#FF8CCC");
  assert.equal(h.state.pending, true);
  assert.equal(h.requests[0].url, "/api/profile");
  const sent = JSON.parse(h.requests[0].options.body);
  assert.equal(sent.background, "#FF8CCC");
  assert.equal(sent.accent, "#000000");
  assert.equal(sent.revision, 3);
  assert.equal(sent.title, "Keep me");
  assert.equal(sent.font, "serif");
  assert.equal(await h.saveBackground("#000000"), false, "A second tap cannot double-submit");
  h.requests[0].resolve(Response.json({ profile: { ...sent, revision: 4 } }));
  assert.equal(await save, true);
  assert.equal(h.state.saved.background, "#FF8CCC");
  assert.equal(h.state.pending, false);
});

test("failed saves keep onboarding open and stale accounts never accept a saved theme", async () => {
  for (const stale of [false, true]) {
    const h = saveHarness();
    const save = h.saveBackground(colors.ONBOARDING_BACKGROUND);
    if (stale) h.state.currentUser.current = "other-owner";
    h.requests[0].resolve(stale ? Response.json({ profile: { ...profile.DEFAULT_PROFILE, revision: 4 } })
      : Response.json({ error: "Try again." }, { status: 503 }));
    assert.equal(await save, false);
    assert.equal(h.state.saved.revision, 3);
    if (!stale) assert.equal(h.state.error, "Try again.");
  }
});
