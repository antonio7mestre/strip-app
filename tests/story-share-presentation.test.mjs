import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scheduleStorySharePhase, STORY_SHARE_COVER_MS, STORY_SHARE_PULSE_MS, STORY_SHARE_DISMISS_MS } from "../app/lib/story-share-presentation.ts";

function setup() {
  const pending = new Map();
  let id = 0;
  const clock = { set: (fn, ms) => { pending.set(++id, { fn, ms }); return id; }, clear: id => pending.delete(id) };
  const phases = [];
  return { pending, phases, schedule: phase => scheduleStorySharePhase(phase, next => phases.push(next), clock) };
}
test("keep the white edge and pulse hidden throughout native presentation", () => {
  const s = setup(); s.schedule("presenting");
  assert.deepEqual(s.phases, []);
  const timer = [...s.pending.values()][0];
  assert.equal(timer.ms, STORY_SHARE_COVER_MS);
  assert.ok(timer.ms >= 650);
  timer.fn(); assert.deepEqual(s.phases, ["covered"]);
});
test("restore bottom paint immediately on close while retaining a fading backdrop", () => {
  const s = setup(); s.schedule("closing");
  assert.deepEqual(s.phases, []);
  const timer = [...s.pending.values()][0];
  assert.equal(timer.ms, STORY_SHARE_DISMISS_MS);
  timer.fn(); assert.deepEqual(s.phases, ["closed"]);
});
test("retire the pulse after two seconds without closing the instructions", () => {
  const s = setup(); s.schedule("covered");
  assert.deepEqual(s.phases, []);
  const timer = [...s.pending.values()][0];
  assert.equal(timer.ms, STORY_SHARE_PULSE_MS);
  assert.equal(timer.ms, 2000);
  timer.fn(); assert.deepEqual(s.phases, ["settled"]);
  const settled = setup(); settled.schedule("settled");
  assert.equal(settled.pending.size, 0);
  assert.deepEqual(settled.phases, []);
});
test("quick cancel, navigation, and a new attempt cancel the old reveal", () => {
  for (const phase of ["presenting", "covered", "closing"]) {
    const s = setup(), cleanup = s.schedule(phase); cleanup();
    assert.equal(s.pending.size, 0);
    assert.deepEqual(s.phases, []);
  }
  for (const phase of ["closed", "settled"]) {
    const s = setup(); s.schedule(phase)(); assert.equal(s.pending.size, 0);
  }
});
test("the live toolbar is only removed behind the covered sheet; dismissal has no slide", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/components/StoryShareBackdrop.tsx", import.meta.url), "utf8");
  assert.match(component, /data-phase=\{motion.phase\}/);
  assert.match(component, /phase: open \? "presenting" : motion.phase === "closed" \? "closed" : "closing"/);
  assert.match(component, /window.addEventListener\("pointerdown", dismiss, \{ capture: true, passive: true \}\)/);
  assert.match(component, /window.removeEventListener\("pointerdown", dismiss, true\)/);
  assert.match(component, /motion.phase !== "covered" && motion.phase !== "settled"/);
  assert.doesNotMatch(component, /preventDefault|stopPropagation/);
  assert.match(css, /html:has\(\.story-share-boundary\[data-phase="covered"\]\) \.share-mode \.share-dock/);
  assert.match(css, /\.story-share-save-beacon\s*\{\s*display: block;\s*visibility: hidden/);
  assert.match(css, /animation: story-share-dismiss 320ms ease-out both/);
  const frames = css.match(/@keyframes story-share-dismiss\s*\{([\s\S]*?)\n\}/)[1];
  assert.doesNotMatch(frames, /transform|translate|height/);
});
