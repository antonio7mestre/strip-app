import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { TEXT_TEXTURES, normalizeTextTexture, textureCoverRect, textureControlsGeometry, textBackgroundChange } from '../app/lib/text-textures.ts';

test('all 25 choices have optimized full images and square thumbnails', () => {
  assert.equal(TEXT_TEXTURES.length,25);
  assert.equal(new Set(TEXT_TEXTURES.map(t=>t.id)).size,25);
  let bytes=0;
  for (const t of TEXT_TEXTURES) {
    assert.equal(normalizeTextTexture(t.id),t.id);
    assert(['#000000','#FFFFFF'].includes(t.checkColor));
    assert(statSync(new URL(`../public${t.src}`,import.meta.url)).size>0);
    bytes+=statSync(new URL(`../public${t.thumbnail}`,import.meta.url)).size;
  }
  assert(bytes<300000);
  for (const id of [undefined,null,1,{},'../../../secret','https://example.com/image.png']) assert.equal(normalizeTextTexture(id),undefined);
});
test('texture loading becomes a centered contrast check without a selected ring', () => {
  const picker=readFileSync(new URL('../app/components/TexturePicker.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/components/TexturePicker.module.css',import.meta.url),'utf8');
  assert.match(picker,/color: texture\.checkColor/);
  assert.match(picker,/LoaderCircle className=\{`\$\{styles\.loading\}/);
  assert.match(picker,/selected === texture.id && pending !== texture.id \? styles.visible/);
  assert.match(picker,/aria-label="Done choosing textures" onClick=\{onDone\} disabled=\{Boolean\(pending\)\}/);
  assert.match(css,/\.check \{[^}]*inset: 0;[^}]*place-items: center;/);
  assert.match(css,/\.check svg \{[^}]*grid-area: 1 \/ 1/);
  assert.doesNotMatch(css,/\.option\[aria-pressed/);
  assert.match(css,/\.none\[aria-pressed=true\] \{ outline: 3px solid #000/);
  assert.match(picker,/aria-label="No texture"[\s\S]*?onClick=\{\(\) => void choose\(\)\}><Slash/);
  assert.equal(TEXT_TEXTURES.find(t=>t.id==='01-blonde-plywood').checkColor,'#000000');
  assert.equal(TEXT_TEXTURES.find(t=>t.id==='03-dark-walnut').checkColor,'#FFFFFF');
});
test('texture tray paints in the document and Done closes the entire color picker', () => {
  const picker=readFileSync(new URL('../app/components/TexturePicker.tsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(picker,/showModal\(|<dialog|node.close\(/);
  assert.match(picker,/role="dialog" aria-modal="true"/);
  assert.match(picker,/installStickerPickerDismiss\(\(\) => \[tray.current\]/);
  assert.match(picker,/installStickerTrayScroll\(\(\) => null, \(\) => \[row.current\]\)/);
  assert.match(picker,/if \(keyboard && origin\?/);
  assert.match(page,/const finishStyleSelection = \(\) => \{\s*setTextureOpen\(false\)/);
  assert.match(page,/onClose=\{\(\) => setTextureOpen\(false\)\} onDone=\{finishStyleSelection\}/);
});
test('unselected, preview, and published textures reserve the same toolbar image tail', () => {
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const rule=css.match(/\.text-block-texture\s*\{([^}]+)\}/)[1];
  assert.match(rule,/--texture-image-tail: var\(--texture-controls-extension, 55px\)/);
  assert.match(rule,/height: calc\(100% \+ var\(--texture-image-tail\)\)/);
  assert.match(rule,/clip-path: inset\(0 0 var\(--texture-image-tail\)\)/);
});
test('all color circle selections use checks instead of a selection outline', () => {
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const rule=css.match(/\.color-swatch-option\.is-selected\s*\{([^}]+)\}/)[1];
  assert.match(rule,/box-shadow: none/);
  assert.match(rule,/border-color: transparent/);
  const onboarding=readFileSync(new URL('../app/components/OnboardingBackground.tsx',import.meta.url),'utf8');
  assert.match(onboarding,/color: profileInk\(swatch.value\)/);
  assert.match(onboarding,/color.toUpperCase\(\) === swatch.value \? <Check/);
});
test('texture fills width, then zooms for tall blocks without changing aspect', () => {
  for (const [sw,sh] of [[1280,1280],[1600,900],[900,1600]]) for (const height of [54,300,1400]) {
    const crop=textureCoverRect(sw,sh,393,height);
    assert.equal(crop.y,0);
    assert(Math.abs(crop.width/crop.height-393/height)<1e-9);
    assert(crop.x>=0&&crop.y>=0&&crop.width<=sw+1e-9&&crop.height<=sh+1e-9);
    assert(Math.abs(crop.width-sw)<1e-9||Math.abs(crop.height-sh)<1e-9);
  }
});
test('changing a solid background removes texture, text styling preserves it', () => {
  assert.deepEqual(textBackgroundChange({backgroundColor:'#ff0000'}),{backgroundColor:'#ff0000',backgroundTexture:undefined});
  assert.deepEqual(textBackgroundChange({textColor:'#fff'}),{textColor:'#fff'});
  assert.deepEqual(textBackgroundChange({backgroundTexture:'17-indigo-denim'}),{backgroundTexture:'17-indigo-denim'});
});
test('texture toolbar continues the exact cover transform and samples the visible controls region', () => {
  for (const [sw,sh] of [[1280,1280],[1600,900],[900,1600]]) for (const height of [60,300,1400]) {
    const geometry = textureControlsGeometry(sw,sh,393,height,336,56);
    const crop = textureCoverRect(sw,sh,393,height+55);
    const scale = 393/crop.width;
    assert.equal(geometry.extension,55);
    assert.equal(geometry.backgroundSize,`${sw*scale}px ${sh*scale}px`);
    assert.equal(geometry.backgroundPosition,`${(336-sw*scale)/2}px ${1-height}px`);
    assert(Math.abs(geometry.source.y*scale-(height-1))<1e-9);
    assert(Math.abs(geometry.source.width*scale-336)<1e-9);
    assert(geometry.source.x>=0 && geometry.source.y>=0);
    assert(geometry.source.y+geometry.source.height<=sh+1e-9);
  }
});
for (const [route,name,args] of [['drafts','prepareDraftBlocks',['owner','draft']],['strips','prepareContentBlocks',['owner','strip',null]]]) {
  test(`${route} storage preserves allowlisted textures and rejects arbitrary paths`, () => {
    const source=readFileSync(new URL(`../app/api/${route}/route.ts`,import.meta.url),'utf8');
    const start=source.indexOf(`function ${name}(`);
    const end=source.indexOf('\nfunction ',start+1);
    const exports={};
    const snippet=source.slice(start,end>0?end:source.indexOf('\nexport ',start+1));
    runInNewContext(ts.transpileModule(`${snippet}\nexports.prepare=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
      {exports,MAX_BLOCKS:1000,ID_PATTERN:/^[a-z-]+$/,finiteNumber:(n,f)=>Number.isFinite(n)?n:f,normalizeTextTexture,normalizeTextAlignment:v=>v??'left'});
    for (const id of ['17-indigo-denim','https://example.com/not-allowed.png',undefined]) {
      const result=exports.prepare(...args,[{id:'text',type:'text',content:'Hello',backgroundTexture:id}]);
      assert.equal(result.storedBlocks[0].backgroundTexture,normalizeTextTexture(id));
      assert.equal(result.storedBlocks[0].content,'Hello');
    }
  });
}
