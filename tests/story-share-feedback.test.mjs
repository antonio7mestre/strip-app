import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beginStoryShare, getStoryShareConfirmation } from "../app/lib/story-share.ts";

const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const tree=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(node=tree){
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==="shareStoryToInstagram")return node;
 return ts.forEachChild(node,find);
}
const compiled=ts.transpileModule(`export const ${find().getText(tree)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function harness({supported=true}={}){
 const copy=deferred(),share=deferred(),attempt={current:0},gate={current:false},exports={},events=[];
 let sheet=false,confirmation=null,downloads=0;
 const browser={
  clipboard:{writeText:()=>{events.push("copy");return copy.promise;}},
  canShare:()=>supported,
  share:()=>{events.push("share");return share.promise;},
 };
 runInNewContext(compiled,{
  exports,storyShareInFlightRef:gate,storyShareAttemptRef:attempt,
  openedPublishedStrip:{id:"test"},storyAssetFile:new File(["image"],"story.png",{type:"image/png"}),storyAssetLoading:false,
  publicStripUrl:()=>"https://example.com/test",getStoryShareConfirmation,
  beginStoryShare:(data,url,callbacks)=>beginStoryShare(data,url,callbacks,browser),
  flushSync:callback=>callback(),
  setNotice:message=>events.push("notice:"+message),
  setStoryShareSheetOpen:value=>{sheet=value;},
  setStoryShareConfirmation:value=>{confirmation=value;},
  downloadStoryAsset:()=>downloads++,
 });
 return{run:exports.shareStoryToInstagram,copy,share,attempt,gate,events,
  get sheet(){return sheet;},get confirmation(){return confirmation;},get downloads(){return downloads;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test("confirmation is a prominent white pill with black copy and seven seconds to read",()=>{
 const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/components/StoryShareConfirmation.tsx",import.meta.url),"utf8");
 assert.match(css,/\.story-share-confirmation\s*\{[^}]*border-radius: 999px;[^}]*color: #111;[^}]*background: #fff;/);
 assert.match(source,/setStoryShareConfirmation\(null\), 7000/);
 assert.match(ui,/role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(ui,/aria-label="Dismiss sharing confirmation"/);
 assert.match(source,/!storyShareSheetOpen && storyShareConfirmation \? \(/);
});

test("compact confirmation shares the Copy link anchor and bottom edge at every viewport size",()=>{
 const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
 const anchor=source.slice(source.indexOf('<div className="share-link-anchor">'),source.indexOf('<footer className="composer-dock share-dock'));
 assert.match(anchor,/className="share-link-button"[\s\S]*<StoryShareConfirmation/);
 assert.doesNotMatch(anchor,/createPortal/);
 assert.match(css,/\.share-link-anchor\s*\{[^}]*position: relative;[^}]*width: 100%;/);
 assert.match(css,/\.story-share-confirmation\s*\{[^}]*position: absolute;[^}]*bottom: 0;[^}]*width: min\(340px, calc\(100% - 32px\)\);[^}]*padding: 12px 14px 12px 18px;/);
});

test("real page handler shows image feedback immediately, then only confirms a resolved clipboard",async()=>{
 const h=harness(),running=h.run();
 assert.equal(h.sheet,true);assert.equal(h.confirmation,null);
 assert.deepEqual(h.events.filter(x=>x==="copy"||x==="share"),["copy","share"]);
 await h.run();assert.equal(h.events.filter(x=>x==="share").length,1);
 h.share.resolve();await running;
 assert.equal(h.sheet,false);assert.equal(h.gate.current,false);
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:null});
 h.copy.resolve();await tick();
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:true});
});
test("cancel reports only the copied link and never says the image was saved",async()=>{
 const h=harness(),running=h.run();h.copy.resolve();h.share.reject(new DOMException("Cancelled","AbortError"));
 await running;await tick();
 assert.deepEqual(h.confirmation,{image:null,copied:true});assert.equal(h.downloads,0);
});
test("clipboard failure retains the image result without claiming a copied link",async()=>{
 const h=harness(),running=h.run();h.copy.reject(new Error("denied"));h.share.resolve();
 await running;await tick();
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:false});
});
test("fallback reports a started download, and new attempts clear the previous popup",async()=>{
 const h=harness({supported:false}),running=h.run();h.copy.resolve();await running;await tick();
 assert.deepEqual(h.confirmation,{image:"Story image download started",copied:true});assert.equal(h.downloads,1);
 const again=h.run();assert.equal(h.confirmation,null);await again;
});
test("late clipboard completion cannot overwrite a new share or a dismissed popup",async()=>{
 const h=harness(),first=h.run();h.share.resolve();await first;
 h.attempt.current++;h.copy.resolve();await tick();
 assert.equal(h.confirmation.copied,null);
 const next=h.run();await next;await tick();assert.equal(h.confirmation.copied,true);
});
