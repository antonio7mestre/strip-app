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

test("the default title capitalizes the username's first letter, without changing handles or custom titles", () => {
  assert.equal(profile.DEFAULT_PROFILE.font, "letter");
  assert.ok(profile.PROFILE_FONTS.some(({ id, family }) => id === "letter" && family.includes("Arial Black")));
  assert.equal(profile.profileTitle(profile.DEFAULT_PROFILE, "antonio"), "Antonio");
  assert.equal(profile.profileTitle({ title: "my little world" }, "antonio"), "my little world");
  assert.equal(profile.profileTitle({ title: "   " }, "antonio"), "Antonio");
  assert.equal(profile.profileTitle(profile.DEFAULT_PROFILE, "softweekend-demo"), "Softweekend-demo");
  assert.equal(profile.profileTitle(profile.DEFAULT_PROFILE, "1antonio"), "1antonio");
  assert.equal(profile.profileTitle(profile.DEFAULT_PROFILE, null), "Your profile");
  assert.equal(profile.DEFAULT_PROFILE.title, "", "the display default is not persisted as a custom title");
  const editor = read("app/components/ProfileEditor.tsx");
  assert.match(editor, /data-placeholder=\{profileTitle\(\{ title: "" \}, username\)\}/);
  assert.match(editor, /className="profile-handle">@\{username\}/, "handles retain the exact username");
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
  assert.match(page, /profileCoverOutline\(strip.cover.color, visibleProfile.background\)/);
  assert.match(page, /boxShadow: `inset 0 0 0 1px \$\{coverOutline\}`/);
});
test("profile settings persist and remain scoped to the authenticated owner", async () => {
  const api = fixture();
  const get = () => api.GET(new Request("http://localhost:3035/api/profile"));
  assert.deepEqual((await (await get()).json()).profile, profile.DEFAULT_PROFILE);
  const response = await api.PUT(request({ ...profile.DEFAULT_PROFILE, title: "My world", font: "serif", background: "#FF8CCC", accent: "#000000" }));
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
test("every selected and legacy font survives a profile save and reload", async () => {
  const api = fixture();
  try {
    for (const [revision, { id: font }] of profile.PROFILE_FONT_CATALOG.entries()) {
      const saved = await api.PUT(request({ ...profile.DEFAULT_PROFILE, font, revision }));
      assert.equal(saved.status, 200, font);
      assert.equal((await saved.json()).profile.font, font);
      const reloaded = await api.GET(new Request("http://localhost:3035/api/profile"));
      assert.equal((await reloaded.json()).profile.font, font);
    }
  } finally { api.db.close(); }
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
  const design = await api.PUT(request({ ...profile.DEFAULT_PROFILE, revision: 1, background: "#FF8CCC", accent: "#000000" }));
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
  assert.doesNotMatch(page, /profile-editor-hint|Tap title to edit/);
  assert.match(page, /feedback=\{stripProfile.editing\}/);
  assert.match(page, /if \(stripProfile.editing\) \{\s*stripProfile.showError\("Save changes to access Strips"\);\s*return;/);
  assert.match(page, /installKeyboardDockPosition/);
  const editor = read("app/components/ProfileEditor.tsx");
  assert.match(editor, /aria-label=\{editing \? "Profile title" : undefined\}/);
  assert.match(editor, /<h1 ref=\{titleInput\}/);
  assert.match(editor, /contentEditable=\{editing && !pending \? "plaintext-only" : false\}/);
  assert.doesNotMatch(editor, /<textarea|style.height|scrollHeight/, "one unclipped title stays in flow across editing");
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
  assert.match(css, /\.profile-tools\.is-gradient-picker\s*\{ position: static; animation: none; \}/);
  assert.doesNotMatch(css, /\.profile-tools \.selector-scroll\.is-gradient-mode\s*\{|\.profile-selector-scroll \.full-gradient-picker\s*\{/);
  assert.match(editor, /return installPageColorDrag\(/);
  assert.match(editor, /onSample: \(x, y\) => samplePointRef\.current\(x, y\)/);
  assert.match(editor, /samplePointRef\.current = updatePickerPoint/);
  for (const source of [editor, read("app/page.tsx")]) assert.match(source, /<GradientColorPicker/, "both pickers share one gesture and rendering implementation");
  assert.match(read("app/components/GradientColorPicker.tsx"), /decoded.saturation > 0 \? decoded.hue : lastHue/, "gray swatches retain the last selected wheel hue");
});

test("background changes only auto-flip pure black or white text", () => {
  for (const accent of ["#000000", "#FFFFFF", "#ffffff"]) {
    for (const { value: background } of profile.PROFILE_COLORS) {
      const next = profile.applyProfileChanges({ ...profile.DEFAULT_PROFILE, accent }, { background });
      assert.equal(next.accent, profile.profileInk(background));
      assert.ok(profile.profileColorsReadable(next));
    }
  }
  for (const accent of ["#3155FF", "#FFFFFE", "#000001", "#FF8CCC"]) {
    assert.equal(profile.applyProfileChanges({ ...profile.DEFAULT_PROFILE, accent }, { background: "#FFFFFF" }).accent, accent);
  }
  assert.equal(profile.applyProfileChanges(profile.DEFAULT_PROFILE, { background: "#FFFFFF", accent: "#FF8CCC" }).accent, "#FF8CCC");
  assert.equal(profile.applyProfileChanges(profile.DEFAULT_PROFILE, { title: "hello" }).accent, "#FFFFFF");
});

test("readability allows softer themes at 3:1 but still rejects low-contrast combinations", () => {
  assert.equal(profile.profileContrast("#000000", "#FFFFFF"), 21);
  assert.equal(profile.PROFILE_MIN_TEXT_CONTRAST, 3);
  assert.equal(profile.profileColorsReadable({ background: "#FFFFFF", accent: "#777777" }), true);
  assert.equal(profile.profileColorsReadable({ background: "#FFFFFF", accent: "#949494" }), true);
  assert.equal(profile.profileColorsReadable({ background: "#FFFFFF", accent: "#959595" }), false);
  const orange = { background: "#FFFFFF", accent: "#FF4D00" };
  assert(profile.profileContrast(orange.background, orange.accent) < 4.5);
  assert.equal(profile.profileColorsReadable(orange), true);
  assert.equal(profile.profileTextColor(orange), orange.accent, "accepted colors must not flip after Save");
  assert.equal(profile.profileTextColor(orange, true), orange.accent);
  assert.equal(profile.profileColorsReadable({ background: "#FFFFFF", accent: "#3155FF" }), true);
  assert.equal(profile.profileColorsReadable({ background: "#3155FF", accent: "#3155FF" }), false);
  assert.ok(profile.profileColorsReadable(profile.DEFAULT_PROFILE));
});

test("server saves newly allowed 3:1 color combinations unchanged", async () => {
  const api = fixture();
  const softer = { ...profile.DEFAULT_PROFILE, background: "#FFFFFF", accent: "#FF4D00" };
  const result = await api.PUT(request(softer));
  assert.equal(result.status, 200);
  const saved = (await result.json()).profile;
  assert.equal(saved.background, softer.background);
  assert.equal(saved.accent, softer.accent);
  api.db.close();
});

test("unreadable combinations can be previewed but Save rejects them without writing", async () => {
  const api = fixture();
  const bad = { ...profile.DEFAULT_PROFILE, background: "#FFFFFF", accent: "#FF8CCC" };
  assert.ok(profile.validateProfile(bad), "color controls permit any valid hex combination");
  const result = await api.PUT(request(bad));
  assert.equal(result.status, 400);
  assert.equal((await result.json()).error, "Change colors so text is more readable");
  assert.equal(api.db.prepare("SELECT count(*) AS count FROM profiles").get().count, 0);
  assert.equal(api.objects.size, 0);
  assert.equal((await api.PUT(request({ ...bad, accent: "#3155FF" }))).status, 200);
  const saved = api.db.prepare("SELECT * FROM profiles").get();
  assert.equal((await api.PUT(request({ ...bad, revision: 1 }))).status, 400);
  assert.deepEqual(api.db.prepare("SELECT * FROM profiles").get(), saved);
  api.db.close();
  const hook = read("app/components/useStripProfile.ts");
  assert.match(hook, /if \(!profileColorsReadable\(draft\)\) \{ showError\(PROFILE_COLOR_ERROR\); return; \}/);
  assert.match(hook, /const showError = \(message: string\) => \{\s*setErrorRepeated\(error === message\);\s*setError\(message\); setErrorRevision\(value => value \+ 1\);/);
  assert.ok(hook.indexOf("!profileColorsReadable(draft)") < hook.indexOf('method: "PUT"'));
  const editor = read("app/components/ProfileEditor.tsx");
  assert.match(editor, /feedback=\{!profileColorsReadable\(profile\)\}/, "only unreadable saves arm tap feedback");
  assert.match(editor, /aria-label="Done choosing styles" onClick=\{leaveTool\}/, "checkmark still previews without validating");
  assert.match(editor, /createPortal\(<p className=\{`notice profile-save-notice\$\{controller.errorRepeated \? " is-repeated" : ""\}`\} role="alert"/);
  assert.match(editor, /"--profile-ink": profileTextColor\(profile, controller.editing\)/);
  assert.match(editor, /aria-label="Text color"[^\n]*<Baseline/);
});

test("editing preserves header and content geometry with readable, independent controls", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.profile-title-input:focus \{ outline: none; \}/);
  assert.match(css, /\.profile-title-input \{[^}]*overflow: visible;/);
  assert.match(css, /\.profile-header\.is-editing \.profile-edit-button,\s*\.is-profile-editing \.profile-empty-state button \{ visibility: hidden; \}/);
  assert.doesNotMatch(css, /\.is-profile-editing \.library-grid\s*\{/);
  assert.match(css, /\.profile-save-notice\.notice \{[^}]*color: #fff;[^}]*\+ 8px\)/);
  assert.match(css, /\.profile-mode \.library-add-button \{ background: #fff; color: #000; \}/);
  assert.match(css, /\.profile-mode \.library-add-button svg \{ color: #000; \}/);
});

test("the title hint replaces Edit profile without moving the username divider", () => {
  const editor = read("app/components/ProfileEditor.tsx");
  const css = read("app/globals.css");
  assert.match(editor, /username && !publicProfile \? <span className="profile-meta-divider"/);
  assert.match(editor, /<span className="profile-edit-action">[\s\S]*?className="profile-edit-button"[\s\S]*?className="profile-edit-hint"/);
  assert.match(editor, /className="profile-edit-hint" id="profile-title-edit-hint" aria-hidden=\{!editing\}/);
  assert.match(editor, /<ChevronUp aria-hidden="true" \/>Tap title to edit/);
  assert.match(editor, /aria-describedby=\{editing \? "profile-title-edit-hint" : undefined\}/);
  assert.match(css, /\.profile-edit-action \{ display: grid; flex: 0 0 auto; \}/);
  assert.match(css, /\.profile-edit-button,\s*\.profile-edit-hint \{\s*grid-area: 1 \/ 1;/);
  assert.match(css, /\.profile-header\.is-editing \.profile-edit-hint \{ visibility: visible; \}/);
  assert.doesNotMatch(css, /\.profile-editor-hint|\.is-editing[^{}]*profile-meta-divider/);
});

test("library page descriptions reuse the profile username treatment", () => {
  const page = read("app/page.tsx");
  const header = page.slice(page.indexOf('<header className="library-header">'), page.indexOf('</header>}', page.indexOf('<header className="library-header">')));
  assert.match(header, /className="profile-name"/);
  assert.match(header, /<\/h1>\s*<div className="profile-meta-row">\s*<p className="profile-handle">/);
  assert.match(header, /isSettings\s*\? "Your account and app details\."\s*: isDraftLibrary\s*\? "Pick up where you left off\."\s*: "Revisit the Strips you’ve opened\."/);
});

test("legacy button accents stay readable outside editing without changing their saved color", () => {
  const legacy = { background: "#000000", accent: "#242424" };
  assert.equal(profile.profileTextColor(legacy), "#FFFFFF");
  assert.equal(profile.profileTextColor(legacy, true), "#242424");
  assert.equal(legacy.accent, "#242424");
  const readable = { background: "#FFFFFF", accent: "#3155FF" };
  assert.equal(profile.profileTextColor(readable), "#3155FF");
  assert.equal(profile.profileTextColor(readable, true), "#3155FF");
});
