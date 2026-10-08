import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as profile from "../app/lib/profile.ts";
import * as sizing from "../app/lib/sticker-sizing.ts";
import * as rotation from "../app/lib/sticker-rotation.ts";
import * as fonts from "../app/lib/font-sizing.ts";
import * as posters from "../app/lib/share-posters.ts";

class Canvas {
  constructor(){this.width=300;this.height=150;this.commands=[];this.context={
    measureText:text=>({width:text.length*8}),
    save:()=>{},restore:()=>{},
  };for(const method of ["scale","setTransform","fillRect","fillText","translate","rotate","drawImage"])
    this.context[method]=(...args)=>this.commands.push([method,...args]);}
  getContext(){return this.context;}
}
const source=readFileSync(new URL("../app/lib/poster-content.ts",import.meta.url),"utf8"),exports={};
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,document:{createElement:tag=>{assert.equal(tag,"canvas");return new Canvas();}},
  require:id=>({"./font-sizing":fonts,"./profile":profile,"./sticker-sizing":sizing,
    "./sticker-rotation":rotation,"./share-posters":posters})[id],
});
const {posterStickerGeometry,posterParagraphLines,posterTextStyle,posterRasterWidth,
  createPosterTextTile,createPosterMediaTile,paintPosterSticker}=exports;

test("frame widths preserve every editor fraction, including 80-92% frames",()=>{
  for(const width of [8,10,30.125,79.875,80.001,86.625,91.99999,92])for(const angle of [-179.5,-17.25,0,89.335,179.75]) {
    const value=posterStickerGeometry({width,x:47.125,y:2394.633333,rotation:angle},{width:512,height:427});
    assert.equal(value.width,sizing.normalizeStickerWidth(width)/100*390);
    assert.equal(value.height,value.width*427/512);
    assert.equal(value.x,47.125/100*390);assert.equal(value.y,2394.633333);
    assert.equal(value.rotation,rotation.normalizeStickerRotation(angle));
  }
  assert.match(source,/normalizeStickerWidth\(block.width\)/);
  assert.match(source,/normalizeStickerRotation\(block.rotation\)/);
});
test("rotation is centered and a sticker spanning two blocks decorates both",()=>{
  const tiles=[{source:new Canvas(),width:390,height:200,top:0,flowHeight:200},
    {source:new Canvas(),width:390,height:200,top:200,flowHeight:200},
    {source:new Canvas(),width:390,height:200,top:400,flowHeight:200}];
  paintPosterSticker(tiles,{width:80.001,x:55,y:200,rotation:89.335},{source:{},width:512,height:427});
  for(const tile of tiles.slice(0,2)) {
    const draw=tile.source.commands.find(c=>c[0]==="drawImage");assert(draw);
    assert.equal(draw[8],80.001/100*390);assert.equal(draw[9],draw[8]*427/512);
    assert.equal(draw[6],-draw[8]/2);assert.equal(draw[7],-draw[9]/2);
    assert(tile.source.commands.some(c=>c[0]==="rotate"&&c[1]===89.335*Math.PI/180));
  }
  assert.equal(tiles[2].source.commands.length,0);
  assert.doesNotMatch(source,/shadowBlur|shadowColor|strokeRect|filter\s*=/);
});
test("no background is painted into transparent tape or frame holes",()=>{
  const tile={source:new Canvas(),width:195,height:300,top:0,flowHeight:600};
  paintPosterSticker([tile],{width:60,x:50,y:300,rotation:0},{source:{alpha:true},width:512,height:427});
  assert.equal(tile.source.commands.filter(c=>c[0]==="drawImage").length,1);
  assert.equal(tile.source.commands.filter(c=>c[0]==="fillRect").length,0);
});
test("text uses the editor's optical font sizing, line height and native weight",()=>{
  for(const face of profile.PROFILE_FONT_CATALOG) {
    const style=posterTextStyle({fontStyle:face.id,fontSize:24,backgroundColor:"#FF4FA3",textColor:"#001CB5"});
    assert.equal(style.font,face.family);assert.equal(style.size,fonts.normalizedFontSize(face.id,24));
    assert.equal(style.leading,24*1.22);assert.equal(style.weight,profile.profileFontWeight(face.id)??450);
    assert.equal(style.background,"#FF4FA3");assert.equal(style.ink,"#001CB5");
  }
});
test("explicit blank lines and long words preserve all authored paragraph content",()=>{
  const c={measureText:s=>({width:s.length*10})};
  assert.deepEqual(Array.from(posterParagraphLines(c,"hey\n\n\nworld\n",100)),["hey","","","world",""]);
  const content="a supercalifragilistic sentence";
  const lines=posterParagraphLines(c,content,60);
  assert.equal(lines.join("").replace(/\s/g,""),content.replace(/\s/g,""));
  assert(lines.every(line=>c.measureText(line).width<=60));
});
test("unpublished text without authored geometry is measured normally",()=>{
  const tile=createPosterTextTile({id:"text",type:"text",content:"hello",fontSize:18},0,585,390);
  assert.equal(tile.flowHeight,32+18*1.22);assert.equal(tile.top,585);
  assert.equal(tile.source.commands.find(c=>c[0]==="fillText")[2],16);
  assert.equal(tile.source.commands.find(c=>c[0]==="fillText")[3],16);
});
test("published text heights preserve the approved layout and sticker coordinates",()=>{
  for(const height of [76,98,142,625,9999]) {
    const tile=createPosterTextTile({id:"text",type:"text",content:"hello",height,fontSize:18},0,2110,390);
    assert.equal(tile.flowHeight,height);assert.equal(tile.top,2110);
    assert.equal(tile.height,Math.min(8192,height));
    paintPosterSticker([tile],{width:80,x:60,y:2394.63,rotation:89.335},
      {source:{},width:512,height:427});
    if(height===625) {
      assert(tile.source.commands.some(c=>c[0]==="translate"&&c[1]===234&&Math.abs(c[2]-284.63)<1e-7));
    }
  }
});
test("media uses its real ratio, with saved top/bottom crops applied before layouts",()=>{
  const photo={source:{},width:800,height:1200};
  const uncropped=createPosterMediaTile({type:"image",height:590},photo,0,0,390);
  assert.equal(uncropped.flowHeight,585);
  const cropped=createPosterMediaTile({type:"image",height:585,cropTop:50,cropBottom:35},photo,0,0,390);
  assert.equal(cropped.flowHeight,500);
  const draw=cropped.source.commands.find(c=>c[0]==="drawImage");
  assert.equal(draw[3],50/585*1200);assert.equal(draw[5],500/585*1200);
});
test("long Strips downsample tiles instead of dropping blocks, with bounded extreme canvases",()=>{
  assert.equal(posterRasterWidth(Array.from({length:7},()=>({type:"image",height:585}))),390);
  const width=posterRasterWidth(Array.from({length:100},()=>({type:"image",height:585})));
  assert(width<390&&width>=96);
  const tile=createPosterMediaTile({type:"image"},{source:{},width:1,height:10000},0,0,width);
  assert(tile.height<=8192);assert.equal(tile.flowHeight,390*10000);
});
