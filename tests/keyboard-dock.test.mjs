import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { installKeyboardDockPosition } from "../app/lib/keyboard-dock.ts";

const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const tree=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(name,node=tree){
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===name)return node;
 return ts.forEachChild(node,child=>find(name,child));
}

test("all keyboard entry points are audited, with no focus-driven dock hide or move",()=>{
 const entries=[];
 function visit(node){
  if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node)){
   const tag=node.tagName.getText(tree);
   if(tag==="input"||tag==="textarea"){
    const attr=name=>node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)===name)?.initializer?.getText(tree);
    if(attr("type")!=="\"file\"")entries.push(attr("id")||attr("aria-label"));
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
 assert.deepEqual(entries.sort(),['"auth-entry"','"Strip title"','{`Text block ${index + 1}`}'].sort());
 const keyboardDockRules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>/keyboard|is-typing|focus-within/.test(selector)&&/dock/.test(selector));
 assert.equal(keyboardDockRules.length,0,"The OS should cover the existing bar without a separate keyboard animation");
 assert.match(css,/\.composer-dock\s*\{[^}]*position: fixed;/);
 assert.match(css,/translate: 0 var\(--keyboard-dock-pan, 0px\)/);
 assert.match(source,/useLayoutEffect\(installKeyboardDockPosition, \[\]\)/);
 assert.match(source,/const viewport = window.visualViewport;[\s\S]*keepFocusedTextBlockVisible\("smooth"\)/);
});

function viewportFixture() {
 const events=new Map(),viewportEvents=new Map(),frames=new Map(),properties=new Map();
 let frameId=0;
 const viewport={scale:1,offsetTop:0,height:714,
  addEventListener:(name,fn)=>viewportEvents.set(name,fn),
  removeEventListener:name=>viewportEvents.delete(name)};
 globalThis.document={activeElement:null,documentElement:{style:{
  setProperty:(name,value)=>properties.set(name,value),removeProperty:name=>properties.delete(name)}}};
 globalThis.window={visualViewport:viewport,
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const dispose=installKeyboardDockPosition();
 return {viewport,events,viewportEvents,frames,
  focus(value){document.activeElement=value?{matches:()=>true}:null;events.get(value?"focusin":"focusout")();},
  pan(value){viewport.offsetTop=value;viewportEvents.get("scroll")();},
  offset:()=>Number.parseFloat(properties.get("--keyboard-dock-pan")),
  dispose,
  cleanup(){dispose();delete globalThis.document;delete globalThis.window;},
 };
}

test("keyboard panning leaves the dock at the same screen position, including deep inputs",()=>{
 const f=viewportFixture();
 try {
  f.focus(true);
  for(const pan of [0,2,80,352,652,190,0]){
   f.pan(pan);
   assert.equal(690+f.offset()-pan,690,"visual viewport pan must not lift the dock above the keyboard");
  }
  f.viewport.height=377;f.viewportEvents.get("resize")();
  assert.equal(f.offset(),0,"keyboard height itself must never translate the dock");
 }finally{f.cleanup();}
});

test("dock pan follows dismissal and focus transfers without a premature reset",()=>{
 const f=viewportFixture();
 try{
  f.focus(true);f.pan(352);f.focus(false);
  assert.equal(f.offset(),352);
  f.pan(240);assert.equal(f.offset(),240);
  f.focus(true);f.pan(400);assert.equal(f.offset(),400);
  f.focus(false);f.pan(0);assert.equal(f.offset(),0);
  f.pan(50);assert.equal(f.offset(),0,"normal page scrolling must not move the dock");
 }finally{f.cleanup();}
});

test("pinch zoom and negative overscroll are not treated as keyboard pan; cleanup removes listeners",()=>{
 const f=viewportFixture();
 try{
  f.focus(true);f.pan(-30);assert.equal(f.offset(),0);
  f.viewport.scale=2;f.pan(90);assert.equal(f.offset(),0);
  f.viewport.scale=1;f.pan(90);assert.equal(f.offset(),90);
  f.dispose();
  assert.equal(f.events.size,0);assert.equal(f.viewportEvents.size,0);assert.equal(f.frames.size,0);
  assert.ok(Number.isNaN(f.offset()));
 }finally{f.cleanup();}
});

test("entering text preserves the current bottom tools and caret placement",()=>{
 const declaration=find("enterTextEditing");
 const compiled=ts.transpileModule(`export const ${declaration.getText(tree)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const tool of [null,"font","background","color"]){
  const state={tool,selected:null,editing:null},events=[],exports={};
  const textarea={focus:options=>events.push(["focus",options.preventScroll]),setSelectionRange:(start,end)=>events.push(["caret",start,end])};
  runInNewContext(compiled,{
   exports,flushSync:fn=>fn(),
   setSelectedBlockId:id=>{state.selected=id;},
   setEditingTextBlockId:id=>{state.editing=id;},
   setActiveTextTool:value=>{state.tool=value;},
   document:{querySelector:()=>({querySelector:()=>textarea})},
  });
  exports.enterTextEditing("block",4);
  assert.equal(state.tool,tool);
  assert.equal(state.selected,"block");assert.equal(state.editing,"block");
  assert.deepEqual(events,[["focus",true],["caret",4,4]]);
 }
});

test("intentional tool switching and preview transitions remain separate from keyboard behavior",()=>{
 assert.match(css,/\.main-composer-dock\.is-shifted,\s*\.publish-setup-dock\.is-shifted\s*\{[^}]*transform: translateY\(125%\)/);
 assert.match(css,/\.selector-dock\.is-visible\s*\{[^}]*opacity: 1;/);
 assert.match(source,/<PreviewDock preview=\{inlinePreview\}>/);
 assert.match(source,/visible=\{activeTextTool !== null\}/);
});
