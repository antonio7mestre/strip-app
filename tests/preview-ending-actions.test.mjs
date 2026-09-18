import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(tree);
  assert.ok(result);
  return result;
}
const declaration = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name).getText(tree);
const code = ts.transpileModule([
  "toggleInlinePreview", "handlePreviewEndingEdit", "handlePreviewEndingShare",
].map(name => `export const ${declaration(name)};`).join("\n"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ view = "edit", inlinePreview = true, historyEntry = true } = {}) {
  const calls = [];
  const scrollRef = { current: null };
  const lock = { current: null };
  const exports = {};
  runInNewContext(code, {
    exports, view, inlinePreview, hasContent: true,
    inlinePreviewScrollRef: scrollRef,
    inlinePreviewExitLockRef: lock,
    inlinePreviewHistoryEntryRef: { current: historyEntry },
    window: {
      scrollY: 1240,
      history: { back: () => calls.push("back") },
      scrollTo: options => calls.push(["scroll", options.top]),
      requestAnimationFrame: callback => callback(),
    },
    beginInlinePreviewExitLock: top => { lock.current = { scrollTop: top }; calls.push(["lock", top]); },
    flushSync: callback => callback(),
    setInlinePreview: update => calls.push(["preview", update(inlinePreview)]),
    setActiveTextTool: () => {}, setEditingTextBlockId: () => {},
    setNotice: message => calls.push(["notice", message]),
    changeViewWithDockTransition: view => calls.push(["view", view]),
  });
  return { ...exports, calls, lock, scrollRef };
}

test("preview Edit consumes the same Back entry and preserves current scroll", () => {
  const f = fixture();
  f.handlePreviewEndingEdit();
  assert.deepEqual(f.calls, [["notice", ""], ["lock", 1240], "back"]);
  assert.equal(f.scrollRef.current, 1240);
  f.handlePreviewEndingEdit();
  assert.equal(f.calls.filter(call => call === "back").length, 1, "rapid taps cannot navigate past the editor");
});

test("without a preview history entry, Edit returns locally without leaving the draft", () => {
  const f = fixture({ historyEntry: false });
  f.handlePreviewEndingEdit();
  assert.deepEqual(f.calls, [["notice", ""], ["preview", false], ["scroll", 1240], ["scroll", 1240]]);
});

test("standalone preview uses its existing editor transition", () => {
  const f = fixture({ view: "preview", inlinePreview: false });
  f.handlePreviewEndingEdit();
  assert.deepEqual(f.calls, [["notice", ""], ["view", "edit"]]);
});

test("Share still only warns, without changing history, preview or selection", () => {
  const f = fixture();
  f.handlePreviewEndingShare();
  assert.deepEqual(f.calls, [["notice", "Publish to use these buttons."]]);
  assert.equal(f.lock.current, null);
});

test("actual preview buttons use separate edit and share actions", () => {
  const node = find(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "StripEndActions" && node.attributes.getText(tree).includes('primaryLabel="Edit this Strip"'));
  const props = node.attributes.getText(tree);
  assert.match(props, /onPrimary=\{handlePreviewEndingEdit\}/);
  assert.match(props, /onShare=\{handlePreviewEndingShare\}/);
  assert.doesNotMatch(source, /handlePreviewEndingAction/);
  const published = fixture({ view: "published", inlinePreview: false });
  published.handlePreviewEndingEdit();
  assert.deepEqual(published.calls, [], "preview handler cannot affect published navigation");
});
