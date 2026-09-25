import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const requestSource = source.slice(source.indexOf("  const requestSignInCode ="), source.indexOf("  const verifySignInCode ="));
const requestJs = ts.transpileModule(requestSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ pending = false, exiting = false } = {}) {
  const calls = [];
  const state = { code: "old", pending, sending: false, error: "", step: "phone" };
  let resolveRequest;
  const response = new Promise(resolve => { resolveRequest = resolve; });
  const context = {
    authPending: pending, authStickerExitRef: { current: exiting }, authPhone: "+12025550100",
    authCodeInputRef: { current: { focus: options => { calls.push("focus-code"); assert.equal(state.step, "code"); assert.deepEqual(options, { preventScroll: true }); } } },
    flushSync: update => { calls.push("commit-code-screen"); update(); },
    setAuthPending: value => { state.pending = value; },
    setAuthSendingCode: value => { state.sending = value; },
    setAuthCodeDeliveryFailed: value => { state.deliveryFailed = value; },
    setAuthError: value => { state.error = value; },
    setAuthDevelopmentCode: value => { state.developmentCode = value; },
    setAuthTransitionDirection: () => {},
    setAuthStep: value => { state.step = value; },
    setAuthCode: value => { state.code = value; },
    setAuthResendSeconds: value => { state.resend = value; },
    fetch: async (url, options) => {
      calls.push("send-sms");
      assert.equal(url, "/api/auth/start");
      assert.deepEqual(JSON.parse(options.body), { phone: "+12025550100" });
      return response;
    },
  };
  const run = new Function(...Object.keys(context), `${requestJs}; return requestSignInCode;`)(...Object.values(context));
  return { run, calls, state, resolve: (ok = true) => resolveRequest({ ok, json: async () => ok ? { ok: true } : { error: "Couldn’t send a code." } }) };
}

test("OTP is focused synchronously before SMS, not when the network response arrives", async () => {
  const qa = harness();
  const running = qa.run({ preventDefault() {} });
  assert.deepEqual(qa.calls, ["commit-code-screen", "focus-code", "send-sms"]);
  assert.equal(qa.state.code, "");
  assert.equal(qa.state.sending, true);
  // A real SMS can arrive while the HTTP request is still pending.
  qa.state.code = "123456";
  qa.resolve(); await running;
  assert.equal(qa.state.code, "123456");
  assert.equal(qa.state.pending, false);
  assert.equal(qa.state.sending, false);
  assert.equal(qa.state.deliveryFailed, false);
  assert.equal(qa.state.resend, 30);
  assert.equal(qa.calls.filter(call => call === "focus-code").length, 1);
});

test("failed sends release the controls without replacing or blurring the OTP field", async () => {
  const qa = harness();
  const running = qa.run(); qa.resolve(false); await running;
  assert.equal(qa.state.error, "Couldn’t send a code.");
  assert.equal(qa.state.deliveryFailed, true);
  assert.equal(qa.state.pending, false);
  assert.equal(qa.state.sending, false);
  assert.equal(qa.state.step, "code");
});

test("pending requests and the opening sticker transition cannot send another SMS", async () => {
  for (const options of [{ pending: true }, { exiting: true }]) {
    const qa = harness(options); await qa.run(); assert.deepEqual(qa.calls, []);
  }
});

test("a complete autofill or paste updates all six visual cells without clipping separators first", () => {
  const input = source.match(/<input\s+id="auth-code"[\s\S]*?\/>/)[0];
  assert.match(input, /name="verification-code"/);
  assert.match(input, /autoComplete="one-time-code"/);
  assert.match(input, /inputMode="numeric"/);
  const handlerSource = input.match(/onChange=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/)[1];
  let code;
  const onChange = new Function("authFlowStep", "authPending", "authSendingCode", "AUTH_CODE_LENGTH", "setAuthCode", "setAuthError", `return event => {${handlerSource}}`)("code", true, true, 6, value => { code = value; }, () => {});
  for (const value of ["123456", "123 456", "123-456"]) {
    onChange({ target: { value } }); assert.equal(code, "123456");
  }
  assert.doesNotMatch(input, /maxLength=|disabled=|readOnly=/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const activeCode = css.match(/\.auth-flow-form \.auth-code-native \{([^}]+)\}/)[1];
  assert.doesNotMatch(activeCode, /opacity:|display:\s*none|visibility:\s*hidden/);
});
