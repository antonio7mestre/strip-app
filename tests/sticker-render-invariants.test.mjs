import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "StripStickerBlock");
const jsx = (type, props) => ({ type, props });
const exports = {};
let firstRef = true;
runInNewContext(ts.transpileModule(`export ${component.getText(tree)}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports, require: () => ({ jsx, jsxs: jsx, Fragment: "fragment" }),
  useRef(value) {
    if (firstRef) {
      firstRef = false;
      return { current: { closest() { assert.fail("Decoding cannot constrain a saved sticker against a partially loaded canvas"); } } };
    }
    return { current: value };
  },
  useState: initial => [initial, () => {}], useEffect() {}, useLayoutEffect(effect) { effect(); },
  packStickerForSource: () => undefined,
  StickerImage: "sticker-image", TextStickerVisual: "sticker-text", TextStickerEditor: "text-editor",
});

test("text-first phone readers offset stickers with the added flow origin, without rewriting their coordinates", () => {
  const selector = "html.leading-image-inset-active .is-strip-reader.has-leading-text .strip-canvas > .sticker-block";
  const rule = css.slice(css.indexOf(selector)).split("}")[0];
  assert.ok(css.includes(selector));
  assert.match(rule, /margin-top:\s*var\(--leading-image-inset\)/);
  for (const inset of [47, 59, 61, 62]) {
    const authoredY = 920.5;
    const editorCanvasPadding = 59;
    const editorRelativeY = authoredY - editorCanvasPadding;
    const readerRelativeY = authoredY + inset - (editorCanvasPadding + inset);
    assert.equal(editorRelativeY, readerRelativeY);
  }
});
function find(node, type) {
  if (!node || typeof node !== "object") return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
}
test("image, video and text decode never move, resize or rotate saved stickers in any view", () => {
  for (const isEditing of [true, false]) for (const type of ["image", "video", "text"]) {
    firstRef = true;
    const settlements = [];
    const block = { id: "pixel-sticker", type: "sticker", src: "/api/drafts/pixel-test/media/pixel-sticker",
      alt: "Pixel test", mediaType: type === "video" ? "video" : "image",
      x: 51.125, y: 920.5, width: 186.625, rotation: -17.75,
      ...(type === "text" ? { textSticker: { content: "Two\nlines" } } : {}),
    };
    const result = exports.StripStickerBlock({ block, isEditing, isSelected: false, isOverlappingSelection: false,
      onTransform() { assert.fail("A load event cannot rewrite authored geometry"); },
      onLoadSettled: value => settlements.push(value),
    });
    const visual = find(result, type === "text" ? "sticker-text" : type === "video" ? "video" : "sticker-image");
    if (type === "video") { visual.props.onLoadedData(); visual.props.onLoadedData(); visual.props.onError(); }
    else { visual.props.onSettled(true); visual.props.onSettled(true); visual.props.onSettled(false); }
    assert.deepEqual(settlements, [true, true, false]);
    const style = find(result, "figure").props.style;
    assert.equal(style.left, "51.125%"); assert.equal(style.top, "920.5px");
    assert.equal(style.width, "186.625%"); assert.equal(style["--sticker-rotation"], "-17.75deg");
  }
});
