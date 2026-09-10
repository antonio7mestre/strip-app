import assert from "node:assert/strict";
import test from "node:test";
import { createSquareGrid, chooseScribbleColor, startScribble, scribbleSurfaceBounds, installScribbleSurface, SQUARE_STEP_MS, SQUARE_FILL_MS, SCRIBBLE_FADE_MS } from "../app/lib/scribble-entrance.ts";

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


test("the first square is exactly centered and every remaining cell appears once", () => {
  for (const [w, h] of [[393, 852], [402, 904], [852, 393], [1440, 900], [320, 1024]]) {
    for (let seed = 0; seed < 100; seed++) {
      const cells = createSquareGrid(w, h, seed);
      assert.equal(cells[0].x + cells[0].size / 2, w / 2);
      assert.equal(cells[0].y + cells[0].size / 2, h / 2);
      assert.equal(new Set(cells.map(c => c.x + ":" + c.y)).size, cells.length);
      assert.ok(cells.every(c => c.size >= 8 && c.size <= 14));
      assert.ok(cells.length < 10000);
      assert.deepEqual(cells, createSquareGrid(w, h, seed));
    }
  }
});

test("each load shuffles the entire grid after its center without favoring a growing region", () => {
  const starts = new Set(), quarters = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const cells = createSquareGrid(393, 852, seed);
    starts.add(JSON.stringify(cells.slice(1, 10)));
    quarters.add((cells[1].x < 196.5) + ":" + (cells[1].y < 426));
    const early = cells.slice(1, 80);
    assert.equal(new Set(early.map(c => (c.x < 196.5) + ":" + (c.y < 426))).size, 4);
  }
  assert.equal(starts.size, 200);
  assert.equal(quarters.size, 4);
  assert.notDeepEqual(createSquareGrid(393, 852), createSquareGrid(393, 852));
});

test("the complete square grid covers every edge, corner, and internal join", () => {
  for (const [w, h] of [[393.33, 852.67], [402, 904], [852, 393], [1440, 900], [1, 1]]) {
    const cells = createSquareGrid(w, h, 92);
    for (let yi = 0; yi <= 48; yi++) for (let xi = 0; xi <= 32; xi++) {
      const x = xi * w / 32, y = yi * h / 48;
      assert.ok(cells.some(c => x >= c.x - 1e-9 && x <= c.x + c.size + 1e-9
        && y >= c.y - 1e-9 && y <= c.y + c.size + 1e-9));
    }
  }
});

function harness({ canvasFails = false, reduced = false } = {}) {
  const queue = new Map(), paints = [];
  let id = 0, resized, disconnected = false, done = 0, now = 0, resets = 0;
  let bounds = { width: 393, height: 852 };
  globalThis.window = { devicePixelRatio: 3, matchMedia: () => ({ matches: reduced }) };
  globalThis.requestAnimationFrame = fn => { queue.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => queue.delete(key);
  globalThis.ResizeObserver = class {
    constructor(callback) { resized = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const context = {
    setTransform(...matrix) { resets++; this.matrix = matrix; },
    fillRect(...rect) { paints.push({ rect, color: this.fillStyle, matrix: this.matrix }); },
  };
  const canvas = { width: 0, height: 0, getContext: () => canvasFails ? null : context };
  const host = { dataset: {}, style: {}, getBoundingClientRect: () => bounds };
  const animation = startScribble(canvas, host, ["#EC6350", "#99CC00"], () => done++);
  return { animation, host, canvas, queue, paints,
    get done() { return done; }, get resets() { return resets; },
    get count() { return Number(host.dataset.inkSegments); },
    get total() { return Number(host.dataset.inkTotal); },
    get disconnected() { return disconnected; },
    tick(time) { now = time; const pending = [...queue.values()]; queue.clear(); pending.forEach(fn => fn(now)); },
    advance(duration) {
      const end = now + duration;
      while (now < end) this.tick(Math.min(end, now + 16));
    },
    resize(width, height) { bounds = { width, height }; resized(); },
    clean() {
      animation.dispose();
      delete globalThis.window; delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame; delete globalThis.ResizeObserver;
    },
  };
}

test("one center square is present immediately, followed by one new square per beat", () => {
  const h = harness();
  try {
    assert.equal(h.count, 1); assert.equal(h.paints.length, 1);
    const [x, y, w, height] = h.paints[0].rect;
    assert.ok(Math.abs(x + w / 2 - 393 / 2) < 1);
    assert.ok(Math.abs(y + height / 2 - 852 / 2) < 1);
    assert.equal(h.host.dataset.inkAnimation, "squares");
    h.tick(0); h.advance(SQUARE_STEP_MS - 1); assert.equal(h.count, 1);
    h.advance(1); assert.equal(h.count, 2);
    const firstTwo = structuredClone(h.paints);
    h.advance(SQUARE_STEP_MS * 8);
    assert.equal(h.count, 10);
    assert.deepEqual(h.paints.slice(0, 2), firstTwo);
    assert.equal(new Set(h.paints.map(p => JSON.stringify(p.rect))).size, h.count);
  } finally { h.clean(); }
});

test("squares arrive eight times faster without depending on screen refresh rate", () => {
  assert.equal(SQUARE_STEP_MS, 2);
  assert.equal(SQUARE_FILL_MS, 260);
  assert.equal(SCRIBBLE_FADE_MS, 650);
  for (const frameMs of [8, 16, 32]) {
    const h = harness();
    try {
      h.tick(0);
      for (let t = frameMs; t <= 960; t += frameMs) h.tick(t);
      assert.equal(h.count, 481);
      assert.equal(h.host.style.opacity, "1");
      assert.equal(h.done, 0);
    } finally { h.clean(); }
  }
});

test("a pre-paint safe-area resize keeps only the centered first square", () => {
  const h = harness();
  try {
    h.resize(402, 762); h.resize(402, 904);
    assert.equal(h.count, 1);
    const [x, y, w, height] = h.paints.at(-1).rect;
    assert.ok(Math.abs(x + w / 2 - 201) < 1);
    assert.ok(Math.abs(y + height / 2 - 452) < 1);
  } finally { h.clean(); }
});

test("slow loading keeps adding individual squares with no early cover or fade", () => {
  const h = harness();
  try {
    h.tick(0);
    let count = h.count;
    for (let t = 16; t <= 30000; t += 16) {
      h.tick(t);
      assert.ok(h.count >= count && h.count <= count + 16 / SQUARE_STEP_MS);
      count = h.count;
      assert.equal(h.host.dataset.inkPhase, "drawing");
      assert.equal(h.host.style.opacity, "1");
      assert.ok(h.count < h.total);
    }
    assert.ok(h.count > 1800);
    assert.equal(h.done, 0);
  } finally { h.clean(); }
});

test("even a very long wait reserves the final tile for actual readiness", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(180000);
    assert.equal(h.count, h.total - 1);
    assert.ok(Number(h.host.dataset.inkProgress) < 1);
    assert.equal(h.host.style.opacity, "1");
    h.animation.setReady(true); h.advance(16);
    h.advance(SQUARE_FILL_MS + SCRIBBLE_FADE_MS + 16);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("readiness quickly fills every remaining square before the same smooth fade", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(800);
    const before = h.count;
    h.animation.setReady(true); h.advance(16);
    assert.equal(h.host.dataset.inkPhase, "sweeping");
    assert.equal(h.count, before);
    h.advance(SQUARE_FILL_MS / 2);
    assert.ok(h.count > before + (h.total - before) * 0.5);
    assert.ok(h.count < h.total);
    assert.equal(h.host.style.opacity, "1");
    h.advance(SQUARE_FILL_MS / 2);
    assert.equal(h.count, h.total);
    assert.equal(h.host.dataset.inkProgress, "1.000");
    assert.equal(h.host.dataset.inkPhase, "fading");
    assert.equal(h.host.style.opacity, "1");
    assert.deepEqual(h.paints.at(-1).rect, [0, 0, 393, 852]);
    h.advance(SCRIBBLE_FADE_MS / 2);
    assert.equal(Number(h.host.style.opacity), 0.5);
    h.advance(SCRIBBLE_FADE_MS / 2);
    assert.equal(h.done, 1);
    h.animation.setReady(true); h.tick(100000);
    assert.equal(h.done, 1); assert.equal(h.queue.size, 0);
  } finally { h.clean(); }
});

test("an already-ready page starts with its center then fills without an extra drawing timer", () => {
  const h = harness();
  try {
    h.animation.setReady(true); h.tick(0);
    assert.equal(h.count, 1);
    assert.equal(h.host.dataset.inkPhase, "sweeping");
    h.advance(SQUARE_FILL_MS + SCRIBBLE_FADE_MS + 16);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("physical-pixel snapping seals tile edges and uses one unchanged strip color", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(1000); h.resize(414.33, 896.67); h.advance(500);
    for (const paint of h.paints) {
      assert.equal(paint.color, "#EC6350");
      assert.ok(paint.rect.every(n => Math.abs(n * 1.5 - Math.round(n * 1.5)) < 1e-8));
    }
    assert.equal(h.host.dataset.inkColor, "#EC6350");
    assert.equal(chooseScribbleColor(["#000000"]), "#646464");
    assert.equal(chooseScribbleColor(["bad", "#FFFFFF"]), "#FFFFFF");
    assert.equal(chooseScribbleColor([]), "#3E60FF");
  } finally { h.clean(); }
});

test("resize redraws the current state synchronously and does not restart the sequence or fade", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(2000);
    const oldCount = h.count, oldTotal = h.total, resets = h.resets;
    h.resize(393, 852);
    assert.equal(h.resets, resets); assert.equal(h.count, oldCount);
    h.resize(852, 393);
    assert.ok(Math.abs(h.count / h.total - oldCount / oldTotal) < 0.003);
    assert.equal(h.canvas.width, 1278);
    h.animation.setReady(true); h.advance(16);
    h.advance(SQUARE_FILL_MS + 200);
    const opacity = h.host.style.opacity;
    h.resize(393, 852);
    assert.equal(h.host.style.opacity, opacity);
    assert.equal(h.count, h.total);
    assert.deepEqual(h.paints.at(-1).rect, [0, 0, 393, 852]);
    h.advance(SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("a suspended tab only catches up a bounded 32ms of waiting squares", () => {
  const h = harness();
  try {
    h.tick(0); h.advance(SQUARE_STEP_MS - 1);
    const count = h.count;
    h.tick(90000);
    assert.equal(h.count, count + 32 / SQUARE_STEP_MS);
    assert.equal(h.host.style.opacity, "1");
    assert.equal(h.host.dataset.inkPhase, "drawing");
  } finally { h.clean(); }
});

test("readiness can be withdrawn during the fill without revealing unfinished content", () => {
  const h = harness();
  try {
    h.tick(0); h.animation.setReady(true); h.advance(16);
    h.animation.setReady(false); h.advance(SQUARE_FILL_MS + 1000);
    assert.equal(h.host.style.opacity, "1");
    assert.equal(h.host.dataset.inkPhase, "covered");
    assert.equal(h.queue.size, 0); assert.equal(h.done, 0);
    h.animation.setReady(true); h.advance(16 + SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("the requested square animation remains enabled with reduced motion", () => {
  const h = harness({ reduced: true });
  try {
    h.tick(0); h.advance(400);
    assert.ok(h.count > 1); assert.ok(h.count < h.total);
    h.animation.setReady(true); h.advance(16);
    h.advance(SQUARE_FILL_MS + SCRIBBLE_FADE_MS + 16);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("canvas failure still waits for readiness, covers, and releases without trapping the page", () => {
  const h = harness({ canvasFails: true });
  try {
    h.tick(0); h.advance(1000);
    assert.equal(h.done, 0);
    assert.equal(h.host.style.opacity, "1");
    h.animation.setReady(true); h.advance(16);
    h.advance(SQUARE_FILL_MS);
    assert.equal(h.host.style.backgroundColor, "#EC6350");
    h.advance(SCRIBBLE_FADE_MS);
    assert.equal(h.done, 1);
  } finally { h.clean(); }
});

test("unmount cancels all frames, removes its observer, and ignores late updates", () => {
  const h = harness();
  try {
    h.tick(0);
    const before = h.paints.length;
    h.animation.dispose(); h.animation.setReady(true); h.resize(500, 500); h.tick(100000);
    assert.equal(h.done, 0); assert.equal(h.queue.size, 0);
    assert.equal(h.paints.length, before); assert.equal(h.disconnected, true);
  } finally { h.clean(); }
});
