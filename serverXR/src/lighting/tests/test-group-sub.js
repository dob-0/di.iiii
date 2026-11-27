'use strict';
// The group fader (`sub`, owner N7670) dims a lamp ON TOP of whatever plays, and a 16-bit dimmer's fine byte rides the
// master, the blackout and the fader with its coarse byte (N7671: the fine byte passed through, so a blackout glowed).
// Run: node serverXR/src/lighting/tests/test-group-sub.js
const assert = require('assert');
const { Engine, makeFixture, addProfile } = require('../engine');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + (e.stack || e)); }
}
addProfile('test-dim16', ['dimmer', 'dimmer_fine', 'r', 'g', 'b'], { replace: true });
function desk(extra, fxExtra) {
  const fx = makeFixture({ profile: 'test-dim16', address: 1, universe: 0, values: { dimmer: 200, dimmer_fine: 100, r: 50, g: 60, b: 70 }, ...(fxExtra || {}) });
  const par = makeFixture({ profile: 'rgb', address: 20, universe: 0, values: { r: 10, g: 20, b: 30 } });
  const state = { master: 255, blackout: false, fixtures: [fx, par], raw: {}, scenes: [], activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 }, looks: [], layers: [], ...(extra || {}) };
  return { e: new Engine(state), state, fx };
}
const bytes = (d) => [...d.e.render(undefined, 1000).get(0).slice(0, 5)].map(Math.round);

check('no fader, full master: the bytes are exactly as before (200, 100)', () => {
  assert.deepStrictEqual(bytes(desk()).slice(0, 2), [200, 100]);
});
check('blackout: coarse AND fine dimmer are 0', () => {
  assert.deepStrictEqual(bytes(desk({ blackout: true })).slice(0, 2), [0, 0]);
});
check('master at 0: coarse and fine are 0', () => {
  assert.deepStrictEqual(bytes(desk({ master: 0 })).slice(0, 2), [0, 0]);
});
check('group fader at 0: the lamp is dark, the colour bytes stay (the dimmer carries the level)', () => {
  const b = bytes(desk(null, { sub: 0 }));
  assert.deepStrictEqual(b, [0, 0, 50, 60, 70]);
});
check('group fader at half: the 16-bit level halves', () => {
  const b = bytes(desk(null, { sub: 128 }));
  const lvl = b[0] + b[1] / 256, want = (200 + 100 / 256) * 128 / 255;
  assert.ok(Math.abs(lvl - want) < 1 / 256 + 1e-9, `got ${lvl}, want ${want}`);
});
check('makeFixture keeps sub below full, drops it at full', () => {
  assert.strictEqual(makeFixture({ profile: 'rgb', sub: 90 }).sub, 90);
  assert.strictEqual('sub' in makeFixture({ profile: 'rgb', sub: 255 }), false);
});
check('a lamp without a fine dimmer is untouched by the fine path', () => {
  const d = desk({ blackout: true });
  assert.deepStrictEqual([...d.e.render(undefined, 1000).get(0).slice(19, 22)].map(Math.round), [0, 0, 0]);
});
console.log(failures ? `${failures} FAILED` : 'all ok'); process.exit(failures ? 1 : 0);
