import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as username from "../../app/lib/username.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../app/components/StripEndingSheet.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(code, {
  exports,
  require: id => id.endsWith("ending-contact") ? { installEndingContact() {} }
    : id === "@/app/lib/username" ? username : require(id),
});
export const StripEndingSheet = exports.StripEndingSheet;
