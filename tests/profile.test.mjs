import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { imageSize } from "image-size";
import * as profile from "../app/lib/profile.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, require: (name) => { if (!(name in imports)) throw new Error(name); return imports[name]; },
    Uint8Array, TextDecoder, atob, Response, Headers, crypto, console,
  });
  return exports;
}
const server = compile("app/server/profile.ts", { "image-size": { imageSize }, "@/app/lib/profile": profile });
const request = (body, origin = "http://localhost:3035") => new Request(`${origin}/api/profile`, {
  method: "PUT", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
});
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('one'), ('two');");
  db.exec(read("drizzle/0006_cool_stone_men.sql"));
  const objects = new Map();
  let user = "one";
  let failing = false;
  const env = {
    DB: { prepare(sql) { return { bind(...args) {
      return {
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => {
          if (failing) throw new Error("Database unavailable");
          return { meta: db.prepare(sql).run(...args) };
        },
      };
    } }; } },
    STRIP_MEDIA: {
      put: async (key, bytes) => objects.set(key, bytes),
      delete: async (key) => objects.delete(key),
    },
  };
  const routes = compile("app/api/profile/route.ts", {
    "cloudflare:workers": { env },
    "@/app/lib/profile": profile,
    "@/app/server/profile": server,
    "@/app/server/auth": {
      requireAuthUser: async () => user ? { user: { id: user } } : { response: new Response(null, { status: 401 }) },
      isSameOrigin: (req) => req.headers.get("Origin") === new URL(req.url).origin,
      consumeRateLimit: async () => true,
    },
  });
  return { ...routes, db, objects, asUser: (value) => { user = value; }, fail: () => { failing = true; } };
}

test("username is the default title, custom titles do not change usernames", () => {
  assert.equal(profile.DEFAULT_PROFILE.font, "letter");
  assert.ok(profile.PROFILE_FONTS.some(({ id, family }) => id === "letter" && family.includes("Arial Black")));
  assert.equal(profile.profileTitle(profile.DEFAULT_PROFILE, "antonio"), "antonio");
  assert.equal(profile.profileTitle({ title: "my little world" }, "antonio"), "my little world");
  assert.equal(profile.profileTitle({ title: "   " }, "antonio"), "antonio");
});
test("font, colors, title length and revision are validated", () => {
  assert.ok(profile.validateProfile(profile.DEFAULT_PROFILE));
  for (const bad of [null, [], { font: "url(evil)" }, { title: "a".repeat(61) }, { background: "red" }, { accent: "#fff;" }, { revision: -1 }, { revision: 1.1 }]) {
    assert.equal(profile.validateProfile(bad === null || Array.isArray(bad) ? bad : { ...profile.DEFAULT_PROFILE, ...bad }), null);
  }
  assert.equal(profile.profileInk("#000000"), "#FFFFFF");
  assert.equal(profile.profileInk("#FFFFFF"), "#000000");
  assert.equal(profile.profileInk("#3155FF"), "#FFFFFF");
  for (const { value } of profile.PROFILE_COLORS) {
    const luminance = (hex) => hex.slice(1).match(/.{2}/g).map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const values = [luminance(value), luminance(profile.profileInk(value))].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${value} has readable theme ink`);
  }
});
test("matching and near-matching covers get a contrasting edge without resizing", () => {
  for (const { value } of profile.PROFILE_COLORS) {
    assert.equal(profile.profileCoverOutline(value, value), profile.profileInk(value));
  }
  assert.equal(profile.profileCoverOutline("#fff", "#FFFFFF"), "#000000");
  assert.equal(profile.profileCoverOutline("#080808", "#000000"), "#FFFFFF");
  assert.equal(profile.profileCoverOutline("#f0f0f0", "#FFFFFF"), "#000000");
  for (const [cover, background] of [["#000000", "#FFFFFF"], ["#3155FF", "#FF8CCC"], ["bad", "#000000"], ["#fff", "invalid"]]) {
    assert.equal(profile.profileCoverOutline(cover, background), undefined);
  }
  const page = read("app/page.tsx");
  assert.match(page, /profileCoverOutline\(strip.cover.color, stripProfile.profile.background\)/);
  assert.match(page, /boxShadow: `inset 0 0 0 1px \$\{coverOutline\}`/);
});
test("profile settings persist and remain scoped to the authenticated owner", async () => {
  const api = fixture();
  const get = () => api.GET(new Request("http://localhost:3035/api/profile"));
  assert.deepEqual((await (await get()).json()).profile, profile.DEFAULT_PROFILE);
  const response = await api.PUT(request({ ...profile.DEFAULT_PROFILE, title: "My world", font: "serif", background: "#FF8CCC" }));
  assert.equal(response.status, 200);
  assert.equal((await (await get()).json()).profile.title, "My world");
  api.asUser("two");
  assert.deepEqual((await (await get()).json()).profile, profile.DEFAULT_PROFILE);
  api.asUser(null);
  assert.equal((await get()).status, 401);
  assert.equal((await api.PUT(request(profile.DEFAULT_PROFILE))).status, 401);
  api.db.close();
});
test("stale saves and cross-origin requests cannot overwrite a profile", async () => {
  const api = fixture();
  assert.equal((await api.PUT(request(profile.DEFAULT_PROFILE))).status, 200);
  assert.equal((await api.PUT(request({ ...profile.DEFAULT_PROFILE, title: "stale" }))).status, 409);
  const crossOrigin = request(profile.DEFAULT_PROFILE);
  crossOrigin.headers.set("Origin", "https://evil.example");
  assert.equal((await api.PUT(crossOrigin)).status, 403);
  assert.equal((await api.PUT(request({ ...profile.DEFAULT_PROFILE, revision: 1, title: "latest" }))).status, 200);
  api.db.close();
});
test("profile photos accept only bounded raster JPEGs and reject arbitrary URLs", async () => {
  for (const value of ["https://example.com/avatar.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,SGVsbG8=", "data:image/jpeg;base64," + "A".repeat(700000)]) {
    assert.equal(server.decodeProfilePhoto(value), null);
    const api = fixture();
    assert.equal((await api.PUT(request({ ...profile.DEFAULT_PROFILE, photo: value }))).status, 400);
    assert.equal(api.objects.size, 0);
    api.db.close();
  }
});
test("request size is bounded even without a Content-Length header", async () => {
  await assert.rejects(server.readProfileInput(request({ padding: "x".repeat(710000) })), /too large/);
});
test("a profile photo is stored, retained on design edits, removed, and cleaned up if saving fails", async () => {
  const photo = "data:image/jpeg;base64," + readFileSync(new URL("../public/apple-messages.jpg", import.meta.url)).toString("base64");
  assert.ok(server.decodeProfilePhoto(photo));
  const api = fixture();
  const upload = await api.PUT(request({ ...profile.DEFAULT_PROFILE, photo }));
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).profile.photoUrl, "/api/profile/photo?v=1");
  assert.equal(api.objects.size, 1);
  const key = [...api.objects.keys()][0];
  assert.ok(key.startsWith("profiles/one/"));
  const design = await api.PUT(request({ ...profile.DEFAULT_PROFILE, revision: 1, background: "#FF8CCC" }));
  assert.equal(design.status, 200);
  assert.equal(api.objects.size, 1);
  assert.equal([...api.objects.keys()][0], key);
  const remove = await api.PUT(request({ ...profile.DEFAULT_PROFILE, revision: 2, photo: null }));
  assert.equal((await remove.json()).profile.photoUrl, null);
  assert.equal(api.objects.size, 0);
  api.fail();
  assert.equal((await api.PUT(request({ ...profile.DEFAULT_PROFILE, revision: 3, photo }))).status, 503);
  assert.equal(api.objects.size, 0, "Failed saves do not leave orphan uploads");
  api.db.close();
});
test("failed saves are explicit and do not claim success", async () => {
  const api = fixture(); api.fail();
  assert.equal((await api.PUT(request(profile.DEFAULT_PROFILE))).status, 503);
  assert.equal(api.db.prepare("SELECT count(*) AS count FROM profiles").get().count, 0);
  api.db.close();
});
test("profile tools reuse the dock on the profile and preserve the main editor", () => {
  const page = read("app/page.tsx");
  assert.match(page, /composer-dock app-navigation-dock.*profile-editor-dock/);
  assert.match(page, /view === "library" && stripProfile.editing \? <ProfileTools/);
  assert.match(page, /<p className="profile-editor-hint">Tap element to edit<\/p>/);
  assert.match(page, /stripProfile.editing \|\| \(isDraft/);
  assert.match(page, /installKeyboardDockPosition/);
  const editor = read("app/components/ProfileEditor.tsx");
  assert.match(editor, /aria-label="Profile title"/);
  assert.match(editor, /<textarea ref=\{titleInput\}/);
  assert.doesNotMatch(editor, /new ResizeObserver\(/, "resizing the title must not loop on its own parent");
  assert.doesNotMatch(editor, /profile-photo-input/);
  assert.match(editor, /Discard profile changes\?/);
  assert.match(editor, /aria-label="Done choosing styles"/);
  assert.match(editor, /profile-save-button.*Save"/);
  assert.doesNotMatch(editor, /profile-tray-instruction/);
  assert.doesNotMatch(editor, /profile-save-button.*<Check/);
});

test("profile edit tools keep mobile swipes inside the dock", () => {
  const editor = read("app/components/ProfileEditor.tsx");
  const css = read("app/globals.css");
  assert.match(editor, /className="dock-icon-button profile-tool-icon"/, "profile actions use editor button feedback");
  assert.match(editor, /ref=\{selectorScrollRef\} className=\{`selector-scroll profile-selector-scroll/, "profile options use the editor's horizontal selector");
  assert.match(editor, /selectorScrollRef\.current\.scrollLeft = 0/, "switching profile tools returns to the first choice");
  assert.match(css, /html\.page-zoom-locked:has\(\.profile-editor-dock\)\s*\{ touch-action: pan-x pan-y; \}/);
  assert.match(css, /\.profile-mode\.is-profile-editing :is\(\.profile-editor-dock, \.profile-tools, \.profile-selector-row, \.profile-selector-scroll, \.profile-selector-row \*\)\s*\{ touch-action: pan-x; \}/);
  assert.match(css, /\.profile-mode\.is-profile-editing :is\(\.profile-tool-row, \.profile-tool-row \*, \.full-gradient-picker, \.full-gradient-picker \*\)\s*\{ touch-action: none; \}/);
  assert.match(css, /\.profile-selector-scroll\s*\{[^}]*overscroll-behavior: contain;/);
  assert.match(css, /\.profile-tools \.selector-scroll\.is-gradient-mode\s*\{[^}]*position: relative;[^}]*height: 48px;/);
  assert.match(editor, /pickerPointerIdRef\.current = event\.pointerId/);
  assert.match(editor, /addEventListener\("touchmove", preventPickerTouchScroll, \{ capture: true, passive: false \}\)/);
  assert.match(editor, /removeEventListener\("touchmove", preventPickerTouchScroll, true\)/);
  assert.match(editor, /activePosition\.saturation > 0 \? activePosition\.hue : wheelHue/, "gray swatches retain the last selected wheel hue");
});
