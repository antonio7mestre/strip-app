import assert from "node:assert/strict";
import test from "node:test";
import { mediaFeedbackClock } from "./helpers/media-import-feedback-fixture.mjs";

function fixture() {
  const clock = mediaFeedbackClock(), controller = new AbortController(), updates = [];
  const feedback = clock.createMediaImportFeedback({ signal: controller.signal,
    onProgress: progress => updates.push({ ...progress }) });
  return { ...clock, controller, updates, feedback };
}

test("fast imports never paint a loading block or incur an artificial wait", async () => {
  for (const duration of [0, 1, 16, 80, 179]) {
    const h = fixture();
    h.feedback.report({ completed: 0, total: 6 });
    h.advance(duration);
    h.feedback.report({ completed: 6, total: 6 });
    await h.feedback.finish();
    assert.ok(h.updates.every(progress => !progress.visible));
    assert.equal(h.timers.size, 0);
    h.advance(1000);
    assert.equal(h.updates.length, 2, "no delayed placeholder after the photos arrive");
    h.feedback.dispose();
  }
});

test("a shown block gets a minimum readable beat, measured from when it appears", async () => {
  for (const readyAt of [180, 181, 210, 320, 499]) {
    const h = fixture();
    h.feedback.report({ completed: 0, total: 6 });
    h.advance(readyAt);
    assert.equal(h.updates.at(-1).visible, true);
    h.feedback.report({ completed: 6, total: 6 });
    let ready = false;
    const pending = h.feedback.finish().then(() => { ready = true; });
    await Promise.resolve();
    assert.equal(ready, false);
    h.advance(500 - readyAt - 1); await Promise.resolve();
    assert.equal(ready, false);
    h.advance(1); await pending;
    assert.equal(ready, true);
    assert.equal(h.timers.size, 0);
    h.feedback.dispose();
  }
});

test("long imports swap immediately once decoded and keep the latest real progress", async () => {
  const h = fixture();
  h.feedback.report({ completed: 0, total: 6 });
  h.advance(100); h.feedback.report({ completed: 3, total: 6 });
  h.advance(80);
  assert.deepEqual(h.updates.at(-1), { completed: 3, total: 6, visible: true });
  h.advance(900); h.feedback.report({ completed: 6, total: 6 });
  await h.feedback.finish();
  assert.equal(h.timers.size, 0);
  h.feedback.dispose();
});

test("cancel and dispose clear delayed shows, release holds and ignore late progress", async () => {
  for (const shown of [false, true]) {
    for (const cancel of [false, true]) {
      const h = fixture();
      h.feedback.report({ completed: 0, total: 6 });
      if (shown) h.advance(200);
      const pending = shown ? h.feedback.finish() : null;
      if (cancel) h.controller.abort(); else h.feedback.dispose();
      if (pending) await pending;
      const count = h.updates.length;
      h.feedback.report({ completed: 6, total: 6 });
      h.advance(1000); await h.feedback.finish();
      assert.equal(h.updates.length, count);
      assert.equal(h.timers.size, 0);
      h.feedback.dispose();
    }
  }
});

test("repeated completion shares one hold and pre-cancelled imports never show", async () => {
  const h = fixture();
  h.feedback.report({ completed: 0, total: 6 }); h.advance(180);
  const first = h.feedback.finish();
  assert.strictEqual(h.feedback.finish(), first);
  assert.equal(h.timers.size, 1);
  h.advance(320); await first; h.feedback.dispose();
  const clock = mediaFeedbackClock(), controller = new AbortController();
  controller.abort();
  const stopped = clock.createMediaImportFeedback({ signal: controller.signal,
    onProgress: () => assert.fail("cancelled presentation must never render") });
  stopped.report({ completed: 0, total: 6 });
  await stopped.finish(); stopped.dispose();
  assert.equal(clock.timers.size, 0);
});
