import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/profile-reload.ts", import.meta.url), "utf8");
function fixture() {
  const items = new Map();
  const localStorage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, localStorage });
  return { ...exports, localStorage, items };
}
const layout = { width: 393, height: 1500, frames: [
  { x: 12, y: 121.5, width: 178.5, height: 240.25, coverId: "one" },
  { x: 202.5, y: 121.5, width: 178.5, height: 113.5, coverId: "two" },
] };

test("reload skeletons preserve exact measured positions, aspect ratios and count for each page", () => {
  const f = fixture();
  for (const path of ["/", "/drafts", "/history", "/settings"]) {
    f.saveProfileLayout("user-one", "#3155FF", path, layout);
    assert.equal(JSON.stringify(f.readProfileLayout(path, 393)), JSON.stringify(layout));
  }
  assert.equal(f.cachedCoverRatio("one"), 178.5 / 240.25);
  assert.equal(f.readProfileLayout("/", 320), null, "do not reuse incorrect geometry at a new viewport width");
  assert.equal(f.readProfileLayout("/edit/something", 393), null);
  assert.equal(f.readProfileReload().background, "#3155FF");
  assert.doesNotMatch(JSON.stringify(f.readProfileReload()), /title|image|src|content|phone/);
});

test("different owners never inherit each other's layouts, sign-out clears remembered presentation", () => {
  const f = fixture();
  f.saveProfileLayout("one", "#FFFFFF", "/drafts", layout);
  f.saveProfileLayout("public:friend", "#FF8CCC", "/", layout);
  assert.equal(f.readProfileLayout("/drafts", 393), null);
  f.clearProfileReload();
  assert.equal(f.readProfileReload(), null);
});

test("broken and blocked local storage never block rendering", () => {
  const f = fixture();
  f.items.set(f.PROFILE_RELOAD_KEY, "{");
  assert.equal(f.readProfileReload(), null);
  f.items.set(f.PROFILE_RELOAD_KEY, JSON.stringify({ owner: "one", background: "#FFFFFF", pages: { "/": { width: 393, height: 1000, frames: [null] }, "/drafts": null } }));
  assert.equal(f.readProfileLayout("/", 393), null);
  assert.equal(f.cachedCoverRatio("one"), undefined);
  f.localStorage.getItem = () => { throw Error("blocked"); };
  f.localStorage.setItem = () => { throw Error("full"); };
  f.localStorage.removeItem = () => { throw Error("blocked"); };
  assert.equal(f.readProfileReload(), null);
  assert.doesNotThrow(() => f.saveProfileLayout("one", "#FFFFFF", "/", layout));
  assert.doesNotThrow(() => f.clearProfileReload());
});

test("head bootstrap restores background before paint on profile pages only", () => {
  for (const background of ["#3155FF", "#FFFFFF", "#FF8CCC", "#000000"]) {
    for (const pathname of ["/", "/drafts", "/history", "/settings", "/strip/abc", "/edit/abc", "/share/abc", "/vanity-strip-id"]) {
      const f = fixture();
      f.saveProfileLayout("one", background, "/", layout);
      const properties = {}, classes = new Set();
      let chrome;
      const root = { style: { setProperty: (name, value) => { properties[name] = value; } }, classList: { add: value => classes.add(value) } };
      runInNewContext(f.PROFILE_RELOAD_SCRIPT, { location: { pathname }, localStorage: f.localStorage, document: {
        documentElement: root, getElementById: () => ({ setAttribute: (_, value) => { chrome = value; } }),
      } });
      const profile = f.PROFILE_PATHS.includes(pathname);
      assert.equal(chrome, profile ? background : undefined);
      assert.equal(classes.has("profile-reload-pending"), profile);
      assert.equal(properties["--profile-reload-background"], profile ? background : undefined);
    }
  }
});

test("loading never fabricates four covers and unsaved layouts are not cached", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/components/ProfileReload.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /librarySkeletonColumns/);
  assert.match(page, /if \(profilePageIsLoading\) return <ProfileReload/);
  assert.match(component, /if \(!ready \|\| !owner \|\| editing \|\| opening\) return/);
  assert.match(component, /rect.top \+ window.scrollY/);
  assert.match(component, /layout\?\.frames.map/);
});
