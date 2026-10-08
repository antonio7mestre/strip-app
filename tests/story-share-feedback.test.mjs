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
 let sheet=false,confirmation=null,downloads=0,instagramFile=null;
 const assetFile=new File(["image"],"story.png",{type:"image/png"});
 const browser={
  clipboard:{writeText:()=>{events.push("copy");return copy.promise;}},
  canShare:()=>supported,
  share:()=>{events.push("share");return share.promise;},
 };
 runInNewContext(compiled,{
  exports,storyShareInFlightRef:gate,storyShareAttemptRef:attempt,posters:{remember:()=>events.push("remember")},
  openedPublishedStrip:{id:"test"},storyAssetFile:assetFile,storyAssetLoading:false,
  publicStripUrl:()=>"https://example.com/test",getStoryShareConfirmation,
  beginStoryShare:(data,url,callbacks)=>beginStoryShare(data,url,callbacks,browser),
  flushSync:callback=>callback(),
  setNotice:message=>events.push("notice:"+message),
  setStoryShareSheetOpen:value=>{sheet=value;},
  setStoryShareConfirmation:value=>{confirmation=value;},
  setStoryInstagramFile:value=>{instagramFile=value;},
  downloadStoryAsset:()=>downloads++,
 });
 return{run:exports.shareStoryToInstagram,copy,share,attempt,gate,events,assetFile,
  get sheet(){return sheet;},get confirmation(){return confirmation;},get downloads(){return downloads;},
  get instagramFile(){return instagramFile;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function copyHarness(view = "share") {
 let copyNode;
 function walk(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(tree)==="copyPublishedStripLink") copyNode=node;
  ts.forEachChild(node,walk);
 }
 walk(tree);
 const code=ts.transpileModule(`export const ${copyNode.getText(tree)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const copy=deferred(),attempt={current:0},exports={},notices=[];
 let state;
 runInNewContext(code,{
  exports,view,openedPublishedStrip:{id:"test"},storyShareAttemptRef:attempt,
  publicStripUrl:()=>"https://example.com/test",
  navigator:{clipboard:{writeText:()=>copy.promise}},
  setStoryShareConfirmation:value=>{state=value;},
  setNotice:value=>notices.push(value),
 });
 return {run:exports.copyPublishedStripLink,copy,attempt,notices,get state(){return state;}};
}
test("manual Copy link activates the existing button without another success notice in the share view",async()=>{
 const h=copyHarness(),running=h.run();
 assert.equal(h.state.copied,null);
 h.copy.resolve();await running;
 assert.equal(h.state.copied,true);assert.deepEqual(h.notices,[]);
});
test("manual clipboard failure leaves Copy link retryable, and late completion cannot activate another page",async()=>{
 const failed=copyHarness(),running=failed.run();failed.copy.reject(new Error("denied"));await running;
 assert.equal(failed.state.copied,false);assert.equal(failed.notices.length,1);
 const stale=copyHarness(),pending=stale.run();stale.attempt.current++;stale.copy.resolve();await pending;
 assert.equal(stale.state.copied,null);
});
test("reader copy feedback keeps its existing success notice outside the poster page",async()=>{
 const h=copyHarness("published"),running=h.run();h.copy.resolve();await running;
 assert.deepEqual(h.notices,["Strip link copied."]);
});

test("the existing Copy link button owns a persistent activated state instead of a popup",()=>{
 const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/components/CopyStripLinkButton.tsx",import.meta.url),"utf8");
 assert.match(css,/\.share-link-button\.is-copied\s*\{[^}]*color: #111;[^}]*background: #fff;/);
 assert.doesNotMatch(source,/setStoryShareConfirmation\(null\), 7000/);
 assert.match(ui,/aria-live="polite" aria-atomic="true"/);
 assert.match(ui,/copied \? "Link copied" : "Copy link"/);
 assert.doesNotMatch(source,/<StoryShareConfirmation(?:\s|\/|>)/);
});

test("Copy link stays above the tray without an overlaid image-save confirmation",()=>{
 const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
 const anchor=source.slice(source.indexOf('<div className="share-link-anchor">'),source.indexOf('<footer className="composer-dock share-dock'));
 assert.match(anchor,/<CopyStripLinkButton copied=\{storyShareConfirmation\?\.copied\}/);
 assert.doesNotMatch(anchor,/<StoryShareConfirmation/);
 assert.doesNotMatch(anchor,/createPortal/);
 assert.match(css,/\.share-link-anchor\s*\{[^}]*position: relative;[^}]*width: 100%;/);
});

test("real page handler shows image feedback immediately, then only confirms a resolved clipboard",async()=>{
 const h=harness(),running=h.run();
 assert.equal(h.sheet,true);assert.equal(h.confirmation,null);
 assert.equal(h.instagramFile,null);
 assert.deepEqual(h.events.filter(x=>x==="copy"||x==="share"),["copy","share"]);
 await h.run();assert.equal(h.events.filter(x=>x==="share").length,1);
 h.share.resolve();await running;
 assert.equal(h.sheet,false);assert.equal(h.gate.current,false);
 assert.equal(h.instagramFile,h.assetFile);
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:null});
 assert.equal(h.events.filter(event=>event==="remember").length,1);
 h.copy.resolve();await tick();
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:true});
});
test("cancel reports only the copied link and never says the image was saved",async()=>{
 const h=harness(),running=h.run();h.copy.resolve();h.share.reject(new DOMException("Cancelled","AbortError"));
 await running;await tick();
 assert.deepEqual(h.confirmation,{image:null,copied:true});assert.equal(h.downloads,0);
 assert.equal(h.instagramFile,null);
 assert.equal(h.events.filter(event=>event==="remember").length,0);
});
test("clipboard failure retains the image result without claiming a copied link",async()=>{
 const h=harness(),running=h.run();h.copy.reject(new Error("denied"));h.share.resolve();
 await running;await tick();
 assert.deepEqual(h.confirmation,{image:"Story image saved or shared",copied:false});
});
test("fallback reports a started download, and new attempts clear the previous popup",async()=>{
 const h=harness({supported:false}),running=h.run();h.copy.resolve();await running;await tick();
 assert.deepEqual(h.confirmation,{image:"Story image download started",copied:true});assert.equal(h.downloads,1);
 assert.equal(h.instagramFile,h.assetFile);
 const again=h.run();assert.equal(h.confirmation,null);assert.equal(h.instagramFile,null);await again;
});
test("late clipboard completion cannot overwrite a new share or a dismissed popup",async()=>{
 const h=harness(),first=h.run();h.share.resolve();await first;
 h.attempt.current++;h.copy.resolve();await tick();
 assert.equal(h.confirmation.copied,null);
 const next=h.run();await next;await tick();assert.equal(h.confirmation.copied,true);
});
test("late save completion cannot expose a post-save action after navigation or a new attempt",async()=>{
 const h=harness(),running=h.run();h.attempt.current++;h.share.resolve();
 await running;assert.equal(h.instagramFile,null);
});
test("only a completed current file expands the tray, with the copy button above it",()=>{
 assert.match(source,/const storyInstagramReady = Boolean\(!storyShareSheetOpen && !storyAssetLoading && storyAssetFile && storyInstagramFile === storyAssetFile\)/);
 assert.match(source,/data-story-ready=\{storyInstagramReady\}/);
 assert.match(source,/setStoryShareConfirmation\(null\);\s*setStoryInstagramFile\(null\);\s*setNotice\(""/);
 const footer=source.slice(source.indexOf('<footer className="composer-dock share-dock'),source.indexOf('<StoryShareBackdrop open='));
 assert.match(footer,/<StoryShareControls/);
 const above=source.slice(source.indexOf('<div className="poster-picker-meta">'),source.indexOf('<footer className="composer-dock share-dock'));
 assert.match(above,/<CopyStripLinkButton/);
 assert.doesNotMatch(above,/<StoryShareConfirmation/);
 assert.doesNotMatch(above,/InstagramStoryAction|StoryShareControls/);
 assert.match(footer,/returnToLibrary/);assert.match(footer,/shareStoryToInstagram/);
 const reset=source.slice(source.indexOf("const resetTransientNavigationState ="),source.indexOf("const resetTransientNavigationState =")+800);
 assert.doesNotMatch(reset,/setStoryInstagramFile/,"returning from Instagram keeps the completed-file action available");
 assert.match(reset,/setStoryShareConfirmation\(previous => previous\?\.copied === null \? null : previous\)/,
  "returning from Instagram keeps the copied button activated but releases an interrupted clipboard request");
});
