import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the real Strip shell while the client checks sign-in", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Strip[^<]*<\/title>/i);
  assert.match(html, /<main class="app-shell route-loading-mode" aria-busy="true"><\/main>/);
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(html, /id="strip-theme-color" name="theme-color"/);
  assert.match(html, /<script type="module" src="\/_next\/static\/chunks\//);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("the loading shell gives way to the real landing and sign-in flow", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const loading = page.indexOf('className="app-shell route-loading-mode"');
  const signIn = page.indexOf('if (needsAuthUsername || (authenticationRequired && authStatus !== "signed-in"))');
  assert.ok(loading > 0 && signIn > loading);
  assert.match(page, /<AuthLandingStrip \/>/);
  assert.match(page, /startAuthStickerExit\(/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.doesNotMatch(page + layout, /SkeletonPreview|_sites-preview|codex-preview/);
});
