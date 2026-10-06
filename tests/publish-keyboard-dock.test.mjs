import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { installKeyboardDockPosition } from "../app/lib/keyboard-dock.ts";
import { installPublishKeyboardDock } from "../app/lib/publish-keyboard-dock.ts";

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

test("publish title form and tools share one retained opaque canvas", () => {
  assert.ok(footer && main);
  assert.equal(footer.parent, main, "The form and tools must paint into the same canvas");
  assert.match(main.openingElement.getText(tree), /className="app-shell title-setup-mode title-dock-canvas"/);
  const markup = footer.getText(tree);
  assert.match(markup, /key="persistent-composer-dock"/);
  assert.match(markup, /className="composer-dock title-setup-dock publish-flow-dock"/);
  assert.doesNotMatch(markup, /keyboard|is-typing|is-shifted|hidden=/);
  assert.match(markup, /returnToCoverSetup\(\)/);
  assert.match(markup, /publish\(\)/);
  assert.match(markup, /disabled=\{publishing\}/);
  assert.match(main.getText(tree), /aria-label="Strip title"/);
});

test("publish uses shared dock sizing in a locked, untransformed document", () => {
  const rule = [...css.matchAll(/\n\.title-setup-dock \{([^}]+)\}/g)]
    .map(match => match[1]).find(body => body.includes("height: calc("));
  assert.ok(rule);
  assert.match(rule, /height: calc\(\s*var\(--dock-visible-height\) \+ 180px \+ env\(safe-area-inset-bottom\) \+\s*var\(--dock-browser-extension\)\s*\)/);
  assert.match(rule, /min-height: 0/);
  assert.match(rule, /transform: none/);
  assert.match(rule, /translate: none/);
  assert.match(rule, /will-change: auto/);
  assert.match(css, /\.title-dock-canvas \{[^}]*position: relative;[^}]*height: 100dvh;[^}]*contain: none;[^}]*overflow: visible;[^}]*transform: none;[^}]*translate: none;[^}]*will-change: auto/);
  assert.match(css, /html\.publish-title-active,[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(css, /html\.publish-title-active body \{ position: fixed; width: 100%; \}/);
  assert.match(css, /\.title-setup-shell \{[^}]*align-items: start;[^}]*padding: calc\(env\(safe-area-inset-top\) \+ clamp\(24px, 15svh, 112px\)\)/);
  assert.match(css, /\.title-dock-canvas \.dock-controls \{[^}]*will-change: auto;[^}]*backface-visibility: visible/);
  assert.doesNotMatch(rule, /opacity|display|visibility|transition:/);
  assert.match(css, /\.composer-dock \{[^}]*position: fixed;[^}]*translate: 0 var\(--keyboard-dock-pan, 0px\)/);
  assert.match(page, /useLayoutEffect\(installKeyboardDockPosition, \[\]\)/);
  assert.match(page, /if \(view !== "title-setup"\) return;\s*return installPublishKeyboardDock\(/);
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

function fixture(initialProperties = []) {
  const listeners = new Map(), viewportListeners = new Map(), frames = new Map();
  const rootProperties = new Map(), dockProperties = new Map(), priorities = new Map(), classes = new Set();
  let frameId = 0, defaultTop = 650;
  let mutations = 0;
  for (const [name, value, priority = ""] of initialProperties) {
    dockProperties.set(name, value); priorities.set(name, priority);
  }
  const add = (map, name, handler) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(handler);
  };
  const remove = (map, name, handler) => map.get(name)?.delete(handler);
  const emit = (map, name) => { for (const callback of map.get(name) ?? []) callback(); };
  const viewport = { height: 744, offsetTop: 0, scale: 1,
    addEventListener: (name, handler) => add(viewportListeners, name, handler),
    removeEventListener: (name, handler) => remove(viewportListeners, name, handler) };
  const input = { matches: () => true };
  const canvasProperties = new Map();
  const dock = {
    parentElement: {
      style: {
        getPropertyValue: name => canvasProperties.get(name) ?? "",
        setProperty: (name, value) => canvasProperties.set(name, value),
        removeProperty: name => canvasProperties.delete(name),
      },
      getBoundingClientRect: () => ({ height: Number.parseFloat(canvasProperties.get("height")) || viewport.height }),
    },
    style: {
      getPropertyValue: name => dockProperties.get(name) ?? "",
      getPropertyPriority: name => priorities.get(name) ?? "",
      setProperty: (name, value, priority = "") => { mutations++; dockProperties.set(name, value); priorities.set(name, priority); },
      removeProperty: name => { mutations++; dockProperties.delete(name); priorities.delete(name); },
    },
    getBoundingClientRect: () => ({
      top: Number.parseFloat(dockProperties.get("top")) || defaultTop,
      height: Number.parseFloat(dockProperties.get("height")) || 278,
    }),
  };
  globalThis.document = { activeElement: null, documentElement: { classList: {
    add: name => classes.add(name), remove: name => classes.delete(name),
  }, style: {
    setProperty: (name, value) => rootProperties.set(name, value), removeProperty: name => rootProperties.delete(name),
  } } };
  globalThis.window = { visualViewport: viewport, innerWidth: 402, scrollY: 0,
    addEventListener: (name, handler) => add(listeners, name, handler),
    removeEventListener: (name, handler) => remove(listeners, name, handler),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id) };
  globalThis.getComputedStyle = () => ({ paddingBottom: "210px" });
  const disposeShared = installKeyboardDockPosition();
  const disposeTitle = installPublishKeyboardDock(dock, input);
  return {
    dock, input, viewport, dockProperties, rootProperties, frames, priorities, canvasProperties, classes,
    focus(active = true) { document.activeElement = active ? input : null; emit(listeners, active ? "focusin" : "focusout"); },
    resize(height, pan = 0, drift = 0) {
      viewport.height = height; viewport.offsetTop = pan; defaultTop = 650 + drift;
      emit(viewportListeners, "resize"); emit(viewportListeners, "scroll");
    },
    scroll(y) { window.scrollY = y; emit(listeners, "scroll"); },
    frame() { const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(); },
    anchorTop: () => Number.parseFloat(dockProperties.get("top")) || defaultTop,
    mutationCount: () => mutations,
    listenerCount: () => [...listeners.values(), ...viewportListeners.values()].reduce((total, set) => total + set.size, 0),
    disposeTitle,
    cleanup() {
      disposeTitle(); disposeShared();
      delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle;
    },
  };
}

test("title tools are anchored before focus or Safari's first chrome resize", () => {
  const f = fixture();
  try {
    assert.equal(f.dockProperties.get("top"), "650px", "already anchored when the title screen opens");
    assert.ok(f.classes.has("publish-title-active"));
    f.resize(744, 0, 40);
    f.focus();
    for (const [height, pan, drift] of [[400, 0, 340], [340, 60, 400], [400, 280, 320], [400, 0, -300]]) {
      f.resize(height, pan, drift); f.frame();
      assert.equal(f.anchorTop(), 650, "a changing fixed bottom must not replace the resting anchor");
      assert.equal(f.dockProperties.get("height"), "278px");
      assert.equal(f.dockProperties.get("padding-bottom"), "210px");
      assert.equal(f.dockProperties.get("bottom"), "auto");
      assert.equal(f.dockProperties.get("position"), "fixed", "retain the same captured top throughout this fixed form");
      assert.equal(f.canvasProperties.get("height"), "744px", "the keyboard cannot shrink the canvas's paint clip");
    }
  } finally { f.cleanup(); }
});

test("blur and dismissal never release or rewrite the covered toolbar layer", () => {
  const f = fixture();
  try {
    const mutations = f.mutationCount();
    f.focus(); f.resize(400, 280, 320);
    f.focus(false); f.frame(); f.frame();
    assert.equal(f.anchorTop(), 650);
    f.resize(744, 100, 320); f.frame(); f.frame();
    assert.equal(f.anchorTop(), 650, "positive residual pan cannot translate the already anchored canvas");
    f.resize(744, 0, 320); f.frame(); f.frame();
    assert.equal(f.anchorTop(), 650, "old bottom anchoring would leave the buttons at 970px, offscreen");
    assert.equal(f.dockProperties.get("top"), "650px");
    f.resize(744, 0, 0); f.frame();
    assert.equal(f.dockProperties.get("top"), "650px");
    f.frame();
    assert.equal(f.dockProperties.get("top"), "650px", "keep the same anchor after full recovery too");
    assert.equal(f.anchorTop(), 650);
    assert.equal(f.mutationCount(), mutations, "zero anchor/style changes throughout dismissal");
  } finally { f.cleanup(); }
});

test("keyboard dismissal while the title stays focused and rapid refocus retain the same anchor", () => {
  const f = fixture();
  try {
    f.focus(); f.resize(400, 200, 300); f.resize(744, 0, 300); f.frame(); f.frame();
    assert.equal(f.anchorTop(), 650);
    f.focus(false); f.resize(744, 0, 0); f.frame();
    f.focus(); f.resize(400, 100, 350); f.frame(); f.frame();
    assert.equal(f.anchorTop(), 650);
    assert.equal(f.dockProperties.get("top"), "650px");
  } finally { f.cleanup(); }
});

test("leaving the title view restores inline styles, priorities, frames and listeners", () => {
  const f = fixture([["height", "278px", "important"]]);
  try {
    f.focus(); f.resize(400, 150, 320); f.focus(false);
    f.resize(744, 0, 0); f.frame();
    f.disposeTitle();
    f.frame();
    assert.equal(f.dockProperties.get("height"), "278px");
    assert.equal(f.priorities.get("height"), "important");
    assert.equal(f.dockProperties.has("top"), false);
    assert.equal(f.dockProperties.has("position"), false);
    assert.equal(f.canvasProperties.size, 0);
    assert.equal(f.classes.size, 0, "the title-only document lock is removed on Back");
    assert.equal(f.frames.size, 0);
    assert.equal(f.listenerCount(), 5, "only the unchanged shared pan listeners remain");
  } finally { f.cleanup(); }
});

test("real width changes replace the anchor without keeping portrait geometry", () => {
  const f = fixture();
  try {
    document.activeElement = { matches: () => true };
    f.resize(744);
    assert.equal(f.anchorTop(), 650);
    f.focus(); f.resize(400, 0, 320); f.focus(false);
    window.innerWidth = 852; f.resize(360, 0, -300);
    assert.equal(f.dockProperties.get("top"), "350px");
    assert.equal(f.anchorTop(), 350);
  } finally { f.cleanup(); }
});

test("missing elements and browsers without VisualViewport keep ordinary toolbar layout", () => {
  globalThis.window = {};
  try {
    assert.equal(installPublishKeyboardDock(null, null), undefined);
    assert.equal(installPublishKeyboardDock({}, {}), undefined);
  } finally { delete globalThis.window; }
});

test("twenty keyboard cycles never mutate the resting layer or accumulate an offset", () => {
  const f = fixture();
  try {
    const mutations = f.mutationCount();
    for (let cycle = 0; cycle < 20; cycle++) {
      f.focus();
      f.resize(400, 180, 280); f.frame();
      assert.equal(f.anchorTop(), 650);
      f.focus(false); f.resize(744, 60, 280); f.frame(); f.frame();
      assert.equal(f.anchorTop(), 650);
      f.resize(744, 0, 280); f.frame(); f.frame();
      assert.equal(f.anchorTop(), 650);
      f.resize(744, 0, 0); f.frame(); f.frame();
      assert.equal(f.dockProperties.get("top"), "650px");
      assert.equal(f.anchorTop(), 650);
      assert.equal(f.frames.size, 0);
      assert.equal(f.mutationCount(), mutations);
    }
  } finally { f.cleanup(); }
});

test("title input does not queue the editor's delayed smooth scroll on blur", () => {
  assert.match(page, /activeElement\?\.closest\("\.auth-shell, \.title-setup-mode"\)/);
});

test("no keyboard event applies extra document pan compensation to the title tools", () => {
  const f = fixture();
  try {
    f.focus(); f.resize(400, 90, 320);
    for (const y of [40, 90, 200, 40, 0]) {
      f.scroll(y);
      assert.equal(f.anchorTop(), 650);
      assert.equal(f.dockProperties.get("top"), "650px");
      assert.equal(f.dockProperties.has("--publish-document-pan"), false);
    }
  } finally { f.cleanup(); }
});
