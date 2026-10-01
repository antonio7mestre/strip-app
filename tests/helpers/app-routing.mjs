import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as username from "../../app/lib/username.ts";

const exports = {};
const source = readFileSync(new URL("../../app/lib/app-routing.ts", import.meta.url), "utf8");
runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { exports, URL, require: name => {
  if (name === "./username") return username;
  throw new Error(`Unexpected routing dependency: ${name}`);
} });
export const { accountAppOrigin, baseAppOrigin, isProductionAppHost, publishedStripUrl, routeFromLocation, workspaceRedirect } = exports;
