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
  assert.match(html, /This is what a Strip looks like\. A place to tell a story/);
  assert.match(html, /You decide who sees your Strip\.<br\/>One shareable link\./);
  assert.match(html, /This is a Strip\.<br\/>Now make yours\./);
  assert.doesNotMatch(html, /\u2014/);
});

test("the longer intro flows above the collage and both section labels are real headings", () => {
  assert.match(css, /\.landing-intro\s*\{[^}]*width: 100%;[^}]*max-width: none;/);
  assert.match(css, /\.landing-hero-stickers\s*\{[^}]*position: relative;[^}]*margin: 110px auto 0;/);
  assert.match(html, /<h2 class="landing-section-title"><span>01 \/<\/span> MAKE IT YOURS<\/h2>/);
  assert.match(html, /<h2 class="landing-section-title"><span>02 \/<\/span> PASS IT AROUND<\/h2>/);
  assert.match(css, /\.landing-block \.landing-section-title\s*\{[^}]*font-size: clamp\(24px, 5.2vw, 42px\)/);
  assert.match(html, /<p class="landing-make-headline">Your photos\.<br\/>Your words\.<br\/>Your world\.<\/p>/);
  assert.doesNotMatch(html, /For your<br\/>people\./);
  assert.match(css, /\.landing-play-hint\s*\{[^}]*right: -22%;[^}]*top: -114px;/);
  assert.match(css, /\.landing-hero-camera\s*\{[^}]*top: calc\(-17% - 16px\);/);
  assert.match(css, /\.landing-hero-spark\s*\{[^}]*top: calc\(-29% - 28px\);/);
});

test("photos are local, have stable dimensions and accessible or decorative alt text", () => {
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 18);
  assert.equal(new Set(images.map(img => img.match(/src="([^"]+)"/)[1])).size, 18, "Every photo and sticker is unique");
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

test("collage keeps complete alpha-cut stickers and a black CTA", () => {
  assert.equal((html.match(/<button[^>]*class="landing-cutout /g) || []).length, 12);
  assert.doesNotMatch(html, /clipPath|clip-path/);
  assert.doesNotMatch(html, /class="[^"]*\s(?:share-shell|hero-camera|make-cd)(?:\s|")/, "Sticker classes cannot inherit unrelated page layouts");
  assert.match(html, /sticker-camera\.webp/);
  assert.match(css, /\.landing-cutout img\s*\{[^}]*object-fit: contain; border: 0; box-shadow: none;/);
  assert.match(css, /\.landing-sticker-button\s*\{[^}]*pointer-events: auto;/);
  assert.match(css, /\.auth-step-landing \.auth-action-button\s*\{[^}]*background: #080808;/);
});

test("every object and doodle is selectable, while the four photos stay stationary", () => {
  const buttons = [...html.matchAll(/<button\b[^>]*data-landing-sticker[^>]*>/g)];
  assert.equal(buttons.length, 17);
  for (const [button] of buttons) {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-pressed="false"/);
    assert.match(button, /aria-label="Move .+ sticker"/);
    assert.doesNotMatch(button, /aria-hidden/);
  }
  assert.match(html, /alt="click a sticker to move it around"/);
  assert.match(html, /sticker-help-arrow\.png/);
  assert.match(html, /sticker-help-text\.png/);
  assert.doesNotMatch(source, /hasPlayed|is-dismissed/);
  assert.match(css, /\.landing-play-lettering \{[^}]*width: 120px;/);
  assert.match(css, /\.landing-play-arrow \{[^}]*overflow: visible;/);
  assert.match(source, /if \(!isSelected \|\| !event.isPrimary/);
  assert.match(source, /onPointerCancel=\{endDrag\} onLostPointerCapture=\{endDrag\}/);
  assert.match(css, /\.landing-sticker-button\s*\{[^}]*touch-action: pan-y;/);
  assert.match(css, /\.landing-sticker-button.is-selected\s*\{[^}]*touch-action: none;/);
});

test("white selection border follows the image alpha and rounds its edge, never a box", () => {
  assert.match(html, /filter id="landing-sticker-outline"/);
  assert.doesNotMatch(html, /feMorphology|feGaussianBlur/);
  assert.equal((html.match(/<feOffset /g) || []).length, 32);
  assert.match(html, /class="landing-shape-outline"[^>]*stroke-linejoin="round"/);
  assert.match(html, /feFlood flood-color="white"/);
  assert.match(css, /\.landing-cutout.is-selected \.landing-sticker-art,[\s\S]*?filter: url\(#landing-sticker-outline\)/);
  assert.match(css, /\.landing-doodle svg \{ overflow: visible; \}/);
  assert.match(css, /filter: drop-shadow\(0 5px 2px rgb\(0 0 0 \/ 38%\)\)/);
  assert.doesNotMatch(html, /landing-shape-shadow/);
  assert.match(css, /\.landing-sticker-button.is-selected,\s*\.landing-sticker-button:focus-visible\s*\{[^}]*drop-shadow\(0 5px 2px/);
  assert.match(css, /\.landing-sticker-button\s*\{[^}]*border: 0;[^}]*outline: none;/);
});

test("landing allows edge-to-edge movement while keeping an editor-sized handle visible", () => {
  const bounds = exports.landingStickerBounds({left: 100, right: 240, width: 140}, 402);
  assert.equal(bounds.minX + 240, 44);
  assert.equal(bounds.maxX + 100, 402 - 44);
  assert.ok(bounds.minX + 100 < 0);
  assert.ok(bounds.maxX + 240 > 402);
});

test("a page scroll does not clear the selected sticker", () => {
  assert.match(source, /onPointerCancel=\{\(\) => \{ backgroundTap.current = null;/);
  assert.match(source, /Math.hypot\(event.clientX - tap.x, event.clientY - tap.y\) < 8/);
  assert.match(source, /Math.abs\(window.scrollY - tap.scrollY\) < 8\) select\(null\)/);
  const leading = readFileSync(new URL("../app/lib/leading-media-top.ts", import.meta.url), "utf8");
  assert.match(leading, /\.landing-sticker-button.is-dragging/);
});

test("dragging stays under the finger on both rotated photo collages", () => {
  for (const degrees of [-6, 7, 0]) {
    const angle = degrees * Math.PI / 180;
    const delta = exports.landingStickerOffset(84, -52, angle);
    assert.ok(Math.abs(delta.x * Math.cos(angle) - delta.y * Math.sin(angle) - 84) < 0.00001);
    assert.ok(Math.abs(delta.x * Math.sin(angle) + delta.y * Math.cos(angle) + 52) < 0.00001);
  }
});

test("lower collages follow their copy instead of reserving a large fixed-height gap", () => {
  assert.match(css, /\.landing-make-collage\s*\{[^}]*position: relative;[^}]*margin: 38px auto 0;/);
  assert.doesNotMatch(css, /\.landing-make \.landing-content\s*\{[^}]*(?:390px|480px)/);
  assert.match(css, /\.landing-share-photo\s*\{[^}]*margin: 56px auto 78px;/);
});

test("only landing scrolls and the existing sign-in dock is outside its scroller", () => {
  assert.match(css, /\.auth-landing\s*\{[^}]*overflow: clip;/);
  assert.match(css, /\.auth-mode\.auth-landing-mode,[\s\S]*?height: auto;\s*overflow: visible;/);
  assert.match(css, /\.auth-shell\.auth-step-landing\s*\{\s*padding: 0;/);
  assert.match(css, /\.composer-dock\s*\{[^}]*position: fixed;/);
  assert.doesNotMatch(html, /Get started|composer-dock/);
  assert.match(page, /<AuthLandingStrip \/>/);
  assert.match(page, /className="composer-dock auth-action-dock"/);
  assert.match(page, /<HapticStartButton onStart=\{beginSignIn\}/);
  assert.match(page, /authPhoneInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("Get started has a generated cursor image without blocking taps or changing the sign-in form", () => {
  assert.ok(existsSync(new URL("../public/landing/sticker-cursor.webp", import.meta.url)));
  assert.match(css, /\.auth-step-landing \.auth-action-button::after\s*\{[^}]*sticker-cursor\.webp[^}]*pointer-events: none;/);
  assert.doesNotMatch(css, /\.auth-step-(?:phone|code)[^{]*::after/);
});

test("the Y2K collage uses Cosmos photos without floating text badges or retired assets", () => {
  assert.doesNotMatch(html, /landing-tape|landing-photo-note|landing-sticker-label|landing-link-sticker/);
  assert.doesNotMatch(html, /photo-booth|photo-picnic|photo-sea|sticker-film|sticker-sunglasses|poolside|afternoon/);
  for (const name of ["street", "ocean"]) {
    assert.match(html, new RegExp(`cosmos-${name}\\.webp`));
    const sources = readFileSync(new URL("../public/landing/SOURCES.md", import.meta.url), "utf8");
    assert.ok(sources.includes(`cosmos-${name}.webp`), "Every Cosmos photo has a source record");
  }
  for (const name of ["flipphone", "green-glasses", "ticket-admit"]) assert.match(html, new RegExp(`sticker-${name}\\.webp`));
  assert.match(html, /landing-cutout-green-glasses landing-hero-glasses/);
  assert.doesNotMatch(html, /sticker-goggles|landing-photo-glasses/);
});

test("each landing section has exactly one photo, surrounded only by object stickers", () => {
  const blocks = [...html.matchAll(/<(?:header|section) class="landing-block [\s\S]*?<\/(?:header|section)>/g)];
  assert.equal(blocks.length, 4);
  for (const [block] of blocks) {
    const photos = [...block.matchAll(/<img\b[^>]*src="\/landing\/(?!sticker-)[^"]+"[^>]*>/g)];
    assert.equal(photos.length, 1, "No section should show adjacent photo stickers");
  }
});

test("all collage stickers are anchored to a photo-sized wrapper, not the surrounding section", () => {
  for (const name of ["hero-stickers", "feature-photo", "make-collage", "share-photo"]) {
    assert.match(html, new RegExp(`class="landing-${name}"`));
    const rule = css.match(new RegExp(`\\.landing-${name} \\{([^}]+)\\}`))?.[1];
    assert.ok(rule && !/height:\s*\d+px/.test(rule), "Photo dimensions determine the sticker anchor");
  }
  assert.match(css, /\.landing-sticker-sky \{ width: 100%; aspect-ratio: 3 \/ 4; object-fit: cover; object-position: center; \}/);
  assert.match(html, /src="\/landing\/story-friends\.webp" width="900" height="1200"/);
  assert.doesNotMatch(html, /cosmos-sky\.webp/);
  assert.match(css, /\.landing-make-scrap-street \{ width: 100%; height: auto; \}/);
  assert.doesNotMatch(css, /\.landing-full-photo[^}]*object-fit:\s*cover/);
  assert.match(css, /\.landing-feature-photo \{ position: relative; width: 100%; \}/);
  assert.match(css, /\.landing-hero-stickers\s*\{[^}]*bottom: -50px;/);
  assert.match(css, /\.landing-make-collage\s*\{[^}]*bottom: -35px;/);
});

test("moving a sticker never raises its section or clips a neighboring collage", () => {
  assert.match(html, /class="landing-sticker-layer"/);
  assert.match(source, /createPortal\(sticker, layer\)/);
  assert.match(source, /observer\.observe\(layer\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(css, /\.landing-sticker-anchor\s*\{[^}]*visibility: hidden;[^}]*pointer-events: none;/);
  assert.match(css, /\.landing-sticker-layer\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 3;/);
  assert.doesNotMatch(css, /\.landing-block:has\(/);
});

test("the refreshed collage uses pack stickers and an unobstructed full-width photo", () => {
  assert.match(html, /class="landing-full-photo" src="\/landing\/story-night\.webp"[^>]*width="1280" height="768"/);
  assert.doesNotMatch(html, /cosmos-sunshade|striped beach umbrella/);
  assert.match(html, /sticker-pack\/nature\/white-daisy\.webp/);
  assert.doesNotMatch(html, /warm-sun|landing-photo-sun/);
  assert.match(css, /\.landing-photo-daisy\s*\{[^}]*width: clamp\(120px, 32%, 280px\);[^}]*right: 3%;[^}]*bottom: -46px;/);
  assert.match(css, /\.landing-hero-spark\s*\{[^}]*width: 42%;/);
  assert.doesNotMatch(html, /sticker-ball|sticker-daisy|meadow\.webp|landing-photo-caption|landing-photo-spark/);
  assert.match(css, /\.landing-hero-ring\s*\{[^}]*color: #ffbf38;/);
  assert.match(css, /\.landing-play-arrow\s*\{[^}]*transform: rotate\(30deg\)/);
  assert.match(css, /\.auth-step-landing \.auth-action-button\s*\{[^}]*box-shadow:/);
});

test("landing content scrolls behind the status bar without a fixed top color layer", () => {
  const auth = page.slice(page.indexOf('if (needsAuthUsername || (authenticationRequired && authStatus !== "signed-in"))'), page.indexOf('const isDraftLibrary ='));
  assert.doesNotMatch(auth, /top-safe-area-anchor/);
  assert.doesNotMatch(html, /top-safe-area-anchor/);
  assert.match(css, /\.auth-mode\.auth-landing-mode,[\s\S]*?overflow: visible;/);
  assert.match(source, /theme\?\.removeAttribute\("name"\)/);
  assert.match(source, /theme\?\.setAttribute\("name", themeName\)/);
  assert.match(css, /html:has\(\.auth-mode\) body\s*\{\s*background: #304dff !important;/);
  assert.match(page, /needsAuthUsername \|\| \(authenticationRequired && authStatus !== "signed-in"\)\s*\? AUTH_LANDING_COLOR/);
  assert.match(page, /landingIsVisible \|\| hasLeadingImage/);
  assert.match(css, /html\.leading-image-inset-active \.auth-landing\s*\{\s*translate: 0 var\(--leading-media-return-y, 0px\);/);
});
