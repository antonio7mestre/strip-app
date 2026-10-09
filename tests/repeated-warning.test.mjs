import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function handler(path, name, bindings) {
  const tree = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) return node;
    return ts.forEachChild(node, find);
  }
  const exports = {};
  runInNewContext(ts.transpileModule(`export const ${find(tree).getText(tree)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, ...bindings });
  return exports[name];
}

test("first and different warnings stay still, every repeated warning restarts the shake", () => {
  for (const profile of [false, true]) {
    let revision = 0, repeated = false, nextMessage = "";
    const messages = ["", "Same warning", "Same warning", "Other warning", ""];
    for (const current of messages) {
      const show = handler(profile ? "app/components/useStripProfile.ts" : "app/page.tsx", profile ? "showError" : "showActionNotice", profile ? {
        error: current, setErrorRepeated: value => { repeated = value; },
        setError: value => { nextMessage = value; }, setErrorRevision: update => { revision = update(revision); },
      } : {
        notice: current, setNoticeShakeMessage: value => { repeated = value === "Same warning"; },
        setNotice: value => { nextMessage = value; }, setNoticeRevision: update => { revision = update(revision); },
      });
      show("Same warning");
      assert.equal(repeated, current === "Same warning");
      assert.equal(nextMessage, "Same warning");
    }
    assert.equal(revision, messages.length, "each tap refreshes the announcement and lifetime");
  }
});

test("shake moves only a few pixels horizontally without fading or changing the dock offset", () => {
  const css = read("app/globals.css");
  const animation = css.slice(css.indexOf("@keyframes notice-shake"), css.indexOf(".haptic-action-button"));
  assert.match(animation, /0%, 100% \{ transform: translateX\(50%\); \}/);
  assert.match(animation, /calc\(50% - 3px\)/);
  assert.match(animation, /calc\(50% \+ 3px\)/);
  assert.doesNotMatch(animation, /opacity|translateY|bottom:|display:|visibility:/);
  assert.doesNotMatch(animation, /prefers-reduced-motion/);
  assert.match(read("app/components/ProfileEditor.tsx"), /controller.errorRepeated \? " is-repeated"/);
  assert.match(read("app/page.tsx"), /notice === noticeShakeMessage \? " is-repeated"/);
});
