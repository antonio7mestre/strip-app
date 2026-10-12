import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as profile from "../app/lib/profile.ts";
import * as alignment from "../app/lib/text-alignment.ts";
import * as sizing from "../app/lib/font-sizing.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, Intl, ...globals, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const data = compile("app/lib/text-sticker.ts", { "./profile": profile, "./text-alignment": alignment });
const base = { content: "Hello\nhi", fontStyle: "letter", fontSize: 32, textColor: "#FFFFFF", textAlign: "center" };
const focus = compile("app/lib/text-sticker-focus.ts");

test("focus scales the complete layout without changing its font-to-width ratio or line wrapping", () => {
  for (const fontSize of [14, 20, 32, 48, 72]) {
    const saved = Object.freeze({ ...base, fontSize });
    const focused = focus.focusedTextSticker(saved);
    assert.equal(focused.fontSize, fontSize);
    assert.equal(saved.fontSize, fontSize);
    for (const key of ["content", "fontStyle", "textColor", "textAlign"]) assert.equal(focused[key], saved[key]);
    assert.equal(focus.focusedTextSticker({ ...saved, content: "Edited words" }).fontSize, fontSize);
  }
  assert.equal(focus.focusedTextSticker({ ...base, fontSize: 24 }).fontSize, 24,
    "intentional size changes use the same layout while typing and after completion");
  assert.ok(Math.abs(focus.textStickerFocusWidth(390, 390) - 358.8) < 0.001);
  assert.equal(focus.textStickerFocusWidth(640, 1440), 560);
  assert.ok(focus.textStickerFocusWidth(640, 320) <= 296);
});

function scrollEnvironment(top, left = 0) {
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
      dispatch: type => listeners.get(type)?.forEach(callback => callback()),
      listenerCount: () => [...listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0),
    };
  };
  const viewport = target(), calls = [];
  const window = { ...target(), visualViewport: viewport, scrollX: left, scrollY: top,
    scrollTo(options) {
      calls.push({ ...options });
      this.scrollX = options.left;
      this.scrollY = options.top;
      this.dispatch("scroll");
    },
  };
  const document = { documentElement: { scrollHeight: 2200, clientHeight: 800 } };
  const { installTextStickerScrollAnchor } = compile("app/lib/text-sticker-focus.ts", {}, { window, document });
  return { window, viewport, document, calls, installTextStickerScrollAnchor };
}

test("typing holds the original page position through focus and keyboard changes then releases it", () => {
  for (const top of [0, 62, 450]) {
    const env = scrollEnvironment(top, 3);
    const release = env.installTextStickerScrollAnchor();
    env.window.scrollY = top + 200;
    env.window.dispatch("focusin");
    assert.deepEqual(env.calls[0], { left: 3, top, behavior: "instant" });
    env.window.scrollY = top + 100;
    env.viewport.dispatch("resize");
    env.window.scrollY = top + 80;
    env.viewport.dispatch("scroll");
    env.window.scrollY = top + 50;
    env.window.dispatch("scroll");
    assert.equal(env.window.scrollY, top);
    assert.equal(env.calls.length, 4);
    env.viewport.dispatch("resize");
    env.window.dispatch("scroll");
    assert.equal(env.calls.length, 4, "stable pages and textarea-only scrolling need no correction");
    release();
    assert.equal(env.window.listenerCount() + env.viewport.listenerCount(), 0);
    env.window.scrollY = top + 200;
    env.window.dispatch("scroll");
    assert.equal(env.window.scrollY, top + 200, "ordinary scrolling returns immediately after typing");
    assert.equal(env.calls.length, 4);
  }
});

test("the typing anchor clamps shrinking documents and overscroll without changing safe-area styles", () => {
  const env = scrollEnvironment(1300);
  const release = env.installTextStickerScrollAnchor();
  env.document.documentElement.scrollHeight = 1000;
  env.viewport.dispatch("resize");
  assert.equal(env.window.scrollY, 200);
  assert.equal(env.calls.length, 1, "clamped scroll events cannot cause a restore loop");
  release();
  const overscroll = scrollEnvironment(-30);
  const stop = overscroll.installTextStickerScrollAnchor();
  overscroll.window.dispatch("focusin");
  assert.equal(overscroll.window.scrollY, 0);
  stop();
  assert.doesNotMatch(read("app/lib/text-sticker-focus.ts"), /\.style|theme-color|--top-safe-area|setInterval/,
    "the anchor does not change document paint or lock body layout");
});

test("typing is sized and positioned before focus and the leading-edge spring yields to it", () => {
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /useLayoutEffect\(installTextStickerScrollAnchor, \[\]\)/);
  assert.match(editor, /transform: initialTransformRef.current/);
  const visual = read("app/components/TextStickerVisual.tsx");
  assert.ok(visual.indexOf('input.style.height = "0px"') < visual.indexOf("input?.focus"));
  assert.ok(visual.indexOf("input?.setSelectionRange") < visual.indexOf("input?.focus"));
  assert.match(visual, /focus\(\{ preventScroll: true \}\)/);
  assert.match(read("app/lib/leading-media-top.ts"), /\.text-sticker-editor-layer/);
});

function renderer() {
  const drawings = [];
  const makeCanvas = () => {
    const ops = [];
    const context = {
      measureText: text => ({ width: [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length * 10,
        actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 8 }),
      scale: (...args) => ops.push(["scale", ...args]),
      fillRect: (...args) => ops.push(["rect", context.fillStyle, ...args]),
      fillText: (...args) => ops.push(["text", context.fillStyle, context.textAlign, ...args]),
    };
    const canvas = { width: 0, height: 0, ops, getContext: () => context, toDataURL: () => "data:image/png;base64,AA==" };
    drawings.push(canvas);
    return canvas;
  };
  const document = { fonts: { load: async () => [] }, createElement: type => {
    assert.equal(type, "canvas"); return makeCanvas();
  } };
  return { ...compile("app/lib/text-sticker-render.ts", {
    "./font-sizing": sizing, "./profile": profile, "./text-sticker": data,
  }, { document }), makeCanvas, drawings };
}

test("metadata accepts plain editable words, validates colors and retains the existing font families", () => {
  for (const value of [null, "", [], {}, { content: 4 }]) assert.equal(data.normalizeTextSticker(value), undefined);
  const result = data.normalizeTextSticker({ content: "a\r\nb\u0000\rc", fontStyle: "missing", fontSize: Infinity,
    textColor: "url(bad)", textAlign: "bad", backgroundColor: "red" });
  assert.equal(result.content, "a\nb\nc");
  assert.equal(result.fontStyle, "letter");
  assert.equal(result.fontSize, 32);
  assert.equal(result.textColor, "#FFFFFF");
  assert.equal(result.textAlign, "left");
  assert.equal(result.backgroundColor, undefined);
  assert.equal(data.normalizeTextSticker({ ...base, fontSize: 999, backgroundColor: "#aabbcc" }).fontSize, 72);
  assert.equal(data.normalizeTextSticker({ ...base, backgroundColor: "#aabbcc" }).backgroundColor, "#AABBCC");
  assert.equal(data.normalizeTextSticker({ ...base, content: "x".repeat(1000) }).content.length, 280);
  for (const font of profile.PROFILE_FONTS) assert.equal(data.normalizeTextSticker({ ...base, fontStyle: font.id }).fontStyle, font.id);
});

test("wrapping preserves explicit new lines and whole emoji sequences", () => {
  const r = renderer(), measure = { measureText: text => ({ width: [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length * 10 }) };
  assert.deepEqual(Array.from(r.textStickerLines(measure, "one two three\n\nfour", 70)), ["one two", "three", "", "four"]);
  assert.deepEqual(Array.from(r.textStickerLines(measure, "👩🏽‍🚀👩🏽‍🚀👩🏽‍🚀", 20)), ["👩🏽‍🚀👩🏽‍🚀", "👩🏽‍🚀"]);
});

test("background is exactly one sharp rectangle fitted to the longest line for every alignment", async () => {
  const r = renderer();
  for (const [textAlign, expectedX] of [["left", 0], ["center", 123], ["right", 246]]) {
    const canvas = r.makeCanvas();
    const result = await r.paintTextSticker(canvas, { ...base, textAlign, backgroundColor: "#FF0066" });
    assert.equal(result.backgroundWidth, 74, "five letters at 10px plus 12px padding each side");
    assert.equal(result.backgroundX, expectedX);
    const rects = canvas.ops.filter(op => op[0] === "rect");
    assert.equal(rects.length, 1);
    assert.deepEqual(rects[0], ["rect", "#FF0066", expectedX, 0, 74, result.height]);
    assert.equal(canvas.ops.filter(op => op[0] === "text").length, 2);
    assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  }
  const plain = r.makeCanvas();
  await r.paintTextSticker(plain, base);
  assert.equal(plain.ops.filter(op => op[0] === "rect").length, 0);
});

test("the export waits for the same normalized font as the on-page editor and bounds large artwork", async () => {
  const r = renderer();
  for (const font of profile.PROFILE_FONTS) {
    const input = { ...base, fontStyle: font.id };
    assert.ok(r.textStickerFont(input).includes(`${sizing.normalizedFontSize(font.id, 32)}px`));
    assert.ok(r.textStickerFont(input).includes(font.family));
  }
  const canvas = r.makeCanvas();
  await r.paintTextSticker(canvas, { ...base, content: "\n".repeat(280), fontSize: 72 });
  assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  await r.renderTextSticker(base);
  const count = r.drawings.length;
  await r.renderTextSticker({ ...base });
  assert.equal(r.drawings.length, count, "autosave reuses identical artwork");
});

test("text uploads keep editable metadata and exact placement, while dropping unfinished empty labels", async () => {
  const r = renderer();
  const upload = compile("app/lib/sticker-upload.ts", {
    "./sticker-pack": { STICKER_PACK: [] }, "./text-sticker": data, "./text-sticker-render": r,
  });
  const block = { id: "words", type: "sticker", src: data.EMPTY_TEXT_STICKER_SRC, textSticker: base, x: 30, y: 220, width: 48, rotation: 23 };
  const result = await upload.prepareStickerUploads([block, { ...block, id: "empty", textSticker: { ...base, content: "  " } }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].stickerOrigin, "text");
  assert.equal(result[0].src, "data:image/png;base64,AA==");
  assert.equal(result[0].textSticker.content, base.content);
  for (const key of ["x", "y", "width", "rotation"]) assert.equal(result[0][key], block[key]);
  assert.equal(block.src, data.EMPTY_TEXT_STICKER_SRC, "the displayed editor source stays untouched");
});

test("text shares the sticker transforms and style picker, with a single pill and counter-rotating icons", () => {
  const page = read("app/page.tsx"), css = read("app/globals.css");
  assert.match(page, /onText=\{addTextSticker\}/);
  assert.match(page, /isTextSticker=\{block.type === "sticker"/);
  assert.doesNotMatch(page, /aria-label="Edit sticker text"/);
  assert.match(page, /textTap && !cancelled && !textTap.moved\) onTextEdit\?\.\(\)/);
  assert.doesNotMatch(css, /\.text-sticker-visual[^\{]*::after/);
  assert.match(css, /\.text-sticker-input:focus-visible\s*\{\s*outline: 0;/);
  assert.doesNotMatch(css, /\.text-sticker-typing-background/);
  assert.match(page, /Choose sticker background/);
  assert.match(page, /allowTransparentBackground transparentBackground=/);
  assert.match(page, /No sticker background/);
  assert.match(page, /querySelector\("img, video, canvas"\)/);
  assert.match(css, /\.sticker-delete-anchor\.has-text-tools\s*\{[^}]*border-radius: 999px;/s);
  assert.match(css, /\.sticker-delete-control\s*\{[^}]*rotate\(var\(--sticker-counter-rotation/s);
  assert.match(read("app/components/TextStickerVisual.tsx"), /aria-label="Sticker text"/);
});

test("typing is temporary, does not move the saved sticker, and keeps the same tools with an explicit checkmark", () => {
  const page = read("app/page.tsx");
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /createPortal/);
  assert.match(editor, /viewport\?\.addEventListener\("resize"/);
  assert.match(editor, /typing finishOnBlur\s/);
  assert.match(editor, /focusedTextSticker\(value\)/);
  assert.doesNotMatch(editor, /initialFontSize/);
  assert.match(editor, /TextStickerVisual value=\{focusedValue\}/);
  assert.match(read("app/layout.tsx"), /<PageDimmer \/>/);
  const backdrop = read("app/globals.css").split(".page-dimmer {")[1].split("}")[0];
  assert.match(backdrop, /z-index: 29/); // Above the canvas, below the existing tool docks.
  assert.match(backdrop, /opacity: var\(--page-dim-opacity\)/);
  assert.match(backdrop, /position: absolute/);
  assert.doesNotMatch(backdrop, /position: fixed|safe-area-inset-top/);
  assert.match(backdrop, /pointer-events: none/);
  assert.doesNotMatch(editor, /onTransform|setBlocks/);
  assert.match(page, /onConfirmStickerText \? "Done typing sticker" : "Delete sticker"/);
  assert.match(page, /if \(!isEditing \|\| textTyping\) return/);
  assert.match(page, /isEditing && textTyping && block.textSticker \? <TextStickerEditor/);
  assert.match(read("app/globals.css"), /\.sticker-block\.is-text-composing\s*\{ opacity: 0;/);
  const visual = read("app/components/TextStickerVisual.tsx");
  assert.match(visual, /value.backgroundColor \? "has-background"/);
  assert.match(visual, /if \(finishOnBlur\) callbacks.current.onFinish\(\)/);
});



test("focused and placed text share one rendered artwork, including its sharp background", () => {
  const { TextStickerVisual } = compile("app/components/TextStickerVisual.tsx", {
    "react": { useLayoutEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    "react/jsx-runtime": jsxRuntime,
    "@/app/lib/font-sizing": sizing, "@/app/lib/profile": profile,
    "@/app/lib/text-sticker-render": { paintTextSticker() {} },
    "@/app/lib/text-sticker": data,
  });
  for (const font of profile.PROFILE_FONTS) for (const textAlign of ["left", "center", "right"]) {
    const value = { ...base, fontStyle: font.id, textAlign, backgroundColor: "#FF0066" };
    const make = typing => TextStickerVisual({ value, typing, onChange() {}, onFinish() {}, onSettled() {} });
    const focused = make(true).props.children, placed = make(false).props.children;
    assert.equal(focused.props.className, "text-sticker-artwork");
    assert.deepEqual(focused.props.style, placed.props.style);
    const [focusCanvas, input] = focused.props.children, [placedCanvas] = placed.props.children;
    assert.deepEqual(focusCanvas.props.style, placedCanvas.props.style);
    assert.equal(focusCanvas.props.style.opacity, 1);
    assert.equal(focusCanvas.props["aria-hidden"], true, "typing has a single accessible native input");
    assert.equal(input.props.style.fontSize, sizing.normalizedFontSize(font.id, base.fontSize));
    assert.equal(input.props.style.textAlign, textAlign);
  }
  const css = read("app/globals.css"), visual = read("app/components/TextStickerVisual.tsx");
  assert.match(css, /color: transparent; -webkit-text-fill-color: transparent;/);
  assert.match(css, /caret-color: var\(--text-sticker-color\)/);
  assert.doesNotMatch(visual, /visibility: typing|setWidth\(element.offsetWidth|fontSize:.*\* scale/);
});

test("focus handoff preserves fractional dimensions instead of rounding the sticker", () => {
  const { textStickerLayoutSize } = compile("app/lib/text-sticker-motion.ts", {}, {
    getComputedStyle: () => ({ width: "397.4375px", height: "121.21875px" }),
  });
  const size = textStickerLayoutSize({ offsetWidth: 397, offsetHeight: 121 });
  assert.equal(size.width, 397.4375);
  assert.equal(size.height, 121.21875);
});

test("keyboard Done commits text through blur, while Return still adds a line", () => {
  let finishes = 0;
  const { TextStickerVisual } = compile("app/components/TextStickerVisual.tsx", {
    "react": { useLayoutEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    "react/jsx-runtime": jsxRuntime,
    "@/app/lib/font-sizing": sizing,
    "@/app/lib/profile": profile,
    "@/app/lib/text-sticker-render": { paintTextSticker() {} },
    "@/app/lib/text-sticker": data,
  });
  const visual = TextStickerVisual({ value: base, typing: true, finishOnBlur: true,
    onChange() {}, onFinish: () => finishes++, onSettled() {} });
  const input = visual.props.children.props.children.find(child => child?.type === "textarea");
  assert.ok(input);
  input.props.onBlur();
  assert.equal(finishes, 1, "native keyboard Done uses the same finish callback");
  const key = { key: "Enter", metaKey: false, ctrlKey: false,
    stopPropagation() {}, preventDefault() { throw new Error("Return must remain a newline"); },
    currentTarget: { blur: () => input.props.onBlur() } };
  input.props.onKeyDown(key);
  assert.equal(finishes, 1);
  for (const shortcut of [{ key: "Escape" }, { key: "Enter", metaKey: true }, { key: "Enter", ctrlKey: true }]) {
    const before = finishes;
    input.props.onKeyDown({ ...key, ...shortcut, preventDefault() {} });
    assert.equal(finishes, before + 1, "keyboard shortcuts finish once via blur");
  }
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /typing finishOnBlur\s+onChange=\{onChange\} onFinish=\{finish\}/);
  assert.match(editor, /if \(alreadyClosing\) return;/, "programmatic blur cannot restart the return animation");
  assert.ok(editor.indexOf("closingRef.current = true") < editor.indexOf('querySelector<HTMLTextAreaElement>("textarea")?.blur()'));
});

test("typing eases from its placed geometry and returns before handing control back", () => {
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /source.getBoundingClientRect\(\)/);
  assert.match(editor, /textStickerLayoutSize\(source\).width \/ Math.max\(1, textStickerLayoutSize\(panel\).width\)/);
  assert.doesNotMatch(editor, /value.fontSize \/ focusedValue.fontSize/);
  assert.match(editor, /getPropertyValue\("--sticker-rotation"\)/);
  assert.match(editor, /onConfirmStickerText: \(\) => finish\(\)/);
  assert.match(editor, /stepTextStickerSpring/);
  assert.match(editor, /targetRef.current\(\)/);
  assert.match(editor, /elapsed >= 440/);
  assert.match(editor, /completeRef.current\(\)/);
  assert.doesNotMatch(editor, /\.animate\(|getComputedStyle\(panel\)/);
  assert.doesNotMatch(editor, /--top-safe-area-color|theme-color|scrollTo|documentElement.style|document.body.style/);
});

test("returning text stays opaque until the placed copy is painted and typing closes in one commit", () => {
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /createPortal, flushSync/);
  assert.match(editor, /panel.style.opacity = String\(closingRef.current \? 1 :/);
  assert.doesNotMatch(editor, /1 - handoff|\(elapsed - 300\) \/ 140/);
  assert.match(editor, /setProperty\("--text-sticker-return-opacity", "1"\)/);
  assert.match(editor, /handoffFramesRef.current >= 2/);
  const complete = editor.split("completeRef.current = () => {")[1].split("// One compositor")[0];
  assert.match(complete, /flushSync\(\(\) =>/);
  assert.doesNotMatch(complete, /delete source.dataset.textReturning|removeProperty/,
    "the placed copy must not be hidden while React still considers it composing");
  assert.match(editor, /useLayoutEffect\(\(\) => \(\) => \{[\s\S]*?delete sourceRef.current.dataset.textReturning/,
    "temporary visibility is released only during the synchronous unmount");
});



test("text tool frames follow scaled artwork without scaling the pill or its icons", () => {
  const { textStickerToolFrame } = compile("app/lib/text-sticker-motion.ts");
  for (const scale of [.1, .4, .88, 1, 1.6, 4]) {
    for (const rotation of [-45, 0, 30, 180]) {
      const frame = textStickerToolFrame({ x: 250, y: 320, scale, rotation }, 400, 120);
      assert.equal(frame.width, 400 * scale);
      assert.equal(frame.height, 120 * scale);
      assert.equal(frame["--sticker-counter-rotation"], String(-rotation) + "deg");
      assert.doesNotMatch(frame.transform, /scale/, "only the orbit geometry changes, not the controls");
    }
  }
  const editor = read("app/components/TextStickerEditor.tsx"), css = read("app/globals.css");
  assert.match(editor, /<div ref=\{toolsRef\} className="text-sticker-editor-tools"/);
  assert.match(editor, /paintTools\(target\)/);
  assert.match(editor, /initialToolsStyleRef.current = textStickerToolFrame/);
  assert.doesNotMatch(css.split(".text-sticker-editor-tools {")[1].split("}")[0], /opacity|scale\(/);
  assert.match(css, /\.is-text-composing \{[^}]*transition: none/);
  assert.match(css, /\.is-text-composing\[data-text-returning\] \.sticker-delete-orbit \{ visibility: hidden;/);
});

test("typing tools open as the keyboard drops, independently of placement motion", () => {
  const editor = read("app/components/TextStickerEditor.tsx");
  assert.match(editor, /onConfirmStickerText: \(\) => finish\(\)/);
  assert.match(editor, /onTextTool: tool => finish\(\(\) => controls.props.onTextTool\?\.\(tool\)\)/);
  assert.match(editor, /const alreadyClosing = closingRef.current/);
  assert.match(editor, /querySelector<HTMLTextAreaElement>\("textarea"\)\?\.blur\(\)/);
  const handoff = editor.split("completeRef.current = () => {")[1].split("const paintTools")[0];
  assert.match(handoff, /!toolRequestedRef.current && isValidElement/);
  assert.doesNotMatch(handoff, /openTool|afterFinish/);
  const finish = editor.split("const finish = (openTool?")[1].split("const typingControls")[0];
  assert.ok(finish.indexOf(".blur()") < finish.indexOf("openTool();"));
  assert.ok(finish.indexOf("openTool();") < finish.indexOf("if (alreadyClosing) return;"));
  assert.ok(finish.indexOf("openTool();") < finish.indexOf("wakeRef.current()"));
  assert.doesNotMatch(read("app/globals.css"), /\.is-closing \.sticker-delete-control\s*\{\s*pointer-events: none/);
  for (const tool of ["font", "color", "background"]) {
    assert.ok(read("app/page.tsx").includes('if (onConfirmStickerText) onTextTool?.("' + tool + '");'),
      "typing tool intent is handled on pointer down, before native keyboard dismissal");
  }
});

test("blur-first and tap-first tool switches both survive the return handoff", () => {
  const editorSource = read("app/components/TextStickerEditor.tsx");
  const finishBody = editorSource.split("const finish = (openTool?: () => void) => {")[1].split("  const typingControls")[0];
  const completeBody = editorSource.split("completeRef.current = () => {")[1].split("  const paintTools")[0];
  for (const sequence of [["blur", "font"], ["font", "blur"], ["blur", "font", "color", "background"]]) {
    const calls = [];
    const context = {
      closingRef: { current: false }, toolRequestedRef: { current: false },
      value: { content: "Keep these words" }, motionRef: { current: {} },
      sourceRef: { current: { dataset: {} } }, startedRef: { current: 0 },
      performance: { now: () => 0 }, setClosing: () => calls.push("closing"),
      wakeRef: { current: () => calls.push("motion") },
      completeRef: { current: null }, flushSync: callback => callback(),
      isValidElement: () => true,
      controls: { props: { onConfirmStickerText: () => calls.push("reset tools") } },
      onFinish: () => calls.push("finish typing"),
    };
    context.panelRef = { current: { querySelector: () => ({ blur: () => context.finish() }) } };
    runInNewContext(ts.transpileModule("finish = (openTool) => {" + finishBody +
      "\ncompleteRef.current = () => {" + completeBody, { compilerOptions: {
        target: ts.ScriptTarget.ES2022,
      } }).outputText, context);
    for (const action of sequence) context.finish(action === "blur" ? undefined : () => calls.push(action));
    assert.equal(calls.filter(call => call === "closing").length, 1);
    assert.equal(calls.filter(call => call === "motion").length, 1, "changing tools never restarts placement");
    for (const action of sequence.filter(action => action !== "blur")) {
      assert.ok(calls.includes(action), action + " opens before the return completes");
    }
    context.completeRef.current();
    assert.equal(calls.at(-1), "finish typing");
    assert.ok(!calls.includes("reset tools"), "placement never closes the selected tool");
  }
});

test("text motion stays continuous when the keyboard retargets it, without overshoot", () => {
  const { stepTextStickerSpring: step } = compile("app/lib/text-sticker-motion.ts");
  let axis = { value: 700, velocity: 0 };
  for (let i = 0; i < 12; i++) axis = step(axis, 450, 1000 / 60);
  const previous = axis;
  axis = step(axis, 260, 1000 / 60);
  assert.ok(axis.value < previous.value && axis.value > 260);
  assert.ok(Math.abs(axis.value - previous.value) < 30, "retargeting does not snap to the keyboard position");
  for (let i = 0; i < 90; i++) {
    const next = step(axis, 260, 1000 / 60);
    assert.ok(next.value >= 260 - .001);
    axis = next;
  }
  assert.ok(Math.abs(axis.value - 260) < .001);
  const one = step({ value: 0, velocity: 0 }, 400, 32);
  const two = step(step({ value: 0, velocity: 0 }, 400, 16), 400, 16);
  assert.ok(Math.abs(one.value - two.value) < 1e-9, "motion is independent of frame rate");
  assert.match(read("app/page.tsx"), /closest\("\.auth-shell, \.title-setup-mode, \.text-sticker-editor-layer"\)/);
});
