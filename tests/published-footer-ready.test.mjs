import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate, node = tree) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, (child) => findNode(predicate, child));
}
const article = findNode((node) => ts.isJsxElement(node) &&
  node.openingElement.tagName.getText(tree) === "article" &&
  node.openingElement.getText(tree).includes("published-strip-load-gate"));
const actions = findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === "StripEndActions");
assert.ok(article && actions);
const compiled = ts.transpileModule(
  `${actions.getText(tree)}\nexport const rendered = (${article.getText(tree)});`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function render({ ready = false, owner = false, last = "image" } = {}) {
  const exports = {};
  const calls = [];
  const icon = () => createElement("svg", { "aria-hidden": true });
  runInNewContext(compiled, {
    require, exports, Pencil: icon, Plus: icon, Send: icon,
    publishedContentCanReveal: ready,
    publishedEndsWithMedia: last !== "text",
    publishedEndsWithVideo: last === "video",
    publishedEndsWithText: last === "text",
    publishedViewerCanEdit: owner,
    openingPublishedEditor: false,
    publishedStripStyle: { "--ending-background": "#66FF8A" },
    legacyPageEnterClass: "",
    publishedBlocks: [{ type: last }],
    visibleEndingStyle: { backgroundColor: "#66FF8A", buttonColor: "#003BEA" },
    renderStrip: () => createElement("div", { className: "strip-canvas" }, "Last block"),
    editPublishedStripFromReader: () => calls.push("edit"),
    makeOwnStripFromReader: () => calls.push("create"),
    sharePublishedStripFromReader: () => calls.push("share"),
  });
  return { element: exports.rendered, html: renderToStaticMarkup(exports.rendered), calls };
}

function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `Missing ${selector}`);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

test("owner and visitor footers are complete from first render for every last-block type", () => {
  for (const owner of [false, true]) {
    for (const last of ["text", "image", "video"]) {
      const loading = render({ owner, last });
      const ready = render({ owner, last, ready: true });
      const footer = (html) => html.match(/<footer[\s\S]*?<\/footer>/)[0];
      assert.equal(footer(loading.html), footer(ready.html), "loading cannot mount, replace or restyle the footer");
      assert.equal((footer(loading.html).match(/<button/g) ?? []).length, 2);
      assert.ok(loading.html.includes(owner ? "Edit this Strip" : "Make your own Strip"));
      assert.match(loading.html, /Last block<\/div><footer/);
      assert.equal(loading.element.props.children[1].type, "footer", "always a direct in-flow child");
    }
  }
});

test("prepainted content remains inaccessible until the existing loading gate opens", () => {
  assert.match(render().html, /aria-hidden="true" inert=""/);
  const ready = render({ ready: true }).html;
  assert.match(ready, /aria-hidden="false"/);
  assert.doesNotMatch(ready, / inert=/);
  for (const owner of [false, true]) {
    const result = render({ owner, ready: true });
    const actions = result.element.props.children[1].props.children;
    actions.props.onPrimary();
    actions.props.onShare();
    assert.deepEqual(result.calls, [owner ? "edit" : "create", "share"]);
  }
});

test("the long document stays paintable instead of changing visibility or opacity at reveal", () => {
  const gate = rule(".published-strip-load-gate");
  assert.match(gate, /visibility: visible/);
  assert.match(gate, /opacity: 1/);
  assert.match(gate, /pointer-events: none/);
  const ready = rule(".published-strip-load-gate.is-ready");
  assert.match(ready, /pointer-events: auto/);
  assert.doesNotMatch(gate + ready, /transition:|animation:|will-change:|transform:|opacity: 0|visibility: hidden/);
});

test("only the small footer gets a permanent rendering layer, without moving or clipping it", () => {
  const footer = rule(".published-bottom-sheet");
  assert.match(footer, /transform: translateZ\(0\)/);
  assert.match(footer, /backface-visibility: hidden/);
  assert.match(footer, /content-visibility: visible/);
  assert.doesNotMatch(footer, /animation:|transition:|opacity:|overflow:|contain:|height:|margin:|padding:|position:/);
  const shared = rule(".strip-end-sheet");
  assert.match(shared, /position: relative/);
  assert.match(shared, /background: var\(--ending-background/);
  assert.match(shared, /border-radius: var\(--iphone-panel-radius\)/);
});

test("the cover entrance owns the opaque loading backdrop and crossfade", () => {
  const entrance = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  const backdrop = rule(".strip-entrance-backdrop");
  assert.match(backdrop, /inset: 0/);
  assert.match(backdrop, /background: #000/);
  assert.match(entrance, /className="strip-entrance-backdrop"/);
  assert.match(entrance, /!revealing \|\| displayPercent !== 100/);
  assert.match(entrance, /return fadeCoverEntrance\(host, \(\) => completeCallback.current\(\)\)/);
  assert.match(page, /publishedContentCanReveal\s*=\s*publishedAssetsReady && publishedMinimumElapsed/);
});
