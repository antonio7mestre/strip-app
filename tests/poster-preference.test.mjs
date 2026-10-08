import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { POSTER_DESIGNS } from "../app/lib/share-posters.ts";

const source=readFileSync(new URL("../app/lib/poster-preference.ts",import.meta.url),"utf8");
function moduleFor(host="antonio.striiip.com",blocked=false) {
  const values=new Map(),document={cookie:""};
  const sandbox={exports:{},document,window:{location:{hostname:host,protocol:host==="localhost"?"http:":"https:"},
    localStorage:{getItem:key=>{if(blocked)throw new Error("blocked");return values.get(key)??null;},
      setItem:(key,value)=>{if(blocked)throw new Error("blocked");values.set(key,value);}}},
    require:()=>({POSTER_DESIGNS})};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
  return {...sandbox.exports,document,values};
}
test("last saved design is first, with every other kept design exactly once",()=>{
  const api=moduleFor();
  for(const [index,design] of POSTER_DESIGNS.entries()) {
    const order=Array.from(api.posterDesignOrder(design.id));
    assert.equal(order[0],index);assert.equal(new Set(order).size,8);
    assert.deepEqual(order.slice(1),POSTER_DESIGNS.map((_,i)=>i).filter(i=>i!==index));
  }
  assert.deepEqual(Array.from(api.posterDesignOrder("retired-design")),[0,1,2,3,4,5,6,7]);
});
test("preference persists across author subdomains, reload and localhost",()=>{
  const api=moduleFor();api.rememberPosterDesign("stepped-blocks");
  assert.equal(api.readPosterPreference(),"stepped-blocks");
  assert.match(api.document.cookie,/Domain=striiip.com/);assert.match(api.document.cookie,/; Secure/);
  const local=moduleFor("localhost");local.rememberPosterDesign("soft-memory");
  assert.equal(local.readPosterPreference(),"soft-memory");assert.doesNotMatch(local.document.cookie,/Domain=|Secure/);
});
test("unknown designs and denied storage never break sharing",()=>{
  const api=moduleFor();api.rememberPosterDesign("not-approved");assert.equal(api.values.size,0);
  const blocked=moduleFor("antonio.striiip.com",true);assert.doesNotThrow(()=>blocked.rememberPosterDesign("masonry-wall"));
});
test("only completed save/share actions remember the original selected file",()=>{
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const hook=readFileSync(new URL("../app/components/useStoryPosters.ts",import.meta.url),"utf8");
  assert.match(page,/const result = await finished;\s*if \(result !== "cancelled"\) posters.remember\(storyAssetFile\)/);
  assert.match(hook,/current\?\.file === file/);
  assert.match(hook,/renderBlob\(assets, order\[i\], true\)/);
  assert.match(hook,/renderBlob\(assets, designIndex\)/);
});
