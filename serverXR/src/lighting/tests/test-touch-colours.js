'use strict';
// Touch colours (ui/colour.js): the colour of a lamp from the output frame, the strip on a look tile,
// the dots of the live stage; and that the page wires them in. Plain node:
//   node tests/test-touch-colours.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../ui/colour');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

const MIX = { w: [0.92, 0.92, 0.92], a: [0.95, 0.62, 0.1] };
const mixOf = (r) => MIX[r] || [0.8, 0.8, 0.8];
const colourOf = (chans, v) => C.colourOfValues(chans, v, ['r', 'g', 'b', 'w', 'a'], mixOf);
const profiles = {
  RGB: { channels: ['dimmer', 'r', 'g', 'b'] },
  Dim: { channels: ['dimmer'] },
  WC: { channels: ['warm', 'cool', 'dimmer'] },
};
const fixtures = [
  { id: 'a', name: 'A', profile: 'RGB', universe: 0, address: 1, x: 0.1, y: 0.2 },
  { id: 'b', name: 'B', profile: 'RGB', universe: 0, address: 5, x: 0.9, y: 0.2 },
  { id: 'c', name: 'C', profile: 'Dim', universe: 1, address: 1, x: 0.5, y: 0.8 },
];
// universe 0: A red full, B blue half (dimmer 128); universe 1: C dimmer 0 (dark)
const frame = { 0: [255, 255, 0, 0, 128, 0, 0, 255], 1: [0] };

check('colourOfValues: RGB channels, dimmer scales, a dimmer-only lamp is white', () => {
  const red = colourOf(profiles.RGB.channels, { dimmer: 255, r: 255, g: 0, b: 0 });
  assert.deepStrictEqual([red.r, red.g, red.b], [255, 0, 0]);
  assert.strictEqual(red.level, 1);
  const half = colourOf(profiles.RGB.channels, { dimmer: 128, r: 0, g: 0, b: 255 });
  assert.ok(Math.abs(half.b - 128) < 0.01 && Math.abs(half.level - 128 / 255) < 1e-9);
  const white = colourOf(profiles.Dim.channels, { dimmer: 255 });
  assert.deepStrictEqual([white.r, white.g, white.b], [255, 255, 255]);
  assert.strictEqual(colourOf(profiles.Dim.channels, { dimmer: 0 }).level, 0);
});

check('colourOfValues: warm/cool mix and a secondary emitter add to the base colour', () => {
  const warm = colourOf(profiles.WC.channels, { warm: 255, cool: 0, dimmer: 255 });
  assert.ok(warm.r > warm.b, 'warm is redder than blue');
  const amber = colourOf(['dimmer', 'r', 'g', 'b', 'a'], { dimmer: 255, r: 0, g: 0, b: 0, a: 200 });
  assert.ok(amber.r > amber.g && amber.g > amber.b && amber.b === 0 + amber.b);
});

check('frameValues reads dmx[universe][address-1 + channel index]', () => {
  assert.deepStrictEqual(C.frameValues(fixtures[1], profiles.RGB.channels, frame), { dimmer: 128, r: 0, g: 0, b: 255 });
  assert.deepStrictEqual(C.frameValues(fixtures[0], profiles.RGB.channels, {}), { dimmer: 0, r: 0, g: 0, b: 0 }, 'no frame yet reads dark, not an error');
});

check('stageDots: colour comes from the output frame; a dark lamp is not lit; places fit the box', () => {
  const dots = C.stageDots(fixtures, profiles, colourOf, frame);
  assert.strictEqual(dots.length, 3);
  assert.strictEqual(dots[0].css, 'rgb(255,0,0)');
  assert.strictEqual(dots[1].css, 'rgb(0,0,128)');
  assert.strictEqual(dots[2].lit, false);
  assert.strictEqual(dots[2].css, '');
  for (const d of dots) assert.ok([d.x, d.y].every((v) => v >= C.PAD - 1e-9 && v <= 1 - C.PAD + 1e-9), `${d.id} inside`);
  assert.ok(dots[0].x < dots[2].x && dots[2].x < dots[1].x, 'left to right as on the stage');
  // the same lamps one second later, red switched off: the dot follows the frame
  const later = C.stageDots(fixtures, profiles, colourOf, { 0: [0, 255, 0, 0, 128, 0, 0, 255], 1: [0] });
  assert.strictEqual(later[0].lit, false);
});

check('stageDots: one lamp sits in the middle; far-off lamps are fitted, not clamped on top of each other', () => {
  const one = C.stageDots([{ ...fixtures[0], x: 500, y: -300 }], profiles, colourOf, frame);
  assert.deepStrictEqual([one[0].x, one[0].y], [0.5, 0.5]);
  const far = C.stageDots([{ ...fixtures[0], x: 400, y: 0 }, { ...fixtures[1], x: 900, y: 0 }], profiles, colourOf, frame);
  assert.ok(far[0].x !== far[1].x);
});

const look = (values) => ({ id: 'L', name: 'L', steps: [{ values }] });

check('lookColours: lit lamps of the look, in rig order; dark, unpatched and unnamed lamps are left out', () => {
  const l = look({ a: { dimmer: 255, r: 255, g: 0, b: 0 }, b: { dimmer: 255, r: 0, g: 0, b: 255 }, c: { dimmer: 0 }, ghost: { dimmer: 255 } });
  const cs = C.lookColours(l, fixtures, profiles, colourOf, null);
  assert.deepStrictEqual(cs.map(C.rgbCss), ['rgb(255,0,0)', 'rgb(0,0,255)']);
  assert.deepStrictEqual(C.lookColours(look({}), fixtures, profiles, colourOf, null), []);
  assert.deepStrictEqual(C.lookColours({ id: 'x', name: 'no steps' }, fixtures, profiles, colourOf, null), []);
});

check('lookColours: the playing look reads the output frame, not its stored values', () => {
  const l = look({ a: { dimmer: 255, r: 0, g: 255, b: 0 } });   // stored: green
  assert.deepStrictEqual(C.lookColours(l, fixtures, profiles, colourOf, null).map(C.rgbCss), ['rgb(0,255,0)']);
  const live = C.lookColours(l, fixtures, profiles, colourOf, frame);   // the frame says what the rig does
  assert.ok(live.map(C.rgbCss).includes('rgb(255,0,0)'));
});

check('lookColours: neighbours of one colour are one band; more than ' + 8 + ' bands are cut evenly', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, name: 'm' + i, profile: 'RGB', universe: 0, address: 1, x: i, y: 0 }));
  const same = look(Object.fromEntries(many.map((f) => [f.id, { dimmer: 255, r: 200, g: 0, b: 0 }])));
  assert.strictEqual(C.lookColours(same, many, profiles, colourOf, null).length, 1);
  const wide = Array.from({ length: 30 }, (_, i) => ({ id: 'w' + i, name: 'w' + i, profile: 'RGB', universe: 0, address: 1, x: i, y: 0 }));
  const rainbow = look(Object.fromEntries(wide.map((f, i) => [f.id, { dimmer: 255, r: (i * 8) % 256, g: 255 - (i * 8) % 256, b: 0 }])));
  assert.strictEqual(C.lookColours(rainbow, wide, profiles, colourOf, null).length, C.MAX_SEGMENTS);
});

check('stripCss: equal hard bands; no colours, no strip', () => {
  assert.strictEqual(C.stripCss([]), '');
  const css = C.stripCss([{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }]);
  assert.strictEqual(css, 'linear-gradient(90deg, rgb(255,0,0) 0.00% 50.00%, rgb(0,0,255) 50.00% 100.00%)');
});

check('the page wires it in: script tag, Touch stage and strip, painted from the DMX stream', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8');
  const html = ui('index.html'), app = ui('app.js'), css = ui('style.css');
  assert.ok(html.indexOf('<script src="colour.js">') > 0 && html.indexOf('colour.js') < html.indexOf('<script src="app.js">'), 'colour.js loads before app.js');
  assert.ok(html.includes('id="tStage"') && html.includes('id="tStageBox"'));
  assert.ok(app.includes('class="tstrip"') && /function paintDmx[\s\S]{0,120}paintTouchColours\(\)/.test(app), 'stream frames repaint the Touch colours');
  assert.ok(css.includes('.tstrip') && css.includes('.tdot'));
  assert.ok(!/(post|fetch)\([^)]*\)/.test(ui('colour.js')), 'colour.js is view only: it sends nothing');
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok  ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log(`\ntouch-colours: ${tests.length - failures}/${tests.length} passed`);
  process.exit(failures ? 1 : 0);
})();
