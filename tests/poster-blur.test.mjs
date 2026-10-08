import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blurPosterPixels } from "../app/lib/poster-blur.ts";

function raster(width, height, pixel) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) data.set(pixel(x,y),4*(y*width+x));
  return data;
}
test("software blur preserves solid colors, alpha and one-pixel edges",()=>{
  for(const [width,height] of [[1,1],[1,37],[43,1],[270,480]]) {
    const data=raster(width,height,()=>[49,85,255,255]),before=data.slice();
    blurPosterPixels(data,width,height,7);
    assert.deepEqual(data,before,"clamped edges never introduce black or transparent borders");
  }
});
test("software blur spreads sharp detail symmetrically in both axes",()=>{
  const size=31,center=15;
  const data=raster(size,size,(x,y)=>[x===center&&y===center?255:0,0,0,255]);
  blurPosterPixels(data,size,size,2);
  const red=(x,y)=>data[4*(y*size+x)];
  assert(red(center,center)>0&&red(center,center)<255);
  assert(red(center-1,center)>0&&red(center,center-1)>0);
  for(let offset=1;offset<8;offset++) {
    assert.equal(red(center-offset,center),red(center+offset,center));
    assert.equal(red(center,center-offset),red(center,center+offset));
  }
  assert(data.filter((_,i)=>i%4===3).every(value=>value===255));
});
test("fine text-like stripes become soft pixels without a native canvas filter",()=>{
  const data=raster(270,480,(x)=>[x%2?255:0,x%2?255:0,x%2?255:0,255]);
  blurPosterPixels(data,270,480,7);
  const row=Array.from({length:200},(_,i)=>data[4*(240*270+i+35)]);
  assert(Math.max(...row)-Math.min(...row)<5,"alternating detail is no longer legible");
  assert(row.every(value=>value>100&&value<155));
});
test("zero blur is a no-op and malformed rasters fail explicitly",()=>{
  const data=raster(3,3,(x,y)=>[x*70,y*80,50,255]),before=data.slice();
  blurPosterPixels(data,3,3,0);assert.deepEqual(data,before);
  for(const [width,height,sigma] of [[0,3,7],[3,0,7],[2,3,7],[3,3,-1],[3,3,Infinity]]) {
    assert.throws(()=>blurPosterPixels(data,width,height,sigma),/Invalid poster blur raster/);
  }
});
test("prepared assets bake the ordered sticker-composited flow once and release it",()=>{
  const source=readFileSync(new URL("../app/lib/share-poster-assets.ts",import.meta.url),"utf8");
  assert(source.indexOf("paintPosterSticker(tiles,block,active)")<source.indexOf("assets.softBackground="));
  assert(source.indexOf("assets.flow=")<source.indexOf("assets.softBackground="));
  assert.match(source,/soft.width=STORY_WIDTH\/4;soft.height=STORY_HEIGHT\/4/);
  assert.match(source,/blurPosterPixels\(pixels.data,soft.width,soft.height,28\/4\)/);
  assert.match(source,/softContext.putImageData\(pixels,0,0\)/);
  assert.match(source,/assets.cover,assets.flow,assets.softBackground/);
});
