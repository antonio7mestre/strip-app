import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { revealPickerOption, scrollPickerOnSelect } from "../app/lib/picker-scroll.ts";
import { normalizeTextAlignment } from "../app/lib/text-alignment.ts";

function fixture({ left=0, width=260, total=1000, optionLeft=180, optionWidth=44, scale=1 }={}) {
  const calls=[];
  const option={getBoundingClientRect:()=>({left:100+optionLeft*scale,width:optionWidth*scale})};
  const rail={scrollLeft:left,clientWidth:width,scrollWidth:total,clientLeft:0,offsetWidth:width,
    contains:item=>item===option,getBoundingClientRect:()=>({left:100,width:width*scale}),scrollTo:value=>calls.push(value)};
  return {rail,option,calls};
}

test("selecting an edge choice nudges it slightly, not all the way to the left",()=>{
  const f=fixture();revealPickerOption(f.rail,f.option);
  assert.deepEqual(f.calls,[{left:21,behavior:"smooth"}]);
  assert.equal(f.rail.scrollLeft,0,"no direct scroll or page-position writes");
});
test("selection uses the existing offset and scales correctly on desktop",()=>{
  const f=fixture({left:200,optionLeft:200,scale:1.7});revealPickerOption(f.rail,f.option);
  assert.deepEqual(f.calls,[{left:241,behavior:"smooth"}]);
});
test("comfortable selections and repeat taps stay still at both viewport scales",()=>{
  for(const scale of [1,1.7]) {
    for(const optionLeft of [8,80,130,159]) {
      const f=fixture({left:100,optionLeft,scale});revealPickerOption(f.rail,f.option);
      assert.deepEqual(f.calls,[]);
    }
  }
});
test("wide desktop rails preserve context and leave room for the next option",()=>{
  const f=fixture({width:600,optionLeft:530});revealPickerOption(f.rail,f.option);
  assert.deepEqual(f.calls,[{left:46,behavior:"smooth"}]);
  assert.ok(530-f.calls[0].left>400,"selected option remains on the right");
});
test("ends clamp, first choices stay still, and short rails never move",()=>{
  for(const [options,expected] of [[{left:700,optionLeft:200},740],[{left:100,optionLeft:-180},0],
    [{optionLeft:6},null],[{total:200},null]]) {
    const f=fixture(options);revealPickerOption(f.rail,f.option);
    assert.deepEqual(f.calls,expected===null?[]:[{left:expected,behavior:"smooth"}]);
  }
  const f=fixture();revealPickerOption(f.rail,{getBoundingClientRect:()=>({left:500})});assert.deepEqual(f.calls,[]);
});
test("clicks from an icon resolve to their choice; utility and disabled buttons stay put",()=>{
  const previous=globalThis.Element;
  class FakeElement { constructor(option){this.option=option;}closest(){return this.option;} }
  globalThis.Element=FakeElement;
  try {
    const f=fixture();f.option.matches=()=>false;
    scrollPickerOnSelect({currentTarget:f.rail,target:new FakeElement(f.option)});
    assert.equal(f.calls.length,1);
    f.option.matches=()=>true;
    scrollPickerOnSelect({currentTarget:f.rail,target:new FakeElement(f.option)});
    scrollPickerOnSelect({currentTarget:f.rail,target:new FakeElement(null)});
    assert.equal(f.calls.length,1);
  } finally {globalThis.Element=previous;}
});
test("all horizontal style rails share the behavior, including cover and shape colors",()=>{
  const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
  for(const path of ["app/page.tsx","app/components/ProfileEditor.tsx","app/components/StickerPicker.tsx"]) {
    const source=read(path);assert.match(source,/onClickCapture=\{scrollPickerOnSelect\}/);
    assert.match(source,/data-picker-option/);
  }
  const page=read("app/page.tsx");
  assert.ok(page.indexOf('aria-label="Font size"')<page.indexOf('aria-label="Text alignment"'));
  assert.ok(page.indexOf('aria-label="Text alignment"')<page.indexOf('...FONT_OPTIONS.map'));
  assert.match(page,/textAlign: normalizeTextAlignment\(block.textAlign\)/);
  assert.match(read("app/globals.css"),/\.text-block textarea,\s*\.text-block p \{\s*text-align: inherit/);
});
test("old and malformed alignments remain left aligned",()=>{
  for(const value of [undefined,null,"justify","LEFT",{},1])assert.equal(normalizeTextAlignment(value),"left");
  for(const value of ["left","center","right"])assert.equal(normalizeTextAlignment(value),value);
});

test("alignment has press feedback without a persistent visual selection",()=>{
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const controls=page.slice(page.indexOf('className="text-alignment-picker"'),page.indexOf('...FONT_OPTIONS.map'));
  assert.match(controls,/className="selector-option"/);
  assert.doesNotMatch(controls,/is-selected/);
  assert.match(controls,/aria-pressed=\{normalizeTextAlignment\(block.textAlign\) === value\}/);
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.text-alignment-picker \.selector-option:active \{\s*background: #080808/);
});
