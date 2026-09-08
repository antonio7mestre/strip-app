import assert from "node:assert/strict";
import test from "node:test";
import { makeScribble, createScribbleJourney, chooseScribbleColor, startScribble, scribbleSurfaceBounds, installScribbleSurface, SCRIBBLE_DRAW_MS, SCRIBBLE_SWEEP_MS, SCRIBBLE_FADE_MS } from "../app/lib/scribble-entrance.ts";


test("the paint surface follows the existing anchor without scrolling or retaining listeners", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const events = new Map(), viewportEvents = new Map();
  let nextFrame, cancelled = false;
  globalThis.window = {
    innerWidth:414,innerHeight:714,screen:{width:414,height:896},scrollY:0,
    addEventListener:(name,callback)=>events.set(name,callback),
    removeEventListener:name=>events.delete(name),
    visualViewport:{addEventListener:(name,callback)=>viewportEvents.set(name,callback),removeEventListener:name=>viewportEvents.delete(name)},
  };
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{userAgent:"iPhone"}});
  globalThis.getComputedStyle=()=>({getPropertyValue:()=>"0px"});
  globalThis.requestAnimationFrame=callback=>{nextFrame=callback;return 12;};
  globalThis.cancelAnimationFrame=id=>{assert.equal(id,12);cancelled=true;};
  const attributes = new Map([["name", "theme-color"], ["content", "#003CFF"]]);
  const theme = {
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    removeAttribute: name => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
  };
  globalThis.document = {getElementById: () => theme};
  const properties = new Map();
  const host={style:{top:"",height:"",getPropertyValue:name=>properties.get(name),setProperty:(name,value)=>properties.set(name,value)},closest:()=>({})};
  const dispose=installScribbleSurface(host);
  try {
    assert.equal(attributes.has("name"), false);
    theme.setAttribute("content", "#FF00FF");
    assert.deepEqual([host.style.top,host.style.height],["-62px","904px"]);
    assert.equal(properties.get("--entrance-label-bottom"),"140px");
    window.scrollY=62; nextFrame();
    assert.deepEqual([host.style.top,host.style.height],["0px","904px"]);
    window.innerHeight=754;viewportEvents.get("resize")();
    assert.equal(host.style.height,"904px");
    assert.equal(properties.get("--entrance-label-bottom"),"100px");
    window.visualViewport.height=680; window.visualViewport.offsetTop=4;
    viewportEvents.get("scroll")();
    assert.equal(properties.get("--entrance-label-bottom"),"170px");
    const lateScroll=events.get("scroll");
    dispose();window.scrollY=500;lateScroll();
    assert.equal(host.style.top,"0px");
    assert.equal(events.size,0);assert.equal(viewportEvents.size,0);assert.ok(cancelled);
    assert.equal(attributes.get("name"), "theme-color");
    assert.equal(attributes.get("content"), "#FF00FF");
  } finally {
    dispose();
    delete globalThis.window;delete globalThis.getComputedStyle;delete globalThis.document;
    delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);
    else delete globalThis.navigator;
  }
});

test("iPhone zero-inset reports still paint behind the notch and browser toolbar", () => {
  const base = { viewportHeight:714, screenWidth:414, screenHeight:896, landscape:false, isPhone:true, safeTop:0, scrollY:0 };
  assert.deepEqual(scribbleSurfaceBounds(base), {top:-62,height:904});
  assert.deepEqual(scribbleSurfaceBounds({...base,scrollY:62}), {top:0,height:904});
  assert.deepEqual(scribbleSurfaceBounds({...base,safeTop:70}), {top:-70,height:904});
});
test("portrait and landscape use the matching screen edge, not desktop monitor height", () => {
  const base = { viewportHeight:350,screenWidth:414,screenHeight:896,landscape:true,isPhone:true,safeTop:0,scrollY:0 };
  assert.deepEqual(scribbleSurfaceBounds(base), {top:0,height:422});
  assert.deepEqual(scribbleSurfaceBounds({...base,isPhone:false,screenHeight:2160,viewportHeight:800}), {top:0,height:808});
});

test("fractional viewport edges retain at least eight pixels of real painted overscan", () => {
  for (const viewportHeight of [714,714.33,834.67,852,896.5]) {
    const bounds=scribbleSurfaceBounds({viewportHeight,screenWidth:414,screenHeight:896,landscape:false,isPhone:true,safeTop:0,scrollY:62});
    assert.ok(bounds.height>=896+8);
    assert.ok(bounds.height-62-viewportHeight>=8);
    assert.equal(bounds.height,Math.ceil(bounds.height));
  }
});

test("starts as a tiny knot and draws a repeatable, bounded pen journey", () => {
  const path = makeScribble(393, 852, 7319);
  assert.deepEqual(path, makeScribble(393, 852, 7319));
  assert.ok(path.length < 3000);
  for (const segment of path.slice(0, 100)) {
    assert.ok(Math.abs(segment.to[0] - 393 / 2) < 22);
    assert.ok(Math.abs(segment.to[1] - 852 / 2) < 22);
  }
  for (const segment of path) {
    assert.ok(segment.width > 0);
    assert.ok([...segment.from, ...segment.to, segment.width].every(Number.isFinite));
  }
  assert.ok(new Set(path.map(segment => segment.width)).size > 100);
});

test("finishing strokes cover every sampled edge and corner on phone, landscape, and desktop", () => {
  for (const [w, h] of [[393, 852], [852, 393], [1440, 900], [320, 1024]]) {
    const path = makeScribble(w, h);
    for (let yi = 0; yi <= 36; yi++) for (let xi = 0; xi <= 24; xi++) {
      const x = xi * w / 24, y = yi * h / 36;
      assert.ok(path.some(s => {
        const dx = s.to[0] - s.from[0], dy = s.to[1] - s.from[1];
        const t = Math.max(0, Math.min(1, ((x-s.from[0])*dx + (y-s.from[1])*dy) / (dx*dx + dy*dy || 1)));
        return Math.hypot(x-s.from[0]-t*dx, y-s.from[1]-t*dy) < s.width / 2;
      }), `uncovered ${x},${y} at ${w}x${h}`);
    }
  }
});

test("one continuous pen stroke wanders freely then paints vertically, thickening throughout", () => {
  const path = makeScribble(393, 852);
  let vertical = 0, horizontal = 0;
  for (let index = 0; index < path.length; index++) {
    const segment = path[index];
    if (index) assert.deepEqual(segment.from, path[index - 1].to);
    if (index) assert.ok(segment.width >= path[index - 1].width - 1e-10);
    if (index >= 1240) {
      vertical += Math.abs(segment.to[1] - segment.from[1]);
      horizontal += Math.abs(segment.to[0] - segment.from[0]);
    }
  }
  assert.ok(vertical > horizontal * 4);
});

test("every entrance gets a new journey, while a retained seed survives resize", () => {
  const paths = Array.from({ length: 12 }, () => makeScribble(393, 852));
  assert.equal(new Set(paths.map(path => JSON.stringify(path.slice(0, 1200)))).size, 12);
  assert.deepEqual(makeScribble(393, 852, 47), makeScribble(393, 852, 47));
  assert.notDeepEqual(makeScribble(393, 852, 47), makeScribble(393, 852, 48));
});

test("random wandering visits all quarters before the final overtaking passes", () => {
  for (let seed = 0; seed < 150; seed++) {
    const path = makeScribble(393, 852, seed).slice(240, 1200);
    const quarters = new Set(path.map(s => `${s.to[0] < 196.5}:${s.to[1] < 426}`));
    assert.equal(quarters.size, 4, `seed ${seed} must roam across the page`);
    assert.ok(Math.min(...path.map(s => s.to[0])) < 393 * 0.22);
    assert.ok(Math.max(...path.map(s => s.to[0])) > 393 * 0.78);
    assert.ok(Math.min(...path.map(s => s.to[1])) < 852 * 0.22);
    assert.ok(Math.max(...path.map(s => s.to[1])) > 852 * 0.78);
  }
});

test("one strip-derived ink color is frozen, with dark colors lifted for the black canvas", () => {
  assert.equal(chooseScribbleColor(["#EC6350", "#99CC00"]), "#EC6350");
  assert.equal(chooseScribbleColor(["#000000"]), "#646464");
  assert.equal(chooseScribbleColor(["bad", "#FFFFFF"]), "#FFFFFF");
  assert.match(chooseScribbleColor([]), /^#[0-9A-F]{6}$/);
  const h = harness();
  try {
    h.tick(0); h.tick(1300); h.resize(852, 393); h.tick(2600);
    assert.deepEqual([...h.colors], ["#EC6350"]);
  } finally { h.clean(); }
});

test("extended waiting and a mid-curve final sweep never lift the pen or recolor it", () => {
  const journey = createScribbleJourney(393, 852, 51);
  const first = structuredClone(journey.segments);
  for (let round = 0; round < 6; round++) journey.extend();
  assert.deepEqual(journey.segments.slice(0, first.length), first);
  const drawn = journey.segments.length - 317;
  const before = structuredClone(journey.segments.slice(0, drawn));
  journey.finish(drawn);
  assert.deepEqual(journey.segments.slice(0, drawn), before);
  for (let index = 1; index < journey.segments.length; index++) {
    const segment = journey.segments[index], previous = journey.segments[index - 1];
    assert.deepEqual(segment.from, previous.to);
    assert.ok(segment.width >= previous.width - 1e-10);
  }
  const length = journey.segments.length;
  journey.extend(); journey.finish();
  assert.equal(journey.segments.length, length);
});

function harness({ reduced = false, canvasFails = false } = {}) {
  const queue = new Map(), listeners = new Map();
  let id = 0, resized, disconnected = false, strokes = 0, fills = 0, done = 0, now = 0;
  let bounds = { width: 393, height: 852 };
  const colors = new Set();
  const media = { matches: reduced, addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name) };
  globalThis.window = { matchMedia: () => media, devicePixelRatio: 3 };
  globalThis.requestAnimationFrame = fn => { queue.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => queue.delete(key);
  globalThis.ResizeObserver = class {
    constructor(callback) { resized = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const context = { setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, clearRect() {},
    stroke() { strokes++; colors.add(this.strokeStyle); }, fillRect() { fills++; colors.add(this.fillStyle); } };
  const canvas = { width: 0, height: 0, getContext: () => canvasFails ? null : context };
  const host = { dataset: {}, style: {}, getBoundingClientRect: () => bounds };
  const animation = startScribble(canvas, host, ["#EC6350", "#99CC00", "#2244AA"], () => done++);
  return { animation, host, canvas, queue, colors,
    get done() { return done; }, get strokes() { return strokes; }, get fills() { return fills; },
    get disconnected() { return disconnected; }, get listeners() { return listeners.size; },
    tick(now) { const pending = [...queue.values()]; queue.clear(); pending.forEach(callback => callback(now)); },
    advance(duration) {
      const end = now + duration;
      while (now < end) { now = Math.min(end, now + 16); this.tick(now); }
    },
    resize(width, height) { bounds = { width, height }; resized(); },
    motion(value) { media.matches = value; listeners.get("change")?.(); },
    clean() {
      animation.dispose();
      delete globalThis.window; delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame; delete globalThis.ResizeObserver;
    },
  };
}

test("never fades before the page is fully inked, then completes exactly once", () => {
  const h = harness();
  try {
    h.animation.setReady(true);
    h.tick(0); h.advance(SCRIBBLE_DRAW_MS - 1);
    assert.equal(h.host.dataset.inkPhase, "drawing");
    assert.equal(h.host.style.opacity, "1");
    h.advance(1);
    assert.equal(h.host.dataset.inkPhase, "sweeping");
    assert.equal(h.fills, 0);
    h.advance(SCRIBBLE_SWEEP_MS);
    assert.equal(h.host.dataset.inkPhase, "fading");
    assert.equal(h.host.dataset.inkProgress, "1.000");
    assert.ok(h.fills > 0);
    h.advance(SCRIBBLE_FADE_MS / 2);
    assert.equal(Number(h.host.style.opacity), 0.5);
    h.advance(SCRIBBLE_FADE_MS / 2);
    assert.equal(h.done, 1);
    h.animation.setReady(true); h.tick(9000);
    assert.equal(h.done, 1);
    assert.equal(h.queue.size, 0);
  } finally { h.clean(); }
});

test("slow assets keep drawing without covering or fading, then trigger one final sweep", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(SCRIBBLE_DRAW_MS);
    const previous = h.strokes;
    h.advance(10000);
    assert.ok(h.strokes > previous + 4000);
    assert.equal(h.host.dataset.inkPhase, "drawing");
    assert.equal(h.fills, 0);
    assert.equal(h.host.style.opacity, "1");
    assert.equal(h.queue.size, 1);
    assert.equal(h.done, 0);
    h.animation.setReady(true);
    h.advance(16);
    assert.equal(h.host.dataset.inkPhase, "sweeping");
    h.advance(SCRIBBLE_SWEEP_MS + SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("resize preserves drawing progress and fade instead of restarting or clearing the frame", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(7000);
    const progress = h.host.dataset.inkProgress, before = h.strokes;
    h.resize(852, 393);
    assert.equal(h.host.dataset.inkProgress, progress);
    assert.ok(h.strokes > before);
    assert.equal(h.canvas.width, 1278);
    h.animation.setReady(true); h.advance(16); h.advance(SCRIBBLE_SWEEP_MS + 200);
    const opacity = h.host.style.opacity;
    h.resize(393, 852);
    assert.equal(h.host.style.opacity, opacity);
    h.advance(SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("returning from a suspended tab cannot skip all wandering or the final sweep", () => {
  const h = harness();
  try {
    h.tick(0); h.animation.setReady(true); h.tick(90000);
    assert.equal(h.host.dataset.inkPhase, "drawing");
    assert.ok(h.strokes < 40);
    assert.equal(h.fills, 0);
  } finally { h.clean(); }
});

test("the final sweep cannot fade through assets that became unready", () => {
  const h = harness();
  try {
    h.tick(0); h.animation.setReady(true); h.advance(SCRIBBLE_DRAW_MS);
    h.animation.setReady(false); h.advance(SCRIBBLE_SWEEP_MS + 1000);
    assert.equal(h.host.style.opacity, "1"); assert.equal(h.done, 0);
    h.animation.setReady(true); h.advance(16 + SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("the requested entrance always draws and sweeps even with reduced motion enabled", () => {
  const h = harness({ reduced: true });
  try {
    h.tick(0);
    assert.equal(h.host.dataset.inkPhase, "drawing");
    assert.equal(h.queue.size, 1);
    h.animation.setReady(true); h.advance(SCRIBBLE_DRAW_MS);
    assert.ok(h.strokes>1000);
    assert.equal(h.host.dataset.inkPhase,"sweeping");
    h.motion(false);h.motion(true);
    h.advance(SCRIBBLE_SWEEP_MS + SCRIBBLE_FADE_MS/2);
    assert.equal(Number(h.host.style.opacity), 0.5);
    h.advance(SCRIBBLE_FADE_MS/2);
    assert.equal(h.done, 1);
    assert.equal(h.listeners,0);
  } finally { h.clean(); }
});

test("canvas failure still waits for media and exits without trapping the page", () => {
  const h = harness({canvasFails:true});
  try {
    h.tick(0); h.advance(1000);
    assert.equal(h.host.dataset.inkPhase,"covered");
    assert.equal(h.queue.size,0); assert.equal(h.done,0);
    h.animation.setReady(true); h.advance(16 + SCRIBBLE_FADE_MS);
    assert.equal(h.done,1);
  } finally { h.clean(); }
});

test("unmount cancels drawing and removes observers and listeners", () => {
  const h = harness();
  try {
    h.tick(0); h.animation.dispose(); h.tick(10000);
    assert.equal(h.done, 0);
    assert.equal(h.queue.size, 0);
    assert.equal(h.listeners, 0);
    assert.equal(h.disconnected, true);
  } finally { h.clean(); }
});
