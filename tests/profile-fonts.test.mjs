import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { PROFILE_FONTS, PROFILE_FONT_CATALOG, DEFAULT_PROFILE, profileFontInfo, profileFontWeight, validateProfile } from "../app/lib/profile.ts";
import { readStripContent, writeStripContent } from "../app/lib/strip-ending.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chosen = ["letter", "sans", "serif", "mono", "rounded", "display", "changa-one", "rubik-black", "shrikhand", "dela-gothic-one", "rammetto-one", "gloock", "yeseva-one", "jacquarda-bastarda-9", "unifrakturcook", "arial", "times"];

test("the menus contain the 15 selected styles with mixed-case alternatives, plus Arial and Times New Roman", () => {
  assert.equal(PROFILE_FONTS.length, 17);
  assert.deepEqual(PROFILE_FONTS.map(({ id }) => id).sort(), chosen.sort());
  assert.match(profileFontInfo("arial").family, /^Arial,/);
  assert.match(profileFontInfo("times").family, /^"Times New Roman",/);
  for (const id of ["hand", "condensed", "bungee", "rubik-mono-one", "notable"]) {
    assert.ok(!PROFILE_FONTS.some((font) => font.id === id));
    assert.equal(profileFontInfo(id).id, id, "older saved styles remain available to the renderer");
  }
});

test("font identifiers are validated and Strip text styles survive serialization", () => {
  for (const { id } of PROFILE_FONT_CATALOG) {
    assert.equal(validateProfile({ ...DEFAULT_PROFILE, font: id }).font, id);
    const blocks = [{ id: "text", type: "text", content: "Your words", fontStyle: id }];
    assert.equal(readStripContent(writeStripContent(blocks)).blocks[0].fontStyle, id);
  }
  for (const id of ["url(evil)", "Arial; color:red", "unknown", null]) {
    assert.equal(validateProfile({ ...DEFAULT_PROFILE, font: id }), null);
    assert.equal(profileFontInfo(id).id, "letter");
  }
});

test("every new webfont is a small, valid, locally hosted WOFF2 with its full license", () => {
  const css = read("app/globals.css");
  const faces = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(([face]) => face);
  let totalBytes = 0;
  const webfonts = PROFILE_FONTS.filter((font) => "asset" in font);
  assert.equal(webfonts.length, 9);
  for (const font of webfonts) {
    const bytes = readFileSync(new URL(`../public${font.asset}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "wOF2", font.label);
    assert.equal(bytes.readUInt32BE(8), bytes.length, font.label);
    assert.ok(bytes.length > 1000 && bytes.length < 100000, font.label);
    totalBytes += bytes.length;
    const license = read(`public/licenses/fonts/${font.id}.txt`);
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(license, /Copyright/i);
    const face = faces.find((value) => value.includes(`url("${font.asset}")`));
    assert.ok(face, font.label);
    assert.ok(face.includes(`font-family: ${font.family.split(",")[0]}`));
    assert.ok(face.includes(`font-weight: ${profileFontWeight(font.id)}`));
    assert.match(face, /font-display: swap/);
    assert.doesNotMatch(face, /https?:/);
  }
  assert.ok(totalBytes < 300000, "all nine fonts together stay below 300 KB");
});

test("single-weight display faces use their original weight in all shared renderers", () => {
  assert.equal(profileFontWeight("letter"), 900);
  assert.equal(profileFontWeight("unifrakturcook"), 700);
  assert.equal(profileFontWeight("rubik-black"), 900);
  for (const { id } of PROFILE_FONTS.filter((font) => "asset" in font && !["unifrakturcook", "rubik-black"].includes(font.id))) {
    assert.equal(profileFontWeight(id), 400);
  }
  assert.equal(profileFontWeight("sans"), undefined, "system fonts keep their existing context weights");
  const page = read("app/page.tsx"), editor = read("app/components/ProfileEditor.tsx");
  assert.match(page, /const FONT_OPTIONS = PROFILE_FONTS\.map/);
  assert.match(page, /PROFILE_FONT_CATALOG\.map/);
  assert.match(page, /"--text-font-weight": block\.fontStyle \? profileFontWeight\(block\.fontStyle\)/);
  assert.match(page, /fontWeight: option\.weight/);
  assert.match(editor, /PROFILE_FONTS\.map/);
  assert.match(editor, /"--profile-font": profileFontInfo\(profile\.font\)\.family/);
  assert.match(editor, /"--profile-font-weight": profileFontWeight\(profile\.font\)/);
  assert.match(read("app/api/strips/[id]/route.ts"), /profileFont: profileFontInfo\(row\.profile_font\)\.id/);
  assert.match(read("app/globals.css"), /font-weight: var\(--text-font-weight, 450\)/);
});

test("all selectable webfonts have real uppercase and lowercase outlines, not repeated capital glyphs", () => {
  const audit = JSON.parse(read("tests/fixtures/profile-font-glyphs.json"));
  for (const font of PROFILE_FONTS.filter((font) => "asset" in font)) {
    const record = audit[font.id];
    assert.ok(record, `audit exists for ${font.label}`);
    const bytes = readFileSync(new URL(`../public${font.asset}`, import.meta.url));
    assert.equal(record.sha256, createHash("sha256").update(bytes).digest("hex"), "audit matches the actual shipped file");
    assert.equal(record.uppercase, true, font.label);
    assert.equal(record.lowercase, true, font.label);
    assert.equal(record.distinctPairs, 26, font.label);
  }
  for (const id of ["bungee", "rubik-mono-one", "notable"]) {
    assert.equal(audit[id].distinctPairs, 0, "uppercase-only legacy faces stay out of the menu");
  }
});
