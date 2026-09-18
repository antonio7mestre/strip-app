import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { beginStoryShare } from "../app/lib/story-share.ts";

const data = { files: [new File(["poster"], "poster.png", { type: "image/png" })] };
const url = "https://antonio.striiip.com/real-strip";
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function setup(overrides={}) {
 const events=[], copy=deferred(), share=deferred();
 const callbacks={open:()=>events.push("open"),close:()=>events.push("close"),download:()=>events.push("download")};
 const browser={
  clipboard:{writeText:value=>{assert.equal(value,url);events.push("copy");return copy.promise;}},
  canShare:value=>{assert.equal(value,data);return true;},
  share:value=>{assert.equal(value,data);events.push("share");return share.promise;},
  ...overrides,
 };
 return {events,copy,share,run:()=>beginStoryShare(data,url,callbacks,browser)};
}
test("clipboard starts before share, both synchronously in the tap",async()=>{
 const s=setup(),pending=s.run();
 assert.deepEqual(s.events,["copy","open","share"]);
 s.share.resolve();assert.equal(await pending.finished,"shared");
 assert.deepEqual(s.events,["copy","open","share","close"]);
 s.copy.resolve();assert.equal(await pending.copied,true);
});
test("cancel dismisses backdrop without downloading and keeps copied link",async()=>{
 const s=setup(),pending=s.run();s.copy.resolve();s.share.reject(new DOMException("Cancelled","AbortError"));
 assert.equal(await pending.finished,"cancelled");assert.equal(await pending.copied,true);
 assert.deepEqual(s.events,["copy","open","share","close"]);
});
test("clipboard rejection does not prevent sharing or strand the backdrop",async()=>{
 for(const clipboard of [undefined,{writeText:()=>Promise.reject(new Error("denied"))},{writeText:()=>{throw new Error("denied");}}]){
  const s=setup({clipboard}),pending=s.run();assert.equal(await pending.copied,false);
  assert.deepEqual(s.events,["open","share"]);s.share.resolve();await pending.finished;
  assert.equal(s.events.at(-1),"close");
 }
});
test("unsupported file share downloads in the click without a native backdrop",async()=>{
 for(const override of [{share:undefined},{canShare:()=>false},{canShare:()=>{throw new Error("unsupported");}}]){
  const s=setup(override),pending=s.run();assert.deepEqual(s.events,["copy","download"]);
  s.copy.resolve();assert.equal(await pending.copied,true);assert.equal(await pending.finished,"downloaded");
 }
});
test("native failure falls back to the image and always closes",async()=>{
 const s=setup(),pending=s.run();s.copy.resolve();s.share.reject(new Error("unavailable"));
 assert.equal(await pending.finished,"downloaded");assert.deepEqual(s.events,["copy","open","share","download","close"]);
 const synchronous=setup({share:()=>{throw new Error("no activation");}});
 const second=synchronous.run();synchronous.copy.resolve();
 assert.equal(await second.finished,"downloaded");assert.equal(synchronous.events.at(-1),"close");
});
test("page guards repeat taps, mounts backdrop before native share, and resets on bfcache",()=>{
 const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(page,/if \(storyShareInFlightRef\.current \|\| !openedPublishedStrip\) return/);
 assert.match(page,/open: \(\) => flushSync\(/);
 assert.match(page,/inert=\{storyShareSheetOpen\}/);
 assert.match(page,/storyShareSheetOpen \? createPortal/);
 assert.match(page,/<StoryShareSaveIcon \/>/);
 assert.match(page,/<p>Save to post<\/p>/);
 assert.match(page,/<span className="story-share-or">or<\/span>/);
 assert.match(page,/<p>Send to friends<\/p>/);
 assert.match(page,/<link rel="preload" as="image" href="\/apple-messages.jpg" \/>/);
 assert.match(page,/<img className="story-share-messages-icon" src="\/apple-messages.jpg" width="56" height="56" alt="" \/>/);
 assert.match(page,/const resetTransientNavigationState = \(\) => \{[\s\S]*?setStoryShareSheetOpen\(false\)/);
 assert.match(page,/if \(event.persisted\) resetTransientNavigationState\(\)/);
 assert.match(page,/storyAssetLoading \|\| !storyAssetFile \|\| storyShareSheetOpen/);
});
test("save guidance uses the reference's round disc and down-arrow tray",()=>{
 const icon=readFileSync(new URL("../app/components/StoryShareSaveIcon.tsx",import.meta.url),"utf8");
 assert.match(icon,/viewBox="0 0 200 200"/);
 assert.match(icon,/<circle cx="100" cy="100" r="100"/);
 assert.match(icon,/strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/);
 assert.match(icon,/M100 56V112M86 98L100 112L114 98/);
 assert.match(icon,/aria-hidden="true" focusable="false"/);
});
test("Messages guidance uses bundled Apple artwork, without a remote image dependency",()=>{
 const artwork=readFileSync(new URL("../public/apple-messages.jpg",import.meta.url));
 assert.deepEqual([...artwork.subarray(0,3)],[0xff,0xd8,0xff]);
 assert.ok(artwork.length>1000);
});
