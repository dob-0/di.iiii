'use strict';
// Owned holds (holds.js): who holds each manual channel, and that a release reaches only
// the caller's own. The 2026-10-17 case — one session releasing "its" holds put out the
// operator's — is the first check.
// Run with: node serverXR/src/lighting/tests/test-holds.js

const assert = require('assert');
const holds = require('../holds');
const { Engine } = require('../engine');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const desk = () => ({ raw: {}, rawOwners: {} });

check("a session's release leaves the operator's holds alone", () => {
  const s = desk();
  holds.hold(s, '1:137', 200);                 // the operator's fader, untagged
  holds.hold(s, '1:138', 64);
  holds.hold(s, '1:10', 255, 'beam-chat');
  const r = holds.releaseHolds(s, { owner: 'beam-chat' });
  assert.strictEqual(r.released, 1);
  assert.deepStrictEqual(r.kept, { owner: 2 }, 'the reply says who still holds the rest');
  assert.deepStrictEqual(s.raw, { '1:137': 200, '1:138': 64 });
});

check("a per-channel release of somebody else's hold is refused and names the holder", () => {
  const s = desk();
  holds.hold(s, '1:137', 200);
  assert.strictEqual(holds.release(s, '1:137', 'beam-chat'), 'owner');
  assert.strictEqual(s.raw['1:137'], 200, 'still on');
  assert.strictEqual(holds.release(s, '1:137'), 'released', 'the holder itself can let go');
  assert.strictEqual(holds.release(s, '1:137'), 'free');
  assert.ok(!('1:137' in s.rawOwners), 'no tag left behind for a channel nobody holds');
});

check('an untagged release releases "owner" holds only, as old callers did for themselves', () => {
  const s = desk();
  holds.hold(s, '0:1', 10);
  holds.hold(s, '0:2', 20, 'la40-player');
  const r = holds.releaseHolds(s, {});
  assert.strictEqual(r.released, 1);
  assert.deepStrictEqual(r.kept, { 'la40-player': 1 });
  assert.deepStrictEqual(s.raw, { '0:2': 20 });
});

check('release-all is explicit, and can be kept to one universe', () => {
  const s = desk();
  holds.hold(s, '4:1', 1); holds.hold(s, '40:1', 2, 'a'); holds.hold(s, '4:2', 3, 'b');
  const r = holds.releaseHolds(s, { owner: 'a', all: true, universe: 4 });
  assert.strictEqual(r.released, 2, "universe 4's holds, everybody's");
  assert.deepStrictEqual(s.raw, { '40:1': 2 }, 'universe 40 is not universe 4');
  assert.deepStrictEqual(s.rawOwners, { '40:1': 'a' });
});

check('setting a held channel takes it: the previous holder can no longer release it', () => {
  const s = desk();
  holds.hold(s, '2:5', 100, 'script');
  holds.hold(s, '2:5', 180);                   // the operator grabs the fader
  assert.strictEqual(holds.ownerOf(s, '2:5'), 'owner');
  assert.strictEqual(holds.releaseHolds(s, { owner: 'script' }).released, 0);
  assert.strictEqual(s.raw['2:5'], 180);
});

check('the tag must be a short plain name; none is "owner", a bad one is no tag at all', () => {
  assert.strictEqual(holds.holdOwner(undefined), 'owner');
  assert.strictEqual(holds.holdOwner(''), 'owner');
  assert.strictEqual(holds.holdOwner('session_01N3:aim-test'), 'session_01N3:aim-test');
  assert.strictEqual(holds.holdOwner('has space'), null);
  assert.strictEqual(holds.holdOwner('x'.repeat(41)), null);
  assert.strictEqual(holds.holdOwner({}), null);
});

check('a show file from before tags loads with every hold the operator\'s', () => {
  const raw = { '0:1': 5, '0:2': 6 };
  assert.deepStrictEqual(holds.sanitizeRawOwners(undefined, raw), { '0:1': 'owner', '0:2': 'owner' });
  assert.deepStrictEqual(holds.sanitizeRawOwners({ '0:1': 'x', '0:2': 'bad tag', '9:9': 'gone' }, raw),
    { '0:1': 'x', '0:2': 'owner' }, 'junk tags become "owner", tags for channels nobody holds are dropped');
});

check("a scene recall replaces the recalling hand's holds and keeps everybody else's", () => {
  const s = desk();
  holds.hold(s, '0:1', 10);                    // the operator's
  holds.hold(s, '0:2', 20);
  holds.hold(s, '0:3', 30, 'laser-chat');
  holds.hold(s, '0:4', 40, 'laser-chat');
  const released = holds.recallHolds(s, { '0:1': 99, '0:4': 77 });
  assert.strictEqual(released, 1, "0:2 was the operator's and the scene does not hold it");
  assert.deepStrictEqual(s.raw, { '0:1': 99, '0:3': 30, '0:4': 77 });
  assert.deepStrictEqual(s.rawOwners, { '0:1': 'owner', '0:3': 'laser-chat', '0:4': 'owner' },
    "the scene's channel goes to the hand that recalled it");
});

check('the engine recall (and so the chase) goes through the same rule', () => {
  const state = { master: 255, blackout: false, fixtures: [], raw: {}, rawOwners: {}, scenes: [], activeScene: null,
    fx: { mode: 'none', enabled: false }, lfos: [], chase: { enabled: false, sceneIds: [] } };
  const e = new Engine(state);
  holds.hold(state, '0:7', 1, 'aim-test');
  holds.hold(state, '0:8', 2);
  e.recallScene({ id: 's', fixtures: [], raw: { '0:9': 3 } }, 0);
  assert.deepStrictEqual(e.state.raw, { '0:7': 1, '0:9': 3 });
  e.recallScene({ id: 's', fixtures: [], raw: {} }, 0, 'aim-test');
  assert.deepStrictEqual(e.state.raw, { '0:9': 3 }, 'a tagged recall releases that tag only');
});

check('holders are counted per tag', () => {
  const s = desk();
  holds.hold(s, '0:1', 1); holds.hold(s, '0:2', 1, 'a'); holds.hold(s, '0:3', 1, 'a');
  s.raw['0:4'] = 9;                            // a hold with no tag at all reads as "owner"
  assert.deepStrictEqual(holds.holdsByOwner(s), { owner: 2, a: 2 });
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log('\nall holds checks passed');
