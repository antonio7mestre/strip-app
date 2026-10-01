import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../app/components/HapticActionButton.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
export function createHapticActionButton(navigator) {
  const exports = {};
  runInNewContext(compiled, { exports, require, navigator });
  return exports.HapticActionButton;
}
export const HapticActionButton = createHapticActionButton();
