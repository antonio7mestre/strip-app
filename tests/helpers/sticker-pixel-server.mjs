// Isolated visual QA: real save/publish handlers, in-memory DB/media only.
// No test request can mutate the normal local database or production.
import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../..");
const db = new DatabaseSync(":memory:");
db.exec(`
 CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
 CREATE TABLE profiles (user_id TEXT, background TEXT, accent TEXT, font TEXT);
 CREATE TABLE drafts (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT,
   cover_block_id TEXT, content_json TEXT, created_at INTEGER, updated_at INTEGER);
 CREATE TABLE strips (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, cover_kind TEXT, cover_color TEXT,
   cover_shape TEXT, cover_object_key TEXT, cover_alt TEXT, content_json TEXT, published_at INTEGER);
 INSERT INTO users VALUES ('pixel-owner', 'pixel-test');
 INSERT INTO profiles VALUES ('pixel-owner', '#304DFF', '#FFFFFF', 'letter');
`);
const media = new Map();
const env = {
 DB: { prepare(sql) { let args = []; return {
   bind(...values) { args = values; return this; },
   async first() { return db.prepare(sql).get(...args) ?? null; },
   async all() { return { results: db.prepare(sql).all(...args) }; },
   async run() { return db.prepare(sql).run(...args); },
 }; } },
 STRIP_MEDIA: {
   async put(key, body, metadata) { media.set(key, { body, ...metadata }); },
   async get(key) { return media.get(key) ?? null; },
   async delete(key) { media.delete(key); },
 },
};
const user = { id: "pixel-owner", username: "pixel-test", phoneLabel: "Isolated test" };
const modules = new Map();
function compile(path) {
 const full = resolve(root, path);
 if (modules.has(full)) return modules.get(full);
 const exports = {}; modules.set(full, exports);
 runInNewContext(ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: {
   module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
 } }).outputText, { exports, Request, Response, URL, Uint8Array, atob, btoa,
   require(name) {
     if (name === "cloudflare:workers") return { env };
     if (name === "@/app/server/auth") return { isSameOrigin: () => true,
       requireAuthUser: async () => ({ user }), getAuthUser: async () => user };
     if (name === "@/app/server/view-history") return { recordStripView: async () => {} };
     if (name.startsWith("@/")) return compile(name.slice(2) + ".ts");
     if (name.startsWith(".")) return compile(resolve(dirname(full), name + ".ts"));
     throw new Error(`Unmocked dependency: ${name}`);
   },
 });
 return exports;
}
const api = path => compile(`app/api/${path}/route.ts`);
const request = (path, body) => new Request(`http://localhost:3039/api/${path}`, {
 method: body ? "POST" : "GET", headers: { "content-type": "application/json" },
 ...(body ? { body: JSON.stringify(body) } : {}),
});
const context = id => ({ params: Promise.resolve({ id }) });
const asset = path => `data:image/webp;base64,${readFileSync(resolve(root, "public", path)).toString("base64")}`;
const photo = asset("landing/photo-picnic.webp");
const ocean = asset("landing/cosmos-ocean.webp");
const frame = asset("sticker-pack/scrap/cobalt-frame.webp");
const flower = asset("sticker-pack/random/checkered-flower.webp");
for (const kind of ["photo", "text", "crop"]) {
 const id = `pixel-${kind}-strip`;
 const words = { id: "pixel-words", type: "text", content: "Placement stays exactly here.\nSame image, same sticker.",
   fontStyle: "letter", fontSize: 32, textColor: "#FFFFFF", backgroundColor: "#304DFF" };
 const image = { id: "pixel-photo", type: "image", src: photo, alt: "Picnic", height: 600,
   ...(kind === "crop" ? { cropTop: 60.5, cropBottom: 90.25 } : {}) };
 const blocks = [ ...(kind === "text" ? [words, image] : [image, words]),
   { id: "pixel-ocean", type: "image", src: ocean, alt: "Ocean" },
   { id: "pixel-frame", type: "sticker", src: frame, alt: "Rotated frame", stickerOrigin: "pack",
     x: 51.125, y: 260.5, width: 86.625, rotation: 17.25 },
   { id: "pixel-flower", type: "sticker", src: flower, alt: "Resized flower", stickerOrigin: "upload",
     x: 28.375, y: 715.25, width: 25.375, rotation: -43.5 },
   { id: "pixel-label", type: "sticker", src: frame, alt: "Rotated text", stickerOrigin: "text",
     textSticker: { content: "Pixel perfect\nEvery time", fontStyle: "shrikhand", fontSize: 35,
       textColor: "#FFFFFF", textAlign: "center", backgroundColor: "#FF0066" },
     x: 61.125, y: 920.5, width: 52.5, rotation: -17.75 },
 ];
 const saved = await api("drafts").POST(request("drafts", { id, blocks, title: `Pixel ${kind}` }));
 if (!saved.ok) throw new Error(await saved.text());
 const restored = (await (await api("drafts/[id]").GET(request(`drafts/${id}`), context(id))).json()).draft;
 const published = await api("strips").POST(request("strips", { id, draftId: id,
   blocks: restored.blocks, title: `Pixel ${kind}`, cover: { kind: "color", color: "#304DFF", shape: "square" } }));
 if (!published.ok) throw new Error(await published.text());
}
http.createServer(async (req, res) => {
 try {
   const url = new URL(req.url, "http://localhost:3039");
   if (url.pathname.startsWith("/__qa/publish/") && req.method === "POST") {
     const id = url.pathname.split("/").at(-1);
     const data = await (await api("drafts/[id]").GET(request(`drafts/${id}`), context(id))).json();
     const response = await api("strips").POST(request("strips", { id, draftId: id,
       title: data.draft.title, blocks: data.draft.blocks,
       cover: { kind: "color", color: "#304DFF", shape: "square" } }));
     res.writeHead(response.status, { "content-type": "application/json" }); res.end(await response.text()); return;
   }
   if (url.pathname.startsWith("/api/")) {
     let body = ""; for await (const chunk of req) body += chunk;
     const input = new Request(url, { method: req.method, headers: { "content-type": "application/json" },
       ...(body ? { body } : {}) });
     const path = url.pathname.slice(5);
     const parts = path.split("/");
     let response;
     if (parts[2] === "media" || parts[2] === "cover") {
       const key = parts[2] === "cover" ? `${parts[0]}/${user.id}/${parts[1]}/cover.webp`
         : `${parts[0]}/${user.id}/${parts[1]}/media/${parts[3]}`;
       const item = media.get(key);
       response = item ? new Response(item.body, { headers: { "content-type": item.httpMetadata.contentType } })
         : new Response("Missing test media", { status: 404 });
     } else if (path === "auth/session") response = Response.json({ user });
     else if (path === "profile") response = Response.json({ profile: { title: "Pixel test", background: "#304DFF", accent: "#FFFFFF", font: "letter", revision: 1 } });
     else if (path === "history") response = Response.json({ history: [] });
     else if (["strips", "drafts"].includes(parts[0])) {
       const route = parts.length > 1 ? `${parts[0]}/[id]${parts[2] ? `/${parts[2]}` : ""}` : parts[0];
       response = await api(route)[req.method](input, context(parts[1]));
     } else response = new Response("Unknown test endpoint", { status: 404 });
     res.writeHead(response.status, { ...Object.fromEntries(response.headers), "cache-control": "no-store" });
     res.end(Buffer.from(await response.arrayBuffer())); return;
   }
   if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return; }
   const upstream = await fetch(new URL(req.url, "http://localhost:3036"), { headers: {
     accept: req.headers.accept ?? "*/*", "sec-fetch-dest": req.headers["sec-fetch-dest"] ?? "",
   } });
   const headers = Object.fromEntries(upstream.headers);
   delete headers["content-encoding"]; delete headers["content-length"]; delete headers["set-cookie"];
   res.writeHead(upstream.status, headers); res.end(Buffer.from(await upstream.arrayBuffer()));
 } catch (error) { console.error(error); res.writeHead(500); res.end(String(error)); }
}).listen(3039, "127.0.0.1", () => console.log("Pixel audit: http://localhost:3039/edit/pixel-photo-strip"));
