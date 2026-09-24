import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { STICKER_PACK } from "../app/lib/sticker-pack.ts";
import { stickerLayoutFields } from "../app/lib/sticker-layout.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, globals = {}, extra = "") {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path) + extra, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Response, Request, TextDecoder, TextEncoder, Uint8Array, AbortSignal, crypto, URL, atob, btoa, fetch, ...globals });
  return exports;
}
const layout = compile("app/lib/generated-strip.ts", { require: () => ({ STICKER_PACK }) });
const server = compile("app/server/generate-strip.ts", { require: (path) => path.endsWith("sticker-pack") ? { STICKER_PACK } : layout });
const security = compile("app/server/media-security.ts");
const deepCopy = (v) => JSON.parse(JSON.stringify(v));
const photo = (i) => ({ preview: "data:image/jpeg;base64,/9j/AA==", src: `data:image/jpeg;base64,/9j/AA==`, width: i === 1 ? 1200 : 1800, height: i === 1 ? 1800 : 1200, alt: `Photo ${i}` });
const pack = (id, x = 74, y = .79) => ({ kind: "sticker", placement: "join", photoIndex: null, stickerId: id, x, y, width: 25, rotation: 7 });
const inset = (index) => ({ kind: "photo", placement: "inside", photoIndex: index, stickerId: null, x: 46, y: .61, width: 64, rotation: -6 });
const plan = { sections: [
  { kind: "photo", photoIndex: 0, color: "#ff91c9", heightRatio: 1, overlays: [pack("red-cherries"), pack("warm-sun", 24)] },
  { kind: "space", photoIndex: null, color: "#c8ff00", heightRatio: 1.65, overlays: [pack("digital-camera"), inset(1), pack("pink-butterfly", 24)] },
] };

const rgb = hex => [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16)/255);
function hsl(hex) {
  const [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  const h=d===0?0:((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)+6)%6*60;
  return {h,s:d===0?0:d/(1-Math.abs(2*l-1)),l};
}
const luminance = hex => rgb(hex).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
  .reduce((total,c,i)=>total+c*[.2126,.7152,.0722][i],0);

test("generated colors become bold without changing their image-inspired hue", () => {
  for(const color of ["#E5D9C9","#BED8E4","#E6C1D2","#87987A","#181F3A","#B09E83"]) {
    const result=layout.boldGenerationColor(color),before=hsl(color),after=hsl(result);
    assert.match(result,/^#[0-9A-F]{6}$/);
    assert.ok(Math.min(Math.abs(before.h-after.h),360-Math.abs(before.h-after.h))<1);
    assert.ok(after.s>=.775,"saturation stays punchy");
    assert.ok(after.l>=.435&&after.l<=.645,"no washed-out or muddy backgrounds");
    assert.equal(layout.boldGenerationColor(result),result,"repeated processing is stable");
  }
  for(const color of ["#C8FF00","#3355FF","#FF5500"]) assert.equal(layout.boldGenerationColor(color),color);
});

test("neutral backgrounds borrow an existing photo accent, never a fixed unrelated hue", () => {
  assert.equal(layout.boldGenerationColor("#DDDDDD",["#DDDDDD","#3355FF"]),"#3355FF");
  assert.equal(layout.boldGenerationColor("#FAFAF8",["#FAFAF8","#21AE67"]),layout.boldGenerationColor("#21AE67"));
  assert.equal(layout.boldGenerationColor("#AAAAAA",["#777777","#CCCCCC"]),"#F5F5F5");
  assert.equal(layout.boldGenerationColor("#333333",["#777777","#CCCCCC"]),"#181818");
});

test("bold generation preserves the source plan and media and keeps normal-sized text readable", () => {
  for(const color of ["#E5D9C9","#BED8E4","#E6C1D2","#87987A","#181F3A","#FFFFFF","#000000","#FF5500","#7700FF"]) {
    const variant=deepCopy(plan);
    variant.sections[1].color=color;
    const before=JSON.stringify(variant),photos=[photo(0),photo(1)];
    const blocks=layout.buildGeneratedStrip(variant,photos,390);
    const text=blocks.find(b=>b.type==="text");
    const a=luminance(text.backgroundColor),b=luminance(text.textColor);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
    assert.equal(text.fontSize,18);
    assert.equal(JSON.stringify(variant),before);
    assert.equal(blocks.find(b=>b.type==="image").src,photos[0].src);
    assert.equal(blocks.find(b=>b.alt==="Photo 1").src,photos[1].src);
  }
});

test("layout retains every photo and only real catalog stickers, with genuinely blank editable text", () => {
  let i = 0;
  const blocks = layout.buildGeneratedStrip(plan, [photo(0), photo(1)], 390, {}, () => `generated-${++i}`);
  assert.equal(blocks.length, 7);
  assert.equal(blocks.find((b) => b.type === "text").content, "");
  const defaultFontSize = Number(read("app/page.tsx").match(/const DEFAULT_FONT_SIZE = (\d+)/)[1]);
  assert.equal(blocks.find((b) => b.type === "text").fontSize, defaultFontSize);
  assert.equal(blocks.find((b) => b.type === "text").layoutHeight, 643.5);
  assert.equal(blocks.find((b) => b.alt === "Photo 1").type, "sticker");
  assert.equal(blocks[2].alt, "Photo 1", "all photos placed before catalog stickers in stacking order");
  assert.equal(blocks[2].rotation, 0, "photo stickers never tilt even if the model requests it");
  const overlay = blocks.find((b) => b.alt === "Digital camera");
  assert.equal(overlay.anchorBlockId, blocks[1].id);
  assert.ok(overlay.anchorY > 0 && overlay.anchorY < 1, "overflow decoration uses colored space instead of crowding the seam");
  assert.deepEqual([...new Set(blocks.map((b) => b.id))].length, blocks.length);
});

test("generated inset photos fit completely and stay straight even if a rotation is requested", () => {
  for (const [w,h] of [[2000,100], [100,2000], [1000,1000], [1200,1800]]) {
    for (const width of [320,390,768]) {
      const variant = deepCopy(plan);
      variant.sections[1].heightRatio = .4;
      variant.sections[1].overlays[1].x = 92;
      variant.sections[1].overlays[1].y = 0;
      variant.sections[1].overlays[1].rotation = -14;
      const blocks = layout.buildGeneratedStrip(variant, [photo(0), { ...photo(1), width:w, height:h }], width);
      const item = blocks.find((b) => b.alt === "Photo 1");
      const text = blocks.find((b) => b.type === "text");
      assert.equal(item.rotation, 0);
      const angle = 0;
      const halfH = item.width/100*width*(Math.sin(angle)+Math.cos(angle)*h/w)/2;
      const halfW = item.width*(Math.cos(angle)+Math.sin(angle)*h/w)/2;
      assert.ok(item.anchorY*text.layoutHeight-halfH >= 75.99);
      assert.ok(item.anchorY*text.layoutHeight+halfH <= text.layoutHeight-11.99);
      assert.ok(item.x-halfW >= 1.99 && item.x+halfW <=98.01);
      assert.ok(item.width >= 7.999, "saving cannot enlarge a fitted photo beyond its space");
    }
  }
});

test("larger pack stickers mix joins and interiors with no overlaps, at every viewport", () => {
  for (const width of [320,390,768]) {
    let nextId = 0;
    const blocks = layout.buildGeneratedStrip(plan, [photo(0), photo(1)], width, {}, () => `generated-${++nextId}`);
    const decoration = blocks.filter(b => b.type === "sticker" && !b.alt.startsWith("Photo"));
    assert.ok(decoration.length >= 3 && decoration.length <= 4);
    assert.ok(decoration.filter(b=>b.anchorY===1).length<=2);
    assert.ok(decoration.some(b=>b.anchorY<1));
    for (const sticker of decoration) {
      assert.ok(sticker.width >= 26);
      assert.ok(sticker.width <= 38);
      assert.ok(blocks.some(b=>b.id===sticker.anchorBlockId&&b.type!=="sticker"));
    }
    for (let a=0;a<decoration.length;a++) for (let b=a+1;b<decoration.length;b++) {
      const first=decoration[a],second=decoration[b];
      const half = item => item.width/100*width*(Math.sin(Math.abs(item.rotation)*Math.PI/180)+Math.cos(item.rotation*Math.PI/180))/2;
      const required=half(first)+half(second)+width*.02;
      assert.ok(Math.abs(first.x-second.x)/100*width >= required-.01 || Math.abs(first.y-second.y) >= required-.01,
        `${first.alt} and ${second.alt} have a clear gap`);
    }
  }
});

test("border stickers use the same side, never a symmetric left/right pair", () => {
  for(const width of [320,390,768]) for(const side of ["left","right"]) for(const size of [26,32,38]) {
    const variant=deepCopy(plan);
    Object.assign(variant.sections[0].overlays[0],{x:side==="left"?20:80,width:size});
    Object.assign(variant.sections[0].overlays[1],{x:side==="left"?80:20,width:size});
    const blocks=layout.buildGeneratedStrip(variant,[photo(0),photo(1)],width);
    const seams=new Map();
    for(const sticker of blocks.filter(b=>b.type==="sticker"&&b.anchorY===1)) {
      const group=seams.get(sticker.anchorBlockId)??[];
      group.push(sticker);seams.set(sticker.anchorBlockId,group);
    }
    assert.ok(seams.size>0);
    for(const group of seams.values()) {
      assert.ok(group.length<=2);
      assert.ok(group.every(b=>b.x<50)||group.every(b=>b.x>50),"never decorate opposite sides of a seam");
      if(size===38) assert.equal(group.length,1,"prefer one large sticker instead of squeezing or mirroring a pair");
    }
  }
});

test("a lone interior photo sticker is omitted instead of left floating", () => {
  const p=deepCopy(plan);
  Object.assign(p.sections[0].overlays[0],{placement:"inside",x:74,y:.34});
  const validated=layout.validateGenerationPlan(p,2);
  assert.equal(validated.sections[0].overlays[0].placement,"inside");
  const blocks=layout.buildGeneratedStrip(p,[photo(0),photo(1)],390);
  assert.equal(blocks.find(b=>b.alt==="Red cherries"),undefined);
});

test("interior photo decorations form a complete layered pair in the chosen quiet area", () => {
  for(const width of [320,390,768]) {
    const p=deepCopy(plan);
    Object.assign(p.sections[0].overlays[0],{placement:"inside",x:74,y:.30});
    Object.assign(p.sections[0].overlays[1],{placement:"inside",x:60,y:.35});
    const blocks=layout.buildGeneratedStrip(p,[photo(0),photo(1)],width);
    const pair=blocks.filter(b=>["Red cherries","Warm sun"].includes(b.alt));
    assert.equal(pair.length,2);
    assert.ok(pair.every(b=>b.anchorBlockId===blocks[0].id&&b.anchorY>0&&b.anchorY<1));
    const half=item=>item.width/100*width*(Math.cos(item.rotation*Math.PI/180)+Math.sin(Math.abs(item.rotation)*Math.PI/180))/2;
    const overlapX=half(pair[0])+half(pair[1])-Math.abs(pair[0].x-pair[1].x)/100*width;
    const overlapY=half(pair[0])+half(pair[1])-Math.abs(pair[0].y-pair[1].y);
    assert.ok(overlapX>width*.03&&overlapY>width*.03,"the pair is actually layered");
    const overlapArea=overlapX*overlapY;
    assert.ok(overlapArea<Math.min(...pair.map(b=>4*half(b)**2))*.4,"each sticker remains readable");
    assert.ok(Math.abs((pair[0].x+pair[1].x)/2-67)<15);
    assert.ok(Math.abs((pair[0].anchorY+pair[1].anchorY)/2-.325)<.15);
  }
});

test("a pair that cannot fit is omitted together, never leaving one member", () => {
  const p=deepCopy(plan);
  for(const item of p.sections[0].overlays) Object.assign(item,{placement:"inside",x:70,y:.3});
  const blocks=layout.buildGeneratedStrip(p,[photo(0),photo(1)],390,{"red-cherries":.04,"warm-sun":.04});
  assert.equal(blocks.filter(b=>["Red cherries","Warm sun"].includes(b.alt)).length,0);
});

test("every colored-block interior decoration touches an inset photo without covering its center", () => {
  for(const width of [320,390,768]) {
    const blocks=layout.buildGeneratedStrip(plan,[photo(0),photo(1)],width);
    const text=blocks.find(b=>b.type==="text");
    const image=blocks.find(b=>b.alt==="Photo 1");
    const photoHalfW=image.width/100*width/2,photoHalfH=photoHalfW*photo(1).height/photo(1).width;
    const decorations=blocks.filter(b=>b.type==="sticker"&&!b.alt.startsWith("Photo")&&b.anchorBlockId===text.id&&b.anchorY<1);
    assert.ok(decorations.length>0);
    for(const item of decorations) {
      const half=item.width/100*width*(Math.cos(item.rotation*Math.PI/180)+Math.sin(Math.abs(item.rotation)*Math.PI/180))/2;
      const dx=Math.abs(item.x-image.x)/100*width,dy=Math.abs(item.y-image.y);
      assert.ok(dx<half+photoHalfW-width*.01&&dy<half+photoHalfH-width*.01,"touches the image");
      assert.ok(dx>=half+photoHalfW*.7+width*.02-.01||dy>=half+photoHalfH*.7+width*.02-.01,"keeps its central subject area clear");
    }
  }
});

test("an empty color block never gets unattached interior decoration", () => {
  const p=deepCopy(plan);
  const [image]=p.sections[1].overlays.splice(1,1);
  p.sections[0].overlays.push(image);
  p.sections[1].overlays.forEach(item=>item.placement="inside");
  const blocks=layout.buildGeneratedStrip(p,[photo(0),photo(1)],390);
  const text=blocks.find(b=>b.type==="text");
  assert.equal(blocks.filter(b=>b.type==="sticker"&&b.anchorBlockId===text.id&&b.anchorY<1).length,0);
});

test("the model can place a related, straight photo over quiet space in another full-width photo", () => {
  const p = deepCopy(plan);
  const [insetPhoto] = p.sections[1].overlays.splice(1, 1);
  p.sections[0].overlays.push({...insetPhoto, x:24, y:.26, width:28});
  const blocks = layout.buildGeneratedStrip(p, [photo(0), photo(1)], 390);
  const item = blocks.find(b=>b.alt === "Photo 1");
  assert.equal(item.anchorBlockId, blocks[0].id);
  assert.equal(item.width, 28);
  assert.equal(item.rotation, 0);
  assert.equal(item.x, 24, "preserve subject-aware horizontal placement");
  assert.ok(item.anchorY > 0 && item.anchorY < 1);
  assert.ok(blocks.some(b=>b.type==="text" && b.content===""));
});

test("photo stickers can bridge real joins without clipping or covering the footer", () => {
  for (const y of [0,1]) {
    const p = deepCopy(plan);
    Object.assign(p.sections[1].overlays[1], {placement:"join", y, x:28, width:42});
    const blocks = layout.buildGeneratedStrip(p, [photo(0), photo(1)], 390);
    const item = blocks.find(b=>b.alt === "Photo 1");
    assert.equal(item.anchorBlockId, blocks[0].id);
    assert.equal(item.anchorY, 1);
    assert.equal(item.y, blocks[0].height);
    assert.equal(item.x, 28);
    assert.equal(item.rotation, 0);
    const halfHeight = item.width/100*390*photo(1).height/photo(1).width/2;
    assert.ok(item.y-halfHeight>=0);
    assert.ok(item.y+halfHeight<=blocks[0].height+blocks[1].layoutHeight);
  }
});

test("a seam-crossing photo can have attached decorations from the neighboring color block", () => {
  const variant=deepCopy(plan);
  const [image]=variant.sections[1].overlays.splice(1,1);
  variant.sections[0].overlays.push({...image,placement:"join",y:1});
  variant.sections[1].overlays.forEach(item=>item.placement="inside");
  const blocks=layout.buildGeneratedStrip(variant,[photo(0),photo(1)],390);
  const paper=blocks.find(b=>b.type==="text");
  const decorations=blocks.filter(b=>b.type==="sticker"&&b.anchorBlockId===paper.id);
  assert.ok(decorations.length>0,"the inset is visible to both blocks, not only the source instruction's block");
  assert.ok(decorations.every(b=>b.anchorY>0&&b.anchorY<1));
});

test("crowded six-photo plans retain every photo without forcing more than two decorations onto any join", () => {
  const sections = [{...deepCopy(plan.sections[0]), overlays: []}];
  for (let i=1;i<5;i++) sections.push({...deepCopy(plan.sections[0]), photoIndex:i, overlays:[]});
  sections.push({...deepCopy(plan.sections[1]), overlays:[inset(5)]});
  for (let i=0;i<12;i++) sections[i % 5].overlays.push(pack(STICKER_PACK[i].id, i%2 ? 75 : 25, 1));
  const blocks = layout.buildGeneratedStrip({sections},Array.from({length:6},(_,i)=>photo(i)),390);
  const joins = new Set(blocks.filter(b=>b.type!=="sticker").slice(0,-1).map(b=>b.id));
  const decoration = blocks.filter(b=>b.type==="sticker"&&!b.alt.startsWith("Photo"));
  assert.equal(blocks.filter(b=>b.alt?.startsWith("Photo")).length,6);
  assert.equal(decoration.length,10,"two decorations without clean nearby space are omitted");
  assert.equal(new Set(decoration.map(b=>b.anchorBlockId)).size,5);
  assert.ok(decoration.every(b=>joins.has(b.anchorBlockId)&&b.anchorY===1));
  for(let i=0;i<4;i++) sections[i].overlays.pop();
  assert.throws(()=>layout.validateGenerationPlan({sections},6), /Incomplete/);
});

test("untrusted layouts cannot insert images, skip photos, write text, or use invalid geometry", () => {
  for (const mutate of [
    (p) => p.sections[1].overlays[1].photoIndex = 10,
    (p) => p.sections[1].overlays[1].photoIndex = 0,
    (p) => p.sections[0].overlays[0].stickerId = "https://evil.example/a.svg",
    (p) => p.sections[1].color = "url(https://evil.example)",
    (p) => p.sections[0].overlays[0].x = Infinity,
    (p) => p.sections[1].overlays[0].stickerId = "red-cherries",
    (p) => p.sections[1].overlays = [],
    (p) => p.sections = [],
  ]) { const p = deepCopy(plan); mutate(p); assert.throws(() => layout.validateGenerationPlan(p, 2)); }
  assert.throws(() => layout.validateGenerationPlan(plan, 3), /Incomplete/);
  const p = deepCopy(plan); p.sections[1].content = "Unwanted generated prose";
  assert.equal(layout.validateGenerationPlan(p, 2).sections[1].content, undefined);
});

test("single-photo Strips still support collage plus full photo", () => {
  const p = deepCopy(plan); p.sections[1].overlays[1].photoIndex = 0;
  assert.equal(layout.validateGenerationPlan(p, 1).sections.length, 2);
});

test("vision input accepts bounded JPEG previews only, not remote URLs or huge batches", () => {
  assert.equal(server.parseGenerationPhotos({photos:[photo(0)]}).length, 1);
  for (const input of [{photos:[]}, {photos:Array(13).fill(photo(0))}, {photos:[{...photo(0),preview:"https://example.com/private"}]}, {photos:[{...photo(0),width:Infinity}]}, {photos:[{...photo(0),preview:"data:image/svg+xml;base64,PHN2Zz4="}]}]) {
    assert.throws(() => server.parseGenerationPhotos(input));
  }
});

test("bounded body reader handles absent length and rejects oversized chunks", async () => {
  assert.deepEqual(deepCopy(await server.readBoundedJson(new Response('{"ok":true}'), 20)), {ok:true});
  await assert.rejects(server.readBoundedJson(new Response("x".repeat(21)), 20), (e) => e.status === 413);
  await assert.rejects(server.readBoundedJson(new Response("{"), 20), (e) => e.status === 400);
});

test("real Responses API request is vision + strict structured output and does not store or expose the key", async () => {
  let requestBody;
  const output = await server.generateStripPlan([photo(0), photo(1)], "test-secret", "gpt-5.4-mini", new AbortController().signal,
    async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer test-secret");
      requestBody = JSON.parse(options.body);
      return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(plan)}]}]});
    });
  assert.equal(output.sections.length, 2);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.input[0].content.filter((c)=>c.type==="input_image").length, 2);
  assert.ok(!JSON.stringify(requestBody).includes("test-secret"));
  assert.ok(!JSON.stringify(output).includes("test-secret"));
});

test("refusals, incomplete output, upstream failures and invalid layout stay out of the editor", async () => {
  const responses = [
    { status:"incomplete", output:[] },
    { status:"completed", output:[{type:"message",content:[{type:"refusal",refusal:"no"}]}] },
    { status:"completed", output:[{type:"message",content:[{type:"output_text",text:"{}"}]}] },
  ];
  for (const response of responses) {
    await assert.rejects(server.generateStripPlan([photo(0),photo(1)],"key","model",new AbortController().signal,async()=>Response.json(response)));
  }
  await assert.rejects(server.generateStripPlan([photo(0)],"key","model",new AbortController().signal,async()=>new Response("private upstream error",{status:429})), (e)=>e.status===429&&!e.message.includes("private"));
});

test("redundant model insets are removed without another paid call or changing the chosen photo-on-photo placement", async () => {
  const variant=deepCopy(plan);
  variant.sections[0].overlays.push({...inset(1),placement:"inside",x:23,y:.28,width:26});
  let calls=0;
  const result=await server.generateStripPlan([photo(0),photo(1)],"key","model",new AbortController().signal,async()=>{
    calls++;
    return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(variant)}]}]});
  });
  assert.equal(calls,1);
  const insets=result.sections.flatMap(s=>s.overlays.filter(o=>o.kind==="photo"));
  assert.equal(insets.length,1);
  assert.equal(insets[0].photoIndex,1);
  assert.equal(insets[0].x,23);
  assert.equal(insets[0].y,.28);
  assert.equal(result.sections[0].overlays.filter(o=>o.kind==="photo").length,1);
  assert.equal(result.sections[1].overlays.filter(o=>o.kind==="photo").length,0);
});

test("draft and publish validators preserve blank collage spaces, anchors, and sticker rotation", () => {
  let i = 0;
  const blocks = layout.buildGeneratedStrip(plan,[photo(0),photo(1)],390,{},()=>`generated-${++i}`)
    .map((b)=>b.type==="sticker"?{...b,src:photo(0).src}:b);
  for (const [route,fn] of [["drafts","prepareDraftBlocks"],["strips","prepareContentBlocks"]]) {
    const validator = compile(`app/api/${route}/route.ts`, {require:(p)=>p.endsWith("media-security")?security:p.endsWith("sticker-layout")?{stickerLayoutFields}:{}},`\nexports.validate=${fn};`).validate;
    const stored = route==="drafts" ? validator("owner-qa","draft-qa",blocks) : validator("owner-qa","strip-qa",null,blocks);
    assert.ok(stored);
    assert.equal(stored.storedBlocks[1].content, "");
    assert.equal(stored.storedBlocks[1].layoutHeight, blocks[1].layoutHeight);
    for (let j=2;j<blocks.length;j++) {
      assert.equal(stored.storedBlocks[j].rotation,blocks[j].rotation);
      assert.equal(stored.storedBlocks[j].anchorBlockId,blocks[j].anchorBlockId);
      assert.equal(stored.storedBlocks[j].anchorY,blocks[j].anchorY);
    }
  }
});

test("layout persistence fields reject invalid anchors and non-finite values", () => {
  assert.deepEqual(stickerLayoutFields({rotation:NaN,anchorBlockId:"bad]",anchorY:Infinity}),{});
  assert.deepEqual(stickerLayoutFields({rotation:900,anchorBlockId:"block-123",anchorY:.4}),{rotation:180,anchorBlockId:"block-123",anchorY:.4});
});

test("starter preserves manual creation, privacy notice, cancellation, and normal editable drafts", () => {
  const ui = read("app/components/NewStripStarter.tsx");
  const page = read("app/page.tsx");
  assert.match(ui,/From scratch/);
  assert.match(ui,/Photos are sent to OpenAI/);
  assert.match(ui,/abortRef\.current\?\.abort\(\)/);
  assert.match(ui,/controller\.signal\.throwIfAborted\(\)/);
  assert.match(page,/setBlocks\(initialBlocks\)/);
  assert.match(page,/anchorBlockId: undefined, anchorY: undefined/);
  assert.match(page,/const settleStickerWithinBounds = \(\) => \{[\s\S]*?if \(!isEditing \|\| liveBlockRef\.current\.anchorBlockId\) return;/);
  assert.match(read("app/api/generate-strip/route.ts"),/WHERE window_started_at <= \? OR count < \? RETURNING count/);
});

function endpoint({signedIn=true, configured=true}={}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE auth_rate_limits (rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, count INTEGER NOT NULL)");
  let modelCalls = 0;
  const env = { ...(configured ? {OPENAI_API_KEY:"server-only-test-key"} : {}), DB:{prepare:(sql)=>({bind:(...args)=>({first:async()=>db.prepare(sql).get(...args)??null})})} };
  const auth = {
    isSameOrigin:request=>request.headers.get("origin")===new URL(request.url).origin,
    requireAuthUser:async()=>signedIn?{user:{id:"qa-user-123"}}:{user:null,response:Response.json({error:"Sign in"},{status:401})},
  };
  const api = compile("app/api/generate-strip/route.ts", {require:(p)=>p==="cloudflare:workers"?{env}:p.endsWith("/auth")?auth:p.endsWith("server/generate-strip")?{...server,generateStripPlan:async()=>{modelCalls++;return plan;}}:layout});
  const request = (body={photos:[photo(0),photo(1)]},origin="https://striiip.com")=>api.POST(new Request("https://striiip.com/api/generate-strip",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)}));
  return {db,request,calls:()=>modelCalls};
}

test("paid endpoint rejects unauthenticated, cross-origin, invalid and unconfigured requests before the model", async () => {
  for (const options of [{signedIn:false},{configured:false},{}]) {
    const api = endpoint(options);
    try {
      const result = await api.request();
      assert.equal(result.status,options.signedIn===false?401:options.configured===false?503:200);
      assert.equal(result.headers.get("cache-control"),options.signedIn===false?null:"no-store");
      if(options.signedIn===false||options.configured===false) assert.equal(api.calls(),0);
      assert.equal((await api.request(undefined,"https://elsewhere.example")).status,403);
      if(!Object.keys(options).length) assert.equal((await api.request({photos:[]})).status,400);
    } finally { api.db.close(); }
  }
});

test("atomic database rate limits admit only two parallel calls and reset expired windows", async () => {
  const api = endpoint();
  try {
    const results = await Promise.all(Array.from({length:8},()=>api.request()));
    assert.equal(results.filter(r=>r.status===200).length,2);
    assert.equal(results.filter(r=>r.status===429).length,6);
    assert.equal(api.calls(),2);
    api.db.exec("UPDATE auth_rate_limits SET window_started_at=0 WHERE rate_key LIKE 'generate:minute:%'");
    assert.equal((await api.request()).status,200);
    api.db.prepare("UPDATE auth_rate_limits SET count=20 WHERE rate_key LIKE 'generate:day:%'").run();
    assert.equal((await api.request()).status,429);
    assert.equal(api.calls(),3);
  } finally { api.db.close(); }
});
