'use strict';
// End-to-end checks on the HTTP API: every route, and the round trip from a POST
// through the render loop back out to the live DMX buffers.
//
// Spawns its own server on an ephemeral HTTP port with an ephemeral Art-Net socket and a
// throwaway show file, so it never contends with a desk already running on 8080/6454.
// Run with: npm run test:http   (npm test runs this after the unit tests)

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

let base = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The output loop runs at 40 Hz; give it a couple of frames before reading the wire back.
const settle = () => sleep(120);

async function api(method, route, body) {
  const res = await fetch(base + route, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, body: json, text };
}
const GET = (r) => api('GET', r);
const POST = (r, b) => api('POST', r, b || {});

// Channel `ch` (1-based) of `universe`, as it is actually being transmitted.
async function wire(universe, ch) {
  const { body } = await GET('/api/dmx');
  const buf = body.dmx[universe];
  return buf ? buf[ch - 1] : undefined;
}

async function patch(profile, opts) {
  const { body } = await POST('/api/fixtures/add', Object.assign({ profile, count: 1 }, opts || {}));
  return body.added[0];
}

// ---- the API surface the interface is built against -------------------------

check('GET /api/state carries the whole desk', async () => {
  const { status, body } = await GET('/api/state');
  assert.strictEqual(status, 200);
  for (const key of ['master', 'blackout', 'fixtures', 'groups', 'raw', 'scenes',
                     'chase', 'output', 'profiles', 'status', 'dmx']) {
    assert.ok(key in body, '/api/state is missing "' + key + '"');
  }
  assert.ok(Array.isArray(body.fixtures), 'fixtures is an array');
  assert.ok(body.profiles.rgb && Array.isArray(body.profiles.rgb.channels), 'the profile library came along');
  assert.ok(Array.isArray(body.status.interfaces), 'status carries the local interfaces');
});

check('GET /api/dmx is {dmx, master, blackout} with 512 channels a universe', async () => {
  await patch('rgb', { universe: 0, address: 1 });
  await settle();
  const { status, body } = await GET('/api/dmx');
  assert.strictEqual(status, 200);
  assert.ok(body.dmx && typeof body.dmx === 'object', 'dmx is keyed by universe');
  assert.strictEqual(body.dmx[0].length, 512, 'a universe is 512 channels');
  assert.ok(body.dmx[0].every((v) => Number.isInteger(v) && v >= 0 && v <= 255), 'channels are bytes');
  assert.strictEqual(typeof body.master, 'number');
  assert.strictEqual(typeof body.blackout, 'boolean');
});

check('a patched fixture reports the shape the UI reads', async () => {
  const f = await patch('ptdrgbw', { universe: 0 });
  for (const key of ['id', 'index', 'name', 'universe', 'address', 'profile', 'on', 'x', 'y', 'values', 'limits']) {
    assert.ok(key in f, 'fixture is missing "' + key + '"');
  }
  assert.strictEqual(f.profile, 'ptdrgbw');
  assert.ok(f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1, 'it has a place on the stage view');
});

// ---- patching ---------------------------------------------------------------

check('patching auto-advances to the next free address', async () => {
  const a = await patch('rgb', { universe: 5 });
  const b = await patch('rgbw', { universe: 5 });
  const c = await patch('rgb', { universe: 5 });
  assert.strictEqual(a.address, 1);
  assert.strictEqual(b.address, 4, 'rgb is 3 wide');
  assert.strictEqual(c.address, 8, 'rgbw is 4 wide');
  assert.ok(b.index > a.index && c.index > b.index, 'fixture numbers advance too');
});

check('patching a count in one go lays them end to end', async () => {
  const { body } = await POST('/api/fixtures/add', { profile: 'rgb', count: 4, universe: 6 });
  assert.strictEqual(body.added.length, 4);
  assert.deepStrictEqual(body.added.map((f) => f.address), [1, 4, 7, 10]);
});

check('a patch that would overrun 512 stops at the edge', async () => {
  const { body } = await POST('/api/fixtures/add', { profile: 'rgbw', count: 4, universe: 7, address: 505 });
  assert.strictEqual(body.added.length, 2, '505 and 509 fit, 513 does not');
  assert.ok(body.added.every((f) => f.address + 4 - 1 <= 512));
});

check('an unknown profile falls back rather than patching nothing', async () => {
  const f = await patch('definitely-not-a-fixture', { universe: 8 });
  assert.strictEqual(f.profile, 'rgb');
});

// ---- the round trip out to the wire ----------------------------------------

check('a fader move reaches the right channels', async () => {
  const f = await patch('rgb', { universe: 10, address: 100 });
  await POST('/api/fixture', { id: f.id, values: { r: 200, g: 10, b: 0 } });
  await settle();
  assert.strictEqual(await wire(10, 100), 200, 'red');
  assert.strictEqual(await wire(10, 101), 10, 'green');
  assert.strictEqual(await wire(10, 102), 0, 'blue');
});

check('master and blackout reach the wire, and blackout is recoverable', async () => {
  const f = await patch('rgb', { universe: 11, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { r: 255, g: 255, b: 255 } });
  await POST('/api/master', { master: 128 });
  await settle();
  assert.strictEqual(await wire(11, 1), 128, 'master halves it');

  await POST('/api/master', { blackout: true });
  await settle();
  assert.strictEqual(await wire(11, 1), 0, 'blackout kills it');

  await POST('/api/master', { blackout: false, master: 255 });
  await settle();
  assert.strictEqual(await wire(11, 1), 255, 'and it comes back');
});

check('master is not applied twice to a fixture with a dimmer channel', async () => {
  const d = await patch('drgb', { universe: 12, address: 1 });
  const g = await patch('rgb', { universe: 12, address: 10 });
  await POST('/api/fixture', { id: d.id, values: { dimmer: 255, r: 255, g: 255, b: 255 } });
  await POST('/api/fixture', { id: g.id, values: { r: 255, g: 255, b: 255 } });
  await POST('/api/master', { master: 128 });
  await settle();
  assert.strictEqual(await wire(12, 1), 128, 'the dimmer channel carries the master');
  assert.strictEqual(await wire(12, 2), 255, 'red stays up - the dimmer already has it');
  assert.strictEqual(await wire(12, 10), 128, 'the dimmerless fixture gets it on its colour');
  await POST('/api/master', { master: 255 });
});

check('a raw override outranks the fixtures but not the blackout', async () => {
  await POST('/api/raw', { universe: 13, channel: 7, value: 200 });
  await settle();
  assert.strictEqual(await wire(13, 7), 200, 'the manual channel is on the wire');

  await POST('/api/master', { blackout: true });
  await settle();
  assert.strictEqual(await wire(13, 7), 0, 'blackout kills manual channels too — the panic button reaches every page');

  await POST('/api/master', { blackout: false });
  await POST('/api/raw', { clear: true });
  await settle();
  assert.strictEqual(await wire(13, 7), 0, 'clearing releases it');
});

check('releasing the last fixture on a universe does not leave it lit', async () => {
  // The failure this guards: tick() only wrote universes that render() produced, while
  // toBuffers() emitted everything ever seen - so the universe froze at its last frame,
  // still transmitting, and blackout could not reach it because nothing rendered for it.
  const f = await patch('rgb', { universe: 20, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { r: 255, g: 255, b: 255 } });
  await settle();
  assert.strictEqual(await wire(20, 1), 255, 'lit to start with');

  await POST('/api/fixtures/remove', { id: f.id });
  await settle();
  assert.strictEqual(await wire(20, 1), 0, 'the released universe transmits zeros');
});

// ---- scenes, groups, chase --------------------------------------------------

check('a scene round-trips through save and recall', async () => {
  const f = await patch('rgb', { universe: 14, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { r: 255, g: 0, b: 0 } });
  const saved = await POST('/api/scenes/save', { name: 'Red', fadeMs: 0 });
  const sceneId = saved.body.scene.id;
  assert.strictEqual(saved.body.scene.name, 'Red');

  await POST('/api/fixture', { id: f.id, values: { r: 0, g: 0, b: 255 } });
  await settle();
  assert.strictEqual(await wire(14, 3), 255, 'moved to blue');

  const recalled = await POST('/api/scenes/recall', { id: sceneId, fadeMs: 0 });
  assert.strictEqual(recalled.body.ok, true);
  await settle();
  assert.strictEqual(await wire(14, 1), 255, 'red is back');
  assert.strictEqual(await wire(14, 3), 0, 'blue is gone');
});

check('a scene says how much of it still exists', async () => {
  const f = await patch('rgb', { universe: 60, address: 1 });
  const g = await patch('rgb', { universe: 60, address: 10 });
  const scene = (await POST('/api/scenes/save', { name: 'Both', fadeMs: 0 })).body.scene;

  // captureScene records the whole rig, not just these two, so compare against itself.
  let s = (await GET('/api/state')).body.scenes.find((x) => x.id === scene.id);
  assert.strictEqual(s.missing, 0, 'nothing missing while the rig is intact');
  const before = s.live;
  assert.ok(before >= 2);

  await POST('/api/fixtures/remove', { ids: [f.id, g.id] });
  s = (await GET('/api/state')).body.scenes.find((x) => x.id === scene.id);
  assert.strictEqual(s.missing, 2, 'the two that were unpatched are reported missing');
  assert.strictEqual(s.live, before - 2,
    'so the interface can say a scene is part-dead rather than just doing nothing');

  await POST('/api/scenes/remove', { id: scene.id });
});

check('recalling a scene that is not there fails rather than throwing', async () => {
  const { status, body } = await POST('/api/scenes/recall', { id: 'sc-nope', fadeMs: 0 });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, false);
});

check('deleting a scene pulls it out of the chase', async () => {
  const a = (await POST('/api/scenes/save', { name: 'A', fadeMs: 0 })).body.scene;
  const b = (await POST('/api/scenes/save', { name: 'B', fadeMs: 0 })).body.scene;
  await POST('/api/chase', { enabled: false, sceneIds: [a.id, b.id], holdMs: 500 });
  await POST('/api/scenes/remove', { id: a.id });
  const { body } = await GET('/api/state');
  assert.ok(!body.scenes.some((s) => s.id === a.id), 'the scene is gone');
  assert.deepStrictEqual(body.chase.sceneIds, [b.id], 'and so is its step');
});

check('a manual recall pauses a running chase, and says so', async () => {
  const a = (await POST('/api/scenes/save', { name: 'CA', fadeMs: 0 })).body.scene;
  const b = (await POST('/api/scenes/save', { name: 'CB', fadeMs: 0 })).body.scene;
  await POST('/api/chase', { enabled: true, sceneIds: [a.id, b.id], holdMs: 60, fadeMs: 0 });

  // The chase engine recalls scenes directly (not through the route), so a running chase
  // must actually step on its own before we interrupt it.
  await sleep(200);
  const running = (await GET('/api/state')).body;
  assert.strictEqual(running.chase.enabled, true, 'the chase is running');
  assert.ok(running.activeScene === a.id || running.activeScene === b.id, 'and it has recalled a step');

  // Pressing a scene button mid-chase takes the rig over instead of being snapped back.
  const { body } = await POST('/api/scenes/recall', { id: a.id, fadeMs: 0 });
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.chasePaused, true, 'the reply says the chase was paused');
  const st = (await GET('/api/state')).body;
  assert.strictEqual(st.chase.enabled, false, 'the chase is paused, not fighting the operator');
  await sleep(150);
  assert.strictEqual((await GET('/api/state')).body.activeScene, a.id, 'no hold snaps the recall back');

  // A recall with the chase already stopped does not claim to have paused anything.
  const again = (await POST('/api/scenes/recall', { id: b.id, fadeMs: 0 })).body;
  assert.strictEqual(again.ok, true);
  assert.ok(!('chasePaused' in again), 'chasePaused only appears when it actually did so');

  await POST('/api/chase', { enabled: false, sceneIds: [] });
  await POST('/api/scenes/remove', { id: a.id });
  await POST('/api/scenes/remove', { id: b.id });
});

check('an empty chase is never left armed', async () => {
  const a = (await POST('/api/scenes/save', { name: 'Lone', fadeMs: 0 })).body.scene;

  // enabled:true with no steps is refused outright.
  let { body } = await POST('/api/chase', { enabled: true, sceneIds: [] });
  assert.strictEqual(body.chase.enabled, false, 'an empty chase cannot be armed');

  // Removing the last step disarms it rather than leaving a landmine for the next add.
  await POST('/api/chase', { enabled: true, sceneIds: [a.id], holdMs: 500 });
  assert.strictEqual((await GET('/api/state')).body.chase.enabled, true);
  await POST('/api/scenes/remove', { id: a.id });
  const st = (await GET('/api/state')).body;
  assert.deepStrictEqual(st.chase.sceneIds, [], 'the step is gone');
  assert.strictEqual(st.chase.enabled, false, 'and the chase disarmed with it');

  // Adding the first step back never starts the chase by itself — running again is an
  // explicit re-enable, in the same request or a later one.
  const b = (await POST('/api/scenes/save', { name: 'Lone2', fadeMs: 0 })).body.scene;
  body = (await POST('/api/chase', { sceneIds: [b.id] })).body;
  assert.strictEqual(body.chase.enabled, false, 'a scene added to an empty list does not start a chase');
  body = (await POST('/api/chase', { enabled: true, sceneIds: [b.id] })).body;
  assert.strictEqual(body.chase.enabled, true, 'saying enabled:true with the steps is explicit enough');

  await POST('/api/chase', { enabled: false, sceneIds: [] });
  await POST('/api/scenes/remove', { id: b.id });
});

check('the recall reply summarises what changed, so the UI can toast it', async () => {
  // A scene with FX running and no raw holds...
  await POST('/api/raw', { clear: true });
  await POST('/api/fx', { mode: 'strobe', bpm: 120, depth: 255 });
  const fxScene = (await POST('/api/scenes/save', { name: 'Strobe on', fadeMs: 0 })).body.scene;
  // ...and a quiet scene, saved while two channels are held.
  await POST('/api/fx', { mode: 'none', enabled: false });
  await POST('/api/raw', { channels: [{ universe: 15, channel: 1, value: 100 }, { universe: 15, channel: 2, value: 100 }] });
  const quiet = (await POST('/api/scenes/save', { name: 'Quiet', fadeMs: 0 })).body.scene;
  await POST('/api/raw', { clear: true });

  // Off -> on: the reply names the mode that started.
  let { body } = await POST('/api/scenes/recall', { id: fxScene.id, fadeMs: 0 });
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.fxStarted, 'strobe', 'the recall turned FX on and says which mode');
  assert.ok(!('fxStopped' in body) && !('releasedHolds' in body), 'nothing else claimed');

  // On -> off, and the two held channels the quiet scene carries replace nothing — hold
  // three now so the recall releases one net.
  await POST('/api/raw', { channels: [
    { universe: 15, channel: 1, value: 90 }, { universe: 15, channel: 2, value: 90 }, { universe: 15, channel: 3, value: 90 },
  ] });
  body = (await POST('/api/scenes/recall', { id: quiet.id, fadeMs: 0 })).body;
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.fxStopped, true, 'the recall turned a running FX off and says so');
  assert.ok(!('fxStarted' in body));
  assert.strictEqual(body.releasedHolds, 1, 'channel 3 was held before and is not in the scene');

  // Same scene again: nothing changes, so the reply is a bare {ok:true}.
  body = (await POST('/api/scenes/recall', { id: quiet.id, fadeMs: 0 })).body;
  assert.deepStrictEqual(body, { ok: true }, 'a recall that changes nothing reports nothing');

  await POST('/api/raw', { clear: true });
  await POST('/api/fx', { mode: 'none', enabled: false, depth: 255, bpm: 120 });
  await POST('/api/scenes/remove', { id: fxScene.id });
  await POST('/api/scenes/remove', { id: quiet.id });
});

check('recalling a scene keeps the operator\'s tempo', async () => {
  await POST('/api/fx', { mode: 'pulse', bpm: 100, depth: 200 });
  const scene = (await POST('/api/scenes/save', { name: 'Tempo look', fadeMs: 0 })).body.scene;
  assert.strictEqual(scene.fx.bpm, 100, 'the scene may store a bpm (harmless)');
  await POST('/api/fx', { bpm: 174 });                       // Tap tempo mid-show
  await POST('/api/scenes/recall', { id: scene.id, fadeMs: 0 });
  const st = (await GET('/api/state')).body;
  assert.strictEqual(st.fx.mode, 'pulse', 'the scene brought its effect');
  assert.strictEqual(st.fx.bpm, 174, 'but the tapped tempo survived the recall');
  await POST('/api/fx', { mode: 'none', enabled: false, depth: 255, bpm: 120 });
  await POST('/api/scenes/remove', { id: scene.id });
});

check('the state names any blackout-blind profiles, and the rig has none', async () => {
  let { body } = await GET('/api/state');
  assert.ok(Array.isArray(body.blackoutBlind), '/api/state carries blackoutBlind');
  assert.deepStrictEqual(body.blackoutBlind, [], 'every patched profile can be blacked out');

  // Patch a pure mode-switch bank (all c1..cN channels) and it is named immediately.
  await POST('/api/profiles/add', { name: 'blindlaser', channels: ['c1', 'c2', 'c3'] });
  const f = await patch('blindlaser', { universe: 63, address: 1 });
  body = (await GET('/api/state')).body;
  assert.deepStrictEqual(body.blackoutBlind, ['blindlaser'], 'the UI can warn about it');

  await POST('/api/fixtures/remove', { id: f.id });
  body = (await GET('/api/state')).body;
  assert.deepStrictEqual(body.blackoutBlind, [], 'unpatched, the warning clears');
  await POST('/api/profiles/remove', { name: 'blindlaser' });
});

check('a scene captures the fx, lfo and audio setup, and recall brings it back', async () => {
  await POST('/api/fx', { mode: 'pulse', bpm: 100, depth: 200 });
  await POST('/api/lfos', { lfos: [{ enabled: true, wave: 'sine', beats: 2, depth: 80, channel: 'dimmer' }] });
  await POST('/api/audiocfg', { enabled: true, mode: 'bass', amount: 180, release: 600, useBeats: false });
  const scene = (await POST('/api/scenes/save', { name: 'Audio look', fadeMs: 0 })).body.scene;

  // The scene as /api/state publishes it carries all three parts.
  const s = (await GET('/api/state')).body.scenes.find((x) => x.id === scene.id);
  assert.strictEqual(s.fx.mode, 'pulse', 'the scene carries its fx');
  assert.strictEqual(s.lfos.length, 1, 'and its lfos');
  assert.deepStrictEqual(s.audioCfg, { enabled: true, mode: 'bass', amount: 180, release: 600, useBeats: false },
    'and its audio setup, useBeats included');

  // Park the live desk somewhere else, then recall: the audio setup must come back.
  await POST('/api/fx', { mode: 'none', enabled: false, depth: 255, bpm: 120 });
  await POST('/api/lfos', { lfos: [] });
  await POST('/api/audiocfg', { enabled: false, mode: 'level', amount: 255, release: 300, useBeats: true });
  await POST('/api/scenes/recall', { id: scene.id, fadeMs: 0 });
  const st = (await GET('/api/state')).body;
  assert.deepStrictEqual(st.audioCfg, { enabled: true, mode: 'bass', amount: 180, release: 600, useBeats: false },
    'recalling the scene restored the audio setup');

  // Leave the desk quiet for the tests that follow.
  await POST('/api/fx', { mode: 'none', enabled: false, depth: 255, bpm: 120 });
  await POST('/api/lfos', { lfos: [] });
  await POST('/api/audiocfg', { enabled: false, mode: 'level', amount: 255, release: 300, useBeats: true });
  await POST('/api/scenes/remove', { id: scene.id });
});

check('scenes/update edits fx, lfos and audio without restaging or touching the live desk', async () => {
  const scene = (await POST('/api/scenes/save', { name: 'Editable', fadeMs: 0 })).body.scene;
  const { status, body } = await POST('/api/scenes/update', {
    id: scene.id,
    fx: { mode: 'strobe', bpm: 9999, depth: -5, enabled: true },
    lfos: [{ enabled: true, wave: 'notawave', beats: 9999, depth: 300, channel: 'dimmer' }],
    audioCfg: { enabled: true, mode: 'beat-pump', amount: 9999, release: 1 },
  });
  assert.strictEqual(status, 200);
  const s = body.scene;
  assert.strictEqual(s.fx.mode, 'strobe');
  assert.strictEqual(s.fx.bpm, 300, 'bpm goes through the /api/fx clamps');
  assert.strictEqual(s.fx.depth, 0, 'so does depth');
  assert.strictEqual(s.lfos[0].wave, 'sine', 'an unknown wave falls back, same as /api/lfos');
  assert.strictEqual(s.lfos[0].beats, 64, 'beats clamped');
  assert.strictEqual(s.lfos[0].depth, 255, 'lfo depth clamped');
  assert.deepStrictEqual(s.audioCfg, { enabled: true, mode: 'beat-pump', amount: 255, release: 50, useBeats: true },
    'the audio setup goes through the /api/audiocfg clamps, useBeats defaulting on');

  const st = (await GET('/api/state')).body;
  assert.strictEqual(st.fx.mode, 'none', 'editing a scene does not touch the live fx');
  assert.strictEqual(st.audioCfg.enabled, false, 'nor the live audio setup');

  // Only the parts present in the body are replaced.
  const { body: b2 } = await POST('/api/scenes/update', { id: scene.id, name: 'Renamed' });
  assert.strictEqual(b2.scene.name, 'Renamed');
  assert.strictEqual(b2.scene.fx.mode, 'strobe', 'fx survives an update that does not mention it');
  assert.deepStrictEqual(b2.scene.audioCfg, { enabled: true, mode: 'beat-pump', amount: 255, release: 50, useBeats: true });
  await POST('/api/scenes/remove', { id: scene.id });
});

check('scenes/update refuses lfos that are not a list, without half-applying', async () => {
  const scene = (await POST('/api/scenes/save', { name: 'Bad lfos', fadeMs: 0 })).body.scene;
  const { status } = await POST('/api/scenes/update', { id: scene.id, lfos: 'nope', name: 'Should not land' });
  assert.strictEqual(status, 400);
  const s = (await GET('/api/state')).body.scenes.find((x) => x.id === scene.id);
  assert.strictEqual(s.name, 'Bad lfos', 'a refused body must not half-apply its rename');
  await POST('/api/scenes/remove', { id: scene.id });
});

check('a group needs real fixtures', async () => {
  const bad = await POST('/api/groups/add', { name: 'Ghosts', ids: ['fx-nope'] });
  assert.strictEqual(bad.status, 400);

  const f = await patch('rgb', { universe: 15 });
  const good = await POST('/api/groups/add', { name: 'Front', ids: [f.id, 'fx-nope'] });
  assert.strictEqual(good.status, 200);
  assert.deepStrictEqual(good.body.group.ids, [f.id], 'the phantom is dropped');

  await POST('/api/groups/remove', { id: good.body.group.id });
  const { body } = await GET('/api/state');
  assert.ok(!body.groups.some((g) => g.id === good.body.group.id));
});

// ---- building your own fixture ----------------------------------------------

check('a custom fixture can be built and patched like any other', async () => {
  const { status, body } = await POST('/api/profiles/add', {
    name: 'My par', channels: ['dimmer', 'r', 'g', 'b', 'pan', 'tilt'],
  });
  assert.strictEqual(status, 200, body.error);
  assert.strictEqual(body.name, 'My par');

  const st = (await GET('/api/state')).body;
  assert.ok(st.profiles['My par'], 'it appears in the library');
  assert.strictEqual(st.profiles['My par'].custom, true, 'flagged so the UI can offer delete');
  assert.strictEqual(st.profiles.rgb.custom, false, 'built-ins are not');

  const f = await patch('My par', { universe: 70, address: 1 });
  assert.strictEqual(f.profile, 'My par');
  await POST('/api/fixture', { id: f.id, values: { dimmer: 255, r: 200, pan: 90 } });
  await settle();
  assert.strictEqual(await wire(70, 1), 255, 'its dimmer is a real dimmer');
  assert.strictEqual(await wire(70, 2), 200, 'red on channel 2, as declared');
  assert.strictEqual(await wire(70, 5), 90, 'pan on channel 5');
});

check('a custom fixture obeys the same rules as a built-in', async () => {
  await POST('/api/profiles/add', { name: 'Blackout test', channels: ['dimmer', 'r', 'pan'] });
  const f = await patch('Blackout test', { universe: 71, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { dimmer: 255, r: 255, pan: 200 } });
  await POST('/api/master', { blackout: true });
  await settle();
  assert.strictEqual(await wire(71, 1), 0, 'blackout reaches it');
  assert.strictEqual(await wire(71, 3), 200, 'and its pan still holds, like any other fixture');
  await POST('/api/master', { blackout: false });
});

check('a built-in cannot be overwritten or deleted', async () => {
  const add = await POST('/api/profiles/add', { name: 'rgb', channels: ['r'] });
  assert.strictEqual(add.status, 400);
  assert.ok(/built-in/.test(add.body.error), add.body.error);

  const del = await POST('/api/profiles/remove', { name: 'rgb' });
  assert.strictEqual(del.status, 400);
  assert.ok((await GET('/api/state')).body.profiles.rgb, 'and it is still there');
});

check('names that would be indistinguishable are refused', async () => {
  await POST('/api/profiles/add', { name: 'Wash', channels: ['r', 'g', 'b'] });
  const dup = await POST('/api/profiles/add', { name: 'wash', channels: ['r'] });
  assert.strictEqual(dup.status, 400, 'two profiles differing only in case would shadow each other');
  await POST('/api/profiles/remove', { name: 'Wash' });
});

check('a nonsense fixture is refused with a reason', async () => {
  for (const bad of [
    { name: '', channels: ['r'] },
    { name: 'ok', channels: [] },
    { name: 'ok', channels: 'not an array' },
    { name: '!!!', channels: ['r'] },
  ]) {
    const { status, body } = await POST('/api/profiles/add', bad);
    assert.strictEqual(status, 400, JSON.stringify(bad));
    assert.ok(body.error && body.error.length, 'the refusal explains itself');
  }
});

check('a fixture type in use cannot be deleted', async () => {
  await POST('/api/profiles/add', { name: 'In use', channels: ['r', 'g', 'b'] });
  const f = await patch('In use', { universe: 72, address: 1 });

  const { status, body } = await POST('/api/profiles/remove', { name: 'In use' });
  assert.strictEqual(status, 409, 'deleting it would silently turn the fixture into an rgb');
  assert.ok(/still patched/.test(body.error), body.error);
  assert.strictEqual(body.inUse.length, 1);

  await POST('/api/fixtures/remove', { id: f.id });
  const after = await POST('/api/profiles/remove', { name: 'In use' });
  assert.strictEqual(after.body.ok, true, 'and can be deleted once nothing uses it');
});

check('reshaping a fixture type cannot grow it into its neighbour', async () => {
  await POST('/api/profiles/add', { name: 'Growing', channels: ['r', 'g', 'b'] });
  await patch('Growing', { universe: 73, address: 1 });
  await patch('rgb', { universe: 73, address: 4 });

  const { status, body } = await POST('/api/profiles/add', {
    name: 'Growing', channels: ['r', 'g', 'b', 'w', 'a'], replace: true,
  });
  assert.strictEqual(status, 409, 'widening to 5 would overlap the fixture at 4');
  assert.ok(/would grow into/.test(body.error), body.error);
});

check('a custom fixture survives a restart', async () => {
  await POST('/api/profiles/add', { name: 'Persist me', channels: ['dimmer', 'r', 'g', 'b', 'uv'] });
  await sleep(700);   // save() debounces at 400ms
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'show.json'), 'utf8'));
  const saved = (disk.customProfiles || []).find((p) => p.name === 'Persist me');
  assert.ok(saved, 'it is part of the show file, not just this session');
  assert.deepStrictEqual(saved.channels, ['dimmer', 'r', 'g', 'b', 'uv']);
});

// ---- moving a fixture in the patch ------------------------------------------

check('a fixture moves to a free address', async () => {
  const f = await patch('rgb', { universe: 50, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { r: 210, g: 0, b: 0 } });
  const { body } = await POST('/api/fixtures/readdress', { id: f.id, address: 100 });
  assert.strictEqual(body.ok, true);
  assert.deepStrictEqual(body.moved, [{ id: f.id, universe: 50, address: 100 }]);

  await settle();
  assert.strictEqual(await wire(50, 100), 210, 'it transmits from its new address');
  assert.strictEqual(await wire(50, 1), 0, 'and the channels it left go quiet');
});

check('a move onto another fixture is refused and names the blocker', async () => {
  const a = await patch('rgb', { universe: 51, address: 1 });
  const b = await patch('rgb', { universe: 51, address: 10 });
  const { status, body } = await POST('/api/fixtures/readdress', { id: b.id, address: 2 });
  assert.strictEqual(status, 409);
  assert.ok(/taken by/.test(body.error), 'the error says what is in the way: ' + body.error);
  assert.strictEqual(body.conflicts[0].blockedBy.id, a.id);

  const { body: st } = await GET('/api/state');
  assert.strictEqual(st.fixtures.find((x) => x.id === b.id).address, 10, 'it did not move');
});

check('a fixture can shift onto channels it already occupies', async () => {
  // A 3-wide fixture at 10 moved to 11 overlaps itself on 11 and 12. It must not block
  // itself, or nudging a fixture along by one would be impossible.
  const f = await patch('rgb', { universe: 52, address: 10 });
  const { status, body } = await POST('/api/fixtures/readdress', { id: f.id, address: 11 });
  assert.strictEqual(status, 200, body.error);
  assert.strictEqual(body.moved[0].address, 11);
});

check('a dragged selection lands together or not at all', async () => {
  const a = await patch('rgb', { universe: 53, address: 1 });
  const b = await patch('rgb', { universe: 53, address: 10 });
  const blocker = await patch('rgb', { universe: 53, address: 200 });

  const bad = await POST('/api/fixtures/readdress', {
    moves: [{ id: a.id, address: 100 }, { id: b.id, address: 200 }],
  });
  assert.strictEqual(bad.status, 409, 'the second move collides, so neither happens');
  const { body: st } = await GET('/api/state');
  assert.strictEqual(st.fixtures.find((x) => x.id === a.id).address, 1,
    'the first fixture must not have half-landed');
  assert.strictEqual(st.fixtures.find((x) => x.id === blocker.id).address, 200);

  const good = await POST('/api/fixtures/readdress', {
    moves: [{ id: a.id, address: 100 }, { id: b.id, address: 110 }],
  });
  assert.strictEqual(good.body.ok, true);
  assert.strictEqual(good.body.moved.length, 2);
});

check('two moves in one request cannot land on each other', async () => {
  const a = await patch('rgb', { universe: 54, address: 1 });
  const b = await patch('rgb', { universe: 54, address: 10 });
  const { status } = await POST('/api/fixtures/readdress', {
    moves: [{ id: a.id, address: 50 }, { id: b.id, address: 51 }],
  });
  assert.strictEqual(status, 409, 'they overlap each other, not an existing fixture');
});

check('force stacks a fixture on top of another', async () => {
  const a = await patch('rgb', { universe: 55, address: 1 });
  const b = await patch('rgb', { universe: 55, address: 10 });
  const { body } = await POST('/api/fixtures/readdress', { id: b.id, address: 1, force: true });
  assert.strictEqual(body.ok, true, 'stacking is legitimate when it is deliberate');
  const { body: st } = await GET('/api/state');
  assert.strictEqual(st.fixtures.find((x) => x.id === a.id).address, 1);
  assert.strictEqual(st.fixtures.find((x) => x.id === b.id).address, 1);
});

check('a move that runs off the end is refused', async () => {
  const f = await patch('rgbw', { universe: 56, address: 1 });
  const { status, body } = await POST('/api/fixtures/readdress', { id: f.id, address: 510 });
  assert.strictEqual(status, 409);
  assert.ok(/runs off the end/.test(body.error), body.error);
});

check('a fixture moves between universes', async () => {
  const f = await patch('rgb', { universe: 57, address: 5 });
  await POST('/api/fixture', { id: f.id, values: { r: 240, g: 0, b: 0 } });
  await settle();
  assert.strictEqual(await wire(57, 5), 240, 'live on 57 before the move');

  const { body } = await POST('/api/fixtures/readdress', { id: f.id, universe: 58, address: 5 });
  assert.strictEqual(body.moved[0].universe, 58);
  await settle();
  assert.strictEqual(await wire(58, 5), 240, 'it transmits on its new universe');
  assert.strictEqual(await wire(57, 5), 0,
    'and 57, now empty, transmits zeros rather than holding its last frame');
});

check('moving a fixture that is not there is a 404', async () => {
  const { status } = await POST('/api/fixtures/readdress', { id: 'fx-nope', address: 5 });
  assert.strictEqual(status, 404);
});

// ---- manual channel faders --------------------------------------------------

check('a bank of faders is set in one request', async () => {
  const { body } = await POST('/api/raw', {
    channels: [
      { universe: 40, channel: 1, value: 255 },
      { universe: 40, channel: 2, value: 128 },
      { universe: 40, channel: 3, value: 0 },
    ],
  });
  assert.strictEqual(body.ok, true);
  await settle();
  assert.strictEqual(await wire(40, 1), 255);
  assert.strictEqual(await wire(40, 2), 128);
  assert.strictEqual(await wire(40, 3), 0);
});

check('a fader released goes back to what the fixtures render', async () => {
  const f = await patch('rgb', { universe: 41, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { r: 60, g: 0, b: 0 } });
  await POST('/api/raw', { channels: [{ universe: 41, channel: 1, value: 255 }] });
  await settle();
  assert.strictEqual(await wire(41, 1), 255, 'the manual fader wins while it is set');

  await POST('/api/raw', { channels: [{ universe: 41, channel: 1, value: -1 }] });
  await settle();
  assert.strictEqual(await wire(41, 1), 60, 'releasing it hands the channel back to the fixture');
});

check('channels outside 1..512 are not stored', async () => {
  const { body } = await POST('/api/raw', {
    channels: [
      { universe: 42, channel: 0, value: 200 },
      { universe: 42, channel: 513, value: 200 },
      { universe: 42, channel: 7, value: 200 },
    ],
  });
  assert.ok(!('42:0' in body.raw) && !('42:513' in body.raw), 'junk keys would bloat the show file forever');
  assert.strictEqual(body.raw['42:7'], 200, 'the valid one still landed');
});

check('a whole universe of faders goes up in one request', async () => {
  // What "set all" does. 512 channels is the largest bank this endpoint will ever be
  // asked for, and it has to fit inside the 1MB body cap in one go.
  const channels = [];
  for (let ch = 1; ch <= 512; ch++) channels.push({ universe: 44, channel: ch, value: 255 });
  const { status, body } = await POST('/api/raw', { channels });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.raw['44:1'], 255);
  assert.strictEqual(body.raw['44:512'], 255);
  await settle();
  assert.strictEqual(await wire(44, 1), 255);
  assert.strictEqual(await wire(44, 512), 255, 'the far end of the universe made it too');
});

check('reset all clears only the universe you are looking at', async () => {
  await POST('/api/raw', {
    channels: [
      { universe: 45, channel: 1, value: 200 },
      { universe: 46, channel: 1, value: 150 },
    ],
  });
  const { body } = await POST('/api/raw', { clear: true, universe: 45 });
  assert.ok(!('45:1' in body.raw), 'the universe in front of you is released');
  assert.strictEqual(body.raw['46:1'], 150, 'a universe you cannot see is left alone');

  const { body: all } = await POST('/api/raw', { clear: true });
  assert.deepStrictEqual(all.raw, {}, 'clear with no universe still releases everything');
});

check('clearing one universe does not catch a similarly numbered one', async () => {
  // "4:" must not match "40:1" — a prefix test that gets this wrong wipes the wrong rig.
  await POST('/api/raw', {
    channels: [{ universe: 4, channel: 1, value: 90 }, { universe: 40, channel: 1, value: 91 }],
  });
  const { body } = await POST('/api/raw', { clear: true, universe: 4 });
  assert.ok(!('4:1' in body.raw));
  assert.strictEqual(body.raw['40:1'], 91, 'universe 40 is not part of universe 4');
  await POST('/api/raw', { clear: true });
});

check('a fader bank survives a reload of the show file', async () => {
  await POST('/api/raw', { channels: [{ universe: 43, channel: 5, value: 111 }] });
  await sleep(700);   // save() debounces at 400ms
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'show.json'), 'utf8'));
  assert.strictEqual(disk.raw['43:5'], 111, 'manual overrides are part of the show, not scratch state');
});

// ---- deleting from the patch ------------------------------------------------

check('a whole selection is unpatched in one request', async () => {
  const a = await patch('rgb', { universe: 30 });
  const b = await patch('rgb', { universe: 30 });
  const c = await patch('rgb', { universe: 30 });
  const { body } = await POST('/api/fixtures/remove', { ids: [a.id, c.id] });
  assert.strictEqual(body.removed, 2);

  const { body: st } = await GET('/api/state');
  const left = st.fixtures.filter((f) => f.universe === 30).map((f) => f.id);
  assert.deepStrictEqual(left, [b.id], 'the one not selected stays patched');
});

check('removing nothing is refused rather than silently succeeding', async () => {
  const { status } = await POST('/api/fixtures/remove', {});
  assert.strictEqual(status, 400);
});

check('an id that is not patched is not an error', async () => {
  const { status, body } = await POST('/api/fixtures/remove', { ids: ['fx-nope'] });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.removed, 0);
});

check('deleting a fixture takes it out of its groups', async () => {
  const a = await patch('rgb', { universe: 31 });
  const b = await patch('rgb', { universe: 31 });
  const g = (await POST('/api/groups/add', { name: 'Pair', ids: [a.id, b.id] })).body.group;

  await POST('/api/fixtures/remove', { id: a.id });
  const { body } = await GET('/api/state');
  const after = body.groups.find((x) => x.id === g.id);
  assert.ok(after, 'the group survives while it still has a member');
  assert.deepStrictEqual(after.ids, [b.id], 'a deleted fixture must not linger in a group');
});

check('a group emptied by a delete goes with it', async () => {
  const a = await patch('rgb', { universe: 32 });
  const g = (await POST('/api/groups/add', { name: 'Solo', ids: [a.id] })).body.group;

  const { body: rm } = await POST('/api/fixtures/remove', { id: a.id });
  assert.deepStrictEqual(rm.groupsRemoved, [g.id], 'it reports what it cleaned up');
  const { body } = await GET('/api/state');
  assert.ok(!body.groups.some((x) => x.id === g.id), 'an empty group tab selects nothing and lies about its count');
});

// ---- limits -----------------------------------------------------------------

check('dimmer limits squeeze the output and apply across a selection', async () => {
  const a = await patch('rgb', { universe: 16, address: 1 });
  const b = await patch('rgb', { universe: 16, address: 10 });
  await POST('/api/fixtures/limits', { ids: [a.id, b.id], limits: { dimMax: 128 } });
  await POST('/api/fixtures/all', { values: { r: 255, g: 255, b: 255, dimmer: 255 } });
  await settle();
  assert.strictEqual(await wire(16, 1), 128, 'full on the fader is half on the lamp');
  assert.strictEqual(await wire(16, 10), 128, 'both of them');
});

check('pan and tilt ignore blackout', async () => {
  const f = await patch('pt', { universe: 17, address: 1 });
  await POST('/api/fixture', { id: f.id, values: { pan: 200, tilt: 60 } });
  await POST('/api/master', { blackout: true });
  await settle();
  assert.strictEqual(await wire(17, 1), 200, 'the head stays where it was pointed');
  assert.strictEqual(await wire(17, 2), 60);
  await POST('/api/master', { blackout: false });
});

// ---- input the interface should not be able to break ------------------------

check('out-of-range input is clamped, not obeyed', async () => {
  const f = await patch('rgb', { universe: 18 });
  await POST('/api/fixture', { id: f.id, address: 9999, universe: -4, index: -1 });
  const { body } = await GET('/api/state');
  const got = body.fixtures.find((x) => x.id === f.id);
  assert.strictEqual(got.address, 512);
  assert.strictEqual(got.universe, 0);
  assert.strictEqual(got.index, 1);

  await POST('/api/master', { master: 9999 });
  const after = await GET('/api/state');
  assert.strictEqual(after.body.master, 255);
  await POST('/api/master', { master: 255 });
});

check('editing a fixture that is not there is a 404', async () => {
  const { status } = await POST('/api/fixture', { id: 'fx-nope', values: { r: 1 } });
  assert.strictEqual(status, 404);
});

check('malformed JSON is a 400, not a dead server', async () => {
  const res = await fetch(base + '/api/master', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"master": ',
  });
  assert.strictEqual(res.status, 400);
  const { status } = await GET('/api/state');
  assert.strictEqual(status, 200, 'still serving afterwards');
});

check('an unknown api route is a 404 in JSON', async () => {
  const { status, body } = await GET('/api/nothing-here');
  assert.strictEqual(status, 404);
  assert.ok(body && body.error, 'answers in JSON, so the UI can read it');
});

check('the static handler will not serve outside public/', async () => {
  for (const attempt of ['/../server.js', '/..%2Fserver.js', '/../data/show.json']) {
    const res = await fetch(base + attempt);
    assert.ok(res.status === 403 || res.status === 404, attempt + ' leaked (' + res.status + ')');
    const text = await res.text();
    assert.ok(text.indexOf('require(') === -1, attempt + ' returned source');
  }
});

check('/api/state publishes what each channel role is', async () => {
  const { body } = await GET('/api/state');
  const k = body.roleKinds;
  assert.ok(k, 'roleKinds is published so the UI need not keep its own copy');
  for (const kind of ['emitter', 'level', 'position', 'control', 'fine']) {
    assert.ok(Array.isArray(k[kind]), 'missing kind: ' + kind);
  }
  assert.ok(k.emitter.includes('uv') && k.emitter.includes('lime'), 'uv and lime dim with the rig');
  assert.ok(k.level.includes('dimmer'));
  assert.ok(k.position.includes('pan') && k.position.includes('tilt'));
  assert.ok(k.control.includes('gobo') && k.control.includes('strobe'));
  assert.ok(k.fine.includes('panFine'));

  // Every channel of every profile must be classified, or the editor has nowhere to put it.
  const classified = new Set(Object.values(k).flat());
  for (const [name, p] of Object.entries(body.profiles)) {
    for (const role of p.channels) {
      assert.ok(classified.has(role), name + ' uses "' + role + '", which is not classified');
    }
  }
});

// ---- discovery --------------------------------------------------------------

check('discover reports where it looked', async () => {
  const { status, body } = await POST('/api/discover', {});
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.ok(Array.isArray(body.polled) && body.polled.length > 0, 'it says which addresses it tried');
  assert.ok(body.polled.includes('255.255.255.255'), 'the limited broadcast is always one of them');
});

check('discover will chase one address you name', async () => {
  // The case this is for: the node is on 2.x.x.x with a /8 mask and the laptop is on
  // 192.168.x.x, so it never hears the broadcast. Asking it directly is the only way to
  // find out whether it is reachable at all.
  const { body } = await POST('/api/discover', { address: '2.0.0.42' });
  assert.ok(body.polled.includes('2.0.0.42'), 'the named address was polled');
});

check('discover ignores an address that is not one', async () => {
  const { status, body } = await POST('/api/discover', { address: 'the node in the corner' });
  assert.strictEqual(status, 200, 'bad input is ignored, not a 500');
  assert.ok(!body.polled.includes('the node in the corner'));
});

check('configured unicast targets are polled by name', async () => {
  await POST('/api/output', { mode: 'unicast', targets: ['10.9.9.9'] });
  const { body } = await POST('/api/discover', {});
  assert.ok(body.polled.includes('10.9.9.9'), 'the address you typed in is asked directly');
  await POST('/api/output', { mode: 'broadcast', targets: [] });
});

check('a node carries how long ago it answered', async () => {
  const { body } = await GET('/api/state');
  assert.ok(Array.isArray(body.status.nodes), 'the node list survives');
  for (const n of body.status.nodes) {
    assert.ok('ageMs' in n, 'each node says how stale it is');
  }
});

// ---- devices added by address ------------------------------------------------
// The device list cannot be only what answered an ArtPoll. Gear that never replies — and
// a show network with no discovery to browse — still has to be reachable, and the address
// printed on the box is the whole of what the desk needs to know.

check('a device added by address is listed and is sent to', async () => {
  const { body } = await POST('/api/nodes/add', { address: '2.0.0.10', name: 'laser' });
  assert.strictEqual(body.ok, true);
  const row = body.nodes.find((n) => n.ip === '2.0.0.10');
  assert.ok(row, 'the device is in the list without ever having answered');
  assert.strictEqual(row.manual, true, 'it is marked as hand-added, not discovered');
  assert.strictEqual(row.name, 'laser');
  assert.strictEqual(row.ageMs, null, 'a device that has not spoken has no age, rather than a fake one');
  // Typing an address is a request to send there. A row that is listed but not addressed
  // is the bug this route exists to remove.
  assert.strictEqual(body.output.mode, 'unicast');
  assert.ok(body.output.targets.includes('2.0.0.10'), 'the show goes to the address that was typed');
});

check('a hand-added device is polled by name', async () => {
  const { body } = await POST('/api/discover', {});
  assert.ok(body.polled.includes('2.0.0.10'), 'if it can answer, it is asked directly');
});

check('adding the same address again renames it rather than duplicating it', async () => {
  const { body } = await POST('/api/nodes/add', { address: '2.0.0.10', name: 'laser SR' });
  assert.strictEqual(body.manual.filter((m) => m.ip === '2.0.0.10').length, 1, 'one device, not two');
  assert.strictEqual(body.manual.find((m) => m.ip === '2.0.0.10').name, 'laser SR');
});

check('an address that is not one is refused, with a reason', async () => {
  for (const address of ['2.0.0', '300.1.1.1', 'laser', '']) {
    const { status, body } = await POST('/api/nodes/add', { address });
    assert.strictEqual(status, 400, `${JSON.stringify(address)} is not an address`);
    assert.ok(body.error, 'and the refusal says why');
  }
});

check('hand-added devices survive a reload of the show file', async () => {
  await sleep(600);   // the save is debounced
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, "show.json"), 'utf8'));
  assert.deepStrictEqual(disk.output.manual.find((m) => m.ip === "2.0.0.10"), { ip: "2.0.0.10", name: "laser SR" },
    'the rig is part of the show, not something to retype every night');
});

check('removing a device also stops the show being sent to it', async () => {
  const { body } = await POST('/api/nodes/remove', { address: '2.0.0.10' });
  assert.ok(!body.manual.some((m) => m.ip === '2.0.0.10'), 'gone from the list');
  assert.ok(!body.targets.includes('2.0.0.10'),
    'and gone from the wire — a device removed from the rig must not still be receiving');
  await POST('/api/output', { mode: 'broadcast', targets: [] });
});

// ---- the suite must stay off the wire ---------------------------------------

check('the test server never transmits', async () => {
  // This is the guard on the whole suite. The test desk patches universe 0 among others,
  // and a real rig is usually listening on the same broadcast address — so if this ever
  // starts sending, running the tests visibly flickers Emily's fixtures. It has to stay
  // at zero no matter how many frames the 40 Hz loop has rendered.
  await patch('rgb', { universe: 0, address: 200 });
  await sleep(300);   // a dozen frames or so
  const { body } = await GET('/api/state');
  assert.strictEqual(body.status.packetsSent, 0, 'ARTNET_OFFLINE is not being honoured');
  assert.ok(body.status.universes.length > 0, 'and it really is rendering, not just idle');
});

// ---- persistence ------------------------------------------------------------

check('the desk is written to the show file', async () => {
  const f = await patch('rgbw', { universe: 19, address: 42 });
  await POST('/api/fixture', { id: f.id, name: 'Back wash' });
  await sleep(700);   // save() debounces at 400ms
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'show.json'), 'utf8'));
  const saved = disk.fixtures.find((x) => x.id === f.id);
  assert.ok(saved, 'the fixture made it to disk');
  assert.strictEqual(saved.name, 'Back wash');
  assert.strictEqual(saved.address, 42);
});

// ---- things that once took the desk down ------------------------------------

check('a malformed path is a 400, not the end of the process', async () => {
  const res = await fetch(base + '/%');
  assert.strictEqual(res.status, 400);
  const { status } = await GET('/api/dmx');
  assert.strictEqual(status, 200, 'the desk is still answering');
});

check('a fade time that is not a number is ignored, not a blackout', async () => {
  const f = await patch('drgb', { address: 300 });
  await POST('/api/fixture', { id: f.id, values: { dimmer: 255, r: 200, g: 0, b: 0 } });
  const { body: saved } = await POST('/api/scenes/save', { name: 'nan fade' });
  await POST('/api/fixture', { id: f.id, values: { r: 0 } });
  await POST('/api/scenes/recall', { id: saved.scene.id, fadeMs: 'slow' });
  await settle();
  assert.strictEqual(await wire(0, 301), 200, 'the scene landed');
  const { body } = await GET('/api/state');
  assert.strictEqual(body.status.fading, false, 'no fade is stuck open');
  await POST('/api/scenes/remove', { id: saved.scene.id });
  await POST('/api/fixtures/remove', { id: f.id });
});

check('master refuses a value that is not a number', async () => {
  await POST('/api/master', { master: {} });
  let { body } = await GET('/api/state');
  assert.strictEqual(body.master, 255);
  await POST('/api/master', { master: '12' });
  ({ body } = await GET('/api/state'));
  assert.strictEqual(body.master, 12, 'a numeric string is still a number');
  await POST('/api/master', { master: 255 });
});

check('a body split across socket chunks keeps its characters', async () => {
  const net = require('net');
  const name = 'Red › bars · ring';
  const payload = Buffer.from(JSON.stringify({ name }), 'utf8');
  const cut = payload.indexOf(Buffer.from('›')) + 1;   // inside the 3-byte character
  const url = new URL(base);
  const reply = await new Promise((resolve, reject) => {
    const sock = net.connect(Number(url.port), url.hostname, () => {
      sock.write('POST /api/scenes/save HTTP/1.0\r\nhost: x\r\ncontent-type: application/json\r\n' +
        'content-length: ' + payload.length + '\r\n\r\n');
      sock.write(payload.subarray(0, cut));
      setTimeout(() => sock.write(payload.subarray(cut)), 30);
    });
    let text = '';
    sock.on('data', (c) => { text += c; });
    sock.on('end', () => resolve(text));
    sock.on('error', reject);
  });
  const saved = JSON.parse(reply.slice(reply.indexOf('\r\n\r\n') + 4));
  assert.strictEqual(saved.scene.name, name);
  await POST('/api/scenes/remove', { id: saved.scene.id });
});

check('an oversize body is refused with 413 rather than a dead socket', async () => {
  const res = await fetch(base + '/api/scenes/save', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{"name":"' + 'a'.repeat(17 * 1024 * 1024) + '"}',
  }).catch(() => null);
  if (res) assert.strictEqual(res.status, 413);
  const { status } = await GET('/api/dmx');
  assert.strictEqual(status, 200, 'the desk is still answering');
});

check('a raw key that is not one is dropped, not transmitted', async () => {
  await POST('/api/raw', { channels: [{ universe: 99999, channel: 5, value: 255 }, { universe: 0, channel: 400, value: 9 }] });
  let { body } = await GET('/api/state');
  assert.ok(!Object.keys(body.raw).some((k) => k.startsWith('99999')), 'a universe past 32767 is refused');
  assert.strictEqual(body.raw['0:400'], 9);
  const { body: rep } = await POST('/api/scenes/replace', { scenes: [
    { id: 'rawjunk', name: 'junk', fixtures: [], raw: { oops: 255, '5:600': 1, '1:3': 'x', '2:7': 300 } },
  ] });
  assert.ok(rep.ok);
  ({ body } = await GET('/api/state'));
  assert.deepStrictEqual(body.scenes.find((s) => s.id === 'rawjunk').raw, { '2:7': 255 });
  await POST('/api/scenes/replace', { scenes: [] });
  await POST('/api/raw', { clear: true });
});

check('scenes saved in the same millisecond get different ids', async () => {
  const saves = await Promise.all([...Array(12)].map(() => POST('/api/scenes/save', { name: 'twin' })));
  const ids = saves.map((r) => r.body.scene.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids: ' + ids.join(' '));
  for (const id of ids) await POST('/api/scenes/remove', { id });
});

check('a library scene with no exclude list leaves the live one alone', async () => {
  await POST('/api/fx', { mode: 'none', enabled: false, exclude: ['Beam 16ch'] });
  await POST('/api/scenes/replace', { scenes: [
    { id: 'noex', name: 'no list', fixtures: [], fx: { mode: 'pulse', enabled: false } },
    { id: 'withex', name: 'a list', fixtures: [], fx: { mode: 'pulse', enabled: false, exclude: ['rgb'] } },
  ] });
  await POST('/api/scenes/recall', { id: 'noex' });
  let { body } = await GET('/api/state');
  assert.deepStrictEqual(body.fx.exclude, ['Beam 16ch'], 'a scene without a list keeps the beams protected');
  assert.strictEqual(body.fx.mode, 'pulse', 'the rest of the fx still came along');
  await POST('/api/scenes/recall', { id: 'withex' });
  ({ body } = await GET('/api/state'));
  assert.deepStrictEqual(body.fx.exclude, ['rgb'], 'a scene with a list sets it');
  await POST('/api/fx', { mode: 'none', enabled: false, exclude: [] });
  await POST('/api/scenes/replace', { scenes: [] });
});

check('moving a fixture on the stage does not forget the scene or cancel a fade', async () => {
  const f = await patch('drgb', { address: 320 });
  const { body: saved } = await POST('/api/scenes/save', { name: 'stay' });
  await POST('/api/scenes/recall', { id: saved.scene.id });
  await POST('/api/fixture', { id: f.id, x: 0.3, y: 0.7 });
  const { body } = await GET('/api/state');
  assert.strictEqual(body.activeScene, saved.scene.id);
  await POST('/api/fixture', { id: f.id, values: { r: 1 } });
  const { body: after } = await GET('/api/state');
  assert.strictEqual(after.activeScene, null, 'a value change still clears it');
  await POST('/api/scenes/remove', { id: saved.scene.id });
  await POST('/api/fixtures/remove', { id: f.id });
});

check('a fixture value that is not a number is dropped', async () => {
  const f = await patch('drgb', { address: 330 });
  await POST('/api/fixture', { id: f.id, values: { dimmer: 255, r: 100 } });
  await POST('/api/fixture', { id: f.id, values: { r: 'full', g: null, b: '77.4' } });
  await settle();
  assert.strictEqual(await wire(0, 331), 100, 'r kept its last real value');
  assert.strictEqual(await wire(0, 333), 77, 'a numeric string is rounded and stored');
  await POST('/api/fixtures/remove', { id: f.id });
});

check('the serial port has to be a serial device', async () => {
  const before = (await GET('/api/state')).body.output.serialPort;
  const bad = process.platform === 'win32' ? '\\\\.\\PhysicalDrive0' : '/dev/null';
  await POST('/api/output', { serialPort: bad });
  const { body } = await GET('/api/state');
  assert.strictEqual(body.output.serialPort, before);
});

check('the show file on disk is always a complete show', async () => {
  const dir = process.env.DATA_DIR;
  await POST('/api/master', { master: 254 });
  await sleep(500);
  await POST('/api/master', { master: 255 });
  await sleep(500);
  assert.ok(!fs.existsSync(path.join(dir, 'show.json.tmp')), 'no temp file left behind');
  assert.ok(fs.existsSync(path.join(dir, 'show.prev.json')), 'the previous save is kept');
  JSON.parse(fs.readFileSync(path.join(dir, 'show.json'), 'utf8'));
  JSON.parse(fs.readFileSync(path.join(dir, 'show.prev.json'), 'utf8'));
});

// ---- looks and layers over the wire -----------------------------------------

check('a look library round-trips, and a bad one is refused whole', async () => {
  const { body } = await POST('/api/looks', { looks: [
    { id: 'red', name: 'House red', kind: 'colour', steps: [{ values: { '*': { r: 220, g: 10, b: 0 } } }] },
    { id: 'nosteps', name: 'empty' },
  ] });
  assert.strictEqual(body.count, 1, 'a look with no steps is not a look');
  const { body: read } = await GET('/api/looks');
  assert.strictEqual(read.looks[0].name, 'House red');
  assert.ok(read.kinds.includes('colour'), 'the page is told what kinds exist rather than keeping its own list');
  const bad = await POST('/api/looks', { looks: 'nope' });
  assert.strictEqual(bad.status, 400);
});

check('a layer drives the wire, and its fader is one small request', async () => {
  const f = await patch('drgb', { address: 400 });
  await POST('/api/fixture', { id: f.id, values: { dimmer: 255, r: 0, g: 0, b: 0 } });
  await POST('/api/looks', { looks: [
    { id: 'blue', kind: 'colour', steps: [{ values: { [f.id]: { b: 255 } } }] },
  ] });
  await POST('/api/layers', { layers: [{ id: 'lay1', name: 'Blue', lookId: 'blue', level: 1 }] });
  await settle();
  assert.strictEqual(await wire(0, 403), 255, 'the layer is on the rig');
  const { body } = await POST('/api/layer', { id: 'lay1', level: 0 });
  assert.strictEqual(body.layer.level, 0);
  await settle();
  assert.strictEqual(await wire(0, 403), 0, 'and the fader took it away');
  const missing = await POST('/api/layer', { id: 'nope', level: 1 });
  assert.strictEqual(missing.status, 404);
  await POST('/api/layers', { layers: [] });
  await POST('/api/looks', { looks: [] });
  await POST('/api/fixtures/remove', { id: f.id });
});

check('the summary says what the stack is doing', async () => {
  await POST('/api/looks', { looks: [{ id: 'l1', steps: [{ values: { '*': { dimmer: 10 } } }] }] });
  await POST('/api/layers', { layers: [{ id: 'a', name: 'Wash', lookId: 'l1', level: 0.5 }] });
  const { body } = await GET('/api/summary');
  assert.strictEqual(body.looks, 1);
  assert.deepStrictEqual(body.layers, [{ id: 'a', name: 'Wash', on: true, level: 0.5, lookId: 'l1' }]);
  await POST('/api/layers', { layers: [] });
  await POST('/api/looks', { looks: [] });
});

check('looks and layers survive a reload of the show file', async () => {
  await POST('/api/looks', { looks: [{ id: 'keep', name: 'Keep', steps: [{ values: { '*': { r: 5 } } }] }] });
  await POST('/api/layers', { layers: [{ id: 'keeplay', lookId: 'keep', level: 0.25 }] });
  await sleep(600);
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'show.json'), 'utf8'));
  assert.strictEqual(disk.looks[0].name, 'Keep');
  assert.strictEqual(disk.layers[0].level, 0.25);
  await POST('/api/layers', { layers: [] });
  await POST('/api/looks', { looks: [] });
});

check('recording the stage makes a look, and a kind records only that lane', async () => {
  const f = await patch('ptdrgb', { address: 420 });
  await POST('/api/fixture', { id: f.id, values: { dimmer: 200, r: 10, g: 20, b: 30, pan: 77 } });
  const { body: all } = await POST('/api/looks/capture', { name: 'Whole stage', fixtures: [f.id] });
  assert.ok(all.look.steps[0].values[f.id].pan === 77 && all.look.steps[0].values[f.id].r === 10);
  const { body: col } = await POST('/api/looks/capture', { name: 'Just colour', kind: 'colour', fixtures: [f.id] });
  assert.deepStrictEqual(Object.keys(col.look.steps[0].values[f.id]).sort(), ['b', 'g', 'r'],
    'a colour palette holds colour and nothing else');
  await POST('/api/looks/remove', { id: all.look.id });
  await POST('/api/looks/remove', { id: col.look.id });
  await POST('/api/fixtures/remove', { id: f.id });
});

check('a new layer arrives on top and OFF, so nothing changes in the room', async () => {
  await POST('/api/looks', { looks: [{ id: 'x', steps: [{ values: { '*': { dimmer: 255 } } }] }] });
  const { body: first } = await POST('/api/layers/add', { name: 'One', lookId: 'x' });
  assert.strictEqual(first.layer.level, 0, 'a layer added mid-show cannot light anything by itself');
  const { body: second } = await POST('/api/layers/add', { name: 'Two' });
  assert.ok(second.layer.priority > first.layer.priority, 'and it lands above what is already there');
  const { body: gone } = await POST('/api/layers/remove', { id: first.layer.id });
  assert.ok(gone.ok);
  assert.strictEqual((await POST('/api/layers/remove', { id: first.layer.id })).status, 404);
  await POST('/api/layers', { layers: [] });
  await POST('/api/looks', { looks: [] });
});

check('deleting a look empties the layers that named it rather than deleting them', async () => {
  await POST('/api/looks', { looks: [{ id: 'doomed', steps: [{ values: { '*': { r: 1 } } }] }] });
  await POST('/api/layers', { layers: [{ id: 'holder', lookId: 'doomed', level: 1 }] });
  const { body } = await POST('/api/looks/remove', { id: 'doomed' });
  assert.strictEqual(body.emptied, 1);
  const { body: state } = await GET('/api/layers');
  assert.strictEqual(state.layers[0].lookId, null, 'the fader keeps its place in the stack');
  await POST('/api/layers', { layers: [] });
});

// ---- harness ----------------------------------------------------------------

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artnet-test-'));
  process.env.DATA_DIR = dir;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'standalone.js')], {
    // ARTNET_OFFLINE matters as much as the rest: without it the test server broadcasts
    // its universes at 40 Hz to the same address a real rig is listening on, and the
    // fixtures visibly flicker through the test run.
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, ARTNET_BIND_PORT: '0', ARTNET_OFFLINE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  const port = await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('server did not start in 10s:\n' + log)), 10000);
    child.stdout.on('data', (c) => {
      log += c;
      const m = log.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(bail); resolve(Number(m[1])); }
    });
    child.stderr.on('data', (c) => { log += c; });
    child.on('exit', (code) => { clearTimeout(bail); reject(new Error('server exited (' + code + '):\n' + log)); });
  });
  base = 'http://127.0.0.1:' + port;

  try {
    for (const t of tests) {
      // Park the desk before each test rather than tidying up after. A test that fails
      // partway through never reaches its own cleanup, and a master left at half would
      // then fail every test after it for the wrong reason.
      await POST('/api/master', { master: 255, blackout: false });
      await POST('/api/raw', { clear: true });
      try { await t.fn(); console.log('  ok   ' + t.name); }
      catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + e.message); }
    }
  } finally {
    child.kill();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('');
  console.log(failures ? '  ' + failures + ' failing' : '  all passing');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
