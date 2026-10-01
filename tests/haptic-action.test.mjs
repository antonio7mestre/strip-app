import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHapticActionButton } from "./helpers/haptic-action.mjs";

function fixture({ feedback = true, disabled = false, navigator } = {}) {
  const calls = [], pulses = [];
  const Button = createHapticActionButton(navigator ?? { vibrate: value => pulses.push(value) });
  const element = Button({ children: "Save", className: "action", label: "Save", feedback, disabled, onClick: () => calls.push("action") });
  return { element, control: feedback ? element.props.children[1] : element, calls, pulses };
}

test("blocked actions use a directly tapped native switch and pulse once for every attempt", () => {
  const f = fixture();
  assert.equal(f.element.type, "label");
  assert.equal(f.control.type, "input");
  assert.equal(f.control.props.type, "checkbox");
  assert.equal(f.control.props.switch, "");
  assert.equal(f.control.props.role, "button");
  assert.equal(f.control.props["aria-label"], "Save");
  let stops = 0;
  f.control.props.onClick({ stopPropagation: () => stops++ });
  assert.equal(f.calls.length, 0, "click does not duplicate the change activation");
  for (const checked of [true, false, true]) f.control.props.onChange({ target: { checked } });
  assert.deepEqual(f.calls, ["action", "action", "action"]);
  assert.deepEqual(f.pulses, [12, 12, 12]);
  assert.equal(stops, 1);
});

test("valid actions remain ordinary buttons without physical feedback", () => {
  const f = fixture({ feedback: false });
  assert.equal(f.element.type, "button");
  let stops = 0;
  f.control.props.onClick({ stopPropagation: () => stops++ });
  assert.equal(stops, 1);
  assert.deepEqual(f.calls, ["action"]);
  assert.deepEqual(f.pulses, []);
});

test("disabled actions cannot pulse or activate", () => {
  for (const feedback of [false, true]) {
    const f = fixture({ feedback, disabled: true });
    assert.equal(f.control.props.disabled, true);
    if (feedback) f.control.props.onChange();
    else f.control.props.onClick({ stopPropagation() {} });
    assert.equal(f.calls.length, 0); assert.equal(f.pulses.length, 0);
  }
});

test("unavailable or blocked vibration never interrupts the error notice", () => {
  for (const navigator of [{}, { vibrate() { throw Error("not supported"); } }]) {
    const f = fixture({ navigator }); f.control.props.onChange({ currentTarget: {} });
    assert.deepEqual(f.calls, ["action"]);
  }
  const Button = createHapticActionButton(undefined);
  let calls = 0;
  Button({ feedback: true, label: "Save", className: "action", onClick: () => calls++ }).props.children[1].props.onChange({ currentTarget: {} });
  assert.equal(calls, 1);
});

test("keyboard Enter activates once; Space remains a native switch activation", () => {
  const f = fixture(); let prevented = 0;
  for (const [key, repeat] of [["Enter", false], ["Enter", true], [" ", false]]) {
    f.control.props.onKeyDown({ key, repeat, preventDefault: () => prevented++ });
  }
  assert.equal(prevented, 2);
  assert.deepEqual(f.calls, ["action"]);
  f.control.props.onChange({ currentTarget: {} }); assert.equal(f.calls.length, 2);
});

test("feedback is scoped to invalid colors, short content and missing sticker anchor", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/components/ProfileEditor.tsx", import.meta.url), "utf8");
  assert.match(profile, /feedback=\{!profileColorsReadable\(profile\)\}/);
  assert.match(page, /label="Preview Strip"[\s\S]*?feedback=\{!hasRequiredContent\}/);
  assert.equal((page.match(/feedback=\{!hasRequiredContent\}/g) ?? []).length, 3);
  assert.match(page, /feedback=\{Boolean\(onPublish\) && publishNeedsContent\}/);
  assert.match(page, /feedback=\{!hasStickerAnchorBlock\}[\s\S]*?label="Add sticker"[\s\S]*?showActionNotice\("Add a text or image block before adding a sticker\."\)/);
  assert.match(page, /\[notice, noticeRevision\]/);
  assert.match(page, /key=\{noticeRevision\}/);
  const component = readFileSync(new URL("../app/components/HapticActionButton.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /\.click\(|setTimeout|dispatchEvent/);
});
