import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("../app/components/AuthLandingStrip.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {exports, require: createRequire(import.meta.url)});
const html = renderToStaticMarkup(exports.AuthLandingStrip());

test("login is a sample Strip with a title, media, explainers, and overlaid photo stickers", () => {
  assert.match(html, /id="auth-heading">Want to<br\/>strip\?/);
  assert.equal((html.match(/class="landing-block /g) || []).length, 4);
  assert.match(html, /landing-hero-stickers/);
  assert.match(html, /Your photos\./);
  assert.match(html, /Send it to the group chat\./);
  assert.doesNotMatch(html, /\u2014/);
});

test("photos are local, have stable dimensions and accessible or decorative alt text", () => {
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 5);
  for (const img of images) {
    const path = img.match(/src="([^"]+)"/)[1];
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)));
    assert.match(img, /width="\d+"/);
    assert.match(img, /height="\d+"/);
    assert.match(img, /alt="[^"]*"/);
  }
  assert.match(html, /aria-hidden="true"/);
  assert.equal(exports.AUTH_LANDING_COLOR, "#304dff");
});

test("only landing scrolls and the existing sign-in dock is outside its scroller", () => {
  assert.match(css, /\.auth-landing\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.auth-shell\.auth-step-landing\s*\{\s*padding: 0;/);
  assert.match(css, /\.composer-dock\s*\{[^}]*position: fixed;/);
  assert.doesNotMatch(html, /Get started|composer-dock/);
  assert.match(page, /<AuthLandingStrip \/>/);
  assert.match(page, /className="composer-dock auth-action-dock"/);
  assert.match(page, /onClick=\{beginSignIn\}/);
  assert.match(page, /authPhoneInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});
