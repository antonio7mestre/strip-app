import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/wide-layout.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "handleDesktopBack") return node;
  return ts.forEachChild(node, find);
}
const compiled = ts.transpileModule(`export const ${find(tree).getText(tree)};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function back(view, extra = {}) {
  const calls = [], exports = {};
  const action = name => () => calls.push(name);
  const context = {
    exports, view, publishing: false, storyShareSheetOpen: false, inlinePreview: false,
    pageTransitionInFlightRef: { current: false }, editorEntrance: { active: false },
    mediaImportRequestRef: { current: null }, mediaImportProgress: null, mediaBatchRevealIds: [],
    editorBackPathRef: { current: "/drafts" }, openedPublishedStrip: { id: "test" },
    returnToCoverSetup: action("cover"), returnFromPublishSetup: action("editor"),
    handlePreviewEndingEdit: action("exit-preview"), returnToLibraryFromPublished: action("homepage-route"),
    returnToLibrary: action("homepage"), resetTransientNavigationState: action("cancel-entrance"),
    setEditingTextBlockId() {}, setActiveTextTool() {}, setStickerPickerOpen() {}, setHeightCropSession() {},
    showEditorLoadingNotice: action("loading-notice"), setBrowserPath: path => calls.push(path),
    URL, publicStripUrl: () => "https://antonio.striiip.com/test",
    PopStateEvent: class {},
    window: { location: { origin: "https://antonio.striiip.com", assign: action("external-route") }, dispatchEvent: action("resolve-route") },
    ...extra,
  };
  runInNewContext(compiled, context);
  exports.handleDesktopBack();
  return calls;
}

test("desktop back follows the publish flow and consumes preview through its existing exit", () => {
  assert.deepEqual(back("title-setup"), ["cover"]);
  assert.deepEqual(back("publish-setup"), ["editor"]);
  assert.deepEqual(back("preview"), ["exit-preview"]);
  assert.deepEqual(back("edit", { inlinePreview: true }), ["exit-preview"]);
});
test("published Strips return to their homepage, posters return to their Strip", () => {
  assert.deepEqual(back("published"), ["homepage-route"]);
  assert.deepEqual(back("share"), ["/test", "resolve-route"]);
  for (const view of ["drafts", "history", "settings"]) assert.deepEqual(back(view), ["homepage"]);
});
test("editor returns to its entry route and can cancel an unfinished entrance", () => {
  const expected = ["cancel-entrance", "/drafts", "resolve-route"];
  assert.deepEqual(back("edit"), expected);
  assert.deepEqual(back("edit", { editorEntrance: { active: true }, pageTransitionInFlightRef: { current: true } }), expected);
});
test("navigation cannot interrupt an import or a publish", () => {
  assert.deepEqual(back("edit", { mediaImportProgress: { visible: true } }), ["loading-notice"]);
  assert.deepEqual(back("edit", { mediaBatchRevealIds: ["photo"] }), ["loading-notice"]);
  assert.deepEqual(back("title-setup", { publishing: true }), []);
  assert.deepEqual(back("share", { storyShareSheetOpen: true }), []);
});
test("back control is desktop-only, outside the canvas, and mounted across seven page branches", () => {
  assert.match(css.split("@media")[0], /\.desktop-back-button,/);
  assert.match(css, /\.desktop-back-button \{[^}]*position: fixed;[^}]*left: calc\(\(100% - var\(--page-max-width\)\) \/ 2 - 64px\)/);
  assert.match(page, /document.body, "desktop-back-control"/);
  assert.equal(page.match(/\{desktopBackControl\}/g).length, 7);
  assert.equal(page.match(/editorBackPathRef.current = window.location.pathname/g).length, 3);
});
