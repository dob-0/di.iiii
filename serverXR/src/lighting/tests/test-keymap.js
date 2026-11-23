'use strict';
/* global document, location, deskKeymap, bankView, page, keyLearnTarget, sceneHotkeys, unbindDeskKey, setBankView, bindDeskKey -- the page's globals, inside page.evaluate() */
// Keyboard mappings (the ⌨ panel): open it, press a control, press a key, and from then on
// the key IS that control — on the server, not just on screen. Real mouse and key presses
// through the repo's playwright with the installed Chrome (no browser download). Ported from
// the studio desk's test-keymap.js, plus the di-only parts: the Touch tab row, the ask bar
// on New, the refused keys, a real Export download and Import upload.
//
// NOT in the default vitest run (it needs a browser and a desk with scenes and containers).
// It moves FX, the active scene and Next scene, so point it only at a THROWAWAY OFFLINE desk:
//
//   cd serverXR/src/lighting
//   DATA_DIR=<a copy of a show> PORT=4604 HOST=127.0.0.1 ARTNET_OFFLINE=1 ARTNET_BIND_PORT=0 node standalone.js
//   DESK_URL=http://127.0.0.1:4604 node tests/test-keymap.js        (from the repo root: playwright lives there)
//   SHOT=path/keys-di.png adds a screenshot of the panel open in learn mode at the end.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '../../../..')] }));

const BASE = (process.env.DESK_URL || process.argv[2] || '').replace(/\/$/, '');
if (!BASE) { console.error('Set DESK_URL to a throwaway offline desk, e.g. DESK_URL=http://127.0.0.1:4604'); process.exit(2); }

let fails = 0;
const ok = (name, cond, extra) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra !== undefined ? '   [' + extra + ']' : ''}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async () => (await fetch(BASE + '/api/state')).json();

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1646, height: 1000 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const js = (fn, arg) => pg.evaluate(fn, arg);
  const strip = () => js(() => { const s = document.querySelector('#statusStrip'); return s.hidden ? '' : s.textContent; });
  const press = async (k) => { await pg.keyboard.press(k); await sleep(250); };
  const click = async (sel) => { const el = pg.locator(sel).filter({ visible: true }).first(); await el.scrollIntoViewIfNeeded(); await sleep(100); await el.click(); await sleep(200); };

  await pg.goto(BASE + '/#control');
  await pg.waitForSelector('#bankList .bankrow', { timeout: 15000 });
  await js(() => { localStorage.removeItem('deskKeymap'); localStorage.removeItem('sceneHotkeys'); localStorage.removeItem('keyPanelPos'); });
  await pg.reload();
  await pg.waitForSelector('#bankList .bankrow', { timeout: 15000 });
  await sleep(800);
  await js(() => [...document.querySelectorAll('.pane-head.foldable.folded, .foldsec.folded > .pane-head')].forEach((h) => h.click()));   // the rail's FX section folds by default
  await sleep(300);
  const fxModes = (await state()).fxModes.filter((m) => m !== 'none');
  const [fxA, fxB] = fxModes;
  await js(() => document.querySelector('.fxpad[data-fx="none"]').click());   // FX off first, so a pad that fires would show
  await sleep(500);

  console.log('the panel');
  await click('#keysBtn');
  ok('the keys button opens the panel', await js(() => !document.querySelector('#keyPanel').hidden));
  ok('the desk is in learn mode', await js(() => document.body.classList.contains('keylearn')));
  ok('...and says what to do', /click any button/i.test(await js(() => document.querySelector('#keyHint').textContent)));
  ok('the list starts empty', /nothing mapped/i.test(await js(() => document.querySelector('#keyList').textContent)));

  console.log('an FX pad');
  const fx0 = (await state()).fx.mode;
  await click(`.fxpad[data-fx="${fxA}"]`);
  ok('pressing a pad in learn mode does NOT fire it', (await state()).fx.mode === fx0, `fx ${(await state()).fx.mode}`);
  const learnText = await js(() => document.querySelector('#keyLearn').textContent);
  ok('...it becomes the thing to bind', /^Press a key for FX · /.test(learnText), learnText);
  ok('...and wears the pick outline', await js((m) => document.querySelector(`.fxpad[data-fx="${m}"]`).classList.contains('keypick'), fxA));
  await press('s');
  ok('pressing S binds it', await js((m) => deskKeymap.s && deskKeymap.s.kind === 'fx' && deskKeymap.s.id === m, fxA), await js(() => JSON.stringify(deskKeymap.s)));
  ok('...and the desk says so', /^S now fires FX · /.test(await strip()), await strip());
  ok('...and the pad wears its key badge', (await js((m) => (document.querySelector(`.fxpad[data-fx="${m}"] .kbadge`) || {}).textContent, fxA)) === 'S');
  ok('...and the badge does not leak into the label', !/S$/.test(await js(() => deskKeymap.s.label)), await js(() => deskKeymap.s.label));
  ok('...and it is stored for a reload', JSON.parse(await js(() => localStorage.getItem('deskKeymap'))).s.id === fxA);

  console.log('a top-bar button, a container tab, the Stage page tab');
  await click('#goBtn');
  await press('g');
  ok('Next scene is bound to G', await js(() => deskKeymap.g && deskKeymap.g.kind === 'btn' && deskKeymap.g.id === 'goBtn'), await js(() => JSON.stringify(deskKeymap.g)));
  const tabId = await js(() => { const t = [...document.querySelectorAll('#bankTabs .btab[data-bank]:not(.add)')]; return t[t.length - 1].dataset.bank; });
  await click(`#bankTabs .btab[data-bank="${tabId}"]`);
  await press('c');
  ok('a container tab is bound to C', await js((id) => deskKeymap.c && deskKeymap.c.kind === 'bank' && deskKeymap.c.id === id, tabId), await js(() => JSON.stringify(deskKeymap.c)));
  ok('...pressing it in learn mode did not switch container', await js((id) => bankView !== id, tabId), await js(() => bankView));
  await click('.page-tab[data-page="stage"]');
  await press('v');
  ok('the Stage page tab is bound to V', await js(() => deskKeymap.v && deskKeymap.v.kind === 'page' && deskKeymap.v.id === 'stage'), await js(() => JSON.stringify(deskKeymap.v)));
  ok('...and learning it did not leave Control', (await js(() => page)) === 'control');
  await click('#tapBtn');
  await press('t');
  ok('Tap is bound to T', await js(() => deskKeymap.t && deskKeymap.t.id === 'tapBtn'));

  console.log('a scene tile, through the same panel into the scene keys');
  const active0 = (await state()).activeScene;
  await click('#bankList .bankrow');
  const sceneName = await js(() => keyLearnTarget && keyLearnTarget.id);
  ok('pressing a tile in learn mode does NOT recall it', (await state()).activeScene === active0);
  await press('q');
  ok('a scene tile binds by NAME into sceneHotkeys', (await js(() => sceneHotkeys.q)) === sceneName, `${await js(() => sceneHotkeys.q)} = ${sceneName}`);
  ok('...and its tile shows the key badge', (await js(() => (document.querySelector('#bankList .bankrow .hk') || {}).textContent)) === 'Q');

  console.log('a key can only mean one thing; refused keys');
  await click(`.fxpad[data-fx="${fxB}"]`);
  await press('s');
  ok('binding S to another pad takes it from the first', await js(([a, b]) => deskKeymap.s.id === b && !Object.values(deskKeymap).some((m) => m.id === a && m.kind === 'fx'), [fxA, fxB]), await js(() => JSON.stringify(deskKeymap.s)));
  ok('...and says where it came from', /taken from FX · /.test(await strip()), await strip());
  await click(`.fxpad[data-fx="${fxA}"]`);
  await press('b');
  const bo0 = (await state()).blackout;
  ok('B is refused and does not blackout while learning', await js(() => !deskKeymap.b && !sceneHotkeys.b) && /blackout key/i.test(await strip()) && !bo0, await strip());
  await press('F2');
  ok('F2 is refused (it renames a stage label)', await js(() => !deskKeymap.f2) && /F2/.test(await strip()), await strip());
  await press('Space'); await press('ArrowLeft'); await press('Tab'); await press('Enter');
  ok('Space, arrows, Tab, Enter do not bind', await js(() => Object.keys(deskKeymap).sort().join(',')) === 'c,g,s,t,v', await js(() => Object.keys(deskKeymap).sort().join(',')));
  await press('Escape');
  ok('Esc drops the pick', await js(() => keyLearnTarget === null));
  await click('#topBlackout');
  ok('the Blackout button is not mappable', await js(() => keyLearnTarget === null) && /only ever turns blackout on/.test(await strip()), await strip());
  ok('...and pressing it in learn mode did not blackout', !(await state()).blackout);
  await click('#bankList .bankrow:nth-child(2)');
  await press('1');
  ok('a digit may be bound (it outranks the digit row, as a scene key already does)', await js(() => sceneHotkeys['1'] === keyLearnTarget || !!sceneHotkeys['1']));
  await js(() => unbindDeskKey('1'));

  console.log('closing, then the keys FIRE');
  await press('Escape');
  ok('Esc closes the panel', await js(() => document.querySelector('#keyPanel').hidden && !document.body.classList.contains('keylearn')));
  ok('...and the badges go with it', (await js(() => document.querySelectorAll('.kbadge').length)) === 0);
  await press('s');
  await sleep(500);
  ok('S puts the FX engine in the mapped mode, on the server', (await state()).fx.mode === fxB, `fx ${(await state()).fx.mode}`);
  await press('q');
  await sleep(500);
  const stQ = await state();
  const activeQ = stQ.scenes.find((s) => s.id === stQ.activeScene);
  ok('Q recalls the scene', !!activeQ && activeQ.name === sceneName, `active "${activeQ && activeQ.name}"`);
  await press('g');
  await sleep(500);
  const stG = await state();
  ok('G presses Next scene: the active scene moves on', stG.activeScene !== stQ.activeScene, `${stQ.activeScene} -> ${stG.activeScene}`);
  await js(() => setBankView('unfiled')); await sleep(200);
  await press('c');
  ok('C opens the container', await js(() => bankView === deskKeymap.c.id), await js(() => bankView));
  await press('t');
  ok('T taps (no error, the desk keeps running)', errors.length === 0);
  await press('v');
  ok('V opens the Stage page', (await js(() => page)) === 'stage' && await js(() => document.querySelector('main.page.is-active').dataset.page) === 'stage');
  await fetch(BASE + '/api/fx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'none', all: true }) });
  await sleep(300);
  await press('s');
  await sleep(400);
  ok('...and a key still fires from the hidden Control page', (await state()).fx.mode === fxB);
  await js(() => { location.hash = 'control'; });
  await sleep(400);
  const stHeld = await state();
  ok('a held key fires once, not on every auto-repeat', await (async () => {
    const before = (await state()).activeScene;
    await pg.keyboard.down('g'); await pg.keyboard.down('g'); await pg.keyboard.down('g'); await pg.keyboard.up('g');
    await sleep(500);
    const st = await state();
    const ids = st.scenes.map((s) => s.id);
    return ids.indexOf(st.activeScene) - ids.indexOf(before) === 1 || st.activeScene !== before;
  })(), 'moved ' + stHeld.activeScene);
  ok('B still blacks out, one way (real press)', await (async () => { await press('b'); await sleep(400); const a = (await state()).blackout; await press('b'); await sleep(400); const b = (await state()).blackout; return a === true && b === true; })());
  await fetch(BASE + '/api/master', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blackout: false }) });

  console.log('the Touch page tab row');
  await click('.page-tab[data-page="touch"]');
  await click('#keysBtn');
  const tt = await js(() => { const t = document.querySelector('#tBankTabs .btab[data-tab]'); return t ? t.dataset.tab : null; });
  ok('Touch has container tabs to map', !!tt);
  if (tt) {
    await click(`#tBankTabs .btab[data-tab="${tt}"]`);
    await press('y');
    ok('a Touch container tab is bound (kind tbank)', await js((id) => deskKeymap.y && deskKeymap.y.kind === 'tbank' && deskKeymap.y.id === id, tt), await js(() => JSON.stringify(deskKeymap.y)));
  }
  await press('Escape');
  await click('.page-tab[data-page="control"]');

  console.log('typing keeps its letters');
  const fxBefore = (await state()).fx.mode, actBefore = (await state()).activeScene;
  await click('#sceneFilter');
  await pg.keyboard.type('sq');
  await sleep(300);
  ok('S and Q typed into the filter are letters, not mappings', (await js(() => document.querySelector('#sceneFilter').value)) === 'sq' && (await state()).fx.mode === fxBefore && (await state()).activeScene === actBefore, await js(() => document.querySelector('#sceneFilter').value) + ' / fx ' + (await state()).fx.mode);
  await js(() => { document.querySelector('#sceneFilterClear').click(); });

  console.log('the panel moves and remembers');
  await click('#keysBtn');
  const head = await pg.locator('.keyhead h2').boundingBox();
  await pg.mouse.move(head.x + 20, head.y + 8);
  await pg.mouse.down();
  await pg.mouse.move(head.x + 320, head.y - 200, { steps: 6 });
  await pg.mouse.up();
  await sleep(200);
  const moved = await pg.locator('#keyPanel').boundingBox();
  ok('dragging the head moves the panel', Math.abs(moved.x - (head.x + 300 - 12)) < 80 || moved.x > 200, `x ${Math.round(moved.x)} y ${Math.round(moved.y)}`);
  ok('...and keeps the position', !!(await js(() => localStorage.getItem('keyPanelPos'))));
  await pg.reload();
  await pg.waitForSelector('#bankList .bankrow');
  await click('#keysBtn');
  const again = await pg.locator('#keyPanel').boundingBox();
  ok('a reload brings it back where it was', Math.abs(again.x - moved.x) < 2 && Math.abs(again.y - moved.y) < 2, `${Math.round(again.x)},${Math.round(again.y)} vs ${Math.round(moved.x)},${Math.round(moved.y)}`);
  await pg.locator('.keyhead h2').dblclick();
  await sleep(200);
  const docked = await pg.locator('#keyPanel').boundingBox();
  ok('double-click on the head docks it bottom-left', docked.x < 12 && !(await js(() => localStorage.getItem('keyPanelPos'))), `${Math.round(docked.x)},${Math.round(docked.y)}`);

  console.log('presets');
  const dl = pg.waitForEvent('download');
  await click('#keyExport');
  const download = await dl;
  const file = path.join(os.tmpdir(), 'di-keymap-' + Date.now() + '.json');
  await download.saveAs(file);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('Export carries both stores in one file', j.desk === 'artnet-controller' && j.map.s && j.scenes.q, Object.keys(j.map).join(',') + ' | ' + Object.keys(j.scenes).join(','));
  const total = Object.keys(j.map).length + Object.keys(j.scenes).length;
  await click('#keyNew');
  ok('New asks first, in the ask bar', await js(() => !!document.querySelector('#deskAsk')) && Object.keys(await js(() => deskKeymap)).length > 0);
  await click('#deskAsk .deskask-no');
  ok('...Cancel keeps every mapping', Object.keys(await js(() => deskKeymap)).length > 0 && await js(() => !document.querySelector('#deskAsk')));
  await click('#keyNew');
  await sleep(450);
  await pg.locator('#deskAsk .deskask-yes').click();
  await sleep(300);
  ok('...and the second answer clears everything', await js(() => Object.keys(deskKeymap).length === 0 && Object.keys(sceneHotkeys).length === 0));
  await pg.setInputFiles('#keyImportFile', file);
  await sleep(500);
  ok('Import brings them all back', await js(() => Object.keys(deskKeymap).length + Object.keys(sceneHotkeys).length) === total && (await js(() => sceneHotkeys.q)) === sceneName, (await strip()));
  await pg.setInputFiles('#keyImportFile', { name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await sleep(500);
  ok('Import refuses a file that is not ours, and changes nothing', /not a keyboard-mappings file/.test(await strip()) && await js(() => Object.keys(deskKeymap).length + Object.keys(sceneHotkeys).length) === total, await strip());
  await pg.setInputFiles('#keyImportFile', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await sleep(500);
  ok('...nor a file that is not JSON', /Import failed/.test(await strip()), await strip());

  if (process.env.SHOT) {
    await js(() => bindDeskKey('p', { kind: 'btn', id: 'saveNow', label: 'Save scene' }));
    await click('.fxpad[data-fx]:not([data-fx="none"])');
    await sleep(400);
    await pg.screenshot({ path: process.env.SHOT });
    console.log('  shot ' + process.env.SHOT);
  }

  ok('no page errors during the run', errors.length === 0, errors.join(' | '));
  console.log(fails ? `\n${fails} failing` : '\nall passing');
  await browser.close();
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
