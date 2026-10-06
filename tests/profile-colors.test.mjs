import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_PROFILE, PROFILE_COLORS, applyProfileChanges, profileColorChoices, profileColorsReadable, profileInk } from "../app/lib/profile.ts";

const theme = (background, accent) => ({ ...DEFAULT_PROFILE, background, accent });
const values = choices => choices.map(({ value }) => value);
const neutrals = new Set(["#FFFFFF", "#000000", "#D9D9D9"]);

test("profile presets retain saturated club colors with both bright and dark options", () => {
  const palette = values(PROFILE_COLORS);
  assert.equal(new Set(palette).size, palette.length);
  for (const color of ["#3155FF", "#BFFF00", "#FF0099", "#FF4D00", "#8500FF", "#00D5FF", "#D7FF00", "#98004F", "#171E5B"]) {
    assert.ok(palette.includes(color), `${color} remains a bold theme option`);
  }
});

test("every suggested text or background swatch produces a saveable pair, including custom colors", () => {
  const colors = [...values(PROFILE_COLORS)];
  // Exercise dark, mid-tone and bright custom wheel/eyedropper colors too.
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    colors.push(`#${[r, g, b].map(channel => channel.toString(16).padStart(2, "0")).join("")}`);
  }
  for (const oppositeColor of colors) for (const tool of ["accent", "background"]) {
    const profile = tool === "accent" ? theme(oppositeColor, "#FF0099") : theme("#3155FF", oppositeColor);
    const choices = profileColorChoices(profile, tool);
    assert.ok(choices.length >= 2, `${tool} choices are available for ${oppositeColor}`);
    assert.ok(choices.some(({ value }) => !neutrals.has(value)), "the suggestions are not only black and white");
    for (const { value } of choices) {
      assert.ok(profileColorsReadable(applyProfileChanges(profile, { [tool]: value })), `${tool} ${value} works with ${oppositeColor}`);
    }
    const readable = PROFILE_COLORS.filter(({ value }) => profileColorsReadable(applyProfileChanges(profile, { [tool]: value })));
    const ink = profileInk(profile.background);
    assert.deepEqual(choices, tool === "accent" ? [...readable.filter(({ value }) => value === ink), ...readable.filter(({ value }) => value !== ink)] : readable);
    if (tool === "accent") assert.equal(choices[0].value, ink, "readable neutral ink always comes first");
    assert.equal(new Set(values(choices)).size, choices.length, "no duplicate swatches");
  }
});

test("the first text swatch is white on dark backgrounds and black on light backgrounds", () => {
  for (const [background, expected] of [["#000000", "#FFFFFF"], ["#3155FF", "#FFFFFF"], ["#171E5B", "#FFFFFF"], ["#FFFFFF", "#000000"], ["#BFFF00", "#000000"], ["#FFB2DE", "#000000"], ["#ff4d00", "#000000"]]) {
    for (const accent of ["#BFFF00", "#3155FF", "#123456", "#000000", "#FFFFFF"]) {
      assert.equal(profileColorChoices(theme(background, accent), "accent")[0].value, expected);
    }
  }
});

test("suggestions react to the other color and leave chosen colored text unchanged", () => {
  const cobalt = theme("#3155FF", "#BFFF00");
  assert.ok(values(profileColorChoices(cobalt, "accent")).includes("#BFFF00"));
  assert.ok(!values(profileColorChoices(cobalt, "accent")).includes("#3155FF"));
  assert.ok(!values(profileColorChoices(cobalt, "background")).includes("#BFFF00"));
  assert.notDeepEqual(profileColorChoices(cobalt, "accent"), profileColorChoices(theme("#BFFF00", "#3155FF"), "accent"));
  assert.notDeepEqual(profileColorChoices(cobalt, "background"), profileColorChoices(theme("#3155FF", "#98004F"), "background"));
  for (const { value } of profileColorChoices(cobalt, "background")) {
    assert.equal(applyProfileChanges(cobalt, { background: value }).accent, cobalt.accent);
  }
});

test("neutral text can auto-flip so all preset backgrounds remain available", () => {
  for (const accent of ["#FFFFFF", "#000000", "#ffffff", "#000000"]) {
    assert.deepEqual(profileColorChoices(theme("#3155FF", accent), "background"), PROFILE_COLORS);
  }
});

test("swatches do not shuffle while the active color is being changed or sampled", () => {
  const base = theme("#3155FF", "#BFFF00");
  const textChoices = profileColorChoices(base, "accent");
  const backgroundChoices = profileColorChoices(base, "background");
  for (const color of [...values(PROFILE_COLORS), "#123456", "#949494"]) {
    assert.deepEqual(profileColorChoices(applyProfileChanges(base, { accent: color }), "accent"), textChoices);
    assert.deepEqual(profileColorChoices(applyProfileChanges(base, { background: color }), "background"), backgroundChoices);
    const neutral = theme("#000000", "#FFFFFF");
    assert.deepEqual(profileColorChoices(applyProfileChanges(neutral, { background: color }), "background"), PROFILE_COLORS);
  }
});

test("custom colors still preview unchanged and use the existing save validation", () => {
  const invalid = applyProfileChanges(theme("#3155FF", "#BFFF00"), { accent: "#3155FF" });
  assert.equal(invalid.accent, "#3155FF");
  assert.equal(profileColorsReadable(invalid), false);
  const editor = readFileSync(new URL("../app/components/ProfileEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const colorChoices = colorTool \? profileColorChoices\(profile, colorTool\) : \[\]/);
  assert.match(editor, /colorChoices\.map/);
  assert.match(editor, /<GradientColorPicker\s+color=\{activeColor\} onChange=\{changeColor\}/);
  assert.match(editor, /const nextColor = color\.toUpperCase\(\);\s*update\(\{ \[colorTool\]: nextColor \}\)/);
  assert.match(editor, /aria-label="Done choosing styles" onClick=\{leaveTool\}/);
  assert.match(editor, /feedback=\{!profileColorsReadable\(profile\)\}/);
  assert.doesNotMatch(editor, /customColor|name: "Current"/);
});
