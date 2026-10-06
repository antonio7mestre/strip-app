import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as rotation from "../app/lib/sticker-rotation.ts";
import * as sizing from "../app/lib/sticker-sizing.ts";
import * as origin from "../app/lib/sticker-origin.ts";
import * as ending from "../app/lib/strip-ending.ts";
import * as profile from "../app/lib/profile.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Request, Response, URL, Uint8Array, atob, btoa, require: name => {
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  } });
  return exports;
}

test("rotation preserves signed fractions and safely normalizes legacy or invalid transforms", () => {
  for (const value of [0, -179.5, -23.5, 17.25, 179.99]) {
    assert.equal(rotation.normalizeStickerRotation(value), value);
  }
  for (const [value, expected] of [[180, -180], [360, 0], [405.5, 45.5], [-405.5, -45.5]]) {
    assert.equal(rotation.normalizeStickerRotation(value), expected);
  }
  for (const value of [undefined, null, "23", {}, NaN, Infinity, -Infinity, -0]) {
    assert.equal(rotation.normalizeStickerRotation(value), 0);
  }
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE profiles (user_id TEXT, background TEXT, accent TEXT, font TEXT);
    CREATE TABLE drafts (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT,
      cover_block_id TEXT, content_json TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE strips (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT,
      cover_shape TEXT, cover_object_key TEXT, cover_alt TEXT, content_json TEXT, published_at INTEGER);
    INSERT INTO users VALUES ('owner-qa', 'tester');
    INSERT INTO profiles VALUES ('owner-qa', '#304DFF', '#FFFFFF', 'letter');
  `);
  const prepare = sql => {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { return db.prepare(sql).run(...args); },
    };
  };
  const media = new Map();
  const env = { DB: { prepare }, STRIP_MEDIA: {
    async put(key, body, metadata) { media.set(key, { body, ...metadata }); },
    async get(key) { return media.get(key) ?? null; },
    async delete(key) { media.delete(key); },
  } };
  const imports = {
    "cloudflare:workers": { env },
    "@/app/lib/sticker-origin": origin, "@/app/lib/sticker-rotation": rotation,
    "@/app/lib/sticker-sizing": sizing,
    "@/app/lib/strip-ending": ending, "@/app/lib/profile": profile,
    "@/app/server/auth": {
      isSameOrigin: () => true,
      requireAuthUser: async request => ({ user: { id: request.headers.get("x-owner") ?? "owner-qa", username: "tester" } }),
      getAuthUser: async () => null,
    },
    "@/app/server/media-security": compile("app/server/media-security.ts", {}),
    "@/app/server/view-history": { recordStripView: async () => {} },
  };
  return { db, api: path => compile(`app/api/${path}/route.ts`, imports) };
}
const context = id => ({ params: Promise.resolve({ id }) });
const request = (body, owner = "owner-qa") => new Request("https://strip.local/api/test", {
  method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-owner": owner },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const transforms = blocks => blocks.map(({ x, y, width, rotation }) => ({ x, y, width, rotation }));

test("real save, reload, publish, public reload, editable clone and republish preserve all sticker transforms", async () => {
  const f = fixture();
  try {
    const id = "rotation-strip-qa";
    const blocks = ["upload", "pack", "shape", "upload"].map((stickerOrigin, index) => ({
      id: `sticker-${index}`, type: "sticker", stickerOrigin,
      src: index === 3 ? "data:video/mp4;base64,AA==" : "data:image/png;base64,AA==",
      mediaType: index === 3 ? "video" : "image", alt: `Sticker ${index}`,
      x: 24 + index * 13, y: 180 + index * 225, width: [10, 92, 86.625, 8][index],
      rotation: [17.25, -23.5, 112, -178][index],
    }));
    const expected = transforms(blocks);
    const drafts = f.api("drafts"), draftRead = f.api("drafts/[id]");
    const publish = f.api("strips"), publicRead = f.api("strips/[id]");
    const clone = f.api("strips/[id]/draft");
    assert.equal((await drafts.POST(request({ id, blocks, title: "Rotated" }))).status, 200);
    const restored = (await (await draftRead.GET(request(), context(id))).json()).draft.blocks;
    assert.deepEqual(transforms(restored), expected);
    assert.equal((await draftRead.GET(request(undefined, "other-owner"), context(id))).status, 404);
    assert.equal((await drafts.POST(request({ id, blocks: restored }))).status, 200, "Existing media autosave retains angles");
    const cover = { kind: "color", color: "#304DFF", shape: "square" };
    assert.equal((await publish.POST(request({ id, draftId: id, cover, blocks: restored }))).status, 201);
    const published = (await (await publicRead.GET(request(), context(id))).json()).strip.blocks;
    assert.deepEqual(transforms(published), expected);
    assert.equal((await draftRead.DELETE(request(), context(id))).status, 204);
    assert.equal((await clone.POST(request({}), context(id))).status, 201);
    const edited = (await (await draftRead.GET(request(), context(id))).json()).draft.blocks;
    assert.deepEqual(transforms(edited), expected);
    assert.equal((await publish.POST(request({ id, draftId: id, cover, blocks: edited }))).status, 200);
    assert.deepEqual(transforms((await (await publicRead.GET(request(), context(id))).json()).strip.blocks), expected);

    // Fresh publish uploads do not depend on a preceding draft save.
    assert.equal((await publish.POST(request({ id: "rotation-direct-qa", cover, blocks }))).status, 201);
    assert.deepEqual(transforms((await (await publicRead.GET(request(), context("rotation-direct-qa"))).json()).strip.blocks), expected);
  } finally { f.db.close(); }
});

test("old content with no rotation reloads at zero rather than breaking either reader", async () => {
  const f = fixture();
  try {
    const block = { id: "sticker-old", type: "sticker", objectKey: "old", x: 50, y: 300, width: 32 };
    const json = ending.writeStripContent([block]);
    f.db.prepare("INSERT INTO drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-qa", "owner-qa", "Old", "color", "#304DFF", null, json, 1, 1);
    f.db.prepare("INSERT INTO strips VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-qa", "owner-qa", "Old", "color", "#304DFF", "square", null, null, json, 1);
    for (const [path, key] of [["drafts/[id]", "draft"], ["strips/[id]", "strip"]]) {
      const result = await (await f.api(path).GET(request(), context("legacy-qa"))).json();
      assert.equal(result[key].blocks[0].rotation, 0);
    }
  } finally { f.db.close(); }
});
