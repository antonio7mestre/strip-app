import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STORY_WIDTH, STORY_HEIGHT, POSTER_DESIGNS, POSTER_COVER_BOTTOM, POSTER_CONTENT_BOTTOM, LINK_STICKER_AREA,
  LINK_STICKER_TARGET, SAVED_LINK_PANEL, SAVED_LINK_GUIDANCE_SCALE, SAVED_LINK_GUIDANCE_CENTER_Y, drawPoster, fitPosterPhoto, posterLinkBounds, posterCoverBounds, steppedPosterTiles,
  posterColor, posterInk, posterMedia, posterPalette } from "../app/lib/share-posters.ts";
import { stackSwipeProgress, stackSwipeTarget } from "../app/lib/stack-picker.ts";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const page=read("app/page.tsx"),hook=read("app/components/useStoryPosters.ts"),
  picker=read("app/components/SharePosterPicker.tsx"),css=read("app/globals.css");
function context(width=1080) {
  const commands=[],paints=[],stack=[];
  const c={canvas:{width,height:width*16/9},font:"500 48px Arial",
    measureText(text){return {width:text.length*Number(c.font.match(/([\d.]+)px/)?.[1] ?? 48)*.52};},
    save(){stack.push({font:c.font,fillStyle:c.fillStyle,textAlign:c.textAlign,textBaseline:c.textBaseline,filter:c.filter});},
    restore(){assert(stack.length);Object.assign(c,stack.pop());}};
  for(const name of ["setTransform","fillRect","fillText","drawImage","translate","scale","rotate","rect","clip",
    "arc","beginPath","moveTo","lineTo","closePath","fill","bezierCurveTo","stroke"]) {
    c[name]=(...args)=>{args.filter(a=>typeof a==="number").forEach(a=>assert(Number.isFinite(a),name));
      commands.push([name,...args]);if(name==="fillRect")paints.push({color:c.fillStyle,args});};
  }
  return {c,commands,paints,depth:()=>stack.length};
}
function assets(count=7,ratio=1.5) {
  const tiles=Array.from({length:count},(_,i)=>({id:String(i),type:i%2?"text":"image",source:{id:i},
    width:390,height:i%2?130:585,flowHeight:i%2?130:585,top:i*500,color:i%2?"#3155FF":undefined}));
  return {title:"Siblings",address:"antonio.striiip.com",palette:["#8ACE00","#001CB5","#FF4FA3"],
    cover:{source:{id:"cover"},width:1000,height:1000*ratio},photos:[],tiles,
    theme:{background:"#8ACE00",ink:"#001CB5",font:'ui-rounded, "SF Pro Rounded", sans-serif',weight:500}};
}

test("only the eight explicitly kept directions become real poster options",()=>{
  assert.deepEqual(POSTER_DESIGNS.map(d=>d.id),["masonry-wall","after-hours-grid","portrait-atmosphere",
    "photo-diptych","sidecar-strip","diagonal-cascade","soft-memory","stepped-blocks"]);
  assert.equal(new Set(POSTER_DESIGNS.map(d=>d.mode)).size,8);
  assert.equal(STORY_WIDTH,1080);assert.equal(STORY_HEIGHT,1920);
  assert.match(picker,/\$\{POSTER_DESIGNS.length\}/);assert.doesNotMatch(picker,/of 10/);
  assert.match(hook,/preview \? "image\/jpeg" : "image\/png"/);
});
test("ordered media includes the whole Strip, its stickers, and first-frame videos",()=>{
  const strip={id:"a",title:"A",cover:{kind:"image",src:"cover"},blocks:[
    {type:"image",src:"cover"},{type:"video",src:"movie.mp4"},{type:"sticker",src:"tape.webp"},
    {type:"sticker",mediaType:"video",src:"video-sticker"}]};
  assert.deepEqual(posterMedia(strip),["cover","movie.mp4","tape.webp","video-sticker"]);
  assert.equal(posterMedia({...strip,blocks:Array.from({length:100},(_,i)=>({type:"image",src:`photo${i}`}))}).length,101);
  assert.deepEqual(posterPalette({...strip,profileBackground:"#8ACE00",profileTextColor:"#001CB5"}),
    ["#8ACE00","#001CB5"]);
  assert.equal(posterColor("#abc"),"#AABBCC");assert.equal(posterColor("transparent"),null);
  assert.equal(posterInk("#FFFFFF"),"#000000");assert.equal(posterInk("#000000"),"#FFFFFF");
});
test("preview address containers hug the measured link, including long usernames",()=>{
  const {c}=context();c.font="500 36px Arial";
  for(const address of ["a.striiip.com","antonio.striiip.com","averylongbutvalidusername.striiip.com"]) {
    const box=posterLinkBounds(c,address);
    assert.equal(box.width,Math.min(LINK_STICKER_TARGET.width,c.measureText(address).width+48));
    assert.equal(box.x+box.width/2,540);assert.equal(box.height,85);assert.equal(box.y,1690);
  }
  assert(posterLinkBounds(c,"a.striiip.com").width<posterLinkBounds(c,"antonio.striiip.com").width);
});
test("saved posters retain the current Instagram sticker instruction, not a fake address",()=>{
  for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const preview=context(),saved=context(),data=assets();
    drawPoster(preview.c,data,i);drawPoster(saved.c,data,i,true);
    assert.deepEqual(preview.commands.slice(0,-2),saved.commands.slice(0,preview.commands.length-2),
      "artwork must match before the footer");
    assert.deepEqual(preview.commands.filter(c=>c[0]==="fillText").map(c=>c[1]),["Siblings","antonio.striiip.com"]);
    assert.deepEqual(saved.commands.filter(c=>c[0]==="fillText").map(c=>c[1]),
      ["Siblings","Link","Paste your link sticker here"]);
    assert.equal(saved.commands.filter(c=>c[0]==="arc").length,3);
    assert.equal(saved.commands.filter(c=>c[0]==="stroke").length,7);
    assert.equal(saved.depth(),0);assert.equal(preview.depth(),0);
  }
  assert.match(hook,/drawPoster\(c, assets, index, !preview\)/);
});
test("all layouts retain every ordered content tile, including very long Strips",()=>{
  for(const count of [1,2,3,7,8,19,100])for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const {c,commands,depth}=context(),data=assets(count);
    drawPoster(c,data,i);
    const drawn=new Set(commands.filter(c=>c[0]==="drawImage").map(c=>c[1].id));
    for(const tile of data.tiles)assert(drawn.has(tile.id==="cover"?"cover":Number(tile.id)),`layout ${i} omitted ${tile.id}`);
    assert.equal(depth(),0);
  }
});
test("approved compositions are distinct for mixed media and image-free Strips",()=>{
  for(const data of [assets(),{...assets(0),cover:null,coverColor:"#FF4FA3",coverRatio:1}]) {
    const signatures=POSTER_DESIGNS.map((_,i)=>{const {c,commands}=context();drawPoster(c,data,i);return JSON.stringify(commands);});
    assert.equal(new Set(signatures).size,POSTER_DESIGNS.length);
  }
});
test("whole foreground covers preserve proportions and stay above the sticker area",()=>{
  for(const ratio of [.0001,.05,.5,1,1.5,3,20,10000])for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const data=assets(3,ratio),bounds=posterCoverBounds(data,i);
    assert(bounds.height>0&&bounds.imageWidth>0);assert(bounds.x>=0);
    assert(bounds.x+bounds.width<=1080);assert(bounds.y+bounds.height+28<=POSTER_CONTENT_BOTTOM);
    const {c,commands}=context();drawPoster(c,data,i);
    const image=commands.filter(c=>c[0]==="drawImage"&&c[1]===data.cover.source).at(-1);
    assert.deepEqual(image.slice(2,6),[0,0,data.cover.width,data.cover.height]);
    assert(Math.abs(image[8]/image[9]-1/ratio)<1e-7);
  }
});
test("actual profile theme and family are used, never demo photos or invented copy",()=>{
  const data=assets(),{c,paints,commands}=context();
  drawPoster(c,data,4);
  assert.equal(paints[0].color,data.theme.background);
  assert.deepEqual(commands.filter(c=>c[0]==="fillText").map(c=>c[1]),["Siblings","antonio.striiip.com"]);
  assert.doesNotMatch(read("app/lib/share-poster-assets.ts"),/demo-20261001|softweekend|siblings-media|fingerprints|difference \/ /);
});
test("light and dark theme fonts retain contrast on title mats and link cues",()=>{
  for(const ink of ["#FFFFFF","#000000","#001CB5","#D7FF00"])for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const data=assets();data.theme.ink=ink;
    for(const saved of [false,true]) {
      const {c,paints}=context();drawPoster(c,data,i,saved);
      const footer=paints.at(-1).color;
      assert.equal(footer,POSTER_DESIGNS[i].front==="naked"
        ? posterInk(ink)==="#FFFFFF" ? ink : "#000000" : posterInk(ink));
    }
  }
});
test("long and unbroken titles keep every character, within the cover-container width",()=>{
  for(const title of ["A weekend of family and very good friends that I will always remember","x".repeat(80),""])
    for(let i=0;i<POSTER_DESIGNS.length;i++) {
      const data={...assets(),title}, {c,commands}=context();drawPoster(c,data,i);
      const texts=commands.filter(c=>c[0]==="fillText"&&c[1]!==data.address);
      assert.equal(texts.map(c=>c[1]).join("").replace(/\s/g,""),title.replace(/\s/g,""));
      assert(texts.every(t=>t[2]===posterCoverBounds(data,i).x));
    }
});
test("export and preview draw identical normalized positions at both raster sizes",()=>{
  for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const large=context(1080),small=context(540),data=assets();
    drawPoster(large.c,data,i,true);drawPoster(small.c,data,i,true);
    assert.deepEqual(large.commands.slice(1),small.commands.slice(1));
    assert.deepEqual(large.commands[0],["setTransform",1,0,0,1,0,0]);
    assert.deepEqual(small.commands[0],["setTransform",.5,0,0,.5,0,0]);
  }
});
test("saved link instruction still fits behind the established Instagram sticker target",()=>{
  const target=LINK_STICKER_TARGET,area=LINK_STICKER_AREA;
  assert.equal(target.x+target.width/2,540);
  assert(POSTER_CONTENT_BOTTOM+28<=area.y);
  assert(target.width>=760&&target.height>=160);
  const {c,commands}=context();drawPoster(c,assets(),0,true);
  assert(commands.some(c=>c[0]==="translate"&&c[1]===0&&c[2]===1712));
  assert.deepEqual(commands.at(-1),["fillText","Paste your link sticker here",540,84,680]);
  assert(commands.some(command=>command[0]==="scale" && command[1]===SAVED_LINK_GUIDANCE_SCALE));
  assert(108*SAVED_LINK_GUIDANCE_SCALE<=target.height);
  const cueTop=SAVED_LINK_GUIDANCE_CENTER_Y-54*SAVED_LINK_GUIDANCE_SCALE,
    cueBottom=SAVED_LINK_GUIDANCE_CENTER_Y+54*SAVED_LINK_GUIDANCE_SCALE;
  assert(cueTop>=target.y && cueBottom<=target.y+target.height);
  assert(cueTop-SAVED_LINK_PANEL.y>=39);
  assert(SAVED_LINK_PANEL.y+SAVED_LINK_PANEL.height-cueBottom>=39);
  assert(SAVED_LINK_PANEL.y>=POSTER_CONTENT_BOTTOM+28);
  assert(SAVED_LINK_PANEL.y+SAVED_LINK_PANEL.height<=area.y+area.height);
});
test("Siblings cover sizes exactly preserve the approved gallery composition",()=>{
  const expected=[
    [350,710,890/1.5,890], [210,540,670,1005], [80,530,690,1035],
    [230,555,630,945], [414,570,560,840], [240,670,580,870],
    [110,450,1150/1.5,1150], [90,590,1010/1.5,1010],
  ];
  for (let i=0;i<POSTER_DESIGNS.length;i++) {
    const data=assets(7,1.5),bounds=posterCoverBounds(data,i),[x,y,w,h]=expected[i];
    assert.equal(bounds.x,x);assert.equal(bounds.y,y);
    assert(Math.abs(bounds.imageWidth-w)<1e-7);assert.equal(bounds.height,h);
    assert(bounds.y+bounds.height<=POSTER_COVER_BOTTOM);
    const {c,paints}=context();drawPoster(c,data,i,true);
    const footer=paints.at(-1);
    assert(footer.args[1]>=bounds.y+bounds.height+28);
  }
});
test("approved title sizes and theme-colored dark panels survive production transfer",()=>{
  for(let i=0;i<POSTER_DESIGNS.length;i++) {
    const data=assets();data.theme.scale=1.33;
    const {c,paints}=context(),styles=[];
    c.fillText=(text)=>styles.push({text,font:c.font});
    drawPoster(c,data,i);
    assert.equal(styles[0].font,`500 ${POSTER_DESIGNS[i].size}px ${data.theme.font}`);
    if(POSTER_DESIGNS[i].front==="naked") assert.equal(paints.at(-1).color,data.theme.ink);
  }
});
test("link badge and save instruction keep the same current font and weight",()=>{
  const {c}=context(),styles=[];c.fillText=(text)=>styles.push({text,font:c.font});
  drawPoster(c,assets(),0,true);
  const link=styles.find(s=>s.text==="Link"),hint=styles.find(s=>s.text==="Paste your link sticker here");
  assert.equal(link.font.replace(/\d+px/,"SIZE"),hint.font.replace(/\d+px/,"SIZE"));
  assert.equal(hint.font,'400 24px "Helvetica Neue", Arial, sans-serif');
});
test("swipe motion and eight-option boundaries follow the existing cover picker",()=>{
  const progress=(a,b,i)=>stackSwipeProgress(a,b,i,POSTER_DESIGNS.length);
  const target=(i,p)=>stackSwipeTarget(i,p,POSTER_DESIGNS.length);
  assert.equal(progress(300,225,3),.5);assert.equal(target(3,.23),3);assert.equal(target(3,.24),4);
  assert.equal(target(0,-.9),0);assert.equal(target(7,.9),7);
  assert.equal(progress(300,150,7),.2);
  assert.match(picker,/onPointerCancel=\{cancel\}/);assert.match(picker,/aria-activedescendant/);
});
test("stepped masonry fills the background edge to edge with touching blocks",()=>{
  for (const heights of [[585], [585,100], [585,98,585,142,585,76,625], Array.from({length:100},(_,i)=>i%2?100:585)]) {
    const cells=steppedPosterTiles(heights);
    assert.equal(cells.length,heights.length);
    assert(Math.abs(cells.reduce((area,cell)=>area+cell.width*cell.height,0)-1080*1920)<1e-7);
    for(const x of [...new Set(cells.map(cell=>cell.x))]) {
      const column=cells.filter(cell=>cell.x===x).sort((a,b)=>a.y-b.y);
      assert.equal(column[0].y,0);
      column.slice(1).forEach((cell,i)=>assert.equal(cell.y,column[i].y+column[i].height));
      assert.equal(column.at(-1).y+column.at(-1).height,1920);
    }
  }
  const design=POSTER_DESIGNS.find(d=>d.id==="stepped-blocks");
  assert.equal(design.front,"paper");
});
test("rapid option changes never share a stale file, and every media surface is disposed",()=>{
  assert.match(hook,/exported\?\.assets === assets && exported\?\.index === index/);
  assert.match(hook,/if \(cancelled\) return/);assert.match(hook,/controller\.abort\(\)/);
  assert.match(hook,/URL\.revokeObjectURL\(url\)/);
  const preparation=read("app/lib/share-poster-assets.ts");
  assert.match(preparation,/disposePosterAssets\(assets\)/);
  assert.match(preparation,/new Set\(\[assets.cover,assets.flow,\.\.\.assets.photos/);
  assert.match(preparation,/signal.addEventListener\("abort",cancel/);
  assert.match(page,/files: \[storyAssetFile\]/);assert.match(page,/link\.download = storyAssetFile\.name/);
});
test("bottom dock, share actions and swipe-dimming behavior are untouched",()=>{
  assert.match(page,/<SharePosterPicker previews=\{posters.previews\} index=\{posters.index\}/);
  assert.match(page,/<footer className="composer-dock share-dock publish-flow-dock">\s*<div className="dock-controls dock-controls-current dock-action-controls">/);
  assert.match(page,/<h1 id="share-heading">Pick your story poster<\/h1>/);
  assert.match(css,/\.cover-image-option::after,\s*\.poster-option::after \{[^}]*opacity: var\(--cover-dim, 0\)/);
  assert.doesNotMatch(read("app/lib/share-posters.ts"),/cover-dim|poster-dim/);
});
test("legacy photo fitting still preserves complete rotated corners",()=>{
  for(const ratio of [.001,.5,1,1.5,3,10000])for(const angle of [-45,0,45]) {
    const result=fitPosterPhoto(1000,1000*ratio,760,344,angle),r=angle*Math.PI/180;
    assert(Math.abs(result.width*Math.cos(r))+Math.abs(result.height*Math.sin(r))<=760+1e-8);
    assert(Math.abs(result.width*Math.sin(r))+Math.abs(result.height*Math.cos(r))<=344+1e-8);
  }
});
