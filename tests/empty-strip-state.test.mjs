import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as guide from "../app/lib/empty-state-guide.ts";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
function compile(source, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, ...globals });
  return exports;
}
const component = compile(read("app/components/EmptyStripState.tsx"), {
  require: name => ({
    react: React, "react/jsx-runtime": jsx,
    "@/app/lib/empty-state-guide": guide,
    "@/app/components/StickerImage": { StickerImage: props => React.createElement("img", props) },
    "./EmptyStripState.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
  })[name],
}).EmptyStripState;
const render = props => renderToStaticMarkup(React.createElement(component, props));

test("empty profile and editor have simple copy, three existing cutouts and a control-specific arrow", () => {
  for (const kind of ["profile", "editor"]) {
    const html = render({ kind });
    assert.equal((html.match(/<img /g) ?? []).length, 3);
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) {
      assert.ok(existsSync(new URL(`public${src}`, root)), `${src} exists`);
    }
    assert.equal((html.match(/alt=""/g) ?? []).length, 3);
    assert.equal((html.match(/draggable="false"/g) ?? []).length, 3);
    assert.match(html, /class="artwork" aria-hidden="true"/);
    assert.match(html, /class="arrowGraphic" aria-hidden="true"/);
    assert.doesNotMatch(html, /<button|data-block-id|sticker-block|data-landing-sticker|<input|contenteditable/,
      "Guidance is not user content or a second set of controls");
    assert.match(html, kind === "profile" ? /Your photos\.<br\/>Your words\.<br\/>Your world\./ : /Your Strip<br\/>starts here\./);
    assert.match(html, kind === "profile" ? /click here to make a strip/ : /pick a starting block/);
    assert.doesNotMatch(html, /Tap \+|tap \+/);
    assert.match(html, /class="lettering" role="img" aria-label=/);
    assert.match(html, /--empty-state-lettering:url\(&quot;\/empty-states\//);
  }
});

test("profile editing removes the plus guidance, without changing the empty layout", () => {
  const html = render({ kind: "profile", editing: true });
  assert.match(html, /Your photos/);
  assert.equal((html.match(/<img /g) ?? []).length, 3);
  assert.doesNotMatch(html, /click here to make a strip|arrowGraphic|class="guide"/);
});

test("Drafts and History share one empty treatment; public profiles do not point at private tools", () => {
  const page = read("app/page.tsx");
  assert.match(page, /\(isHistory \|\| isDraftLibrary\) && libraryItems\.length === 0/);
  assert.match(page, /<div className="library-empty-state" role="status">/);
  assert.match(page, /isDraftLibrary \? "No drafts yet\." : "No viewing history yet\."/);
  assert.match(page, /Strips you’re working on will appear here\./);
  const publicEmpty = page.indexOf('viewingPublicProfile && libraryItems.length === 0');
  const ownerEmpty = page.indexOf('<EmptyStripState kind="profile"');
  assert.ok(publicEmpty > 0 && publicEmpty < ownerEmpty);
  assert.match(page, /sourceBlocks\.length === 0 && isEditing \? \(\s*<div className="empty-strip">\s*<EmptyStripState kind="editor" \/>/);
  assert.match(page, /<EmptyStripState kind="profile" editing=\{stripProfile\.editing\} \/>/);
  assert.doesNotMatch(page, /Make your first Strip<\/button>/);
});

test("guidance inherits profile type/ink, has no shadow and cannot swallow tool taps", () => {
  const css = read("app/components/EmptyStripState.module.css");
  assert.match(css, /color: inherit/);
  assert.match(css, /font-family: var\(--profile-font/);
  assert.match(css, /mask: url\("\/landing\/sticker-help-arrow.png"\)/);
  assert.match(css, /\.editor \.arrowGraphic \{[^}]*scaleX\(-1\)/);
  assert.match(css, /\.profile \.arrowGraphic \{ left: 104px; top: 0; \}/);
  assert.match(css, /\.profile \.lettering \{[^}]*left: -26px; top: -14px/);
  assert.match(css, /\.artwork \{[^}]*--empty-guide-left[^}]*--empty-guide-top/s);
  assert.match(css, /\.editor \.arrowGraphic \{[^}]*top: -8px/);
  assert.match(css, /\.editor \.lettering \{[^}]*left: 104px/);
  assert.match(css, /\.guide \{[^}]*position: absolute;[^}]*pointer-events: none/s);
  assert.match(css, /\.artwork \{[^}]*pointer-events: none/s);
  assert.doesNotMatch(css, /box-shadow|drop-shadow|100[lsd]?vh|position: fixed|animation:|transition:/);
  assert.match(css, /max-height: 650px/);
  assert.match(css, /background: currentColor;[\s\S]*mask: var\(--empty-state-lettering\)/,
    "Generated handwriting keeps its alpha and follows readable theme ink");
  const source = read("app/components/EmptyStripState.tsx");
  assert.match(source, /<StickerImage/);
  for (const src of ["items/digital-camera.webp", "random/pearl-star.webp", "scrap/notebook-scrap.webp"]) {
    assert.ok(render({ kind: "editor" }).includes(src));
  }
  assert.match(render({ kind: "editor" }), /class="textGlyph">Aa<\/span>/);
  assert.doesNotMatch(source, /setBlocks|placeSticker|addSticker|onPointer|onTouch|onClick/);
});

test("both generated handwritten labels ship as transparent landscape PNGs", () => {
  for (const name of ["create-strip", "starting-block"]) {
    const file = readFileSync(new URL(`public/empty-states/${name}.png`, root));
    assert.equal(file.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(file[25], 6, "RGBA preserves generated transparency");
    assert.ok(file.readUInt32BE(16) / file.readUInt32BE(20) >= 2);
    assert.ok(file.length < 1024 * 1024);
  }
});

test("the arrow tip follows the real plus or media control across viewport sizes and page scroll", () => {
  for (const kind of ["profile", "editor"]) {
    for (const width of [320, 390, 430, 768, 1440]) {
      for (const scroll of [0, 12, 100, 500]) {
        const origin = { left: 20, top: 110 - scroll, width: width - 40, height: 500 };
        const target = { left: kind === "profile" ? width - 74 : width / 2 - 150,
          top: 610, width: kind === "profile" ? 56 : 44, height: kind === "profile" ? 56 : 44 };
        const { left, top } = guide.emptyStateGuidePosition(origin, target, kind);
        const tip = { x: origin.left + left + (kind === "profile" ? 142 : 42), y: origin.top + top + 104 };
        if (kind === "profile") {
          assert.ok(Math.abs(Math.hypot(tip.x - target.left - 28, tip.y - target.top - 28) - Math.hypot(22, 22)) < .01);
          assert.ok(tip.x < target.left + 28 && tip.y < target.top + 28);
        } else {
          assert.equal(tip.x, target.left + 22);
          assert.equal(tip.y, target.top - 8);
        }
      }
    }
  }
});

test("resize, Safari chrome and scroll keep guidance aligned, with complete cleanup and no page mutations", () => {
  const listeners = [];
  const surface = name => ({
    addEventListener: (event, callback, options) => listeners.push({ name, event, callback, options }),
    removeEventListener: (event, callback) => {
      const index = listeners.findIndex(item => item.name === name && item.event === event && item.callback === callback);
      assert.ok(index >= 0); listeners.splice(index, 1);
    },
  });
  let targetRect = { left: 315, top: 650, width: 56, height: 56 };
  let originRect = { left: 20, top: 110, width: 350, height: 600 };
  const target = { getBoundingClientRect: () => targetRect };
  const page = { ...surface("page"), querySelector: selector => {
    assert.equal(selector, ".library-add-button"); return target;
  } };
  const positions = new Map();
  const origin = { closest: selector => { assert.equal(selector, ".app-shell"); return page; }, getBoundingClientRect: () => originRect,
    style: { setProperty: (key, value) => positions.set(key, value), removeProperty: key => positions.delete(key) } };
  const attributes = new Map();
  const arrow = { style: {}, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  let observer;
  const lib = compile(read("app/lib/empty-state-guide.ts"), {
    window: { ...surface("window"), visualViewport: surface("viewport") },
    ResizeObserver: class {
      constructor(sync) { observer = { sync, nodes: [], disconnected: false }; }
      observe(node) { observer.nodes.push(node); }
      disconnect() { observer.disconnected = true; }
    },
  });
  const stop = lib.installEmptyStateGuide(origin, arrow, "profile");
  assert.equal(attributes.get("data-positioned"), "true");
  assert.equal(positions.get("--empty-guide-left"), arrow.style.left);
  assert.equal(positions.get("--empty-guide-top"), arrow.style.top);
  assert.deepEqual(observer.nodes, [origin, target]);
  targetRect = { ...targetRect, top: 710 };
  listeners.find(item => item.name === "viewport" && item.event === "resize").callback();
  assert.equal(parseFloat(arrow.style.top) + originRect.top + 104, 716);
  originRect = { ...originRect, top: -40 };
  listeners.find(item => item.name === "window" && item.event === "scroll").callback();
  assert.equal(parseFloat(arrow.style.top) + originRect.top + 104, 716);
  targetRect = { ...targetRect, width: 0 };
  observer.sync();
  assert.equal(attributes.has("data-positioned"), false);
  stop();
  assert.equal(listeners.length, 0);
  assert.equal(observer.disconnected, true);
  assert.equal(positions.size, 0);
  assert.doesNotMatch(read("app/lib/empty-state-guide.ts"), /scrollTo|scrollBy|preventDefault|document\.body|documentElement|requestAnimationFrame/);
});
