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

test("cobalt is selected in the top-left, with distinct colors and readable ink for every color", () => {
  assert.equal(colors.ONBOARDING_COLORS[0].value, colors.ONBOARDING_BACKGROUND);
  assert.equal(profile.profileInk(colors.ONBOARDING_BACKGROUND), "#FFFFFF");
  assert.equal(new Set(colors.ONBOARDING_COLORS.map(color => color.value)).size, colors.ONBOARDING_COLORS.length);
  for (const { value } of colors.ONBOARDING_COLORS) {
    assert.ok(profile.profileContrast(value, profile.profileInk(value)) >= 4.5);
  }
  const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));
  for (let i = 0; i < colors.ONBOARDING_COLORS.length; i++) {
    for (const other of colors.ONBOARDING_COLORS.slice(i + 1)) {
      const a = colors.ONBOARDING_COLORS[i], b = other;
      const distance = Math.hypot(...rgb(a.value).map((value, index) => value - rgb(b.value)[index]));
      assert.ok(distance > 65, `${a.name} and ${b.name} must not be near-duplicates`);
    }
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

test("every swatch and custom color replaces stale reload paint at both Safari edges", () => {
  const classes = new Set(["profile-reload-pending", "onboarding-background-active"]);
  const values = new Map([["--profile-reload-background", colors.ONBOARDING_BACKGROUND]]);
  const meta = new Map([["content", colors.ONBOARDING_BACKGROUND]]);
  const page = {
    documentElement: {
      classList: { remove: name => classes.delete(name) },
      style: { setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) },
    },
    getElementById: name => name === "strip-theme-color" ? { setAttribute: (name, value) => meta.set(name, value) } : null,
  };
  for (const color of [...colors.ONBOARDING_COLORS.map(({ value }) => value), "#EF72A1", "#113F87"]) {
    colors.syncOnboardingBackground(color, page);
    assert.equal(page.documentElement.style.backgroundColor, color);
    for (const property of ["--onboarding-background", "--top-safe-area-color", "--bottom-safe-area-color"]) {
      assert.equal(values.get(property), color);
    }
    assert.equal(meta.get("content"), color);
    assert.equal(meta.get("name"), "theme-color", "Restore Safari tint after the preceding keyboard form");
    assert.equal(classes.has("profile-reload-pending"), false);
    assert.equal(values.has("--profile-reload-background"), false);
    assert.deepEqual([...classes], ["onboarding-background-active"], "Do not change any footer or tool classes");
  }
  assert.doesNotThrow(() => colors.syncOnboardingBackground("#BFFF00", { ...page, getElementById: () => null }));
  assert.match(read("app/components/OnboardingBackground.module.css"), /background: var\(--onboarding-background\) !important/);
});

test("onboarding takes edge ownership before paint and only after inactive footer cleanup", () => {
  const source = read("app/page.tsx");
  const footer = source.indexOf("useLayoutEffect(() => installFooterSafeAreaColor(");
  const sync = source.indexOf("if (needsAuthBackground) syncOnboardingBackground(authBackground)");
  assert.ok(footer >= 0 && sync > footer);
  assert.match(source.slice(footer, sync + 160), /useLayoutEffect\(\(\) => \{\s*if \(needsAuthBackground\) syncOnboardingBackground\(authBackground\);\s*\}, \[needsAuthBackground, authBackground\]\)/);
});

test("color screen renders selected ring, contrast changes and the shared picker control", () => {
  const component = compile(read("app/components/OnboardingBackground.tsx"), {
    require: name => ({
      react: React, "react/jsx-runtime": jsx,
      "lucide-react": { ArrowLeft: () => null, Check: () => null, Palette: () => null },
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
  assert.match(html, /Back to username/);
  assert.match(html, /auth-flow-header/);
  assert.match(html, /auth-flow-copy/);
  const source = read("app/components/OnboardingBackground.tsx");
  assert.match(source, /ResizeObserver\(measure\)/);
  assert.match(source, /<GradientColorPicker color=\{color\}/);
  assert.match(source, /disabled=\{pending \|\| loading\}/);
  const css = read("app/components/OnboardingBackground.module.css");
  assert.match(css, /grid-template-columns: repeat\(4,/);
  assert.match(css, /\.swatch\[aria-pressed="true"\] \{ border: 3px solid var\(--onboarding-ink\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /\.picker :global\(\.full-gradient-picker\) \{[^}]*border-radius: 0/,
    "Only the outer picker clips the rainbow, so it fills all four corners");
  assert.match(css, /\.picker \{[^}]*position: fixed;[^}]*left: 0; right: 0;[^}]*border-radius: 0/,
    "The onboarding rainbow reaches both edges of the screen with no inset or cut-out top-left corner");
  assert.match(read("app/globals.css"), /\.auth-signin-mode \.auth-flow-copy h1 \{ color: #ffffff; \}/);
  assert.doesNotMatch(css, /font-weight: 800|letter-spacing: -0.04em/,
    "The color step inherits the same header typography as the preceding steps");
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
