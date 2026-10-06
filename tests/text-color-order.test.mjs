import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { profileInk } from "../app/lib/profile.ts";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definitions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) definitions.set(node.name.text, node.getText(tree));
  if (ts.isVariableDeclaration(node)) definitions.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  ts.forEachChild(node, visit);
}
visit(tree);
const exports = {};
const code = ["DEFAULT_BACKGROUND", "DEFAULT_BLOCK_BACKGROUND", "BACKGROUND_COLORS", "TEXT_COLOR_PALETTES", "colorChannels", "contrastColor", "textColorOptionsForBackground"].map(name => definitions.get(name)).join("\n");
runInNewContext(ts.transpileModule(`${code}\nexport { textColorOptionsForBackground };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });

test("editor text swatches always begin with the contrasting pure black or white, without duplicates", () => {
  for (const background of ["#000000", "#FFFFFF", "#3155FF", "#8ACE00", "#FF4FA3", "#D9D9D9", "#7A2CFF", "#FF4D00", "#123456", "#EEEEEE", "#9a6021"]) {
    const colors = exports.textColorOptionsForBackground(background);
    assert.equal(colors[0].value, profileInk(background), background);
    assert.equal(colors[0].label, colors[0].value === "#000000" ? "Black" : "White");
    assert.equal(colors.length, new Set(colors.map(({ value }) => value.toUpperCase())).size);
    assert.ok(colors.some(({ value }) => !["#000000", "#FFFFFF"].includes(value)), "the other expressive choices stay available");
    assert.deepEqual(exports.textColorOptionsForBackground(background), colors, "reading options does not mutate the original palette");
  }
});
