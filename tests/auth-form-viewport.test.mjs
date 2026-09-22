import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installAuthFormViewport } from "../app/lib/auth-form-viewport.ts";

test("the auth canvas follows keyboard height and pan, then releases its scroll lock", () => {
  const properties=new Map(),classes=new Set(),events=new Map(),windowEvents=new Map();
  const viewport={height:740,offsetTop:0,scale:1,
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  globalThis.window={visualViewport:viewport,innerHeight:800,
    addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name)};
  globalThis.document={documentElement:{style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},
    classList:{add:c=>classes.add(c),remove:(...items)=>items.forEach(c=>classes.delete(c)),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}}};
  try {
    const cleanup=installAuthFormViewport();
    assert.equal(properties.get("--auth-viewport-height"),"740px");
    viewport.height=350;viewport.offsetTop=48;events.get("resize")();
    assert.equal(properties.get("--auth-viewport-height"),"350px");
    assert.equal(properties.get("--auth-viewport-top"),"48px");
    assert.ok(classes.has("auth-form-compact"));
    viewport.offsetTop=-12;events.get("scroll")();
    assert.equal(properties.get("--auth-viewport-top"),"0px");
    viewport.height=740;events.get("resize")();
    assert.ok(!classes.has("auth-form-compact"));
    cleanup();
    assert.equal(events.size+windowEvents.size+properties.size+classes.size,0);
  } finally {delete globalThis.window;delete globalThis.document;}
});

test("phone and code share one enabled native input and keep Continue under the input", () => {
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const auth=page.slice(page.indexOf('if (authenticationRequired && authStatus !== "signed-in")'));
  const input=auth.match(/<input\s+id="auth-entry"[\s\S]*?\/>/)[0];
  assert.equal((auth.match(/id="auth-entry"/g)||[]).length,1);
  assert.match(input,/type="tel"\s+inputMode="tel"/);
  assert.doesNotMatch(input,/disabled=|readOnly=|key=/);
  assert.match(input,/autoComplete=\{authStep === "phone" \? "tel" : "one-time-code"\}/);
  assert.match(auth,/<div className="auth-flow-actions">[\s\S]*?className="auth-continue-button"/);
  assert.match(auth,/onPointerDown=\{event => event.preventDefault\(\)\}/);
  assert.doesNotMatch(auth,/auth-flow-brand/);
  assert.match(auth,/authStep === "landing" \? <footer/);
});

test("Get started uses a real switch tap, not synthetic Safari haptic clicks", () => {
  const source=readFileSync(new URL("../app/components/HapticStartButton.tsx",import.meta.url),"utf8");
  assert.match(source,/type="checkbox".*switch: ""/);
  assert.match(source,/role="button" aria-label="Get started"/);
  assert.match(source,/navigator.vibrate\(12\)/);
  assert.doesNotMatch(source,/\.click\(|setInterval|setTimeout/);
});
