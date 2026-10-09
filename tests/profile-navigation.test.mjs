import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = read("app/page.tsx");
const css = read("app/globals.css");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name, node = tree) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) return node;
  return ts.forEachChild(node, child => declaration(name, child));
}
const compiled = ts.transpileModule(["switchLibraryView", "openLibrarySection"].map(name =>
  `const ${declaration(name).getText(tree)};`).join("\n") + "\nexports.navigate = openLibrarySection;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(scrollY = 0) {
  const updates = [], paths = [], classes = new Set(["strip-page-transitioning", "strip-standard-page-entering"]);
  const unexpected = () => assert.fail("a tab switch must not wait for a network request, timer, animation, or scroll reset");
  const state = {
    exports: {}, view: "library", pageTransitionInFlightRef: { current: false }, libraryScrollInsetRef: { current: 0 },
    window: { scrollY, setTimeout: unexpected, requestAnimationFrame: unexpected, scrollTo: unexpected },
    fetch: unexpected, setTimeout: unexpected, requestAnimationFrame: unexpected,
    document: { documentElement: { classList: { remove: (...names) => names.forEach(name => classes.delete(name)) } } },
    setBrowserPath: path => paths.push(path), cancelDockTransitionSchedule: () => updates.push("cancel-old-transition"),
    flushSync: update => update(), setLegacyPageTransition: value => assert.equal(value, null),
    setDockTransition: value => assert.equal(value, null), setDockTransitionStarted: value => assert.equal(value, false),
    setInstantLibraryNavigation: value => assert.equal(value, true), setLibraryScrollInset: value => assert.equal(value, scrollY),
    setView: view => { state.view = view; updates.push(view); },
  };
  runInNewContext(compiled, state);
  return { state, paths, updates, classes, navigate: state.exports.navigate };
}

test("every rapid tab press commits its page synchronously without timers or network waits", () => {
  const h = harness();
  for (let pass = 0; pass < 10; pass++) {
    for (const view of ["drafts", "history", "settings", "library"]) {
      assert.equal(h.navigate(view), undefined);
      assert.equal(h.state.view, view);
      assert.equal(h.paths.at(-1), view === "library" ? "/" : `/${view}`);
      assert.equal(h.classes.size, 0);
    }
  }
  assert.equal(h.paths.length, 40);
});
test("reselecting a tab is a no-op and active strip opening retains its safety guard", () => {
  const h = harness(); h.navigate("library");
  h.state.pageTransitionInFlightRef.current = true; h.navigate("drafts");
  assert.equal(h.paths.length, 0);
});
test("tab switches retain the existing Safari scroll canvas and inset", () => {
  const h = harness(735); h.navigate("settings");
  assert.equal(h.state.libraryScrollInsetRef.current, 735);
  assert.equal(h.state.view, "settings");
});
test("navigation stays mounted, active ink changes instantly, and cards skip staggered entrances", () => {
  assert.match(source, /<ProfileNavigation className=\{currentDockControlsClass\} view=\{view\}/);
  assert.doesNotMatch(source, /<ProfileNavigation[^>]*key=/);
  assert.match(css, /\.library-mode\.is-instant-navigation \.library-card\.is-library-card-entering \{\s*animation: none;/);
  const button = css.match(/\.app-navigation-button \{[^}]+\}/)[0];
  assert.match(button, /touch-action: manipulation/);
  assert.match(button, /transition: transform 100ms ease-out/);
  assert.doesNotMatch(button, /background-color \d|color \d/);
});
test("loading profile screens use the selected tab immediately and refresh its saved frame positions", () => {
  const reload = read("app/components/ProfileReload.tsx");
  assert.match(reload, /view: requestedView/);
  assert.match(reload, /\[owner, requestedView\]/);
  assert.match(reload, /const view: ProfileView = requestedView \?\?/);
  assert.match(source, /const reloadProfileProps = \{\s*view: initialRouteReady &&/);
});
