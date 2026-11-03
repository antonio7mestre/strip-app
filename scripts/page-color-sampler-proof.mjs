// Local browser regression fixture. No account data or production writes.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = new URL('../app/lib/page-color-sampler.ts', import.meta.url);
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Color sampler checks</title>
<style>
body{margin:0;font:16px Arial;background:white}button{margin:12px;padding:12px}pre{white-space:pre-wrap;padding:12px}
#block{position:relative;width:320px;height:240px;overflow:hidden;background:#eee}
.text-block-texture{position:absolute;inset:0;width:320px;height:295px;object-fit:cover;object-position:center top;clip-path:inset(0 0 55px);pointer-events:none}
p{position:relative;margin:0;padding:16px;color:#00ff00;font:700 64px/80px Arial;white-space:pre-wrap;letter-spacing:-1px}
.sticker-block{position:absolute;inset:0;pointer-events:none}.sticker-block img,.sticker-block canvas{pointer-events:none}
#art{position:absolute;left:220px;top:170px;width:80px;height:50px;transform:rotate(12deg)}
</style><button id="run">Run sampler checks</button><div id="block" class="text-block">
<img class="text-block-texture" alt="Test texture"><p>HO   ME</p><div class="sticker-block"><canvas id="art" width="80" height="50"></canvas><img id="cover" alt="Test overlap" style="position:absolute;width:320px;height:240px;display:none"></div></div><pre id="results">Ready</pre>
<script type="module">
import {samplePageColorAtPoint} from '/sampler.js';
const texture=document.querySelector('.text-block-texture'),p=document.querySelector('p'),block=document.querySelector('#block'),art=document.querySelector('#art'),cover=document.querySelector('#cover'),results=document.querySelector('#results');
const svg=s=>'data:image/svg+xml,'+encodeURIComponent(s);
texture.src=svg('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="320"><path fill="#ff0000" d="M0 0h160v80H0z"/><path fill="#0000ff" d="M0 80h160v240H0z"/></svg>');
cover.src=svg('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><path fill="#ffff00" d="M0 0h320v240H0z"/></svg>');
const ctx=art.getContext('2d');ctx.fillStyle='#00ffff';ctx.fillRect(0,0,40,50);
function rect(start,end){const range=document.createRange();range.setStart(p.firstChild,start);range.setEnd(p.firstChild,end);return range.getBoundingClientRect();}
document.querySelector('#run').onclick=async()=>{
await texture.decode();await cover.decode();await document.fonts.ready;
const checks=[];const check=(name,actual,expected)=>checks.push({name,actual,expected,pass:actual===expected});
const sample=(x,y)=>samplePageColorAtPoint(x,y);const b=block.getBoundingClientRect();
const h=rect(0,1),o=rect(1,2),space=rect(2,5);
const hx=h.left+h.width*.2,hy=h.top+h.height*.5;
check('font ink on a textured block',sample(hx,hy),'#00FF00');
check('hole in the O reveals texture',sample(o.left+o.width/2,o.top+o.height/2),'#FF0000');
check('spaces between words reveal texture',sample(space.left+space.width/2,hy),'#FF0000');
check('upper visible texture pixel',sample(b.left+10,b.top+120),'#FF0000');
check('lower visible texture pixel',sample(b.left+10,b.top+220),'#0000FF');
check('texture pointer events restored',texture.style.getPropertyValue('pointer-events'),'');
check('rotated canvas ink',sample(b.left+240,b.top+195),'#00FFFF');
check('transparent canvas reveals texture',sample(b.left+280,b.top+195),'#0000FF');
cover.style.display='block';check('overlapping image takes priority over text',sample(hx,hy),'#FFFF00');cover.style.display='none';
p.style.color='#ff00ff';check('live font color change',sample(hx,hy),'#FF00FF');p.style.color='#00ff00';
const start=performance.now();for(let i=0;i<200;i++)sample(hx,hy);const mean=(performance.now()-start)/200;
results.textContent=JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,meanSampleMs:mean,checks},null,2);
document.body.dataset.result=checks.every(c=>c.pass)?'pass':'fail';
};
</script>`;
http.createServer(async (req,res)=>{
  if(req.url==='/sampler.js'){
    const text=await readFile(source,'utf8');
    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
    res.end(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
  }else{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);}
}).listen(3067,'127.0.0.1',()=>console.log('Sampler checks: http://127.0.0.1:3067/'));
