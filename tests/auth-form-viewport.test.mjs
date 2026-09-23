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
  globalThis.document={documentElement:{style:{getPropertyValue:k=>properties.get(k)||"",setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},
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

test("the iPhone form owns its media anchor and theme until sign-in ends, not until stickers leave", () => {
  const properties = new Map([["--auth-flight-inset", "62px"]]);
  const classes = new Set(["auth-stickers-floating"]), documentEvents = new Map(), viewportEvents = new Map();
  const attributes = new Map([["name", "theme-color"]]);
  const scrolls = [];
  const theme = { getAttribute: key => attributes.get(key), hasAttribute: key => attributes.has(key),
    removeAttribute: key => attributes.delete(key), setAttribute: (key, value) => attributes.set(key, value) };
  globalThis.document = {
    documentElement: { style: {getPropertyValue: key => properties.get(key) || "",
      setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key)},
      classList: {add: value => classes.add(value), remove: (...values) => values.forEach(value => classes.delete(value)),
        toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value)} },
    getElementById: () => theme,
    addEventListener: (name, handler) => documentEvents.set(name, handler),
    removeEventListener: name => documentEvents.delete(name),
  };
  globalThis.window = {
    innerHeight: 774, visualViewport: {height: 714, offsetTop: 0, scale: 1,
      addEventListener: (name, handler) => viewportEvents.set(name, handler), removeEventListener: name => viewportEvents.delete(name)},
    addEventListener() {}, removeEventListener() {}, scrollTo: options => scrolls.push(options),
  };
  try {
    const cleanup = installAuthFormViewport();
    assert.ok(classes.has("auth-form-anchored"));
    assert.equal(properties.get("--auth-form-anchor-inset"), "62px");
    assert.ok(!attributes.has("name"));
    // Physics is finished, but its cleanup must not move the focused form.
    classes.delete("auth-stickers-floating"); properties.delete("--auth-flight-inset");
    window.visualViewport.height = 404; viewportEvents.get("resize")();
    assert.ok(classes.has("auth-form-anchored"));
    assert.equal(properties.get("--auth-form-anchor-inset"), "62px");
    assert.ok(!attributes.has("name"));
    assert.deepEqual(scrolls, []);
    let canceled = false;
    documentEvents.get("touchmove")({preventDefault: () => { canceled = true; }});
    assert.ok(canceled);
    cleanup();
    assert.equal(documentEvents.size + viewportEvents.size + properties.size + classes.size, 0);
    assert.equal(attributes.get("name"), "theme-color");
    assert.deepEqual(scrolls, [{top: 0, left: 0, behavior: "instant"}]);
  } finally { delete globalThis.window; delete globalThis.document; }
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
  assert.equal((auth.match(/<AuthKeyboardButton/g)||[]).length,3);
  assert.match(auth,/keepKeyboard=\{authStep === "code"\}/);
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
