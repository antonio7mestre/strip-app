import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { StripEndingSheet } from "./helpers/ending-sheet.mjs";
import { profileFontWeight } from "../app/lib/profile.ts";
import { normalizedFontSize } from "../app/lib/font-sizing.ts";
import { getReaderImageProps } from "../app/lib/reader-image.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = tree) {
  return predicate(node) ? node : ts.forEachChild(node, child => find(predicate, child));
}
function declaration(name) {
  const node = find(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name);
  assert.ok(node, name);
  return node.getText(tree);
}
function element(tag, classText) {
  const node = find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === tag &&
    node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) &&
      prop.name.getText(tree) === "className" && prop.initializer.getText(tree).includes(classText)));
  assert.ok(node, `${tag}: ${classText}`);
  return node.getText(tree);
}
const cropFunction = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resolveBlockHeightCrop").getText(tree);
const roots = {
  inline: element("div", "editor-canvas ${legacyPageEnterClass}"),
  standalone: element("article", "published-strip ${legacyPageEnterClass}"),
  published: element("article", "published-strip published-strip-load-gate"),
};
const fragment = Symbol.for("react.fragment");
const jsx = (type, props) => type === StripEndingSheet ? type(props) : { type, props };
const readerModes = ["inline", "standalone", "published"];

// Execute the actual render function, crop resolver and route wrappers. Leaf
// video/sticker components remain inspectable so their real renderer props can
// be compared without substituting another implementation of the mode gates.
function fixture(mode, blocks, overrides = {}) {
  const view = mode === "published" ? "published" : mode === "standalone" ? "preview" : "edit";
  const inlinePreview = mode === "inline";
  const calls = [];
  const stub = () => null;
  const exports = {};
  const code = ts.transpileModule([
    `const ${declaration("MIN_CROPPED_BLOCK_HEIGHT")};`, cropFunction,
    ...["handlePreviewEndingEdit", "handlePreviewEndingPublish", "renderStrip",
      "trailingPublishedBlock", "publishedEndsWithMedia", "publishedEndsWithVideo", "publishedEndsWithText", "publishedStripStyle"]
      .map(name => `const ${declaration(name)};`),
    `export function render() { return (${roots[mode === "editor" ? "inline" : mode]}); }`,
  ].join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, {
    exports, require: () => ({ jsx, jsxs: jsx, Fragment: fragment }),
    blocks, publishedBlocks: blocks, view, inlinePreview,
    authUser: { username: "antonio" }, openedPublishedStrip: { username: "antonio" },
    publishedContentCanReveal: true, openingPublishedEditor: false, publishedViewerCanEdit: false,
    legacyPageEnterClass: "", topSafeAreaColor: "#000000", hasRequiredContent: true,
    stripCanvasRef: { current: null }, mediaLoadStatus: {}, importedMediaSizes: {},
    mediaBatchRevealIds: [], mediaBatchRevealStarted: false, mediaImportProgress: null,
    editorEntrance: { active: false },
    selectedBlockId: null, editingTextBlockId: null, heightCropSession: null,
    overlappingStickerIds: [], selectedBlock: null, audibleVideoId: null, videoAudioPresence: {},
    trackBlockTapGesture: stub, cancelBlockTapGesture: stub,
    renderBlockControls: () => ({ type: "editor-controls", props: {} }),
    renderHeightCropHandles: () => ({ type: "crop-handles", props: {} }),
    recordBlockHeight: stub, BlockHeightReporter: "height-reporter",
    DEFAULT_BACKGROUND: "#000000", DEFAULT_FONT_SIZE: 24, FONT_STACKS: { sans: "Arial" },
    profileFontWeight, normalizedFontSize, getReaderImageProps,
    contrastColor: color => color === "#FFFFFF" ? "#000000" : "#FFFFFF",
    StripEndingSheet, StripEndActions: "reader-actions", MediaEdgeExtension: "media-edge-extension",
    StripVideoBlock: "reader-video", StripStickerBlock: "reader-sticker", EmptyStripState: "empty-strip-state",
    inlinePreviewExitLockRef: { current: null },
    setNotice: value => calls.push(["notice", value]), toggleInlinePreview: () => calls.push("toggle-inline"),
    changeViewWithDockTransition: next => calls.push(["view", next]), continueToPublish: () => calls.push("publish"),
    ...overrides,
  });
  return { root: exports.render(), calls };
}
function children(node) {
  const flatten = value => Array.isArray(value) ? Array.from(value).flatMap(flatten)
    : !value || typeof value !== "object" ? []
      : value.type === fragment ? flatten(value.props.children) : [value];
  return flatten(node.props?.children);
}
function all(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => all(child, predicate))];
}
const ofType = (node, type) => all(node, child => child.type === type);
const hasClass = (node, name) => typeof node.props?.className === "string" && node.props.className.split(/\s+/).includes(name);
const canvas = root => all(root, node => hasClass(node, "strip-canvas"))[0];
const footer = root => all(root, node => hasClass(node, "strip-ending-card"))[0];
function signature(node) {
  return JSON.parse(JSON.stringify(node, (key, value) => key === "ref" || key.startsWith("on") || typeof value === "function" ? undefined : value));
}
const photo = { id: "photo", type: "image", src: "/photo.jpg", alt: "Photo", height: 800 };
const video = { id: "video", type: "video", src: "/video.mp4", height: 600, audioEnabled: true, hasAudio: true };
const text = { id: "text", type: "text", content: "A short Strip", backgroundColor: "#9772FF" };
const sticker = { id: "sticker", type: "sticker", src: "/sticker.png", x: 12, y: 1000, width: 120, rotation: 12 };

test("actual reader routes render identical content and exactly one sibling ending", () => {
  for (const blocks of [[], [text], [photo], [video], [photo, text], [text, sticker], [text, photo, video, sticker]]) {
    let expectedContent;
    for (const mode of readerModes) {
      const { root } = fixture(mode, blocks);
      const content = canvas(root), ending = footer(root);
      assert.ok(content && ending, mode);
      assert.deepEqual(children(root), [content, ending], "the footer follows the complete content canvas in every reader");
      assert.equal(all(root, node => hasClass(node, "strip-ending-card")).length, 1);
      assert.equal(all(content, node => hasClass(node, "strip-ending-card")).length, 0);
      assert.equal(content.props.style?.backgroundColor, undefined, "no preview-only white canvas");
      assert.equal(content.props.style?.minHeight, blocks.includes(sticker) ? "1180px" : undefined);
      const contentTree = children(content).map(signature);
      expectedContent ??= contentTree;
      assert.deepEqual(contentTree, expectedContent, `${mode}: content rendering matches the other reader routes`);
      assert.equal(ending.props.style["--ending-background"], "#FFFFFF");
      assert.equal(ending.props.style["--ending-corner-color"], blocks.findLast(block => block.type !== "sticker")?.type === "text" ? "#9772FF" : "transparent");
    }
  }
});

test("every reader loads all media immediately without editor visibility or decode ordering gates", () => {
  for (const mode of readerModes) {
    const { root } = fixture(mode, [photo, { ...photo, id: "second", src: "/second.jpg" }, video]);
    assert.deepEqual(ofType(root, "img").map(node => node.props.src), ["/photo.jpg", "/second.jpg"]);
    for (const image of ofType(root, "img")) {
      assert.equal(image.props.loading, "eager");
      assert.equal(image.props.style, undefined, "unsettled reader photos are not hidden by editor state");
    }
    const renderedVideo = ofType(root, "reader-video")[0];
    assert.equal(renderedVideo.props.shouldLoad, true);
    assert.equal(renderedVideo.props.loadBeforeReveal, true);
    assert.equal(renderedVideo.props.extendBottomEdge, true);
    assert.equal(renderedVideo.props.controls, null);
    assert.equal(ofType(root, "editor-controls").length, 0);
  }
  const { root } = fixture("editor", [photo, { ...photo, id: "second" }, video]);
  const images = ofType(root, "img");
  assert.equal(images[0].props.src, "/photo.jpg");
  assert.equal(images[1].props.src, undefined, "editor media still waits for preceding media to settle");
  assert.equal(images[0].props.style.visibility, "hidden");
  assert.equal(ofType(root, "reader-video")[0].props.loadBeforeReveal, false);
  assert.equal(ofType(root, "reader-video")[0].props.shouldLoad, false);
  assert.equal(footer(root), undefined);
  assert.equal(ofType(root, "editor-controls").length, 2);
});

test("every actual reader selects bounded image variants while editing retains the original source", () => {
  const source = "/api/strips/1791303521563-plsa2g/media/photo-001";
  const media = { ...photo, src: source, cropTop: 70, cropBottom: 90 };
  for (const mode of readerModes) {
    const { root } = fixture(mode, [media]);
    const image = ofType(root, "img")[0];
    const expected = getReaderImageProps(source);
    for (const key of ["src", "srcSet", "sizes"]) assert.equal(image.props[key], expected[key], `${mode}: ${key}`);
    assert.notEqual(image.props.src, source, "the reader does not decode the full-size source by default");
    assert.equal(image.props.loading, "eager");
    assert.equal(all(root, node => hasClass(node, "block-crop-viewport"))[0].props.style.height, "640px");
    assert.equal(all(root, node => hasClass(node, "block-crop-content"))[0].props.style.transform, "translateY(-70px)");
  }
  const { root } = fixture("editor", [media]);
  const image = ofType(root, "img")[0];
  assert.equal(image.props.src, source);
  assert.equal(image.props.srcSet, undefined);
  assert.equal(image.props.sizes, undefined);
});

test("saved photo and video crops match across readers despite an active editor crop session", () => {
  for (const media of [photo, video]) {
    const cropped = { ...media, cropTop: 70, cropBottom: 90 };
    const heightCropSession = { blockId: media.id, sourceHeight: media.height, top: 140, bottom: 160 };
    for (const mode of readerModes) {
      const { root } = fixture(mode, [cropped, sticker], { heightCropSession });
      assert.equal(canvas(root).props.style.minHeight, "1180px", "the sticker floor belongs to the content, not the ending");
      if (media.type === "image") {
        const viewport = all(root, node => hasClass(node, "block-crop-viewport"))[0];
        const content = all(root, node => hasClass(node, "block-crop-content"))[0];
        assert.equal(viewport.props.style.height, "640px");
        assert.equal(content.props.style.transform, "translateY(-70px)");
        const edge = ofType(root, "media-edge-extension")[0];
        assert.equal(edge.props.cropTop, 70);
        assert.equal(edge.props.cropHeight, 640);
      } else {
        const rendered = ofType(root, "reader-video")[0];
        assert.equal(rendered.props.cropTop, 70);
        assert.equal(rendered.props.croppedHeight, 440);
        assert.equal(rendered.props.cropEditing, false);
        assert.equal(rendered.props.heightCropHandles, null);
      }
      assert.equal(ofType(root, "crop-handles").length, 0);
      assert.deepEqual(signature(ofType(root, "reader-sticker")[0].props.block), sticker);
    }
    const { root } = fixture("editor", [cropped], { heightCropSession });
    if (media.type === "image") {
      assert.equal(all(root, node => hasClass(node, "block-crop-viewport"))[0].props.style.height, "800px");
      assert.equal(all(root, node => hasClass(node, "block-crop-content"))[0].props.style, undefined);
      assert.equal(ofType(root, "crop-handles").length, 1);
      assert.equal(ofType(root, "media-edge-extension").length, 0);
    } else {
      const rendered = ofType(root, "reader-video")[0];
      assert.equal(rendered.props.cropTop, 140);
      assert.equal(rendered.props.cropEditing, true);
      assert.ok(rendered.props.heightCropHandles);
      assert.equal(rendered.props.extendBottomEdge, false);
    }
  }
});

test("reader media retain settled and error handling without inheriting editor-only hiding", () => {
  for (const status of ["loaded", "error"]) {
    for (const mode of readerModes) {
      const { root } = fixture(mode, [photo, video], { mediaLoadStatus: { photo: status, video: status } });
      const image = ofType(root, "img")[0];
      assert.equal(image.props.src, photo.src);
      assert.equal(image.props.style?.display, status === "error" ? "none" : undefined);
      assert.equal(image.props.style?.visibility, undefined);
      const renderedVideo = ofType(root, "reader-video")[0];
      assert.equal(renderedVideo.props.isLoaded, status === "loaded");
      assert.equal(renderedVideo.props.loadSettled, true);
      assert.equal(renderedVideo.props.shouldLoad, true);
      assert.equal(renderedVideo.props.loadBeforeReveal, true);
    }
  }
});

test("an unrelated crop session does not change saved media geometry in any mode", () => {
  for (const mode of [...readerModes, "editor"]) {
    const cropped = { ...photo, cropTop: 70, cropBottom: 90 };
    const { root } = fixture(mode, [cropped], {
      heightCropSession: { blockId: "another-block", sourceHeight: 1000, top: 300, bottom: 200 },
    });
    assert.equal(all(root, node => hasClass(node, "block-crop-viewport"))[0].props.style.height, "640px");
    assert.equal(all(root, node => hasClass(node, "block-crop-content"))[0].props.style.transform, "translateY(-70px)");
  }
});

test("preview ending actions retain the real Edit and Publish handlers", () => {
  for (const mode of ["inline", "standalone"]) {
    const f = fixture(mode, [photo]);
    const actions = ofType(footer(f.root), "reader-actions")[0].props;
    assert.equal(actions.primaryAction, "edit");
    assert.equal(actions.primaryLabel, "Edit Strip");
    assert.equal(actions.onShare, undefined);
    actions.onPrimary();
    assert.deepEqual(f.calls, mode === "inline" ? [["notice", ""], "toggle-inline"] : [["notice", ""], ["view", "edit"]]);
    actions.onPublish();
    assert.equal(f.calls.at(-1), "publish");
  }
});

test("settled inline preview mounts no additional fixed composer dock", () => {
  const dockSource = readFileSync(new URL("../app/components/PreviewDock.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(dockSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const exports = {};
  runInNewContext(code, {
    exports,
    require: name => name.startsWith("@/") ? {} : require(name),
  });
  const child = createElement("footer", { className: "composer-dock main-composer-dock" }, "Editor tools");
  assert.equal(renderToStaticMarkup(createElement(exports.PreviewDock, { preview: true }, child)), "");
  assert.match(renderToStaticMarkup(createElement(exports.PreviewDock, { preview: false }, child)), /main-composer-dock/);
});
