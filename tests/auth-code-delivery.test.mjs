import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const source = readFileSync(new URL("../app/components/AuthCodeDelivery.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: createRequire(import.meta.url) });

test("sending, sent and failed keep all status layers mounted and announce only the current state", () => {
  for (const [sending, failed, label] of [[true, false, "Sending code to"], [false, false, "Code sent to"], [false, true, "Couldn’t send to"], [true, true, "Sending code to"]]) {
    const html = renderToStaticMarkup(createElement(exports.AuthCodeDelivery, { sending, failed, phone: "+1 202 555 0100" }));
    assert.ok(html.includes(`aria-label="${label} +1 202 555 0100"`));
    assert.ok(html.includes(`class="is-current">${label}</span>`));
    assert.equal((html.match(/is-current/g) || []).length, 1);
    for (const text of ["Sending code to", "Code sent to", "Couldn’t send to"]) assert.ok(html.includes(text));
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /auth-code-delivery-phone" aria-hidden="true">\+1 202 555 0100<\/span>/);
  }
});

test("status text crossfades within a fixed grid while the input and button stay mounted", () => {
  assert.match(css, /\.auth-code-delivery-prefix\s*\{ display: inline-grid;/);
  assert.match(css, /\.auth-code-delivery-prefix > span\s*\{[^}]*grid-area: 1 \/ 1;[^}]*transition: opacity 320ms ease, transform 320ms ease;/);
  assert.match(css, /\.auth-code-delivery-phone\s*\{[^}]*white-space: nowrap;[^}]*tabular-nums;/);
  assert.match(page, /<AuthCodeDelivery sending=\{authSendingCode\} failed=\{authCodeDeliveryFailed\}/);
  assert.match(page, /authPending && !authSendingCode \? \(needsAuthUsername \? "Saving…" : "Checking…"\) : "Continue"/);
  assert.doesNotMatch(source, /setTimeout|\.focus\(|key=\{status\}/);
});
