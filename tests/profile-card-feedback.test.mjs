import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createHapticActionButton } from "./helpers/haptic-action.mjs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node = tree) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "HapticActionButton" && node.attributes.getText(tree).includes('className="library-card-open-button"')) return node;
  return ts.forEachChild(node, find);
}
const card = find();
assert(card);
const click = card.attributes.properties.find(attribute => attribute.name?.getText(tree) === "onClick").initializer.expression;
const compiled = ts.transpileModule(`export const click = ${click.getText(tree)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

test("profile-edit card taps warn and vibrate without opening a Strip or losing the clicked position", () => {
  for (const editing of [false, true]) {
    const calls = [], pulses = [], exports = {};
    const target = { tagName: editing ? "INPUT" : "BUTTON" };
    const strip = { id: "test-strip" };
    runInNewContext(compiled, {
      exports, isDraft: false, strip,
      stripProfile: { editing, showError: message => calls.push(message) },
      openDraft: () => assert.fail("A published card must not open a draft"),
      openPublishedStrip: (opened, origin) => { assert.equal(opened, strip); assert.equal(origin, target); calls.push("open"); },
    });
    const Button = createHapticActionButton({ vibrate: value => pulses.push(value) });
    const element = Button({ children: "Cover", className: "library-card-open-button", label: "Open cover", feedback: editing, onClick: exports.click });
    const control = editing ? element.props.children[1] : element;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (editing) control.props.onChange({ currentTarget: target });
      else control.props.onClick({ currentTarget: target, stopPropagation() {} });
    }
    assert.deepEqual(calls, editing ? ["Save changes to access Strips", "Save changes to access Strips"] : ["open", "open"]);
    assert.deepEqual(pulses, editing ? [12, 12] : []);
  }
});

test("draft cards keep their normal route outside profile editing", () => {
  const calls = [], exports = {}, strip = { id: "draft" };
  runInNewContext(compiled, {
    exports, strip, isDraft: true, stripProfile: { editing: false },
    openDraft: draft => calls.push(draft), openPublishedStrip: () => assert.fail("Not a published Strip"),
  });
  exports.click({}); assert.deepEqual(calls, [strip]);
  assert.match(card.attributes.getText(tree), /feedback=\{stripProfile.editing\}/);
  assert.doesNotMatch(card.attributes.properties.find(attribute => attribute.name?.getText(tree) === "disabled").getText(tree), /stripProfile.editing/);
});
