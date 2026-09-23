import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { finishAuthButtonTap } from "../app/lib/auth-keyboard.ts";

function tap({ disabled = false, end = { clientX: 60, clientY: 25 }, touches = [] } = {}) {
  const calls = [];
  const input = { focus: options => calls.push(["focus", options]) };
  const event = {
    preventDefault: () => calls.push("prevent-default"),
    changedTouches: [end], touches,
    currentTarget: { disabled, click: () => calls.push("activate"),
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 50 }) },
  };
  return { calls, input, event };
}

test("auth taps cancel Safari's blur-producing synthetic click and activate once while focused", () => {
  const { calls, input, event } = tap();
  finishAuthButtonTap(event, { clientX: 60, clientY: 25 }, input);
  assert.deepEqual(calls, ["prevent-default", ["focus", { preventScroll: true }], "activate"]);
});

test("disabled, canceled, dragged, multitouch and off-button gestures never submit", () => {
  for (const [options, start] of [
    [{ disabled: true }, { clientX: 60, clientY: 25 }],
    [{}, null],
    [{ end: { clientX: 90, clientY: 25 } }, { clientX: 60, clientY: 25 }],
    [{ touches: [{}] }, { clientX: 60, clientY: 25 }],
    [{ end: { clientX: 105, clientY: 25 } }, { clientX: 99, clientY: 25 }],
  ]) {
    const { calls, input, event } = tap(options);
    finishAuthButtonTap(event, start, input);
    assert.deepEqual(calls, ["prevent-default"]);
  }
});

test("the keyboard button cancels moved gestures and supports non-touch activation", () => {
  const component = readFileSync(new URL("../app/components/AuthKeyboardButton.tsx", import.meta.url), "utf8");
  assert.match(component, /onTouchEnd=\{event =>[\s\S]*finishAuthButtonTap\(event, start, inputRef.current\)/);
  assert.match(component, /onTouchMove=[\s\S]*touchStart.current = null/);
  assert.match(component, /onTouchCancel=\{\(\) => \{ touchStart.current = null; \}\}/);
  assert.match(component, /onClick=\{event =>[\s\S]*inputRef.current\?\.focus[\s\S]*onClick\?\.\(event\)/);
  assert.doesNotMatch(component, /setTimeout|requestAnimationFrame|\.blur\(/);
});
