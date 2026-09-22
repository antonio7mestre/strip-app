import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const physicsSource = readFileSync(new URL("../app/lib/sticker-physics.ts", import.meta.url), "utf8");
const source = readFileSync(new URL("../app/lib/auth-sticker-exit.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(physicsSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText, { exports, require: createRequire(import.meta.url) });
const { createStickerPhysics, STICKER_STEP_MS } = exports;
const seed = (x = 200, y = 180) => ({ x, y, width: 95, height: 110, angle: 0.1 });

test("stickers recoil and twist from the bump, break loose, then float through the top edge", () => {
  const sim = createStickerPhysics([seed()], 402, () => 0.7);
  sim.step(32);
  assert.ok(sim.bodies[0].position.y > 180, "A small downward recoil makes the impact visible");
  assert.notEqual(sim.bodies[0].angle, 0.1);
  assert.ok(sim.bodies[0].isStatic, "The sticker shudders before detaching");
  for (let i = 0; i < 200; i++) {
    sim.step(STICKER_STEP_MS);
    if (i > 20) assert.ok(sim.bodies[0].velocity.y < 0);
  }
  assert.notEqual(sim.bodies[0].angle, 0.1);
  assert.ok(sim.bodies[0].position.y < -800);
  sim.dispose();
});

test("collisions between stickers engage after the initially overlapping collage separates", () => {
  const sim = createStickerPhysics([seed(190, 150), seed(225, 180)], 402, () => 0.5);
  assert.equal(sim.bodies[0].collisionFilter.mask, 1);
  for (let i = 0; i < 25; i++) sim.step(STICKER_STEP_MS);
  assert.equal(sim.bodies[0].collisionFilter.mask, 3);
  for (let i = 0; i < 240; i++) sim.step(STICKER_STEP_MS);
  const [a, b] = sim.bodies;
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > 55);
  assert.ok(a.position.y < 0 && b.position.y < 0);
  sim.dispose();
});

test("60 Hz and 120 Hz screens use the same physics steps", () => {
  const a = createStickerPhysics([seed()], 402, () => 0.7);
  const b = createStickerPhysics([seed()], 402, () => 0.7);
  for (let i = 0; i < 60; i++) a.step(1000 / 60);
  for (let i = 0; i < 120; i++) b.step(1000 / 120);
  assert.equal(a.bodies[0].position.x, b.bodies[0].position.x);
  assert.equal(a.bodies[0].position.y, b.bodies[0].position.y);
  a.dispose(); b.dispose();
});

test("suspensions, densely overlapped stickers, and disposal cannot explode the simulation", () => {
  const sim = createStickerPhysics(Array.from({length: 18}, (_, i) => ({...seed(40 + i * 18, 300 + i * 3), round: i % 3 === 0})), 402, () => 0.6);
  sim.step(60000);
  assert.ok(sim.bodies.every(body => body.position.y < 500));
  for (let i = 0; i < 300; i++) sim.step(STICKER_STEP_MS);
  for (const body of sim.bodies) {
    assert.ok(Number.isFinite(body.position.x) && Number.isFinite(body.angle));
    assert.ok(body.position.y < 720);
    assert.ok(body.position.x > -100 && body.position.x < 500);
  }
  sim.dispose();
  const y = sim.bodies[0].position.y;
  sim.step(64);
  assert.equal(sim.bodies[0].position.y, y);
});

test("only cutouts and doodles detach; frozen Cosmos photos are never physics bodies", () => {
  assert.match(source, /FLOATING_STICKER_SELECTOR = "\.landing-cutout, \.landing-doodle"/);
  assert.doesNotMatch(source, /querySelectorAll[^\n]*landing-sticker/);
  assert.match(source, /frozen\.querySelectorAll\(FLOATING_STICKER_SELECTOR\)\.forEach\(element => element\.remove\(\)\)/);
  assert.match(source, /translate: "none", transform: "none"/);
  assert.match(source, /createStickerPhysics\(seeds, width\)/);
  assert.doesNotMatch(source, /rect\.top > height|rect\.bottom < -20/);
  assert.match(source, /screenAngle\(element\)/);
});

test("the form crossfades after stickers leave with no duplicate taps or leftover animation", () => {
  assert.match(page, /if \(authStickerExitRef\.current\) return/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{ authStickerExitRef\.current\?\.\(\); \}, \[\]\)/);
  assert.match(source, /elapsed >= 700 && clearedScreen/);
  assert.match(source, /physics\.bodies\[index\]\.bounds\.max\.y < -24/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /window\.setTimeout\(finish, 2400\)/);
  for (const cleanup of ["cancelAnimationFrame(frame)", "clearTimeout(watchdog)", "physics.dispose()", "overlay.remove()", 'removeEventListener("click", preventTap, true)']) assert.ok(source.includes(cleanup));
  assert.match(css, /\.auth-sticker-revealed \.auth-flow-stage \{ animation: none; \}/);
  assert.match(page, /authStep === "phone" && authStickerRevealed/);
  assert.match(css, /html\.auth-stickers-floating \.auth-action-dock\.composer-dock \{ z-index: 2147482100; \}/);
  assert.match(css, /html\.auth-stickers-floating \.auth-shell \{ z-index: auto; \}/);
});

test("even an object starting at the very bottom can float past the top without a ceiling", () => {
  const sim = createStickerPhysics([seed(180, 2900)], 402, () => 0.5);
  for (let i = 0; i < 400; i++) sim.step(STICKER_STEP_MS);
  assert.ok(sim.bodies[0].position.y < -800);
  assert.ok(sim.bodies[0].velocity.y < 0);
  sim.dispose();
});
