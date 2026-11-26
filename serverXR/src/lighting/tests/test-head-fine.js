'use strict';
// Head motion writes 16-bit pan and tilt for every fine-channel naming (panFine / pan_fine, tiltFine / tilt_fine), and
// is byte-identical to before for a profile that already worked and for a fixture that no look moves.
// Run: node serverXR/src/lighting/tests/test-head-fine.js
const assert = require('assert');
const { Engine, makeFixture, addProfile, removeProfile } = require('../engine');
const { headsPose, moveAxis } = require('../headMotion');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + (e.stack || e)); }
}

const unit = (id, extra) => ({ id, x: 0, z: 0, hung: false, panRange: 540, tiltRange: 270, ...extra });
const hd = (u, pan, tilt) => ({ off: { pan, tilt }, unit: u, level: 1 });

// The bytes headsPose gave before the resolver change: the fine channel was found by the names panFine / tiltFine only.
function oldHeadsPose(h, channels, val) {
  const sign = h.unit.hung ? { pan: -1, tilt: 1 } : { pan: 1, tilt: -1 };
  const out = {};
  const axis = (role, fineRole, offset, range) => {
    if (!channels.includes(role)) return;
    const hasFine = channels.includes(fineRole);
    const c = val(role), f = hasFine ? val(fineRole) : null;
    const [coarse, fine] = moveAxis([c == null ? 128 : c, f == null ? 0 : f], offset, range, hasFine);
    out[role] = coarse;
    if (hasFine) out[fineRole] = fine;
  };
  axis('pan', 'panFine', sign.pan * h.off.pan * h.level, h.unit.panRange);
  axis('tilt', 'tiltFine', sign.tilt * h.off.tilt * h.level, h.unit.tiltRange);
  return Object.keys(out).length ? out : null;
}

const rest = (vals) => (role) => vals[role];

check('pan_fine / tilt_fine profile: both bytes written, coarse*256+fine is the 16-bit target', () => {
  const u = unit('a');
  const ch = ['pan', 'pan_fine', 'tilt', 'tilt_fine', 'dimmer'];
  for (const [p, t] of [[0, 0], [1.37, -2.9], [-33.3, 12.1], [90, 40]]) {
    const out = headsPose(hd(u, p, t), ch, rest({ pan: 128, pan_fine: 0, tilt: 128, tilt_fine: 0 }));
    assert.ok('pan_fine' in out && 'tilt_fine' in out, 'both fine bytes present');
    assert.ok(!('panFine' in out) && !('tiltFine' in out), 'written under the profile\'s own names');
    const panDeg = (128 * 256 / 65535 - 0.5) * 540 + p;         // rest 128/0 as a 16-bit value is the start
    const tiltDeg = (128 * 256 / 65535 - 0.5) * 270 - t;               // standing machine: tilt sign -1
    const want = (deg, range) => Math.round(Math.min(Math.max(deg / range + 0.5, 0), 1) * 65535);
    assert.strictEqual(out.pan * 256 + out.pan_fine, want(panDeg, 540), `pan 16-bit for offset ${p}`);
    assert.strictEqual(out.tilt * 256 + out.tilt_fine, want(tiltDeg, 270), `tilt 16-bit for offset ${t}`);
  }
});

check('the two naming styles give the same bytes', () => {
  const a = headsPose(hd(unit('a'), 7.31, -4.2), ['pan', 'panFine', 'tilt', 'tiltFine'], rest({ pan: 100, panFine: 10, tilt: 90, tiltFine: 200 }));
  const b = headsPose(hd(unit('a'), 7.31, -4.2), ['pan', 'pan_fine', 'tilt', 'tilt_fine'], rest({ pan: 100, pan_fine: 10, tilt: 90, tilt_fine: 200 }));
  assert.deepStrictEqual([b.pan, b.pan_fine, b.tilt, b.tilt_fine], [a.pan, a.panFine, a.tilt, a.tiltFine]);
});

check('a tilt-only bar (BAR1240PIX57 shape) gets a 16-bit tilt and no pan', () => {
  const out = headsPose(hd(unit('a', { hung: true }), 5, 3.3), ['tilt', 'tilt_fine', 'dimmer'], rest({ tilt: 128, tilt_fine: 0 }));
  assert.deepStrictEqual(Object.keys(out).sort(), ['tilt', 'tilt_fine']);
  assert.ok(out.tilt_fine !== 0 || out.tilt !== 128, 'it moved');
});

check('panFine / tiltFine profiles: byte-identical to the old code', () => {
  const ch = ['pan', 'panFine', 'tilt', 'tiltFine'];
  for (const hung of [false, true]) for (const [p, t] of [[0, 0], [12.345, -6.7], [-200, 99], [270, 135]]) {
    for (const v of [{ pan: 128, panFine: 0, tilt: 128, tiltFine: 0 }, { pan: 3, panFine: 250, tilt: 251, tiltFine: 7 }, {}]) {
      assert.deepStrictEqual(headsPose(hd(unit('a', { hung }), p, t), ch, rest(v)), oldHeadsPose(hd(unit('a', { hung }), p, t), ch, rest(v)));
    }
  }
});

check('8-bit profiles (pan, tilt only; or a partial pair) are byte-identical to the old code', () => {
  for (const ch of [['pan', 'tilt', 'dimmer'], ['pan', 'tilt', 'tiltFine'], ['pan', 'panFine', 'tilt'], ['dimmer', 'r', 'g', 'b']]) {
    for (const [p, t] of [[0, 0], [12.345, -6.7], [-200, 99]]) {
      const v = { pan: 77, panFine: 5, tilt: 190, tiltFine: 9 };
      assert.deepStrictEqual(headsPose(hd(unit('a'), p, t), ch, rest(v)), oldHeadsPose(hd(unit('a'), p, t), ch, rest(v)));
    }
  }
  assert.strictEqual(headsPose(hd(unit('a'), 5, 5), ['dimmer', 'r', 'g', 'b'], rest({})), null, 'no pan or tilt: nothing');
});

// Whole desk: a sweep look on a pan_fine bar, a panFine bar, an 8-bit head and an RGB par; the par and what no look names stay put.
function deskWith(profileName, channels) {
  if (channels) addProfile(profileName, channels, { replace: true });
  const fx = makeFixture({ profile: profileName, address: 1, universe: 0, values: { dimmer: 255 } });
  const par = makeFixture({ profile: 'rgb', address: 100, universe: 0, values: { r: 10, g: 20, b: 30 } });
  const look = { id: 'L1', kind: 'full', steps: [], fixtures: [], heads: { pattern: 'sweep', period_s: 8, pan_deg: 40, tilt_deg: 0, spatial: 'all', units: [unit(fx.id)] } };
  const state = {
    master: 255, blackout: false, fixtures: [fx, par], raw: {}, scenes: [], activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 },
    looks: [look], layers: [{ id: 'y', on: true, lookId: 'L1', level: 1, priority: 1, firedAt: 0, mask: 'full' }],
  };
  return { e: new Engine(state), state, fx };
}

check('whole desk: a pan_fine bar moves in 16 bits; a pan step of 1/256 shows in the fine byte, not the coarse', () => {
  const { e } = deskWith('test pan_fine bar', ['pan', 'pan_fine', 'tilt', 'tilt_fine', 'dimmer']);
  try {
    const seen = new Set();
    let finePos = 0;
    for (let ms = 0; ms < 2000; ms += 50) {
      const b = e.render(undefined, ms).get(0);
      seen.add(b[0] * 256 + b[1]);
      if (b[1] !== 0) finePos++;
    }
    assert.ok(finePos > 10, 'the fine byte carries the in-between positions, got ' + finePos);
    assert.ok(seen.size > 30, 'many distinct 16-bit positions, got ' + seen.size);
  } finally { removeProfile('test pan_fine bar'); }
});

check('whole desk: the fixture no look names keeps its bytes whether or not a look runs', () => {
  const { e, state } = deskWith('test pan_fine bar', ['pan', 'pan_fine', 'tilt', 'tilt_fine', 'dimmer']);
  try {
    const moving = [...e.render(undefined, 1234).get(0).slice(99, 102)];
    state.layers = [];
    const still = [...new Engine(state).render(undefined, 1234).get(0).slice(99, 102)];
    assert.deepStrictEqual(moving, [10, 20, 30]);
    assert.deepStrictEqual(still, [10, 20, 30]);
  } finally { removeProfile('test pan_fine bar'); }
});

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
