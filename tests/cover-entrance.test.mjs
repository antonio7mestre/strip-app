import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER_MOVE_MS, COVER_FADE_MS, COVER_DOCK_DROP_MS, COVER_APPEAR_MS, captureCoverOrigin, captureCoverDock, dropCoverDock, coverEntranceLayout, coverLineLayout, coverProgressCells, fadeCoverEntrance, fadeInCover, watchCoverImage } from "../app/lib/cover-entrance.ts";

test("direct-link covers match the profile grid width, centered and uncropped", () => {
  for (const [w, h, offset] of [[393, 714, 0], [402, 842, 0], [852, 393, 15], [1440, 900, 0]]) {
    for (const ratio of [0.75, 0.8, 1, 1.5, 5, NaN, 0]) {
      const box = coverEntranceLayout(w, h, offset, ratio);
      assert.ok(Math.abs(box.left + box.width / 2 - w / 2) < 0.01);
      assert.ok(Math.abs(box.top + box.height / 2 - offset - h / 2) < 0.01);
      assert.ok(box.left > 0);
      assert.equal(box.width, (w - 36) / 2);
      assert.ok(Math.abs(box.width / box.height - (ratio > 0 ? ratio : 1)) < 0.01);
    }
  }
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const grid = css.match(/^\.library-grid \{[^}]+\}/m)[0];
  assert.match(grid, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(grid, /gap: 12px/);
  assert.match(grid, /padding: 0 12px/);
});
test("direct-link poster shapes use a shared width and retain their proportions", () => {
  for (const [w, h, offset] of [[393, 714, 0], [393, 842, 0], [1440, 900, 15]]) {
    const expectedWidth = coverEntranceLayout(w, h, offset, 1).width;
    for (const ratio of [0.2, 0.75, 0.8, 1, 1.5, 5]) {
      const box = coverEntranceLayout(w, h, offset, ratio);
      assert.equal(box.width, expectedWidth);
      assert.equal(box.height, expectedWidth / ratio);
      assert.equal(box.left + box.width / 2, w / 2);
      assert.ok(Math.abs(box.top + box.height / 2 - offset - h / 2) < 0.001);
    }
  }
});

test("profile covers keep their exact dimensions throughout the centered loader", () => {
  for (const [w, h, offset] of [[393, 714, 0], [393, 842, 22], [1440, 900, 15]]) {
    for (const origin of [{ width: 167.5, height: 232.75 }, { width: 174, height: 174 }, { width: 167.5, height: 110.2 }]) {
      const box = coverEntranceLayout(w, h, offset, origin.width / origin.height, origin);
      assert.equal(box.width, origin.width);
      assert.equal(box.height, origin.height);
      assert.equal(box.left + box.width / 2, w / 2);
      assert.ok(Math.abs(box.top + box.height / 2 - offset - h / 2) < 0.001);
    }
  }
});

test("reload and direct-link covers use the same image and color proportions as profile clicks", () => {
  for (const w of [320, 390, 393, 430, 768, 1440]) {
    for (const ratio of [1080 / 1497, 1080 / 1349, 4 / 5, 1, 3 / 2, 5]) {
      const profileCover = { width: (w - 36) / 2, height: (w - 36) / 2 / ratio };
      assert.deepEqual(coverEntranceLayout(w, 844, 0, ratio), coverEntranceLayout(w, 844, 0, ratio, profileCover));
    }
  }
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.match(component, /cover.shape === "portrait" \? 4 \/ 5 : cover.shape === "landscape" \? 3 \/ 2 : 1/);
});

test("the tray drops immediately while zero blinks independently behind the traveling cover", () => {
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /holdCoverDock/);
  assert.match(component, /return dropCoverDock\([^;]+setDockDropped\(true\)/);
  const dockEffect = component.slice(component.indexOf("if (!surfaceRef.current || !dockRef.current"), component.indexOf("const stage = stageRef.current"));
  assert.doesNotMatch(dockEffect, /centered/);
  assert.match(dockEffect, /\[initialDock\]/);
  assert.match(component, /setTarget\(centered && coverVisible \? loadPercent : 0\)/);
  assert.match(component, /\[coverVisible, setCoverVisible\] = useState\(Boolean\(origin\)\)/);
  assert.match(component, /if \(initialOrigin \|\| !coverReadyToAppear \|\| !visualRef.current\) return/);
  assert.match(component, /if \(mounted.current\) flushSync\(\(\) => setCentered\(true\)\)/);
  assert.match(component, /requestPending \|\| !dockDropped/);
  assert.match(component, /aspectRatio, initialOrigin\)/);
  assert.doesNotMatch(component, /scale\(/);
  assert.match(component, /const animation = stage.animate/);
  assert.match(component, /displayPercent === 0 \? " is-waiting"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, new RegExp(`animation: cover-backdrop-in ${COVER_MOVE_MS}ms`));
  assert.match(css, new RegExp(`transition: opacity ${COVER_MOVE_MS}ms ease`));
  assert.match(css, /\.strip-entrance-percent.is-waiting\s*\{\s*animation: cover-zero-blink 700ms ease-in-out infinite alternate;/);
  assert.doesNotMatch(css.match(/\.strip-entrance-line \{[^}]+\}/)[0], /animation:|opacity:/);
  assert.match(css, /\.strip-entrance:not\(\.is-from-library\) \.strip-entrance-cover \{ opacity: 0; \}/);
});

test("the vertical line begins under the physical safe area and ends below the title", () => {
  for (const [top, height, visibleTop, visibleHeight, titleBottom] of [
    [-62, 914, 0, 740, 44], [-47, 860, 0, 680, 84], [0, 720, 0, 720, 44], [-20, 420, 15, 350, 60],
  ]) {
    const { startHeight, travel } = coverLineLayout(top, height, visibleTop, visibleHeight, titleBottom);
    const bottom = top + height;
    assert.ok(startHeight > 0);
    assert.ok(travel > 0);
    assert.equal(bottom - startHeight, visibleTop + visibleHeight - 64);
    assert.equal(bottom - startHeight - travel, titleBottom + 52);
    let lastTip = bottom;
    for (let percent = 0; percent <= 100; percent++) {
      const tip = bottom - startHeight - travel * percent / 100;
      assert.ok(tip <= lastTip);
      assert.ok(tip >= titleBottom + 52 - 0.0001);
      lastTip = tip;
    }
  }
});

test("all decorative squares use the exact profile ink without randomized shades", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const accent = css.match(/^\.strip-entrance-accent \{[^}]+\}/m)[0];
  assert.match(accent, /background: var\(--entrance-a\)/);
  assert.match(accent, /border-radius: 0/);
  assert.doesNotMatch(accent, /opacity|color-mix|filter/);
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /accentColors|Math.random/);
});

test("a raw-load cover finishes its quick fade before releasing progress", () => {
  let pending, done = 0;
  globalThis.requestAnimationFrame = fn => { pending = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const cover = { style: {} };
  const cancel = fadeInCover(cover, () => { assert.equal(cover.style.opacity, "1"); done++; });
  try {
    assert.equal(COVER_APPEAR_MS, 180);
    assert.equal(cover.style.opacity, "0");
    pending(0); pending(90);
    assert.ok(Number(cover.style.opacity) > 0 && Number(cover.style.opacity) < 1);
    assert.equal(done, 0);
    pending(180); assert.equal(done, 1);
    const late = pending;
    cancel(); late(1000); assert.equal(done, 1);
  } finally { cancel(); delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
});

test("cover readiness waits for decoded pixels, including already-cached images", async () => {
  for (const cached of [false, true]) {
    let decoded, ready = 0, errors = 0;
    const events = new Map();
    const image = { complete: cached, naturalWidth: 1200,
      decode: () => new Promise(resolve => { decoded = resolve; }),
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: name => events.delete(name) };
    const dispose = watchCoverImage(image, () => ready++, () => errors++);
    if (!cached) events.get("load")();
    assert.equal(ready, 0);
    decoded(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ready, 1); assert.equal(errors, 0);
    events.get("load")(); assert.equal(ready, 1, "no duplicate readiness");
    dispose(); assert.equal(events.size, 0);
  }
});

test("failed covers recover and late decoding cannot mutate an exited loader", async () => {
  let decoded, ready = 0, errors = 0;
  const events = new Map();
  const image = { complete: false, naturalWidth: 1200,
    decode: () => new Promise(resolve => { decoded = resolve; }),
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  let dispose = watchCoverImage(image, () => ready++, () => errors++);
  events.get("error")(); assert.equal(errors, 1); dispose();
  dispose = watchCoverImage(image, () => ready++, () => errors++);
  events.get("load")(); dispose(); decoded(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, 0); assert.equal(errors, 1);
});

test("the square bar is deterministic, monotonic and never full before real completion", () => {
  assert.equal(coverProgressCells(0), 0);
  assert.equal(coverProgressCells(50), 12);
  assert.equal(coverProgressCells(99), 23);
  assert.equal(coverProgressCells(100), 24);
  assert.equal(coverProgressCells(NaN), 0);
  assert.equal(coverProgressCells(-5), 0);
  for (let p = 1; p <= 100; p++) assert.ok(coverProgressCells(p) >= coverProgressCells(p - 1));
});
test("the final crossfade keeps its previous timing, is monotonic, and cleans up", () => {
  assert.equal(COVER_MOVE_MS, 620); assert.equal(COVER_FADE_MS, 650);
  let pending, done = 0;
  globalThis.requestAnimationFrame = callback => { pending = callback; return 7; };
  globalThis.cancelAnimationFrame = () => { pending = null; };
  const host = { dataset: {}, style: { opacity: "1" } };
  const cancel = fadeCoverEntrance(host, () => done++);
  try {
    pending(100); assert.equal(host.style.opacity, "1");
    pending(425); assert.equal(Number(host.style.opacity), 0.5);
    pending(750); assert.equal(host.style.opacity, "0"); assert.equal(done, 1);
    assert.equal(host.dataset.inkPhase, "fading");
    cancel(); assert.equal(pending, null);
  } finally { cancel(); delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
});
test("same-origin home click preserves a single portal and cannot race a Back gesture", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const open = page.slice(page.indexOf("const openPublishedStrip ="), page.indexOf("const returnToLibraryFromPublished ="));
  assert.match(open, /captureCoverOrigin/);
  assert.ok(open.indexOf("captureCoverOrigin(") < open.indexOf("flushSync("));
  assert.match(open, /flushSync/);
  assert.match(open, /Promise.all/);
  assert.match(open, /openingCoverRequestRef.current !== controller/);
  assert.match(open, /signal: controller.signal/);
  // The owner-only cross-origin route leaves before creating any loader or
  // history entry. All same-origin openings keep the continuous cover portal.
  assert.doesNotMatch(open.slice(open.indexOf("const cover =")), /location.assign|transitionToView/);
  assert.equal((page.match(/\{coverEntranceLayer\}/g) ?? []).length, 2);
  assert.equal((page.match(/<StripEntrance /g) ?? []).length, 1);
  assert.match(page, /openingCoverRequestRef.current\?\.abort\(\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.library-card.is-opening-cover \.library-cover\s*\{\s*visibility: hidden/);
  assert.match(page, /\{!viewingPublicProfile && !openingCover \? <footer\s*key="persistent-composer-dock"/);
  assert.doesNotMatch(css, /\.library-mode.is-opening-strip \.composer-dock/);
  assert.match(css, /\.strip-entrance \.strip-entrance-dock\s*\{[^}]*position: absolute;[^}]*transform: none;[^}]*transition: none/);
  assert.ok(open.indexOf("captureCoverDock(") < open.indexOf("flushSync("));
});

test("the clicked cover's already-visible pixels are captured synchronously with bounded memory", () => {
  const image = { complete: true, naturalWidth: 2400, naturalHeight: 3000 };
  const bounds = { left: 23, top: 98, width: 180, height: 225 };
  const draws = [], canvas = { setAttribute() {}, getContext: () => ({ drawImage: (...args) => draws.push(args) }) };
  globalThis.window = { devicePixelRatio: 3 };
  globalThis.document = { createElement: () => canvas };
  globalThis.getComputedStyle = () => ({ boxShadow: "inset 0 0 0 1px white" });
  const cover = { getBoundingClientRect: () => bounds, querySelector: () => image };
  try {
    assert.equal(captureCoverOrigin(null), undefined);
    const captured = captureCoverOrigin(cover);
    assert.equal(captured.snapshot, canvas);
    assert.equal(captured.boxShadow, "inset 0 0 0 1px white");
    assert.equal(captured.top, 98);
    assert.equal(canvas.width, 360); assert.equal(canvas.height, 450);
    assert.deepEqual(draws, [[image, 0, 0, 360, 450]]);
    bounds.width = 4000; bounds.height = 5000;
    captureCoverOrigin(cover);
    assert.ok(canvas.width <= 1024 && canvas.height <= 1024);
    image.complete = false;
    assert.equal(captureCoverOrigin(cover).snapshot, undefined);
    image.complete = true;
    globalThis.document.createElement = () => { throw new Error("Allocation unavailable"); };
    assert.equal(captureCoverOrigin(cover).snapshot, undefined);
    assert.equal(captureCoverOrigin({ ...cover, querySelector: () => null }).boxShadow, captured.boxShadow);
  } finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
});

test("dock capture includes the exact controls, geometry and Safari corner treatment", () => {
  const style = { padding: "12px 20px 222px", borderRadius: "44px 44px 0px 0px", boxShadow: "rgba(0, 0, 0, 0.18) 0px -4px 12px -4px", getPropertyValue: () => "squircle" };
  globalThis.getComputedStyle = () => style;
  try {
    assert.equal(captureCoverDock(null), undefined);
    const bounds = { left: 0, top: 650, width: 402, height: 284 };
    const result = captureCoverDock({ getBoundingClientRect: () => bounds, innerHTML: '<nav aria-label="Main">Controls</nav>' });
    assert.equal(result.top, 650); assert.equal(result.height, 284);
    assert.equal(result.padding, style.padding); assert.equal(result.cornerShape, "squircle");
    assert.equal(result.boxShadow, style.boxShadow);
    assert.equal(result.markup, '<nav aria-label="Main">Controls</nav>');
  } finally { delete globalThis.getComputedStyle; }
});

test("one document-painted dock edge crosses the whole glass, not just the visual viewport", () => {
  let pending, cancelled = 0, done = 0;
  globalThis.requestAnimationFrame = callback => { pending = callback; return 3; };
  globalThis.cancelAnimationFrame = () => { cancelled++; };
  const surface = { top: -62, bottom: 820, left: 0 };
  const host = { getBoundingClientRect: () => surface };
  const dock = { style: { setProperty(name, value) { this[name] = value; } } };
  const origin = { left: 0, top: 650, width: 402, height: 284, padding: "12px 20px 222px", borderRadius: "44px", cornerShape: "squircle", boxShadow: "rgba(0, 0, 0, 0.18) 0px -4px 12px -4px", markup: "" };
  const started = performance.now();
  const dispose = dropCoverDock(host, dock, origin, () => done++);
  try {
    assert.equal(Number.parseFloat(dock.style.top) + surface.top, 650);
    assert.equal(dock.style.boxShadow, origin.boxShadow);
    let last = 650;
    for (let t = 0; t <= COVER_DOCK_DROP_MS; t += 10) {
      pending(started + t + 1);
      const edge = Number.parseFloat(dock.style.top) + surface.top;
      assert.ok(edge >= last, "no stops or upward jumps");
      assert.equal(dock.style.transform, undefined, "do not create a fixed compositor snapshot");
      last = edge;
    }
    assert.ok(last > surface.bottom, "clear all paint behind Safari, not just innerHeight");
    assert.equal(dock.style.visibility, "hidden");
    assert.equal(done, 1);
    const late = pending, before = dock.style.top;
    dispose(); late(started + 1000); assert.equal(dock.style.top, before); assert.equal(cancelled, 1);
    assert.equal(done, 1);
  } finally { delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
});
