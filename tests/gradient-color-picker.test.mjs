import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/components/GradientColorPicker.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("picker.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = tree.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ["hslToHex", "hexPosition"].includes(node.name?.text)).map(node => node.getText(tree)).join("\n");
const exports = {};
runInNewContext(ts.transpileModule(helpers, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports});

test("the shared rainbow has the editor's hue sequence and black/white endpoints", () => {
  for (const [hue,hex] of [[0,"#FF0000"],[60,"#FFFF00"],[120,"#00FF00"],[180,"#00FFFF"],[240,"#0000FF"],[300,"#FF00FF"],[360,"#FF0000"]]) {
    assert.equal(exports.hslToHex(hue,50),hex);
    assert.equal(exports.hslToHex(hue,0),"#000000");
    assert.equal(exports.hslToHex(hue,100),"#FFFFFF");
  }
});

test("gray values retain hue in the control and both pointer completion paths release capture", () => {
  for (const [hex,lightness] of [["#FFFFFF",100],["#000000",0],["#CCCCCC",80]]) {
    const position = exports.hexPosition(hex);
    assert.equal(position.saturation,0);
    assert.equal(position.lightness,lightness);
  }
  assert.match(source,/decoded.saturation > 0 \? decoded.hue : lastHue/);
  assert.match(source,/onPointerUp=\{release\} onPointerCancel=\{release\}/);
  assert.match(source,/event.preventDefault\(\); event.currentTarget.setPointerCapture/);
});
