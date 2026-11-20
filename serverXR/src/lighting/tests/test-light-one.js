'use strict';
// The light desk's set player, speed fader and K2 preset (PR #1327 review findings). app.js is a
// browser file, so the pure pieces are sliced out of its source and run here, as test-tap.js does.
// Run with: node test-light-one.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const js = fs.readFileSync(path.join(__dirname, '../ui/app.js'), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const slice = (re, what) => { const m = js.match(re); if (!m) throw new Error('app.js has no ' + what); return m[0]; };

const sets = slice(/function setLiveIds\(st, scenes\) \{[\s\S]*?\nfunction setPlayBody[\s\S]*?\n\}\n/, 'set player helpers');
const { setLiveIds, setIsRunning, setPlayBody } = new Function(sets + '\nreturn { setLiveIds, setIsRunning, setPlayBody };')();
const tempo = slice(/const clampBpm = [\s\S]*?\nfunction makeTrailing[\s\S]*?\n\}\n/, 'tempo helpers');
const { clampBpm, tempoStep, makeTrailing } = new Function(tempo + '\nreturn { clampBpm, tempoStep, makeTrailing };')();

const scenes = [{ id: 'A' }, { id: 'C' }];                       // B was deleted
const set = { name: 'S', sceneIds: ['A', 'B', 'C'] };

check('a set holding a deleted scene still reads as running once the chase holds the live ids', () => {
  assert.deepStrictEqual(setLiveIds(set, scenes), ['A', 'C']);
  assert.strictEqual(setIsRunning({ enabled: true, sceneIds: ['A', 'C'] }, set, scenes), true);
});
check('a different or stopped chase is not "running"', () => {
  assert.strictEqual(setIsRunning({ enabled: false, sceneIds: ['A', 'C'] }, set, scenes), false);
  assert.strictEqual(setIsRunning({ enabled: true, sceneIds: ['C', 'A'] }, set, scenes), false);
  assert.strictEqual(setIsRunning({ enabled: true, sceneIds: [] }, { sceneIds: ['B'] }, scenes), false);
});
check('Play posts live ids, the sliders, clock sync and enabled (so Hold is not ignored)', () => {
  assert.deepStrictEqual(setPlayBody(set, scenes, 800, 200),
    { sceneIds: ['A', 'C'], holdMs: 800, fadeMs: 200, sync: 'clock', enabled: true });
});

check('speed: bpm clamps to 20-300; half/double read the shown value and compound', () => {
  assert.strictEqual(clampBpm(5), 20);
  assert.strictEqual(clampBpm(999), 300);
  assert.strictEqual(tempoStep('60', 2), 120);
  assert.strictEqual(tempoStep('120', 2), 240);
  assert.strictEqual(tempoStep('250', 2), 300);
  assert.strictEqual(tempoStep('25', 0.5), 20);
});
check('speed: a 200-event drag in 1 s posts a handful of times and ends on the last value', () => {
  let t = 0; const timers = []; const sent = [];
  const send = makeTrailing((v) => sent.push(v), 80, () => t, (fn, ms) => { timers.push({ at: t + ms, fn }); return timers.length; });
  const run = (until) => { for (;;) { const i = timers.findIndex((x) => x.at <= until); if (i < 0) break; const [x] = timers.splice(i, 1); t = x.at; x.fn(); } };
  for (let i = 0; i < 200; i++) { t = i * 5; run(t); send(100 + i); }
  run(t + 1000);
  assert.ok(sent.length <= 14, 'posts: ' + sent.length);
  assert.strictEqual(sent[sent.length - 1], 299);
  assert.strictEqual(sent[0], 100);
});
check('speed: setTempo updates the header at once and posts the clamped value', () => {
  const src = slice(/const postTempo = [\s\S]*?\nfunction setTempo\(bpm\) \{[\s\S]*?\n\}\n/, 'setTempo');
  const els = { '#tSpeed': {}, '#tSpeedOut': {}, '#tBpm': {} }; const posted = [];
  const fn = new Function('$', 'post', 'Date', 'setTimeout', 'clampBpm', 'makeTrailing', src + '\nreturn setTempo;')(
    (s) => els[s], (r, b) => posted.push([r, b]), Date, setTimeout, clampBpm, makeTrailing);
  fn(500);
  assert.strictEqual(els['#tBpm'].textContent, 300);
  assert.strictEqual(els['#tSpeed'].value, 300);
  assert.deepStrictEqual(posted, [['api/fx', { bpm: 300 }]]);
});

const presetSrc = slice(/const MIDI_PRESETS = \[\{[\s\S]*?\n\}\];\n/, 'MIDI_PRESETS');
const targets = ['master', 'alldim', 'fxdepth', 'fxbpm', 'hold', 'fade', 'blackout', 'chaseon', 'fxon']
  .map((key) => ({ key })).concat(Array.from({ length: 16 }, (_, i) => ({ key: 'scene:' + i })))
  .concat(Array.from({ length: 4 }, (_, i) => ({ key: 'ch:' + i, kind: 'cc' })));
const presets = new Function('midiTargets', presetSrc + '\nreturn MIDI_PRESETS;')(targets);
check('K2 preset: matches the port name, maps the four faders and Blackout, no key twice, nothing outside 0-127', () => {
  const p = presets.find((x) => x.match.test('XONE:K2 MIDI 1'));
  assert.ok(p && !p.match.test('Launchpad'));
  const rows = p.build();
  const by = (k) => rows.find((r) => r.key === k);
  assert.deepStrictEqual([16, 17, 18, 19].map((n) => rows.find((r) => r.type === 'cc' && r.num === n).key), ['master', 'alldim', 'fxdepth', 'fxbpm']);
  assert.deepStrictEqual(by('blackout'), { key: 'blackout', type: 'note', ch: 1, num: 12 });
  assert.strictEqual(new Set(rows.map((r) => r.key)).size, rows.length, 'duplicate target');
  assert.strictEqual(new Set(rows.map((r) => r.type + r.ch + ':' + r.num)).size, rows.length, 'one control on two targets');
  assert.ok(rows.every((r) => r.ch === 1 && r.num >= 0 && r.num < 128));
});

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
