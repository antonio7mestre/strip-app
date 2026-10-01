import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pencil } from "lucide-react";
import ts from "typescript";
import { StripEndingSheet } from "./helpers/ending-sheet.mjs";
import { HapticActionButton } from "./helpers/haptic-action.mjs";

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

function render({ ready = false, owner = false, last = "image", username = "antonio" } = {}) {
  const exports = {};
  const calls = [];
  const icon = () => createElement("svg", { "aria-hidden": true });
  runInNewContext(compiled, {
    require, exports, Pencil, Plus: icon, Send: icon, StripEndingSheet, HapticActionButton,
    publishedContentCanReveal: ready,
    publishedEndsWithMedia: last !== "text",
    publishedEndsWithVideo: last === "video",
    publishedEndsWithText: last === "text",
    trailingPublishedBlock: { backgroundColor: "#9772FF" }, DEFAULT_BACKGROUND: "#000000",
    publishedViewerCanEdit: owner,
    openedPublishedStrip: { username },
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
      assert.ok(loading.html.includes(owner ? "Edit Strip" : "Make a Strip"));
      assert.match(loading.html, /Last block<\/div><footer/);
      assert.equal(loading.element.props.children[1].type, StripEndingSheet, "always the shared in-flow footer");
      assert.match(footer(loading.html), /A Strip by <a href="https:\/\/antonio\.striiip\.com\/"[^>]*>@antonio<\/a>/);
    }
  }
});

test("owners and visitors get matching pill buttons with Share first and a solid pencil action second", () => {
  for (const owner of [false, true]) {
    const result = render({ owner, ready: true });
    const actionElement = result.element.props.children[1].props.children;
    const controls = actionElement.type(actionElement.props);
    assert.equal(controls.props.className, "strip-end-sheet-controls is-published");
    const [share, primary] = controls.props.children;
    assert.equal(share.props.className, "strip-end-sheet-share");
    assert.equal(share.props.label, "Share this Strip");
    assert.equal(primary.props["data-action"], owner ? "edit" : "create");
    share.props.onClick();
    let stopped = false;
    primary.props.onClick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(result.calls, ["share", owner ? "edit" : "create"]);
    const buttons = result.html.match(/<button[\s\S]*?<\/button>/g);
    assert.match(buttons[0], /viewBox="0 0 256 256" fill="currentColor"/);
    assert.match(buttons[0], /<span>Share<\/span>/);
    assert.match(buttons[1], /strip-end-sheet-solid-pencil/);
    assert.doesNotMatch(buttons.join(""), /lucide-plus|lucide-send/);
  }
  assert.match(rule(".strip-end-sheet-controls"), /minmax\(0, 1fr\) minmax\(0, 1\.52fr\)/);
  const buttons = rule(".strip-end-sheet-controls.is-published button");
  assert.match(buttons, /border-radius: 999px/);
  assert.match(buttons, /corner-shape: round/);
  assert.match(buttons, /min-height: 53px/);
  assert.match(rule(".strip-end-sheet-controls.is-published .strip-end-sheet-share"), /background: #ffffff;\s*color: #000000/);
  assert.match(rule(".strip-end-sheet-primary .strip-end-sheet-solid-pencil"), /fill: currentColor/);
});

test("the footer credits the author for every viewer and handles legacy Strips without a username", () => {
  for (const owner of [false, true]) {
    assert.match(render({owner, username: "someone-else"}).html, /A Strip by <a href="https:\/\/someone-else\.striiip\.com\/"[^>]*>@someone-else<\/a>/);
    const legacy = render({owner, username: null}).html;
    assert.match(legacy, /Made with Strip/);
    assert.doesNotMatch(legacy, /@null|@undefined|Keep the story going/);
  }
  const title = rule(".published-bottom-sheet-title");
  assert.match(title, /text-align: center/);
  assert.match(title, /overflow-wrap: anywhere/);
  assert.match(title, /color: #000000/);
  assert.match(rule(".published-bottom-sheet"), /align-items: center/);
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
  assert.match(footer, /overflow: visible/);
  assert.doesNotMatch(footer, /animation:|transition:|opacity:|contain:|height:|margin:|padding:|position:/);
  const shared = rule(".strip-end-sheet");
  assert.match(shared, /position: relative/);
  assert.match(shared, /background: transparent/);
  assert.match(rule(".strip-end-sheet-surface"), /background: var\(--ending-background/);
  assert.match(shared, /border-radius: var\(--iphone-panel-radius\)/);
});

test("the cover entrance owns the opaque loading backdrop and crossfade", () => {
  const entrance = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  const backdrop = rule(".strip-entrance-backdrop");
  assert.match(backdrop, /inset: 0/);
  assert.match(backdrop, /background: var\(--entrance-background, #000\)/);
  assert.match(entrance, /className="strip-entrance-backdrop"/);
  assert.match(entrance, /!revealing \|\| displayPercent !== 100/);
  assert.match(entrance, /return fadeCoverEntrance\(host, \(\) => completeCallback.current\(\)\)/);
  assert.match(page, /publishedContentCanReveal\s*=\s*publishedAssetsReady && publishedMinimumElapsed/);
});
