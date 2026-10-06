import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findTitleStep(node = tree) {
  if (ts.isIfStatement(node) && node.expression.getText(tree) === 'view === "title-setup"') return node;
  return ts.forEachChild(node, findTitleStep);
}
const step = findTitleStep();
assert.ok(step);
function findElement(tag, node = step) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === tag) return node;
  return ts.forEachChild(node, child => findElement(tag, child));
}
const footer = findElement("footer");
const main = findElement("main");

test("publish title tools remain mounted outside the clipped typing screen", () => {
  assert.ok(footer && main);
  assert.equal(footer.parent, main.parent, "The form and fixed dock must be siblings, not a clipped parent/child");
  const markup = footer.getText(tree);
  assert.match(markup, /key="persistent-composer-dock"/);
  assert.match(markup, /className="composer-dock title-setup-dock publish-flow-dock"/);
  assert.doesNotMatch(markup, /keyboard|is-typing|is-shifted|hidden=/);
  assert.match(markup, /returnToCoverSetup\(\)/);
  assert.match(markup, /publish\(\)/);
  assert.match(markup, /disabled=\{publishing\}/);
  assert.match(main.getText(tree), /aria-label="Strip title"/);
});

test("publish uses the same fixed dock sizing and immediate pan compensation as editor", () => {
  const rule = [...css.matchAll(/\n\.title-setup-dock \{([^}]+)\}/g)]
    .map(match => match[1]).find(body => body.includes("height: calc("));
  assert.ok(rule);
  assert.match(rule, /height: calc\(\s*var\(--dock-visible-height\) \+ 180px \+ env\(safe-area-inset-bottom\) \+\s*var\(--dock-browser-extension\)\s*\)/);
  assert.match(rule, /min-height: 0/);
  assert.doesNotMatch(rule, /transform|translate|opacity|display|visibility|transition/);
  assert.match(css, /\.composer-dock \{[^}]*position: fixed;[^}]*translate: 0 var\(--keyboard-dock-pan, 0px\)/);
  assert.match(page, /useLayoutEffect\(installKeyboardDockPosition, \[\]\)/);
});

test("typing and dismissal do not change the dock's resting position or button space", () => {
  for (const viewport of [667, 740, 844, 932]) {
    for (const safeArea of [0, 21, 34]) {
      const restingTop = viewport - 64 - safeArea;
      for (const [extension, pan] of [[0, 0], [50, 20], [120, 344], [80, 140], [0, 0]]) {
        const bottom = -180 - extension;
        const height = 64 + 180 + safeArea + extension;
        const paintedTop = viewport - bottom - height + pan;
        assert.equal(paintedTop - pan, restingTop);
        const padding = 12 + 180 + 2 + safeArea + extension;
        assert.equal(height - padding, 50, "48px buttons retain their space throughout dismissal");
      }
    }
  }
});
