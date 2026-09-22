import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const source = readFileSync(new URL("../app/components/AuthLandingStrip.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {exports, require: createRequire(import.meta.url)});
const html = renderToStaticMarkup(createElement(exports.AuthLandingStrip));

test("login is a sample Strip with a title, media, explainers, and overlaid photo stickers", () => {
  assert.match(html, /id="auth-heading">Want to<br\/>strip\?/);
  assert.doesNotMatch(html, /landing-masthead|auth-landing-brand|A little bit of your life/);
  assert.equal((html.match(/class="landing-block /g) || []).length, 4);
  assert.match(html, /landing-hero-stickers/);
  assert.match(html, /Your photos\./);
  assert.match(html, /Send it to the group chat\./);
  assert.doesNotMatch(html, /\u2014/);
});

test("photos are local, have stable dimensions and accessible or decorative alt text", () => {
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 20);
  assert.equal(new Set(images.map(img => img.match(/src="([^"]+)"/)[1])).size, 20, "Every photo and sticker is unique");
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

test("collage uses complete transparent stickers without rough masks or borders and a black CTA", () => {
  assert.equal((html.match(/class="landing-cutout /g) || []).length, 14);
  assert.doesNotMatch(html, /clipPath|clip-path/);
  assert.doesNotMatch(html, /class="[^\"]*\s(?:share-shell|hero-camera|make-cd)(?:\s|\")/, "Sticker classes cannot inherit unrelated page layouts");
  assert.match(html, /sticker-camera\.webp/);
  assert.match(css, /\.landing-cutout img\s*\{[^}]*object-fit: contain; border: 0; box-shadow: none;/);
  assert.match(css, /\.landing-cutout\s*\{[^}]*pointer-events: none;/);
  assert.match(css, /\.auth-step-landing \.auth-action-button\s*\{[^}]*background: #080808;/);
});

test("only landing scrolls and the existing sign-in dock is outside its scroller", () => {
  assert.match(css, /\.auth-landing\s*\{[^}]*overflow: clip;/);
  assert.match(css, /\.auth-mode\.auth-landing-mode,[\s\S]*?height: auto;\s*overflow: visible;/);
  assert.match(css, /\.auth-shell\.auth-step-landing\s*\{\s*padding: 0;/);
  assert.match(css, /\.composer-dock\s*\{[^}]*position: fixed;/);
  assert.doesNotMatch(html, /Get started|composer-dock/);
  assert.match(page, /<AuthLandingStrip \/>/);
  assert.match(page, /className="composer-dock auth-action-dock"/);
  assert.match(page, /onClick=\{beginSignIn\}/);
  assert.match(page, /authPhoneInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("the Y2K collage uses Cosmos photos without floating text badges or retired assets", () => {
  assert.doesNotMatch(html, /landing-tape|landing-photo-note|landing-sticker-label|landing-link-sticker/);
  assert.doesNotMatch(html, /photo-booth|photo-picnic|photo-sea|sticker-film|sticker-sunglasses|poolside|afternoon/);
  for (const name of ["sky", "seaside", "double-exposure", "street", "ocean"]) {
    assert.match(html, new RegExp(`cosmos-${name}\\.webp`));
    const sources = readFileSync(new URL("../public/landing/SOURCES.md", import.meta.url), "utf8");
    assert.ok(sources.includes(`cosmos-${name}.webp`), "Every Cosmos photo has a source record");
  }
  for (const name of ["flipphone", "green-glasses", "ticket-admit"]) assert.match(html, new RegExp(`sticker-${name}\\.webp`));
});

test("landing content scrolls behind the status bar without a fixed top color layer", () => {
  const auth = page.slice(page.indexOf('if (authenticationRequired && authStatus !== "signed-in")'));
  assert.match(auth, /\{authStep !== "landing" \? \(\s*<div\s*className="top-safe-area-anchor"/);
  assert.match(auth, /style=\{\{ backgroundColor: DEFAULT_BACKGROUND \}\}/);
  assert.doesNotMatch(html, /top-safe-area-anchor/);
  assert.match(css, /\.auth-mode\.auth-landing-mode,[\s\S]*?overflow: visible;/);
  assert.match(source, /theme\?\.removeAttribute\("name"\)/);
  assert.match(source, /theme\?\.setAttribute\("name", themeName\)/);
  assert.match(page, /authStep === "landing" \? AUTH_LANDING_COLOR : DEFAULT_BACKGROUND/);
  assert.match(page, /landingIsVisible \|\| hasLeadingImage/);
  assert.match(css, /html\.leading-image-inset-active \.auth-landing\s*\{\s*translate: 0 var\(--leading-media-return-y, 0px\);/);
});
