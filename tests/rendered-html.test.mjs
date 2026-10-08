import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerHooks } from "node:module";

// The built root now resolves its public canvas in the Worker. Supply only
// read-only D1 presentation fixtures when running that Worker in plain Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: specifier, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "cloudflare:workers") return { format: "module", shortCircuit: true,
      source: `export const env = { DB: { prepare() { return { bind() { return { first: async () => ({
        id: "test-public-strip", title: "A test Strip", cover_kind: "color", cover_color: "#3155FF",
        cover_shape: "square", published_at: 1, username: "test-author", background: "#FF8CCC"
      }) }; } }; } } };` };
    return nextLoad(url, context);
  },
});

async function render(url = "http://localhost/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(url, { headers: { accept: "text/html", host: new URL(url).host } }),
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
  assert.match(html, /<main class="app-shell route-loading-mode profile-reload" aria-busy="true" aria-label="Loading profile"><\/main>/);
  assert.match(html, /profile-reload-pending/);
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(html, /id="strip-theme-color" name="theme-color"/);
  assert.match(html, /<script type="module" src="\/_next\/static\/chunks\//);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("cold public profile and Strip HTML already color the page and both safe areas", async () => {
  for (const url of ["https://test-author.striiip.com/", "https://test-author.striiip.com/test-public-strip", "https://striiip.com/strip/test-public-strip"]) {
    const response = await render(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.match(html, /<html[^>]*data-initial-background="#FF8CCC"[^>]*class="profile-reload-pending"/);
    for (const variable of ["background-color", "--profile-reload-background", "--top-safe-area-color", "--bottom-safe-area-color"]) {
      assert.ok(html.includes(`${variable}:#FF8CCC`), `${url}: ${variable}`);
    }
    assert.match(html, /id="strip-theme-color" name="theme-color" content="#FF8CCC"/);
  }
});

test("the loading shell gives way to the real landing and sign-in flow", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const loading = page.indexOf('return <ProfileReload ');
  const signIn = page.indexOf('if (needsAuthUsername || (authenticationRequired && authStatus !== "signed-in"))');
  assert.ok(loading > 0 && signIn > loading);
  assert.match(page, /<AuthLandingStrip \/>/);
  assert.match(page, /startAuthStickerExit\(/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.doesNotMatch(page + layout, /SkeletonPreview|_sites-preview|codex-preview/);
});
