import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { INSTAGRAM_STORY_CAMERA_URL, instagramStoryCameraUrl } from "../app/lib/instagram-story.ts";

test("iPhone and iPad handoffs target story creation, never a feed or invented photo identifier",()=>{
  for(const agent of ["Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)","Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)",""]) {
    const url=instagramStoryCameraUrl(agent);
    assert.equal(url,INSTAGRAM_STORY_CAMERA_URL);
    assert.equal(url,"instagram://story-camera");
    assert.doesNotMatch(url,/LocalIdentifier|library|AssetPath|blob:|file:/);
  }
});

const require = createRequire(import.meta.url);
function loadComponent(path, modules = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: name => modules[name] ?? require(name) });
  return exports;
}
const { InstagramStoryAction } = loadComponent("../app/components/InstagramStoryAction.tsx", {
  "@/app/lib/instagram-story": { instagramStoryCameraUrl },
});
const { StoryShareControls } = loadComponent("../app/components/StoryShareControls.tsx", {
  "@/app/components/InstagramStoryAction": { InstagramStoryAction },
});
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function controls(ready) {
  return renderToStaticMarkup(createElement(StoryShareControls, {
    instagramReady: ready, disabled: false, onBack() {}, onShare() {},
  }));
}
test("rendered tray exposes only Done and Share before save, only Instagram after save", () => {
  const before = controls(false), after = controls(true);
  assert.match(before, /data-instagram-ready="false"/);
  assert.equal((before.match(/inert=""/g) ?? []).length, 1);
  assert.equal((before.match(/aria-hidden="true"/g) ?? []).length, 3); // Hidden link, decorative icon and instructions.
  assert.match(after, /data-instagram-ready="true"/);
  assert.equal((after.match(/inert=""/g) ?? []).length, 2);
  assert.match(after, /<a[^>]*href="instagram:\/\/story-camera"[^>]*aria-hidden="false"/);
  assert.doesNotMatch(after, /<a[^>]*inert=""/);
  assert.match(after, /Add to Instagram Story/);
});
test("the morph preserves 48px buttons while expanding only the share tray for instructions", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.composer-dock \.story-share-controls\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.composer-dock \.story-share-controls\[data-instagram-ready="true"\]\s*\{[^}]*grid-template-columns: minmax\(0, 0fr\) minmax\(0, 1fr\);[^}]*gap: 0;/);
  assert.match(css, /\.story-share-primary > \.publish-flow-button\s*\{[^}]*height: 48px;/);
  assert.doesNotMatch(css.match(/\.composer-dock \.story-share-controls\s*\{[^}]*\}/)?.[0] ?? "", /padding|height|shadow|bottom|position/);
  assert.match(css, /@property --story-share-instruction-space\s*\{[^}]*syntax: "<length>";[^}]*initial-value: 0px;/);
  assert.match(css, /\.share-mode\[data-story-ready="true"\][^}]*--story-share-instruction-space: 28px/);
  assert.match(css, /\.share-dock \{ --dock-visible-height: calc\(64px \+ var\(--story-share-instruction-space\)\);/);
  assert.match(controls(true), /Select your saved poster and paste your link sticker\./);
  assert.doesNotMatch(controls(true), /<br\b/);
  assert.match(css, /\.story-share-instructions p \{[^}]*white-space: nowrap;/);
});
test("Android intent uses the same story target with a safe browser fallback",()=>{
  const url=instagramStoryCameraUrl("Mozilla/5.0 (Linux; Android 16) Chrome/154");
  assert.equal(url.split("#")[0],"intent://story-camera");
  assert.match(url,/scheme=instagram;package=com\.instagram\.android;/);
  const fallback=url.match(/S\.browser_fallback_url=([^;]+)/)?.[1];
  assert.equal(decodeURIComponent(fallback),"https://www.instagram.com/");
  assert(url.endsWith(";end"));
});
test("the handoff is a fresh user-tapped tray link, inactive before a completed save",()=>{
  const component=readFileSync(new URL("../app/components/InstagramStoryAction.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(component,/className="dock-icon-button publish-icon-button publish-flow-button share-story-button instagram-story-button"/);
  assert.match(component,/href=\{href\}/);
  assert.match(component,/inert=\{!active\}/);
  assert.match(component,/aria-hidden=\{!active\}/);
  assert.match(component,/<span>Add to Instagram Story<\/span>/);
  assert.match(component,/Choose your saved poster from the camera roll\./);
  assert.match(component,/typeof navigator === "undefined" \? "" : navigator\.userAgent/);
  assert.doesNotMatch(component,/window\.open|location\.(?:href|assign|replace)|setTimeout|LocalIdentifier/);
  assert.doesNotMatch(css,/prefers-reduced-motion/);
});

const { CopyStripLinkButton } = loadComponent("../app/components/CopyStripLinkButton.tsx");
test("copy button has idle, copying, copied and retry states without a separate save popup", () => {
  const render = copied => renderToStaticMarkup(createElement(CopyStripLinkButton, {copied, onCopy() {}}));
  assert.match(render(undefined), />Copy link<\/span>/);
  assert.doesNotMatch(render(undefined), /is-copied/);
  assert.match(render(null), /disabled=""/);
  assert.match(render(null), /Copying…/);
  assert.match(render(true), /share-link-button is-copied/);
  assert.match(render(true), /Link copied/);
  assert.doesNotMatch(render(true), /disabled=""|image saved|dismiss/i);
  assert.match(render(false), />Copy link<\/span>/);
  assert.doesNotMatch(render(false), /is-copied|Link copied/);
});
