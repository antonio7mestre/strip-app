import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PROFILE_FONTS, PROFILE_FONT_CATALOG, DEFAULT_PROFILE } from "../app/lib/profile.ts";
import * as fonts from "../app/lib/font-sizing.ts";
import { readStripContent, writeStripContent } from "../app/lib/strip-ending.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const audit = JSON.parse(read("tests/fixtures/font-sizing.json"));
const visualHeight = ([cap, x], context) => {
  const capWeight = context === "title" ? 0.65 : 0.25;
  return cap * capWeight + x * (1 - capWeight);
};

test("every selectable and legacy font has measured title and text sizes, tied to its actual asset", () => {
  assert.deepEqual(Object.keys(fonts.FONT_VISUAL_METRICS).sort(), PROFILE_FONT_CATALOG.map(font => font.id).sort());
  for (const font of PROFILE_FONT_CATALOG) {
    assert.deepEqual(fonts.FONT_VISUAL_METRICS[font.id].title, audit[font.id].title, font.label);
    assert.deepEqual(fonts.FONT_VISUAL_METRICS[font.id].text, audit[font.id].text, font.label);
    if ("asset" in font) {
      const file = readFileSync(new URL(`../public${font.asset}`, import.meta.url));
      assert.equal(createHash("sha256").update(file).digest("hex"), audit[font.id].sha256,
        `${font.label}: a replaced asset requires a fresh sizing audit`);
    }
  }
});

test("all 17 font options converge on the same optical size at every editor size and profile viewport", () => {
  for (const font of PROFILE_FONTS) {
    for (const context of ["title", "text"]) {
      const scale = fonts.fontVisualScale(font.id, context);
      assert.ok(scale > 0.85 && scale < 1.15, `${font.label} stays naturally proportioned`);
      for (const size of context === "title" ? [30, 31.98, 35.26, 36] : [14, 16, 18, 24, 32, 48, 72]) {
        const visible = fonts.normalizedFontSize(font.id, size, context) * visualHeight(audit[font.id][context], context);
        const target = visualHeight(audit.letter[context], context);
        assert.ok(Math.abs(visible - size * target) < 0.001, `${font.label} at ${size}px in ${context}`);
      }
    }
  }
  assert.equal(fonts.fontVisualScale("letter", "title"), 1, "the default keeps its established size");
  assert.ok(fonts.fontVisualScale("changa-one", "title") > 1.1, "small-looking capitals are enlarged");
  assert.ok(fonts.fontVisualScale("times") > 1.1, "small-looking serif text is enlarged");
  assert.ok(fonts.fontVisualScale("rammetto-one") < 0.91, "oversized letters are reduced");
  assert.ok(fonts.fontVisualScale("display") > 1.13, "low-x-height body text gets extra help without inflating its title");
  assert.ok(fonts.fontVisualScale("jacquarda-bastarda-9") > fonts.fontVisualScale("jacquarda-bastarda-9", "title"));
});

test("normalization is deterministic on the first render and never compounds into saved fontSize", () => {
  for (const id of [undefined, null, "__proto__", "constructor", "missing"]) {
    assert.equal(fonts.fontVisualScale(id), fonts.fontVisualScale("sans"));
  }
  for (const { id } of PROFILE_FONT_CATALOG) {
    const block = { id: "text", type: "text", content: "Your story", fontStyle: id, fontSize: 24 };
    const before = JSON.stringify(block);
    for (let i = 0; i < 20; i++) fonts.normalizedFontSize(block.fontStyle, block.fontSize);
    assert.equal(JSON.stringify(block), before);
    const reloaded = readStripContent(writeStripContent([block])).blocks[0];
    assert.equal(reloaded.fontSize, 24);
    assert.equal(fonts.normalizedFontSize(reloaded.fontStyle, reloaded.fontSize), fonts.normalizedFontSize(id, 24));
  }
  assert.doesNotMatch(read("app/lib/font-sizing.ts"), /window|document|useEffect|requestAnimationFrame|transform:/,
    "no delayed measurement or transform can flash, distort glyphs or separate hit areas");
});

test("profile titles use the same normalization before, during and after editing, including public profiles", () => {
  const exports = {};
  runInNewContext(ts.transpileModule(read("app/components/ProfileEditor.tsx"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => name === "@/app/lib/font-sizing" ? fonts :
    name === "@/app/lib/profile" ? { profileTextColor: () => "#FFF", profileInk: () => "#FFF", profileFontInfo: () => ({ family: "Test" }), profileFontWeight: () => 400 } : {} });
  for (const { id } of PROFILE_FONTS) {
    for (const editing of [false, true]) {
      const style = exports.profilePageStyle({ profile: { ...DEFAULT_PROFILE, font: id }, editing });
      assert.equal(style["--profile-font-scale"], fonts.fontVisualScale(id, "title"));
      assert.equal(style["--profile-text-font-scale"], fonts.fontVisualScale(id));
    }
  }
  const css = read("app/globals.css");
  for (const selector of [".profile-theme-mode .library-header h1", ".profile-name h1,\n.profile-title-input"]) {
    const block = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)));
    assert.match(block, /font-size: calc\(clamp\(30px, 8\.2vw, 36px\) \* var\(--profile-font-scale, 1\)\)/);
    assert.match(block, /line-height: calc\(clamp\(30px, 8\.2vw, 36px\) \* 0\.92\)/);
  }
  assert.doesNotMatch(css, /\.profile-header\.is-editing[^}]*font-size:/);
});

test("typing, editor, preview and published text share one sizing and leading rule, as do both font menus", () => {
  const page = read("app/page.tsx"), editor = read("app/components/ProfileEditor.tsx"), css = read("app/globals.css");
  const text = page.slice(page.indexOf('if (block.type === "text") {', page.indexOf("const renderStrip =")), page.indexOf('if (block.type === "image") {', page.indexOf("const renderStrip =")));
  assert.equal((text.match(/fontSize: normalizedFontSize\(block\.fontStyle \?\? "sans", block\.fontSize \?\? DEFAULT_FONT_SIZE\)/g) ?? []).length, 2);
  assert.match(text, /"--text-base-size": `\$\{block.fontSize \?\? DEFAULT_FONT_SIZE\}px`/);
  assert.match(css, /\.text-block textarea,\s*\.text-block p \{[^}]*line-height: calc\(var\(--text-base-size, 18px\) \* 1\.22\)/);
  assert.match(page, /fontSize: normalizedFontSize\(option.value, 16\)/);
  assert.match(editor, /fontSize: normalizedFontSize\(font.id, 16\)/);
  for (const font of ["serif", "mono", "display", "hand"]) {
    const block = css.match(new RegExp(`\\.font-selector-option\\[data-font="${font}"\\] \\{[^}]*\\}`))[0];
    assert.doesNotMatch(block, /font-size:/, "remove old inconsistent hand-picked menu sizes");
  }
});
