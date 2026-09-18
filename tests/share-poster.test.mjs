import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STORY_WIDTH, STORY_HEIGHT, POSTER_DESIGNS, POSTER_CONTENT_BOTTOM, LINK_STICKER_AREA, LINK_STICKER_TARGET, drawPoster, fitPosterPhoto, posterBackgrounds, posterColor, posterInk, posterMedia, posterPalette } from "../app/lib/share-posters.ts";
import { stackSwipeProgress, stackSwipeTarget } from "../app/lib/stack-picker.ts";
const posterSwipeProgress = (start, current, index) => stackSwipeProgress(start, current, index, POSTER_DESIGNS.length);
const posterSwipeTarget = (index, progress) => stackSwipeTarget(index, progress, POSTER_DESIGNS.length);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../app/components/useStoryPosters.ts", import.meta.url), "utf8");
const picker = readFileSync(new URL("../app/components/SharePosterPicker.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../app/lib/share-posters.ts", import.meta.url), "utf8");
const assetsSource = readFileSync(new URL("../app/lib/share-poster-assets.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const strip = { id:"a",title:"My strip",cover:{kind:"image",src:"cover"},blocks:[{type:"image",src:"cover"},{type:"image",src:"second"},{type:"text",backgroundColor:"#f04",textColor:"#fff",content:"hello"}],endingStyle:{backgroundColor:"#121212",buttonColor:"#00FFAA"} };
test("ten distinct named layouts export at full 9:16 story size",()=>{
 assert.equal(POSTER_DESIGNS.length,10);assert.equal(new Set(POSTER_DESIGNS.map(d=>d.id)).size,10);
 assert.equal(STORY_WIDTH,1080);assert.equal(STORY_HEIGHT,1920);assert.match(hook,/preview \? "image\/jpeg" : "image\/png"/);
});
test("uses real strip colors, photos, and stickers without duplicate covers",()=>{
 assert.deepEqual(posterMedia(strip),["cover","second"]);assert.deepEqual(posterPalette(strip),["#FF0044","#00FFAA","#FFFFFF","#121212"]);
 assert.equal(posterColor("#abc"),"#AABBCC");assert.equal(posterColor("transparent"),null);
 assert.equal(posterInk("#FFFFFF"),"#000000");assert.equal(posterInk("#000000"),"#FFFFFF");
 assert.deepEqual(posterMedia({...strip,blocks:[{type:"sticker",mediaType:"video",src:"api-video"},{type:"sticker",src:"sticker"}]}),["cover","sticker"]);
});
test("large strips sample their full length with bounded media memory",()=>{
 const sources=posterMedia({...strip,blocks:Array.from({length:100},(_,i)=>({type:"image",src:`photo${i}`}))});
 assert.equal(sources.length,8);assert.equal(sources[0],"cover");assert.equal(sources.at(-1),"photo99");
});
test("swipe matches cover distance, threshold, and edge resistance",()=>{
 assert.equal(posterSwipeProgress(300,225,3),.5);assert.equal(posterSwipeTarget(3,.23),3);assert.equal(posterSwipeTarget(3,.24),4);assert.equal(posterSwipeTarget(3,-.24),2);
 assert.equal(posterSwipeTarget(0,-.9),0);assert.equal(posterSwipeTarget(9,.9),9);assert.equal(posterSwipeProgress(300,450,0),-.2);assert.equal(posterSwipeProgress(300,150,9),.2);assert.equal(posterSwipeProgress(900,0,4),.95);
 assert.match(picker,/onPointerCancel=\{cancel\}/);assert.match(picker,/aria-activedescendant/);
});
function context(){
 const commands=[],paints=[];let depth=0;const c={canvas:{width:1080,height:1920},measureText:s=>({width:s.length*Number(c.font?.match(/([\d.]+)px/)?.[1]||48)*.52}),save:()=>depth++,restore:()=>depth--};
 for(const name of ['setTransform','fillRect','fillText','drawImage','translate','scale','rotate','arc','beginPath','moveTo','lineTo','closePath','fill','bezierCurveTo','stroke','strokeText'])c[name]=(...args)=>{for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),name);commands.push([name,...args]);};
 const fill=c.fillRect;c.fillRect=(...args)=>{paints.push({color:c.fillStyle,args});fill(...args);};
 return{c,commands,paints,depth:()=>depth};
}
test("saved posters add the reference icons and link-sticker instruction without changing previews",()=>{
 for(let index=0;index<10;index++)for(const title of ["", "Summer"]){
  const assets={title,address:"antonio.striiip.com",palette:["#FF0044","#00FFAA"],photos:[{source:{},width:1600,height:900}]};
  const preview=context(),saved=context();
  drawPoster(preview.c,assets,index);drawPoster(saved.c,assets,index,true);
  assert.deepEqual(preview.commands.at(-1),["fillText","antonio.striiip.com",540,1658,680]);
  assert.deepEqual(saved.commands.at(-1),["fillText","Paste your link sticker here",540,84,680]);
  assert.deepEqual(preview.commands.slice(0,-1),saved.commands.slice(0,preview.commands.length-1));
  assert.deepEqual(saved.commands.slice(preview.commands.length-1).filter(c=>c[0]==="fillText").map(c=>c[1]),["Link","Paste your link sticker here"]);
  assert.equal(saved.commands.filter(c=>c[0]==="arc").length,3);
  assert.equal(saved.commands.filter(c=>c[0]==="stroke").length,7);
  assert.equal(saved.depth(),0);
  assert.deepEqual(preview.paints,saved.paints);
 }
 assert.match(hook,/drawPoster\(c, assets, index, !preview\)/);
});
test("all ten layouts are distinct finite compositions for photos and text-only strips",()=>{
 for(const photos of [[],[{source:{},width:1600,height:900}]]){
  const signatures=[];
  for(let i=0;i<10;i++){
   const {c,commands,depth}=context();drawPoster(c,{title:"A very long title for a wonderful weekend with my friends",address:"hello.striiip.com",palette:["#FF0044","#00FFAA"],words:["hey!"],photos},i);
   assert.equal(depth(),0);assert.equal(commands.filter(c=>c[0]==='fillText'&&c[1]!=='hello.striiip.com').map(c=>c[1]).join(' '),'A very long title for a wonderful weekend with my friends');if(photos.length)assert(commands.some(c=>c[0]==='drawImage'));signatures.push(JSON.stringify(commands));
  }assert.equal(new Set(signatures).size,10);
 }
});
test("saved link-sticker instruction uses exactly the Link badge's font family and weight",()=>{
 const {c}=context(),styles=[];
 c.fillText=(text)=>styles.push({text,font:c.font});
 drawPoster(c,{title:"",address:"antonio.striiip.com",palette:["#3155FF"],photos:[]},0,true);
 const badge=styles.find(s=>s.text==="Link"),hint=styles.find(s=>s.text==="Paste your link sticker here");
 assert.equal(badge.font.replace(/\d+px/,"SIZE"),hint.font.replace(/\d+px/,"SIZE"));
 assert.equal(hint.font,'400 24px "Helvetica Neue", Arial, sans-serif');
});
test("rapid selection never shares a stale export; async work and URLs are cleaned up",()=>{
 assert.match(hook,/exported\?\.assets === assets && exported\?\.index === index/);assert.match(hook,/if \(cancelled\) return/);assert.match(hook,/controller\.abort\(\)/);assert.match(hook,/URL\.revokeObjectURL\(url\)/);
 assert.match(page,/useStoryPosters\(view === "share" \? openedPublishedStrip : null\)/);assert.match(page,/files: \[storyAssetFile\]/);assert.match(page,/link\.download = storyAssetFile\.name/);
});
test("first option uses the full cover, actual title, and footer link",()=>{
 const {c,commands}=context(),source={};
 drawPoster(c,{title:"A day outside",palette:["#FF0044"],photos:[{source,width:800,height:1200}]},0);
 assert.deepEqual(commands.filter(c=>c[0]==='fillText').map(c=>c[1]),["A day outside","striiip.com"]);
 const images=commands.filter(c=>c[0]==='drawImage');assert.equal(images.length,1);
 assert.equal(images[0][1],source);assert.equal(images[0][4],800);assert.equal(images[0][5],1200);
});
test("every layout keeps the entire source and original proportions for every image shape",()=>{
 const shapes=[[1200,800],[800,1200],[1000,1000],[2000,100],[100,2000],[1,10000],[10000,1]];
 for(let index=0;index<10;index++)for(let offset=0;offset<shapes.length;offset++)for(const count of [1,2,7]){
  const photos=Array.from({length:count},(_,i)=>{const [width,height]=shapes[(i+offset)%shapes.length];return {source:{width,height},width,height};});
  const {c,commands}=context();
  drawPoster(c,{title:"weekend",address:"me.striiip.com",palette:["#FFAA00","#123456"],words:[],photos},index);
  for(const [,source,sx,sy,sw,sh,dx,dy,dw,dh] of commands.filter(c=>c[0]==='drawImage')){
   assert.deepEqual([sx,sy,sw,sh],[0,0,source.width,source.height],`layout ${index} must not crop`);
   assert(Math.abs(dw/dh-source.width/source.height)<1e-7,`layout ${index} must not stretch`);
   assert(dw>0&&dh>0);assert.equal(dx,-dw/2);assert.equal(dy,-dh/2);
  }
 }
});
test("rotated images fit every corner inside their nonoverlapping slots",()=>{
 for(const [width,height] of [[1200,800],[800,1200],[1000,1000],[10000,1],[1,10000]])for(const angle of [-5,0,5]){
  const fit=fitPosterPhoto(width,height,760,344,angle),r=angle*Math.PI/180;
  const outerWidth=Math.abs(fit.width*Math.cos(r))+Math.abs(fit.height*Math.sin(r));
  const outerHeight=Math.abs(fit.width*Math.sin(r))+Math.abs(fit.height*Math.cos(r));
  assert(outerWidth<=760+1e-8);assert(outerHeight<=344+1e-8);
  assert(Math.abs(fit.width/fit.height-width/height)<1e-7);
 }
});
test("no photo leaves the story or is covered by another photo, including mixed extremes",()=>{
 const shapes=[[1600,900],[900,1600],[1000,1000],[10000,1],[1,10000]];
 for(let index=0;index<10;index++)for(let offset=0;offset<shapes.length;offset++){
  const photos=Array.from({length:8},(_,i)=>{const [width,height]=shapes[(i+offset)%shapes.length];return {source:{},width,height};});
  const {c}=context(),stack=[],bounds=[];let m=[1,0,0,1,0,0];
  c.save=()=>stack.push([...m]);c.restore=()=>{m=stack.pop();};
  c.setTransform=(...v)=>{m=v;};
  c.translate=(x,y)=>{m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;};
  c.rotate=r=>{const [a,b,d,e]=m,cos=Math.cos(r),sin=Math.sin(r);m[0]=a*cos+d*sin;m[1]=b*cos+e*sin;m[2]=-a*sin+d*cos;m[3]=-b*sin+e*cos;};
  c.drawImage=(_s,_sx,_sy,_sw,_sh,x,y,w,h)=>{
   const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py])=>[m[0]*px+m[2]*py+m[4],m[1]*px+m[3]*py+m[5]]);
   const rect={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
   assert(rect.left>=0&&rect.right<=1080&&rect.top>=0&&rect.bottom<=POSTER_CONTENT_BOTTOM,`layout ${index} clips a photo or enters the sticker area`);bounds.push(rect);
  };
  drawPoster(c,{title:"weekend",address:"me.striiip.com",palette:["#FFAA00","#123456"],words:[],photos},index);
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
   const a=bounds[i],b=bounds[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`layout ${index} covers another photo`);
  }
 }
});
test("all titles stay small and long titles fit without losing any words",()=>{
 for(let index=0;index<10;index++){
  for(const title of ['weekend','A weekend of very good friends and summer swims that we will always remember','x'.repeat(80)]){
   const {c,commands}=context();const original=c.fillText;
   c.fillText=(value,...rest)=>{assert(Number(c.font.match(/([\d.]+)px/)[1])<=48);assert(c.measureText(value).width<=rest[2]+.001);original(value,...rest);};
   drawPoster(c,{title,palette:["#FFAA00"],photos:[]},index);
   assert.equal(commands.filter(c=>c[0]==='fillText'&&c[1]!=='striiip.com').map(c=>c[1]).join('').replace(/\s/g,''),title.replace(/\s/g,''));
  }
 }
});
test("every template reserves a full-size sticker plus breathing room above Story controls",()=>{
 const area=LINK_STICKER_AREA,target=LINK_STICKER_TARGET;
 assert(area.width>=840&&area.height>=280);
 assert(target.width>=760&&target.height>=160);
 assert(POSTER_CONTENT_BOTTOM+40<=area.y);
 const cx=target.x+target.width/2,cy=target.y+target.height/2;
 assert.equal(cx,540);
 // Screenshot-sized, wide, and enlarged link stickers must all fit comfortably.
 for(const [width,height] of [[674,120],[760,160],[840,240]]){
  assert(cx-width/2>=area.x&&cx+width/2<=area.x+area.width);
  assert(cy-height/2>=area.y&&cy+height/2<=area.y+area.height);
  assert(cy+height/2<=1800);
 }
});
test("long titles stay above the link area and the complete hint hides behind a screenshot-size sticker",()=>{
 for(let index=0;index<10;index++)for(const title of ["","x".repeat(80),"A weekend of very good friends and summer swims that we will always remember"]){
  const {c}=context(),stack=[];let m=[1,0,0,1,0,0],path=[];
  const hint={left:203,right:877,top:1610,bottom:1730};let drawingHint=false;
  const points=(values)=>values.map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  const check=(ps,kind)=>{
   const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);
   if(drawingHint){
    assert(Math.min(...xs)>=hint.left&&Math.max(...xs)<=hint.right,`${index} ${kind} escapes sticker width`);
    assert(Math.min(...ys)>=hint.top&&Math.max(...ys)<=hint.bottom,`${index} ${kind} escapes sticker height`);
   }else if(kind==="title")assert(Math.max(...ys)<=POSTER_CONTENT_BOTTOM,`layout ${index} title enters sticker area`);
  };
  c.save=()=>stack.push({m:[...m],font:c.font,align:c.textAlign,baseline:c.textBaseline});
  c.restore=()=>{const state=stack.pop();m=state.m;c.font=state.font;c.textAlign=state.align;c.textBaseline=state.baseline;};
  c.setTransform=(...v)=>{m=v;};
  c.translate=(x,y)=>{if(y===1616)drawingHint=true;m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;};
  c.scale=(x,y)=>{m[0]*=x;m[1]*=x;m[2]*=y;m[3]*=y;};
  c.rotate=r=>{const [a,b,d,e]=m,cos=Math.cos(r),sin=Math.sin(r);m[0]=a*cos+d*sin;m[1]=b*cos+e*sin;m[2]=-a*sin+d*cos;m[3]=-b*sin+e*cos;};
  c.beginPath=()=>{path=[];};
  c.moveTo=c.lineTo=(x,y)=>path.push(...points([[x,y]]));
  c.bezierCurveTo=(a,b,d,e,x,y)=>path.push(...points([[a,b],[d,e],[x,y]]));
  c.arc=(x,y,r)=>path.push(...points([[x-r,y-r],[x+r,y+r]]));
  c.fill=c.stroke=()=>{if(drawingHint)check(path,"icon");};
  c.fillText=(text,x,y,maxWidth)=>{
   const size=Number(c.font.match(/([\d.]+)px/)[1]);
   const w=Math.min(c.measureText(text).width,maxWidth),left=x-(c.textAlign==="center"?w/2:0);
   const top=y-(c.textBaseline==="alphabetic"?size:0);
   check(points([[left,top],[left+w,top],[left,top+size],[left+w,top+size]]),drawingHint?"instruction":"title");
  };
  drawPoster(c,{title,address:"antonio.striiip.com",palette:["#3155FF","#F0EDE6"],photos:[]},index,true);
  assert(drawingHint);assert.equal(stack.length,0);
 }
});
test("untitled strips keep only the footer link and ten distinct compositions",()=>{
 for(const photos of [[],[{source:{},width:1600,height:900}]]){
  const signatures=[];
  for(let index=0;index<10;index++){
   const {c,commands}=context();drawPoster(c,{title:'  ',address:'hello.striiip.com',words:['Do not use block copy'],palette:['#000000'],photos},index);
   assert.deepEqual(commands.filter(c=>c[0]==='fillText'),[['fillText','hello.striiip.com',540,1658,680]]);signatures.push(JSON.stringify(commands));
  }
  assert.equal(new Set(signatures).size,10);
 }
 assert.doesNotMatch(renderer,/i stripped|good moments/);assert.doesNotMatch(assetsSource,/A little bit of me|words:/);
});
test("no poster paints a pure-black surface, even for black-only strips",()=>{
 for(const palette of [['#000000'],['#000'],['#111111'],[],['#FFFFFF','#000000'],['#FF0044','#00FFAA','#123456']]){
  assert(posterBackgrounds(palette).every(c=>c!=='#000000'));
  for(let index=0;index<10;index++){
   const {c,paints}=context();drawPoster(c,{title:'weekend',palette,photos:[]},index);
   assert(paints.length>0);assert(paints.every(p=>p.color!=='#000000'));
  }
 }
});
test("every option uses multiple authored colors as components when available",()=>{
 const palette=['#FF0044','#00FFAA','#123456'];
 for(let index=0;index<10;index++){
  const {c,paints}=context();drawPoster(c,{title:'weekend',palette,photos:[{source:{},width:800,height:1200}]},index);
  const colors=new Set(paints.map(p=>p.color));assert(colors.has(palette[0]));assert(colors.has(palette[1]));
 }
});
test("cut-across replaces the nested boxes with diagonal fields and no fake photo",()=>{
 const {c,commands,paints}=context();
 drawPoster(c,{title:"Love in the air",address:"antonio.striiip.com",palette:["#3155FF","#FF5100","#FF75BB"],photos:[]},3);
 assert.equal(POSTER_DESIGNS[3].id,"billboard");
 assert.equal(POSTER_DESIGNS[3].name,"Cut across");
 assert.equal(commands.filter(command=>command[0]==="drawImage").length,0);
 assert.deepEqual(paints.map(p=>p.args),[[0,0,1080,1920],[0,0,1080,1920]]);
 assert(commands.some(command=>JSON.stringify(command)===JSON.stringify(["lineTo",1080,700])));
 assert(commands.some(command=>JSON.stringify(command)===JSON.stringify(["lineTo",0,1120])));
 assert.equal(commands.filter(command=>command[0]==="fill").length,2);
 assert.deepEqual(commands.filter(command=>command[0]==="fillText").map(command=>command[1]),["Love in the air","antonio.striiip.com"]);
});
test("cut-across draws a full cover and uses readable footer ink on its new lower field",()=>{
 const {c,commands}=context(),text=[];
 const original=c.fillText;c.fillText=(value,...args)=>{text.push({value,ink:c.fillStyle});original(value,...args);};
 drawPoster(c,{title:"Weekend",address:"me.striiip.com",palette:["#3155FF","#FFFFFF"],photos:[{source:{},width:1800,height:600}]},3);
 assert.equal(commands.filter(command=>command[0]==="drawImage").length,1);
 assert.deepEqual(text,[{value:"Weekend",ink:"#FFFFFF"},{value:"me.striiip.com",ink:"#000000"}]);
 assert.equal(commands.filter(command=>command[0]==="fill").length,1);
});
test("static picker preserves the matching bottom action row",()=>{
 assert.match(page,/<SharePosterPicker previews=\{posters.previews\} index=\{posters.index\}/);
 assert.match(page,/<footer className="composer-dock share-dock publish-flow-dock">\s*<div className="dock-controls dock-controls-current dock-action-controls">/);
 assert.doesNotMatch(page,/share-film|createInstagramStoryAsset/);
});
test("share page has one clear heading and no visible poster navigation metadata",()=>{
 assert.match(page,/<h1 id="share-heading">Pick your story poster<\/h1>/);
 assert.doesNotMatch(page,/STRIP \/ STORIES|poster-picker-navigation|poster-counter|Previous poster|Next poster|poster-swipe-hint|Swipe up to find/);
 assert.match(picker,/aria-activedescendant/);assert.match(picker,/onPointerMove=\{move\}/);
});
test("behind posters use the cover picker's darkness without changing exported artwork",()=>{
 assert.match(page,/return stackCardStyle\(/);
 assert.match(picker,/const motion = stackCardStyle\(/);
 assert.match(css,/\.cover-image-option::after,\s*\.poster-option::after \{[^}]*opacity: var\(--cover-dim, 0\);[^}]*pointer-events: none;[^}]*transition: opacity 360ms cubic-bezier\(0.22, 0.78, 0.18, 1\);/);
 assert.match(css,/\.poster-picker.is-dragging \.poster-option::after \{ transition: none; \}/);
 assert.doesNotMatch(renderer,/poster-dim|cover-dim/);
});
