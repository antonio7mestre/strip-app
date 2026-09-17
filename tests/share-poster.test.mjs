import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const generator = page.slice(page.indexOf("async function createInstagramStoryAsset("), page.indexOf("function sampleVisualBottomColor("));

test("share artwork is the original static 1080 by 1350 PNG poster", () => {
  assert.match(generator, /const storyWidth = 1080/);
  assert.match(generator, /const storyHeight = 1350/);
  assert.match(generator, /"image\/png"/);
  assert.match(generator, /context\.drawImage\(coverImage/);
  assert.match(generator, /storyPalette\(strip\)/);
  assert.match(generator, /drawCenteredStoryTitle\(/);
  assert.match(page, /\$\{filenameBase\}-share\.png/);
});

test("the share preview and export no longer use video or encoding", () => {
  const start = page.indexOf('if (view === "share" && openedPublishedStrip)');
  const share = page.slice(start, page.indexOf('if (view === "title-setup")', start));
  assert.match(share, /<img\s+className="story-asset-preview"/);
  assert.doesNotMatch(share, /<video|ShareFilm|Share video/);
  assert.doesNotMatch(page, /share-film|exportShareFilm|MediaRecorder/);
  assert.equal(pkg.dependencies.mediabunny, undefined);
  assert.match(css, /aspect-ratio: 4 \/ 5/);
});

test("Done and Share use the same shared sizing as Back and Publish", () => {
  assert.match(page, /<footer className="composer-dock share-dock publish-flow-dock">\s*<div className="dock-controls dock-controls-current dock-action-controls">/);
  assert.doesNotMatch(css, /\.share-dock \.dock-controls-current\s*\{/);
});
