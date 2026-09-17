import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../app/lib/share-film.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const api={};runInNewContext(code,{exports:api});
const plain=value=>JSON.parse(JSON.stringify(value));
const strip={id:'strip-photo',title:'Weekend',username:'antonio',cover:{kind:'color',color:'#abc'},blocks:[
 {type:'image',src:'/one'},{type:'video',src:'/two'},{type:'sticker',src:'/three',mediaType:'video'},
 {type:'text',content:'My words',backgroundColor:'#f0c',textColor:'#fff'}],endingStyle:{backgroundColor:'#123456',buttonColor:'#f0c'}};

test('reference edit keeps a fixed 33.57 second 720p vertical timeline',()=>{
 assert.deepEqual(plain(api.SHARE_FILM),{width:720,height:1280,fps:30,duration:33.57});
 assert.equal(api.SHARE_FILM_CUTS.at(-1),api.SHARE_FILM.duration);
 assert(api.SHARE_FILM_CUTS.every((t,i,a)=>!i||t>a[i-1]));
});
test('palette is drawn from this Strip, normalized and deduplicated',()=>{
 const colors=plain(api.filmPalette(strip));
 assert.deepEqual(colors,['#FF00CC','#123456','#AABBCC','#FFFFFF']);
 assert.equal(api.filmColor('red'),null);assert.equal(api.filmColor('#12345678'),null);
 assert.equal(api.filmColor('#c0f'),'#CC00FF');
 assert.deepEqual(plain(api.filmPalette({...strip,cover:{kind:'image',src:'/a'},blocks:[],endingStyle:undefined})),[]);
});
test('photos, videos, stickers and cover come from the referenced Strip only',()=>{
 assert.deepEqual(plain(api.filmMediaSources(strip)),[{src:'/one',video:false},{src:'/two',video:true},{src:'/three',video:true}]);
 const sources=api.filmMediaSources({...strip,cover:{kind:'image',src:'/one'}});
 assert.equal(sources.length,3,'cover is not decoded twice');
 const newCover=api.filmMediaSources({...strip,cover:{kind:'image',src:'/cover'}});
 assert.equal(newCover.at(-1).src,'/cover');
});
test('large strips sample across their full length with bounded decoded memory',()=>{
 const many={...strip,blocks:Array.from({length:150},(_,i)=>({type:'image',src:'/photo-'+i}))};
 const sources=api.filmMediaSources(many);
 assert.equal(sources.length,18);assert.equal(sources[0].src,'/photo-0');assert.equal(sources.at(-1).src,'/photo-149');
});

function canvas(){
 const calls=[],stack=[];let alpha=1;
 const target={canvas:{width:720,height:1280},measureText:text=>({width:text.length*45}),
  save:()=>{stack.push(alpha);},restore:()=>{assert(stack.length>0);alpha=stack.pop();},
  get globalAlpha(){return alpha;},set globalAlpha(value){assert(Number.isFinite(value));alpha=value;}};
 const c=new Proxy(target,{get(o,k){if(k in o)return o[k];return (...args)=>{
  for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${String(k)} received ${arg}`);
  calls.push([k,...args]);
 };},set(o,k,value){o[k]=value;return true;}});
 return {c,calls,stack};
}
const assets={tiles:[{color:'#123456',text:'This is my own text',ink:'#ffffff'},{color:'#f0c',image:{width:600,height:800}}],palette:['#FF00CC','#123456'],title:'Weekend with friends',byline:'antonio.striiip.com',seed:api.filmSeed(strip.id)};
test('every exported frame is valid and restores all canvas state',()=>{
 for(let frame=0;frame<Math.ceil(api.SHARE_FILM.duration*api.SHARE_FILM.fps);frame++){
  const h=canvas();api.renderShareFilm(h.c,assets,frame/api.SHARE_FILM.fps);
  assert.equal(h.stack.length,0,`unbalanced save/restore at frame ${frame}`);
  assert.equal(h.c.globalAlpha,1);assert(h.calls.some(c=>c[0]==='fillRect'));
 }
});
test('random-looking layouts are deterministic for preview, export and retries',()=>{
 const hash=(a,t)=>{const h=canvas();api.renderShareFilm(h.c,a,t);return createHash('sha256').update(JSON.stringify(h.calls)).digest('hex');};
 for(const t of [0,0.7,2,8,12,18,21,24,27,31])assert.equal(hash(assets,t),hash(assets,t));
 assert.notEqual(hash(assets,0),hash({...assets,seed:api.filmSeed('another-strip')},0));
});
test('text-only strips render all scenes without requiring stock media',()=>{
 const a={...assets,tiles:[assets.tiles[0]]};
 for(const t of api.SHARE_FILM_CUTS){const h=canvas();api.renderShareFilm(h.c,a,t);assert.equal(h.stack.length,0);}
 assert.doesNotMatch(source,/FrameRate|Untitled\.mov|https?:\/\//);
});
test('closing card uses STRIP and the current author address, not the reference brand',()=>{
 const h=canvas();api.renderShareFilm(h.c,assets,32);
 const text=h.calls.filter(c=>c[0]==='fillText').map(c=>c[1]);
 assert(text.includes('STRIP'));assert(text.includes('antonio.striiip.com'));
});
test('export and share page use video files with lifecycle cleanup and actual progress',()=>{
 const exporter=readFileSync(new URL('../app/lib/share-film-export.ts',import.meta.url),'utf8');
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(exporter,/encodingStep\(source.add\(time,/);assert.match(exporter,/encodingStep\(output.finalize\(\)/);
 assert.match(exporter,/delete encoder.displayWidth; delete encoder.displayHeight/);
 assert.match(exporter,/type: "video\/mp4"/);assert.match(exporter,/stream.getTracks\(\).forEach/);
 assert.match(exporter,/signal.removeEventListener\("abort", abort\)/);
 assert.match(page,/controller.abort\(\);\s*dispose\(\)/);
 assert.match(page,/URL.revokeObjectURL\(storyAssetObjectUrlRef.current\)/);
 assert.match(page,/storyAssetStripId !== openedPublishedStrip\?\.id/);
 assert.doesNotMatch(page,/createInstagramStoryAsset|share\.png|share image/);
});

test('native encoder waits resolve, abort, and time out without leaking listeners',async()=>{
 const exporter=readFileSync(new URL('../app/lib/share-film-export.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(exporter+'\nexports.testStep = encodingStep;',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
 }).outputText;
 const exported={},timers=new Map();let next=0;
 runInNewContext(compiled,{exports:exported,require:()=>api,DOMException,
  window:{setTimeout:callback=>{const id=++next;timers.set(id,callback);return id;}},clearTimeout:id=>timers.delete(id),
 });
 assert.equal(await exported.testStep(Promise.resolve('encoded'),new AbortController().signal),'encoded');
 assert.equal(timers.size,0);
 const abort=new AbortController();
 const aborted=exported.testStep(new Promise(()=>{}),abort.signal);abort.abort();
 await assert.rejects(aborted,{name:'AbortError'});assert.equal(timers.size,0);
 let finishLate;
 const stalled=exported.testStep(new Promise(resolve=>{finishLate=resolve;}),new AbortController().signal);
 [...timers.values()][0]();
 await assert.rejects(stalled,/Video encoder timed out/);assert.equal(timers.size,0);
 finishLate('late native response');await Promise.resolve();assert.equal(timers.size,0);
});
