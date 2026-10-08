import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as profile from "../app/lib/profile.ts";
import * as origin from "../app/lib/sticker-origin.ts";
import * as rotation from "../app/lib/sticker-rotation.ts";
import * as sizing from "../app/lib/sticker-sizing.ts";
import * as ending from "../app/lib/strip-ending.ts";
import { posterPalette } from "../app/lib/share-posters.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(source, globals) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Response, URL, Uint8Array, atob, ...globals });
  return exports;
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE profiles (user_id TEXT, background TEXT, accent TEXT, font TEXT);
    CREATE TABLE strips (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT,
      cover_shape TEXT, cover_object_key TEXT, cover_alt TEXT, content_json TEXT, published_at INTEGER);
    INSERT INTO users VALUES ('author', 'antonio'), ('viewer', 'friend');
    INSERT INTO profiles VALUES ('author', '#8ACE00', '#001CB5', 'rounded');
    INSERT INTO profiles VALUES ('viewer', '#FFFFFF', '#000000', 'serif');
  `);
  const env = { DB: { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { return db.prepare(sql).run(...args); },
    };
  } }, STRIP_MEDIA: { async delete() {} } };
  const imports = {
    "cloudflare:workers": { env }, "@/app/lib/profile": profile,
    "@/app/lib/sticker-origin": origin, "@/app/lib/sticker-rotation": rotation,
    "@/app/lib/sticker-sizing": sizing, "@/app/lib/strip-ending": ending,
    "@/app/server/auth": { isSameOrigin: () => true,
      requireAuthUser: async () => ({ user: { id: "author", username: "antonio" } }),
      getAuthUser: async () => ({ id: "viewer", username: "friend" }),
    },
    "@/app/server/media-security": { isAllowedStoredMediaContentType: () => true },
    "@/app/server/view-history": { recordStripView: async () => {} },
  };
  const api = path => compile(read(path), { require: name => {
    assert(name in imports, name); return imports[name];
  } });
  return { db, publish: api("app/api/strips/route.ts").POST, reload: api("app/api/strips/[id]/route.ts").GET };
}
const blocks = [{ id: "blue-block-qa", type: "text", content: "Siblings", height: 98,
  backgroundColor: "#304DFF", textColor: "#FFFFFF", fontStyle: "rounded", fontSize: 27 }];
const request = new Request("https://antonio.striiip.com/api/strips", {
  method: "POST", body: JSON.stringify({ id: "poster-theme-qa", title: "Siblings",
    cover: { kind: "color", color: "#304DFF", shape: "square" }, blocks }),
});
const theme = strip => ({ profileBackground: strip.profileBackground,
  profileTextColor: strip.profileTextColor, profileFont: strip.profileFont });

test("fresh publish returns exactly the author's reload theme, not the viewer or blue content block", async () => {
  const f = fixture();
  try {
    const response = await f.publish(request.clone());
    assert.equal(response.status, 201);
    const fresh = (await response.json()).strip;
    const reloadResponse = await f.reload(new Request("https://strip.local/api/test"),
      { params: Promise.resolve({ id: fresh.id }) });
    const reloaded = (await reloadResponse.json()).strip;
    assert.deepEqual(theme(fresh), { profileBackground: "#8ACE00", profileTextColor: "#001CB5", profileFont: "rounded" });
    assert.deepEqual(theme(fresh), theme(reloaded));
    assert.equal(reloaded.viewerIsOwner, false);
    assert.deepEqual(posterPalette({ ...fresh, blocks }).slice(0, 2), ["#8ACE00", "#001CB5"]);
    assert.equal((await f.publish(request.clone())).status, 200, "republish uses the same response contract");
  } finally { f.db.close(); }
});

test("missing or legacy invalid profile values share the same safe defaults in publish and reload", () => {
  for (const value of [null, {}, { background: "transparent", accent: "red", font: "unknown" }]) {
    assert.deepEqual(profile.publishedProfileTheme(value), {
      profileBackground: "#000000", profileTextColor: "#FFFFFF", profileFont: "letter",
    });
  }
  assert.equal(profile.publishedProfileTheme({ background: "#FFFFFF", accent: "#FFFFFF" }).profileTextColor, "#000000");
});

test("the real post-publish page handler preserves the returned theme before entering Share", async () => {
  const f = fixture();
  try {
    const page = read("app/page.tsx"), tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const find = node => ts.isVariableDeclaration(node) && node.name.getText(tree) === "publish"
      ? node : ts.forEachChild(node, find);
    const handler = find(tree), state = {}, events = [];
    assert(handler);
    const setters = Object.fromEntries([...handler.getText(tree).matchAll(/\bset([A-Z]\w*)\(/g)].map(([, name]) =>
      [`set${name}`, value => { state[name] = value; }]));
    const { publish } = compile(`export const ${handler.getText(tree)};`, {
      ...setters, hasContent: true, view: "title-setup", publishSetupHasCover: true,
      coverChoices: [{ key: "cover", kind: "color", color: "#304DFF" }], selectedCover: "cover",
      libraryOwnerId: "author", publishing: false, pageTransitionInFlightRef: { current: false },
      coverColorShape: "square", editingPublishedStripId: null, makeId: () => "poster-theme-qa",
      currentDraftId: null, stripTitle: "Siblings", blocks, endingStyle: ending.DEFAULT_STRIP_ENDING_STYLE,
      DEFAULT_STRIP_ENDING_STYLE: ending.DEFAULT_STRIP_ENDING_STYLE,
      prepareStickerUploads: async value => value,
      fetch: async (_url, options) => f.publish(new Request(request.url, options)),
      setBrowserPath: value => events.push(value),
      transitionToView: async value => { events.push(value); assert.equal(state.OpenedPublishedStrip.profileBackground, "#8ACE00"); },
    });
    await publish();
    assert.deepEqual(theme(state.OpenedPublishedStrip), { profileBackground: "#8ACE00", profileTextColor: "#001CB5", profileFont: "rounded" });
    assert.equal(state.OpenedPublishedStrip.blocks, blocks);
    assert.equal(state.OpenedPublishedStrip.viewerIsOwner, true);
    assert.deepEqual(events, ["/share/poster-theme-qa", "share"]);
    assert.equal(state.Notice, undefined);
  } finally { f.db.close(); }
});
