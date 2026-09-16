import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER_MOVE_MS, COVER_FADE_MS, COVER_DOCK_DROP_MS, captureCoverDock, dropCoverDock, coverEntranceLayout, coverProgressCells, fadeCoverEntrance } from "../app/lib/cover-entrance.ts";

test("portrait, landscape and square covers stay centered, uncropped, with room for the bar", () => {
  for (const [w, h, offset] of [[393, 714, 0], [402, 842, 0], [852, 393, 15], [1440, 900, 0]]) {
    for (const ratio of [0.75, 0.8, 1, 1.5, 5, NaN, 0]) {
      const box = coverEntranceLayout(w, h, offset, ratio);
      assert.ok(Math.abs(box.left + box.width / 2 - w / 2) < 0.01);
      assert.ok(Math.abs(box.top + box.height / 2 - offset - h / 2) < 0.01);
      assert.ok(box.top >= offset && box.left > 0);
      assert.ok(box.top + box.height + 36 < offset + h);
      assert.ok(box.width <= 320 && box.width < w);
      assert.ok(Math.abs(box.width / box.height - (ratio > 0 ? ratio : 1)) < 0.01);
    }
  }
});
test("all poster shapes enlarge to the same shared width and retain their proportions", () => {
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

test("the tray drops immediately while cover arrival reveals the loading bar", () => {
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /holdCoverDock/);
  assert.match(component, /return dropCoverDock\([^;]+setDockDropped\(true\)/);
  const dockEffect = component.slice(component.indexOf("if (!surfaceRef.current || !dockRef.current"), component.indexOf("const stage = stageRef.current"));
  assert.doesNotMatch(dockEffect, /centered/);
  assert.match(dockEffect, /\[initialDock\]/);
  assert.match(component, /setTarget\(centered \? loadPercent : 0\)/);
  assert.match(component, /if \(mounted.current\) flushSync\(\(\) => setCentered\(true\)\)/);
  assert.match(component, /requestPending \|\| !dockDropped/);
  assert.match(component, /scale\(\$\{initialOrigin.width \/ target.width\}/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, new RegExp(`animation: cover-backdrop-in ${COVER_MOVE_MS}ms`));
  assert.match(css, new RegExp(`transition: opacity ${COVER_MOVE_MS}ms ease`));
  assert.match(css, /\.strip-entrance.is-centered \.strip-entrance-progress \{ opacity: 1; \}/);
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
test("home click preserves a single portal and cannot navigate away or race a Back gesture", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const open = page.slice(page.indexOf("const openPublishedStrip ="), page.indexOf("const returnToLibraryFromPublished ="));
  assert.match(open, /getBoundingClientRect/);
  assert.match(open, /flushSync/);
  assert.match(open, /Promise.all/);
  assert.match(open, /openingCoverRequestRef.current !== controller/);
  assert.match(open, /signal: controller.signal/);
  assert.doesNotMatch(open, /location.assign|transitionToView/);
  assert.equal((page.match(/\{coverEntranceLayer\}/g) ?? []).length, 2);
  assert.equal((page.match(/<StripEntrance /g) ?? []).length, 1);
  assert.match(page, /openingCoverRequestRef.current\?\.abort\(\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.library-card.is-opening-cover \.library-cover\s*\{\s*visibility: hidden/);
  assert.match(page, /\{!openingCover \? <footer\s*key="persistent-composer-dock"/);
  assert.doesNotMatch(css, /\.library-mode.is-opening-strip \.composer-dock/);
  assert.match(css, /\.strip-entrance \.strip-entrance-dock\s*\{[^}]*position: absolute;[^}]*transform: none;[^}]*transition: none/);
  assert.ok(open.indexOf("captureCoverDock(") < open.indexOf("flushSync("));
});

test("dock capture includes the exact controls, geometry and Safari corner treatment", () => {
  const style = { padding: "12px 20px 222px", borderRadius: "44px 44px 0px 0px", boxShadow: "0px -16px 44px #0003", getPropertyValue: () => "squircle" };
  globalThis.getComputedStyle = () => style;
  try {
    assert.equal(captureCoverDock(null), undefined);
    const bounds = { left: 0, top: 650, width: 402, height: 284 };
    const result = captureCoverDock({ getBoundingClientRect: () => bounds, innerHTML: '<nav aria-label="Main">Controls</nav>' });
    assert.equal(result.top, 650); assert.equal(result.height, 284);
    assert.equal(result.padding, style.padding); assert.equal(result.cornerShape, "squircle");
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
  const origin = { left: 0, top: 650, width: 402, height: 284, padding: "12px 20px 222px", borderRadius: "44px", cornerShape: "squircle", boxShadow: "none", markup: "" };
  const started = performance.now();
  const dispose = dropCoverDock(host, dock, origin, () => done++);
  try {
    assert.equal(Number.parseFloat(dock.style.top) + surface.top, 650);
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
