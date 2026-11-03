import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const page = read('app/page.tsx');

test('black backgrounds and custom colors remain selectable covers', () => {
  const source = page.slice(page.indexOf('  const usedCoverColors ='), page.indexOf('  const publishSetupHasCover ='));
  for (const color of ['#000000', '#050505']) {
    const context = { blocks: [{ type: 'text', backgroundColor: color, textColor: '#FFFFFF' }],
      customCoverColors: [color], customCoverSrc: null, visualCoverBlocks: [], DEFAULT_BACKGROUND: '#000000',
      randomFallbackCoverColors: () => ['#2147D9'] };
    const choices = runInNewContext(transpile(`${source}\ncoverChoices;`), context);
    assert.equal(choices.filter(choice => choice.kind === 'color').length, 1);
    assert.equal(choices.find(choice => choice.kind === 'color').color, color);
  }
  assert.match(page, /backgroundOptions=\{BACKGROUND_COLORS\}/);
  assert.doesNotMatch(page, /nonBlackCoverColors|can.t handle pure black covers/);
});

test('confirming black closes the picker and selects the cover without a warning', () => {
  const source = page.slice(page.indexOf('  const confirmCoverColor ='), page.indexOf('  const selectCoverAt ='));
  for (const color of ['#000000', '#050505']) {
    const changes = {};
    runInNewContext(transpile(`${source}\nconfirmCoverColor();`), {
      pendingCoverColor: color, setCustomCoverColors: update => { changes.colors = update([]); },
      setSelectedCover: key => { changes.selected = key; }, setActiveCoverKey: key => { changes.active = key; },
      setCoverStackStarted: value => { changes.started = value; }, setCoverColorPickerOpen: value => { changes.open = value; },
      setNotice: () => assert.fail('Black is a valid cover color'),
    });
    assert.equal(changes.colors[0], color);
    assert.equal(changes.selected, `color:${color}`);
    assert.equal(changes.active, changes.selected);
    assert.equal(changes.started, true);
    assert.equal(changes.open, false);
  }
});

function publishApi() {
  const writes = [], exports = {};
  const imports = {
    'cloudflare:workers': { env: { DB: { prepare: sql => ({ bind: (...values) => ({
      first: async () => null, run: async () => { writes.push({ sql, values }); },
    }) }) }, STRIP_MEDIA: {} } },
    '@/app/server/auth': { isSameOrigin: () => true, requireAuthUser: async () => ({ user: { id: 'test-owner', username: 'test' } }) },
    '@/app/lib/strip-ending': { writeStripContent: (blocks, endingStyle) => JSON.stringify({ blocks, endingStyle }), readStripContent: JSON.parse },
    '@/app/lib/profile': { publishedProfileTheme: () => ({}) },
  };
  for (const path of ['text-textures', 'text-sticker', 'sticker-origin', 'sticker-rotation', 'sticker-sizing', 'text-alignment', 'published-media']) imports[`@/app/lib/${path}`] = {};
  imports['@/app/server/media-security'] = {};
  runInNewContext(transpile(read('app/api/strips/route.ts')), { exports, Response, URL,
    require: name => { assert(name in imports, `Unexpected import ${name}`); return imports[name]; } });
  return { api: exports, writes };
}

test('publishing accepts pure black, shorthand black, and near black without changing the color', async () => {
  for (const color of ['#000000', '#000', ' #000000 ', '#050505']) {
    const { api, writes } = publishApi();
    const response = await api.POST(new Request('https://strip.local/api/strips', { method: 'POST',
      body: JSON.stringify({ id: 'black-cover-test', cover: { kind: 'color', color, shape: 'square' }, blocks: [] }),
    }));
    assert.equal(response.status, 201);
    const expected = color.trim() === '#000' ? '#000000' : color.trim();
    assert.equal((await response.json()).strip.cover.color, expected);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].values[4], expected);
  }
});

test('publishing still rejects an empty cover color', async () => {
  const { api, writes } = publishApi();
  const response = await api.POST(new Request('https://strip.local/api/strips', { method: 'POST',
    body: JSON.stringify({ id: 'black-cover-test', cover: { kind: 'color', color: ' ', shape: 'square' }, blocks: [] }),
  }));
  assert.equal(response.status, 400);
  assert.equal(writes.length, 0);
});
