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

test("the form mounts in the tap, slides with the stickers, and cleans up without a fade", () => {
  assert.match(page, /if \(authStickerExitRef\.current\) return/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{ authStickerExitRef\.current\?\.\(\); \}, \[\]\)/);
  assert.ok(source.indexOf('onReveal();\n  // Landing') < source.indexOf('frame = requestAnimationFrame(tick)'));
  assert.match(source, /seeds\[index\]\.y - physics\.bodies\[index\]\.position\.y/);
  assert.doesNotMatch(source, /overlay\.style\.opacity/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /window\.setTimeout\(finish, 2400\)/);
  for (const cleanup of ["cancelAnimationFrame(frame)", "clearTimeout(watchdog)", "physics.dispose()", "overlay.remove()", 'removeEventListener("click", preventTap, true)']) assert.ok(source.includes(cleanup));
  assert.match(css, /\.auth-sticker-revealed \.auth-flow-stage \{ animation: none; \}/);
  assert.match(page, /authStep === "phone" && authStickerRevealed/);
  assert.match(source, /copy\.classList\.add\("auth-dock-frozen"\)/);
  assert.match(source, /theme\?\.removeAttribute\("name"\)/);
  assert.match(source, /theme\?\.setAttribute\("name", themeName\)/);
  assert.match(css, /html\.auth-stickers-floating \.top-safe-area-anchor \{ visibility: hidden; \}/);
  assert.match(css, /html\.auth-form-active\.auth-stickers-floating body \{ overflow: visible; \}/);
  assert.match(source, /window\.scrollTo\(\{ top: flightInset/);
  assert.match(source, /removeProperty\("--auth-flight-inset"\)/);
  assert.match(css, /\.auth-sticker-exit \{\s*position: absolute;[\s\S]*?height: calc\(100lvh \+ 320px\)/);
});

test("the panel tracks median sticker travel monotonically, not a separate timing curve", () => {
  const result = {};
  runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:result,require:()=>({})});
  assert.equal(result.stickerPanelRise([-5,-3,-4],0,800),0);
  assert.equal(result.stickerPanelRise([230,220,900],0,800),230);
  assert.equal(result.stickerPanelRise([210,215,220],230,800),230);
  assert.equal(result.stickerPanelRise([830,820,810],230,800),800);
  assert.equal(result.stickerPanelRise([],0,800),800);
});

test("even an object starting at the very bottom can float past the top without a ceiling", () => {
  const sim = createStickerPhysics([seed(180, 2900)], 402, () => 0.5);
  for (let i = 0; i < 400; i++) sim.step(STICKER_STEP_MS);
  assert.ok(sim.bodies[0].position.y < -800);
  assert.ok(sim.bodies[0].velocity.y < 0);
  sim.dispose();
});
