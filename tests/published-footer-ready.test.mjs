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

function declarationsFor(selector) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((value) => value.trim() === selector))
    .map(([, , declarations]) => declarations).join("\n");
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

test("pill styling preserves the original action structure, callbacks, and footer height", () => {
  for (const owner of [false, true]) {
    const result = render({ owner, ready: true });
    const actionElement = result.element.props.children[1].props.children;
    const controls = actionElement.type(actionElement.props);
    assert.equal(controls.props.className, "strip-end-sheet-controls");
    const [primary, share] = controls.props.children;
    assert.equal(share.props.className, "strip-end-sheet-share");
    assert.equal(share.props.label, "Share this Strip");
    assert.equal(primary.type, "button");
    assert.equal(primary.props.className, "strip-end-sheet-primary");
    share.props.onClick();
    let stopped = false;
    primary.props.onClick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(result.calls, ["share", owner ? "edit" : "create"]);
    const buttons = result.html.match(/<button[\s\S]*?<\/button>/g);
    assert.match(buttons[1], /viewBox="0 0 256 256" fill="currentColor"/);
    assert.match(buttons[1], /<span>Share<\/span>/);
    assert.match(buttons[0], /strip-end-sheet-solid-pencil/);
    assert.doesNotMatch(buttons.join(""), /lucide-plus|lucide-send/);
  }
  assert.match(rule(".strip-end-sheet-controls"), /minmax\(0, 1fr\) minmax\(0, 1\.52fr\)/);
  assert.match(rule(".strip-end-sheet-share"), /order: -1/);
  assert.match(rule(".strip-end-sheet-controls"), /gap: 10px/);
  const buttons = rule(".strip-end-sheet-controls:not(.is-preview) button");
  assert.match(buttons, /border-radius: 999px/);
  assert.match(buttons, /corner-shape: round/);
  assert.doesNotMatch(buttons, /min-height:|height: 5/);
  assert.match(buttons, /padding: 0 8px/);
  assert.match(rule(".strip-end-sheet button"), /min-height: 52px/);
  assert.match(rule(".strip-end-sheet-controls:not(.is-preview) .strip-end-sheet-share"), /background: #ffffff;\s*color: #000000/);
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

test("the published footer paints its opaque base without forcing a separate graphics layer", () => {
  const footer = rule(".published-bottom-sheet");
  assert.match(footer, /transform: translateZ\(0\)/);
  assert.match(footer, /backface-visibility: hidden/);
  assert.doesNotMatch(footer, /(?:^|[;\s])translate:|will-change:/);
  assert.match(footer, /content-visibility: visible/);
  assert.match(footer, /overflow: visible/);
  assert.doesNotMatch(footer, /animation:|transition:|opacity:|contain:|height:|margin:|padding:|position:/);
  const published = rule(".published-mode .published-bottom-sheet");
  assert.equal(published.replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " "),
    "transform: none; backface-visibility: visible;",
    "only published layer promotion changes; shared preview paint and footer geometry stay intact");
  assert.ok(css.indexOf("\n.published-mode .published-bottom-sheet {") > css.indexOf("\n.published-bottom-sheet {"));
  assert.equal(declarationsFor(".editor-mode .published-bottom-sheet"), "");
  assert.equal(declarationsFor(".preview-mode .published-bottom-sheet"), "");
  const shared = rule(".strip-end-sheet");
  assert.match(shared, /position: relative/);
  assert.match(shared, /background: var\(--ending-background, #ffffff\)/);
  assert.doesNotMatch(shared, /background: transparent|transform:|translate:|backface-visibility:|will-change:|animation:|transition:|content-visibility:/);
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, declarations] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.(?:published-bottom-sheet|strip-end-sheet(?:-surface)?)(?![\w-])/.test(selector)) continue;
    if (!/(?:is-ready|is-visible|is-revealed|published-content-loading|published-bottom-sheet-canvas-active)/.test(selector)) continue;
    assert.doesNotMatch(declarations, /(?:background(?:-color)?|opacity|visibility|content-visibility|transform|translate|display)\s*:/,
      `footer paint cannot wait for reveal or scroll state: ${selector.trim()}`);
  }
});

test("published photos and their document stay free of forced graphics layers", () => {
  const selector = ".published-mode .image-block .block-crop-content > img";
  assert.doesNotMatch(declarationsFor(selector), /transform:|translate:|backface-visibility:|will-change:/,
    "forcing an image layer made native Safari render the photos blank");
  const publishedPromotions = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors, declarations]) => /\.published-(?:mode|strip)/.test(selectors) &&
      /translateZ\(|translate3d\(|will-change:\s*(?:transform|all)/.test(declarations))
    .flatMap(([, selectors]) => selectors.split(",").map((value) => value.trim()));
  assert.deepEqual(publishedPromotions, [],
    "neither a published photo nor its document may be promoted at mount or during scroll/reveal");
  for (const container of [
    ".app-shell", ".reader-mode", ".published-mode", ".published-strip", ".strip-canvas",
    ".published-mode .published-strip", ".published-mode .strip-canvas", ".image-block",
    ".block-crop-viewport", ".block-crop-content", ".image-block img", ".sticker-block img", selector,
    ".editor-mode .image-block .block-crop-content > img",
    ".preview-mode .image-block .block-crop-content > img",
  ]) {
    assert.doesNotMatch(declarationsFor(container), /translateZ\(|translate3d\(|will-change:\s*(?:transform|all)/,
      `reader painting must not promote ${container}`);
  }
  const photo = findNode((node) => ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(tree) === "img" && node.getText(tree).includes("shouldLoadMedia(block.id)"));
  assert.ok(photo, "check the actual photo element");
  assert.doesNotMatch(photo.getText(tree), /transform:|translate:|backfaceVisibility:|willChange:/);
  assert.match(photo.parent.openingElement.getText(tree), /className="block-crop-content"/);
  assert.match(photo.parent.parent.openingElement.getText(tree), /className="block-crop-viewport"/);
  assert.match(photo.parent.parent.parent.openingElement.getText(tree), /strip-block image-block/);
  assert.match(photo.parent.openingElement.getText(tree), /transform: `translateY\(/,
    "existing height-crop offsets stay on the wrapper rather than adding a photo transform");
  const imageGeometry = rule(".image-block img");
  for (const declaration of ["display: block", "width: 100%", "height: auto", "max-height: none", "aspect-ratio: auto", "object-fit: contain"]) {
    assert.ok(imageGeometry.includes(declaration), `preserve ${declaration}`);
  }
});

test("all published photos keep their existing eager load and decode path before reveal", () => {
  const photo = findNode((node) => ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(tree) === "img" && node.getText(tree).includes("shouldLoadMedia(block.id)"));
  const mediaGate = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(tree) === "shouldLoadMedia");
  assert.ok(photo && mediaGate);
  assert.match(photo.getText(tree), /loading="eager"/);
  assert.match(photo.getText(tree), /decoding="async"/);
  assert.match(photo.getText(tree), /view === "published"\s*\? undefined/,
    "pending published images cannot acquire an inline visibility gate");
  assert.match(photo.getText(tree), /\.decode\(\)[\s\S]*?settleMediaLoad\(block\.id, true\)/);
  assert.match(mediaGate.getText(tree), /if \(!isEditing && view === "published"\) return mediaIndex >= 0/,
    "later published photos must not wait behind preceding blocks or viewport intersection");
});

test("the footer paint fix preserves the existing shape, contact fill, shadow and spacing", () => {
  const shared = rule(".strip-end-sheet");
  assert.match(shared, /--ending-paint-overlap: 2px/);
  assert.match(shared, /min-height: 0/);
  assert.match(shared, /justify-content: center/);
  assert.match(shared, /padding: 12px max\(18px, env\(safe-area-inset-right\)\)\s*calc\(var\(--dock-bottom-gap\) - var\(--ending-paint-overlap\) \+ env\(safe-area-inset-bottom\)\)\s*max\(18px, env\(safe-area-inset-left\)\)/);
  assert.match(shared, /border-radius: var\(--iphone-panel-radius\) var\(--iphone-panel-radius\) 0 0/);
  assert.match(shared, /corner-shape: squircle/);
  assert.match(shared, /isolation: isolate/);
  assert.match(rule(".strip-end-sheet[data-touches-block] > .strip-end-sheet-corner-fill"), /background: var\(--ending-corner-color, transparent\)/);
  const surface = rule(".strip-end-sheet-surface");
  assert.match(surface, /position: absolute/);
  assert.match(surface, /inset: 0/);
  assert.match(surface, /bottom: calc\(-1 \* var\(--ending-paint-overlap\)\)/);
  assert.match(surface, /border-radius: inherit/);
  assert.match(surface, /corner-shape: inherit/);
  assert.match(surface, /background: var\(--ending-background, #ffffff\)/);
  assert.match(surface, /box-shadow: var\(--bottom-bar-shadow\)/);
  assert.match(surface, /clip-path: inset\(-24px 0 0\)/);
  assert.doesNotMatch(shared + surface, /position: (?:fixed|sticky)|100[lsd]?vh|padding-bottom:|margin-top:/);
});

test("the footer fix preserves the black document backing and existing independent Safari edge colors", () => {
  assert.match(rule(".published-mode,\n.published-mode .published-strip"), /min-height: 0;\s*background: var\(--black\)/);
  assert.match(rule(".published-mode .strip-canvas"), /padding-bottom: 0;\s*background: var\(--black\)/);
  assert.match(declarationsFor("body"), /background: var\(--top-safe-area-color, #000000\)/);
  const activeRoot = rule("html.published-bottom-sheet-canvas-active");
  assert.match(activeRoot, /background-color: var\(--bottom-safe-area-color, var\(--black\)\) !important/);
  assert.match(activeRoot, /background-image: linear-gradient\(\s*to bottom,\s*var\(--bottom-safe-area-color, var\(--black\)\) 0 50%,\s*var\(--top-safe-area-color, var\(--black\)\) 50% 100%\s*\) !important/);
  assert.match(rule("html.published-bottom-sheet-canvas-active body"), /background-color: var\(--bottom-safe-area-color, var\(--black\)\) !important/);
  assert.doesNotMatch(page + css, /plainReaderPreview|plain-reader-proof|reader-layout=plain|published-document-active/,
    "the fix must not introduce an alternate reader or replace the existing edge-color model");
});

test("published overscroll remains constant across the top-edge boundary without changing editor or preview", () => {
  const base = "html.leading-image-inset-active,\nhtml.leading-image-inset-active body";
  const dynamic = "html.leading-image-inset-active.leading-media-top-edge,\nhtml.leading-image-inset-active.leading-media-top-edge body";
  const published = "html.leading-image-inset-active:has(.published-mode),\nhtml.leading-image-inset-active:has(.published-mode) body";
  assert.match(rule(base), /overscroll-behavior-y: contain/);
  assert.match(rule(dynamic), /overscroll-behavior-y: none/);
  assert.equal(rule(published).trim(), "overscroll-behavior-y: none;",
    "the scoped rule changes only scroll policy, not paint, geometry, or page layering");
  assert.ok(css.indexOf(published) > css.indexOf(dynamic),
    "the equal-specificity published selector follows the dynamic top-edge rule");
  assert.ok(css.indexOf(dynamic) > css.indexOf(base));
  const policies = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors, declarations]) => selectors.includes("leading-image-inset-active") &&
      /overscroll-behavior-y\s*:/.test(declarations));
  assert.deepEqual(policies.map(([, selectors]) => selectors.trim()), [base, dynamic, published],
    "no unscoped rule may replace the editor and preview's existing contain/none behavior");
  for (const selector of published.split(",")) {
    assert.match(selector, /:has\(\.published-mode\)/,
      "both root and body overrides require an actual published reader");
    assert.doesNotMatch(selector, /editor-mode|preview-mode|is-inline-preview|leading-media-top-edge/);
  }
});

test("the real published route retains its existing footer-color and leading-inset helpers", () => {
  assert.match(page, /useLayoutEffect\(\(\) => installFooterSafeAreaColor\(\{\s*enabled: \(view === "published" && publishedContentCanReveal\) \|\| cleanViewBottomSurfaceColor !== null/);
  assert.match(page, /const removeLeadingMediaTop = installLeadingMediaTop\(\{\s*inset: offset,\s*resetScroll: !skipInitialAnchor && \(offset > 0 \|\| ownsReloadScroll\),\s*ownsReloadScroll,/);
  const helper = readFileSync(new URL("../app/lib/footer-safe-area.ts", import.meta.url), "utf8");
  assert.match(helper, /window\.addEventListener\("scroll", sync, \{ passive: true \}\)/);
  assert.match(helper, /root\.classList\.toggle\(activeClassName, next\)/);
  assert.match(helper, /theme\?\.setAttribute\("content", next \? bottomColor : topColor\)/);
  assert.doesNotMatch(helper, /\bsheet\.(?:style|classList|setAttribute|toggleAttribute|removeAttribute)\b/,
    "the existing edge-color helper must not control the footer's own surface");
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
