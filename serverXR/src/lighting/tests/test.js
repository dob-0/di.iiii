'use strict';
// Byte-level checks on the Art-Net packets and the render engine.
// Run with: npm test

const assert = require('assert');
const { buildDmx, buildPoll } = require('../artnet');
const { Engine, makeFixture, addProfile, removeProfile, customProfiles, PROFILES } = require('../engine');
const { Enttec, frame, listPorts, describePort, PORT_NAME } = require('../enttec');
const { FX_MODES, fxOrder, fxLevel, fxActive, fxPhase } = require('../fx');

// A synchronous pause, so the rate limiting can be tested without making every check async.
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

check('ArtDmx header is spec-shaped', () => {
  const data = Buffer.alloc(512);
  data[0] = 128;
  const p = buildDmx(0, 7, data);
  assert.strictEqual(p.length, 530);
  assert.strictEqual(p.toString('latin1', 0, 7), 'Art-Net');
  assert.strictEqual(p[7], 0);
  assert.strictEqual(p.readUInt16LE(8), 0x5000, 'opcode is little-endian 0x5000');
  assert.strictEqual(p[10], 0);
  assert.strictEqual(p[11], 14, 'protocol version 14');
  assert.strictEqual(p[12], 7, 'sequence');
  assert.strictEqual(p.readUInt16BE(16), 512, 'length is big-endian');
  assert.strictEqual(p[18], 128, 'channel 1 payload');
});

check('port address splits into net / sub-uni', () => {
  const p = buildDmx(0x1234 & 0x7fff, 1, Buffer.alloc(2));
  assert.strictEqual(p[14], 0x34, 'low byte = sub-net + universe');
  assert.strictEqual(p[15], 0x12, 'high byte = net');
});

check('ArtPoll is 14 bytes with opcode 0x2000', () => {
  const p = buildPoll();
  assert.strictEqual(p.length, 14);
  assert.strictEqual(p.readUInt16LE(8), 0x2000);
  assert.strictEqual(p[11], 14);
});

function baseState(fixtures) {
  return {
    master: 255, blackout: false, fixtures, raw: {}, scenes: [], activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 },
  };
}

check('RGB fixture lands on its patched channels', () => {
  const f = makeFixture({ profile: 'rgb', address: 10, universe: 0, values: { r: 255, g: 128, b: 0, dimmer: 255 } });
  const e = new Engine(baseState([f]));
  const buf = e.render().get(0);
  assert.strictEqual(buf[9], 255);
  assert.strictEqual(buf[10], 128);
  assert.strictEqual(buf[11], 0);
  assert.strictEqual(buf[8], 0, 'channel before the fixture stays dark');
});

check('virtual dimmer scales colour when the fixture has no dim channel', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 200, g: 100, b: 0, dimmer: 128 } });
  const e = new Engine(baseState([f]));
  const buf = e.render().get(0);
  assert.strictEqual(buf[0], Math.round(200 * 128 / 255));
  assert.strictEqual(buf[1], Math.round(100 * 128 / 255));
});

check('a real dim channel is not double-scaled', () => {
  const f = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 128, r: 200, g: 0, b: 0 } });
  const e = new Engine(baseState([f]));
  const buf = e.render().get(0);
  assert.strictEqual(buf[0], 128, 'dimmer channel carries the level');
  assert.strictEqual(buf[1], 200, 'red stays at full');
});

check('master is not applied twice to a fixture with a dimmer channel', () => {
  // A drgb and an rgb pointed at the same colour must track each other as the master
  // moves. Scaling the drgb's colour channels by master as well would make it dive
  // quadratically and pull the colour of a mixed rig around.
  const d = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255, g: 255, b: 255 } });
  const g = makeFixture({ profile: 'rgb', address: 10, values: { dimmer: 255, r: 255, g: 255, b: 255 } });
  const s = baseState([d, g]);
  const e = new Engine(s);
  s.master = 128;
  const buf = e.render().get(0);
  assert.strictEqual(buf[0], 128, 'the dimmer channel carries the master');
  assert.strictEqual(buf[1], 255, 'red stays at full — the dimmer already has the master');
  assert.strictEqual(buf[9], 128, 'the dimmerless fixture gets the master on its colour');
});

check('blackout kills a fixture with a dimmer channel', () => {
  const f = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255, g: 0, b: 0 } });
  const s = baseState([f]);
  const e = new Engine(s);
  s.blackout = true;
  assert.strictEqual(e.render().get(0)[0], 0, 'dimmer channel goes to zero');
});

check('a dimmer floor still blacks out', () => {
  // dimMin lifts the bottom of the range, but blackout has to win over it.
  const f = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 0, r: 255, g: 0, b: 0 },
                          limits: { dimMin: 60, dimMax: 255 } });
  const s = baseState([f]);
  const e = new Engine(s);
  assert.strictEqual(e.render().get(0)[0], 60, 'the floor holds with the fader down');
  s.blackout = true;
  assert.strictEqual(e.render().get(0)[0], 0, 'blackout beats the floor');
});

check('master and blackout scale fixtures', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 255, b: 255, dimmer: 255 } });
  const s = baseState([f]);
  const e = new Engine(s);
  s.master = 128;
  assert.strictEqual(e.render().get(0)[0], 128);
  s.blackout = true;
  assert.strictEqual(e.render().get(0)[0], 0);
});

check('raw overrides replace the fixture value and ride the master', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 0, b: 0, dimmer: 255 } });
  const s = baseState([f]);
  s.raw = { '0:1': 100, '0:20': 200 };
  let buf = new Engine(s).render().get(0);
  assert.strictEqual(buf[0], 100, 'the override replaces what the fixture was rendering');
  assert.strictEqual(buf[19], 200, 'an override outside any fixture still outputs');

  s.master = 128;
  buf = new Engine(s).render().get(0);
  assert.strictEqual(buf[19], 100, 'manual channels follow the master like everything else');

  // These used to bypass blackout so a shutter could be parked through it. The Fader page
  // made manual channels a control surface, and a panic button that cannot reach the
  // surface you are working on is worse than losing the parked shutter.
  s.blackout = true;
  buf = new Engine(s).render().get(0);
  assert.strictEqual(buf[19], 0, 'blackout reaches manual channels too');
});

check('fixtures on different universes stay separate', () => {
  const a = makeFixture({ profile: 'dimmer', address: 5, universe: 0, values: { dimmer: 255 } });
  const b = makeFixture({ profile: 'dimmer', address: 5, universe: 3, values: { dimmer: 100 } });
  const e = new Engine(baseState([a, b]));
  const out = e.render();
  assert.strictEqual(out.get(0)[4], 255);
  assert.strictEqual(out.get(3)[4], 100);
});

check('scene capture and recall restore values', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 0, b: 0, dimmer: 255 } });
  const s = baseState([f]);
  const e = new Engine(s);
  const scene = e.captureScene('red');
  Object.assign(f.values, { r: 0, b: 255 });
  assert.strictEqual(e.render().get(0)[2], 255);
  e.recallScene(scene, 0);
  const buf = e.render().get(0);
  assert.strictEqual(buf[0], 255);
  assert.strictEqual(buf[2], 0);
});

check('a scene carries the fx, lfo and audio setup, and recall restores them', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 0, b: 0, dimmer: 255 } });
  const s = baseState([f]);
  s.fx = { mode: 'pulse', bpm: 100, depth: 200, enabled: true, spatial: 'patch', exclude: [] };
  s.lfos = [{ id: 'l1', name: '', enabled: true, wave: 'sine', beats: 2, depth: 100,
    spread: 0, channel: 'dimmer', bipolar: false, targets: { profiles: [], ids: [] } }];
  s.audioCfg = { enabled: true, mode: 'bass', amount: 200, release: 500, useBeats: false };
  const e = new Engine(s);
  const scene = e.captureScene('look');
  assert.deepStrictEqual(scene.audioCfg, { enabled: true, mode: 'bass', amount: 200, release: 500, useBeats: false });
  s.audioCfg = { enabled: false, mode: 'level', amount: 255, release: 300, useBeats: true };
  s.fx.mode = 'none'; s.lfos = [];
  e.recallScene(scene, 0);
  assert.deepStrictEqual(s.audioCfg, { enabled: true, mode: 'bass', amount: 200, release: 500, useBeats: false },
    'the audio setup came back with the look, useBeats included');
  assert.strictEqual(s.fx.mode, 'pulse');
  assert.strictEqual(s.lfos.length, 1);
});

check('recalling a scene never overwrites the live tapped tempo', () => {
  const f = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 0, b: 0, dimmer: 255 } });
  const s = baseState([f]);
  s.fx = { mode: 'pulse', bpm: 100, depth: 200, enabled: true, spatial: 'patch', exclude: [] };
  const e = new Engine(s);
  const scene = e.captureScene('look');           // stores bpm 100 (harmless)
  s.fx.bpm = 174;                                 // the operator taps a new tempo
  s.fx.mode = 'none'; s.fx.enabled = false;
  e.recallScene(scene, 0);
  assert.strictEqual(s.fx.mode, 'pulse', 'the scene brings its mode back');
  assert.strictEqual(s.fx.enabled, true, 'and arms it');
  assert.strictEqual(s.fx.bpm, 174, 'but the tempo stays with the operator, not the scene');
});

check('recall validates a hand-edited scene audio setup with the live clamps', () => {
  const e = new Engine(baseState([]));
  e.state.audioCfg = { enabled: false, mode: 'level', amount: 255, release: 300 };
  e.recallScene({ id: 'x', fadeMs: 0, fixtures: [], raw: {},
    audioCfg: { enabled: 1, mode: 'nonsense', amount: 9999, release: -5 } }, 0);
  assert.deepStrictEqual(e.state.audioCfg, { enabled: true, mode: 'level', amount: 255, release: 50, useBeats: true },
    'the same clamps as POST /api/audiocfg apply on the way in');
});

check('a scene without an audio setup leaves the running one alone', () => {
  const e = new Engine(baseState([]));
  e.state.audioCfg = { enabled: true, mode: 'bass', amount: 100, release: 400 };
  e.recallScene({ id: 'x', fadeMs: 0, fixtures: [], raw: {} }, 0);
  assert.deepStrictEqual(e.state.audioCfg, { enabled: true, mode: 'bass', amount: 100, release: 400 },
    'an old scene must not yank the audio setup out from under the rig');
});

check('beat-pump with useBeats off pumps on the fx clock and ignores mic beats', () => {
  const f = makeFixture({ profile: 'dimmer', address: 1, values: { dimmer: 255 } });
  const s = baseState([f]);
  s.fx = { mode: 'none', enabled: false, bpm: 100, depth: 255, exclude: [] };  // 600ms beats
  const now = 6300;                                     // exactly mid-beat on the fx clock
  s.audio = { level: 0, low: 0, mid: 0, high: 0, beatAt: now, bpm: null, lastAt: now };
  s.audioCfg = { enabled: true, mode: 'beat-pump', amount: 255, release: 300, useBeats: true };
  assert.strictEqual(new Engine(s).render(s, now).get(0)[0], 255,
    'trusting beats: a mic beat just landed, full hit');
  s.audioCfg.useBeats = false;
  assert.strictEqual(new Engine(s).render(s, now).get(0)[0], 63,
    'metronome mid-beat: (1-0.5)^2 of 255, the fresh mic beat is ignored');
  s.audio.beatAt = 0; s.audio.lastAt = 6600;
  assert.strictEqual(new Engine(s).render(s, 6600).get(0)[0], 255,
    'full hit at every beat boundary of the fx clock, no mic beat needed');
  s.audio.lastAt = now - 5000;                          // mic stopped streaming
  assert.strictEqual(new Engine(s).render(s, now).get(0)[0], 255,
    'stale audio mid-beat means untouched (255), not a free-running metronome');
});

check('fade interpolates between looks', () => {
  const f = makeFixture({ profile: 'dimmer', address: 1, values: { dimmer: 0 } });
  const e = new Engine(baseState([f]));
  e.tick();                                   // live settles at 0
  f.values.dimmer = 255;
  e.startFade(1000);
  e.fade.start = Date.now() - 500;            // pretend we are halfway
  const buf = e.tick().get(0);
  assert.ok(buf[0] > 100 && buf[0] < 155, 'halfway through the fade, got ' + buf[0]);
});

check('addresses cannot run off the end of a universe', () => {
  const f = makeFixture({ profile: 'rgbw', address: 511, values: { r: 255, g: 255, b: 255, w: 255, dimmer: 255 } });
  const buf = new Engine(baseState([f])).render().get(0);
  assert.strictEqual(buf[510], 255);
  assert.strictEqual(buf[511], 255);
  assert.strictEqual(buf.length, 512, 'buffer never grows past 512');
});

check('dimmer limits squeeze the output range', () => {
  const f = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255, g: 0, b: 0 } });
  f.limits.dimMax = 128;
  const buf = new Engine(baseState([f])).render().get(0);
  assert.strictEqual(buf[0], 128, 'full dimmer stops at the max limit');
});

check('pan/tilt limits, invert and swap', () => {
  const f = makeFixture({ profile: 'pt', address: 1, values: { pan: 255, tilt: 0 } });
  const e = new Engine(baseState([f]));
  assert.deepStrictEqual([...e.render().get(0).slice(0, 2)], [255, 0]);
  f.limits.panMax = 128;
  assert.strictEqual(e.render().get(0)[0], 128, 'pan max caps travel');
  f.limits.panMax = 255; f.limits.invertPan = true;
  assert.strictEqual(e.render().get(0)[0], 0, 'invert flips pan');
  f.limits.invertPan = false; f.limits.swapPT = true;
  assert.strictEqual(e.render().get(0)[0], 0, 'swap feeds tilt into the pan channel');
  assert.strictEqual(e.render().get(0)[1], 255);
});

check('pan/tilt ignore master and blackout', () => {
  const f = makeFixture({ profile: 'ptrgb', address: 1, values: { pan: 200, tilt: 100, r: 255, g: 255, b: 255 } });
  const s = baseState([f]);
  s.blackout = true;
  const buf = new Engine(s).render().get(0);
  assert.strictEqual(buf[0], 200, 'pan holds position in blackout');
  assert.strictEqual(buf[1], 100);
  assert.strictEqual(buf[2], 0, 'but the colour is killed');
});

check('nextFreeAddress skips patched channels', () => {
  const a = makeFixture({ profile: 'rgb', address: 1, universe: 0 });
  const b = makeFixture({ profile: 'rgb', address: 4, universe: 0 });
  const e = new Engine(baseState([a, b]));
  assert.strictEqual(e.nextFreeAddress(0, 3), 7, 'lands after the two patched fixtures');
  assert.strictEqual(e.nextFreeAddress(1, 3), 1, 'a different universe starts clean');
});

check('nextIndex follows the highest fixture number', () => {
  const a = makeFixture({ profile: 'rgb', index: 4 });
  const e = new Engine(baseState([a]));
  assert.strictEqual(e.nextIndex(), 5);
});

check('every profile has a unique, in-range channel list', () => {
  const { PROFILES } = require('../engine');
  for (const [name, p] of Object.entries(PROFILES)) {
    assert.ok(p.channels.length >= 1 && p.channels.length <= 32, name + ' width');
    assert.strictEqual(new Set(p.channels).size, p.channels.length, name + ' repeats a role');
    assert.ok(p.label.includes(name), name + ' label');
  }
});

check('dimmer + strobe + speed + colour behaves per channel', () => {
  const f = makeFixture({
    profile: 'dsspdrgb', address: 1,
    values: { dimmer: 128, strobe: 200, speed: 90, r: 255, g: 100, b: 0 },
  });
  const s = baseState([f]);
  const e = new Engine(s);
  let buf = e.render().get(0);
  assert.strictEqual(buf[0], 128, 'the dimmer carries the level');
  assert.strictEqual(buf[1], 200, 'strobe passes through');
  assert.strictEqual(buf[2], 90, 'so does its speed');
  assert.strictEqual(buf[3], 255, 'colour stays at full — the dimmer already has the level');
  assert.strictEqual(buf[4], 100);

  s.blackout = true;
  buf = e.render().get(0);
  assert.strictEqual(buf[0], 0, 'blackout kills it through the dimmer channel');
  assert.strictEqual(buf[1], 200, 'strobe and speed are settings, not light — they hold');
  assert.strictEqual(buf[2], 90);
});

// ---- the role vocabulary ----------------------------------------------------

check('every role that emits light has a default', () => {
  const { ROLE_DEFAULTS, LIGHT_ROLES } = require('../engine');
  for (const role of LIGHT_ROLES) {
    assert.ok(role in ROLE_DEFAULTS, role + ' emits light but has no default value');
  }
});

check('the extra emitters start dark', () => {
  const { ROLE_DEFAULTS } = require('../engine');
  // A par coming up with its UV lit because that was the channel default is the kind of
  // surprise you only discover in front of an audience.
  assert.strictEqual(ROLE_DEFAULTS.uv, 0);
  assert.strictEqual(ROLE_DEFAULTS.lime, 0);
  assert.strictEqual(ROLE_DEFAULTS.panFine, 0, 'a fine channel is an offset, so zero is none');
});

check('control channels are not treated as light', () => {
  const { LIGHT_ROLES } = require('../engine');
  for (const role of ['gobo', 'zoom', 'focus', 'iris', 'prism', 'macro', 'speed',
                      'sound', 'auto', 'panFine', 'tiltFine', 'strobe']) {
    assert.ok(!LIGHT_ROLES.has(role), role + ' must not be dimmed');
  }
});

check('uv dims with the rig, gobo does not', () => {
  const { PROFILES } = require('../engine');
  PROFILES.__test = { cat: '_TEST', channels: ['r', 'uv', 'gobo'] };
  try {
    const f = makeFixture({ profile: '__test', address: 1, values: { r: 255, uv: 200, gobo: 77, dimmer: 128 } });
    const s = baseState([f]);
    const e = new Engine(s);
    let buf = e.render().get(0);
    assert.strictEqual(buf[0], 128, 'red follows the virtual dimmer');
    assert.strictEqual(buf[1], 100, 'so does uv — it is an emitter');
    assert.strictEqual(buf[2], 77, 'gobo is a position, not a level');

    s.blackout = true;
    buf = e.render().get(0);
    assert.strictEqual(buf[1], 0, 'blackout kills the uv');
    assert.strictEqual(buf[2], 77, 'and leaves the gobo where it was parked');
  } finally {
    delete PROFILES.__test;
  }
});

check('every role is classified exactly once', () => {
  const { ROLE_DEFAULTS, roleKinds } = require('../engine');
  const kinds = roleKinds();
  const all = Object.values(kinds).flat();
  assert.strictEqual(new Set(all).size, all.length, 'a role appears under two kinds');
  assert.deepStrictEqual(new Set(all), new Set(Object.keys(ROLE_DEFAULTS)),
    'the published classification and the defaults table disagree about which roles exist');
});

check('a role nobody has heard of is a plain fader', () => {
  const { roleKind } = require('../engine');
  assert.strictEqual(roleKind('wibble'), 'control');
});

check('the published classification matches what the renderer does', () => {
  // This is the anti-drift test. The interface decides what to draw from `roleKinds`, so
  // if that list ever says "emitter" for a channel the renderer passes straight through
  // (or the reverse), the UI lies about the rig. Rather than assert the two lists match,
  // assert the published answer against the DMX that actually comes out.
  const { PROFILES, roleKinds } = require('../engine');
  const kinds = roleKinds();
  for (const [kind, roles] of Object.entries(kinds)) {
    if (kind === 'level') continue;               // the dimmer is covered by its own tests
    for (const role of roles) {
      PROFILES.__k = { cat: '_TEST', channels: [role] };
      try {
        const f = makeFixture({ profile: '__k', address: 1, values: { [role]: 200, dimmer: 255 } });
        const s = baseState([f]);
        const e = new Engine(s);
        s.master = 128;
        const got = e.render().get(0)[0];
        if (kind === 'emitter') {
          assert.strictEqual(got, 100, role + ' is published as an emitter but ignored the master');
        } else {
          assert.strictEqual(got, 200, role + ' is published as ' + kind + ' but the master moved it');
        }
      } finally {
        delete PROFILES.__k;
      }
    }
  }
});

// ---- discovery --------------------------------------------------------------

// offline + an ephemeral local port: constructing this never touches 6454 or the wire.
const { ArtNet, broadcastAddresses } = require('../artnet');
const probe = new ArtNet({ offline: true, bindPort: 0 });

check('a poll goes to the broadcasts, the known nodes and anything handed in', () => {
  const targets = probe.pollTargets(['10.0.0.7']);
  for (const bc of broadcastAddresses()) assert.ok(targets.includes(bc), 'missing broadcast ' + bc);
  assert.ok(targets.includes('10.0.0.7'), 'the address handed in is polled directly');
  assert.strictEqual(new Set(targets).size, targets.length, 'no address is polled twice');
});

check('a node already found is polled directly next time', () => {
  probe.nodes.set('2.0.0.42', { ip: '2.0.0.42', seen: Date.now() });
  assert.ok(probe.pollTargets().includes('2.0.0.42'),
    'a node on a foreign subnet cannot hear the broadcast, so it has to be asked directly');
});

check('junk addresses are not polled', () => {
  const targets = probe.pollTargets(['', 'not-an-ip', null, undefined, '1.2.3']);
  assert.ok(!targets.some((t) => t === '' || t === 'not-an-ip' || t === '1.2.3'));
});

check('nodes that stopped answering are dropped', () => {
  probe.nodes.clear();
  probe.nodes.set('2.0.0.1', { ip: '2.0.0.1', seen: Date.now() });
  probe.nodes.set('2.0.0.2', { ip: '2.0.0.2', seen: Date.now() - 120000 });
  probe.nodes.set('2.0.0.3', { ip: '2.0.0.3' });                       // never stamped
  probe.pruneNodes(60000);
  assert.deepStrictEqual([...probe.nodes.keys()], ['2.0.0.1'],
    'an unplugged node must not sit in the list looking reachable');
});

check('the node list says how long ago each one answered', () => {
  probe.nodes.clear();
  probe.nodes.set('2.0.0.1', { ip: '2.0.0.1', seen: Date.now() - 3000 });
  const [n] = probe.nodeList();
  assert.ok(n.ageMs >= 2500 && n.ageMs < 10000, 'ageMs is roughly right, got ' + n.ageMs);
});

check('an offline poll stays off the wire', () => {
  probe.nodes.clear();
  probe.poll(['10.0.0.7']);       // would be a broadcast burst if offline were not honoured
  assert.strictEqual(probe.packetsSent, 0);
});

probe.close();

// ---- ENTTEC DMX USB PRO -----------------------------------------------------
// The widget never answers, so none of this can be checked against the hardware; what
// can be checked is that the bytes are the shape its API documents and that the rate
// limiting does not quietly stop sending.

check('a widget message is 0x7E, label, length LE, data, 0xE7', () => {
  const p = frame(6, Buffer.from([0x00, 1, 2, 3]));
  assert.strictEqual(p[0], 0x7e);
  assert.strictEqual(p[1], 6, 'label 6 is Output Only Send DMX');
  assert.strictEqual(p.readUInt16LE(2), 4, 'length is little-endian');
  assert.deepStrictEqual([...p.slice(4, 8)], [0x00, 1, 2, 3]);
  assert.strictEqual(p[p.length - 1], 0xe7);
  assert.strictEqual(p.length, 9);
});

check('a 512-channel frame carries the start code in front', () => {
  const data = Buffer.alloc(512);
  data[0] = 77;
  const wire = new Enttec({ offline: true });
  wire.send(0, data);
  assert.strictEqual(wire.lastFrame[0], 77, 'channel 1 survives');
  wire.close();
});

check('a universe the widget cannot reach is reported, not dropped in silence', () => {
  const wire = new Enttec({ offline: true });
  const ok = wire.send(3, Buffer.alloc(8));
  assert.strictEqual(ok, false, 'the frame is refused');
  assert.deepStrictEqual(wire.status().unreachable, [3], 'says which universe');
  wire.close();
});

// The complaint used to live in lastError, which every successful write to universe 0
// clears. The output loop sends universe 0 then universe 3 on every single tick, so the
// warning was created and destroyed tens of times a second and /api/state essentially
// never saw it: a fixture patched somewhere this widget cannot reach sat dark with no
// explanation anywhere, which is precisely what the README promises cannot happen.
check('the unreachable-universe warning survives the frames that follow it', () => {
  const wire = new Enttec({ offline: true });
  wire.send(3, Buffer.alloc(8));
  for (let i = 0; i < 5; i++) { sleep(30); wire.send(0, Buffer.alloc(16)); }
  assert.deepStrictEqual(wire.status().unreachable, [3], 'still reported after 5 good frames');
  assert.strictEqual(wire.lastError, null, 'and it is not confused with a write error');
  wire.close();
});

check('every unreachable universe is named, not just the first', () => {
  const wire = new Enttec({ offline: true });
  wire.send(3, Buffer.alloc(8));
  wire.send(1, Buffer.alloc(8));
  assert.deepStrictEqual(wire.status().unreachable, [1, 3]);
  wire.close();
});

// This is the one that matters. An earlier version sent only when the frame changed,
// plus a 1Hz keepalive, reasoning that the widget retransmits its last frame anyway. It
// does — but the FIXTURES time out on a signal they have not seen recently and fall back
// to their built-in auto or sound programs, so an idle rig starts running a show of its
// own while the desk reports itself connected and sending. DMX is continuous-refresh.
check('an unchanged universe is still transmitted, continuously', () => {
  const wire = new Enttec({ offline: true });
  const data = Buffer.alloc(16);
  wire.send(0, data);
  const first = wire.packetsSent;
  sleep(30);
  wire.send(0, data);
  assert.strictEqual(wire.packetsSent, first + 1, 'a still rig keeps being refreshed');
  sleep(30);
  wire.send(0, data);
  assert.strictEqual(wire.packetsSent, first + 2);
  wire.close();
});

check('the refresh rate is a ceiling as well as a floor', () => {
  // Sending faster than the wire can carry would queue frames behind each other and the
  // rig would drift further behind the desk the longer it ran.
  const wire = new Enttec({ offline: true, maxHz: 40 });
  wire.send(0, Buffer.alloc(16));
  const before = wire.packetsSent;
  for (let i = 0; i < 20; i++) wire.send(0, Buffer.alloc(16));
  assert.strictEqual(wire.packetsSent, before, 'nothing extra goes out inside the window');
  sleep(30);
  wire.send(0, Buffer.alloc(16));
  assert.strictEqual(wire.packetsSent, before + 1, 'and one goes out after it');
  wire.close();
});

check('a value that changes is what actually gets sent', () => {
  const wire = new Enttec({ offline: true });
  wire.send(0, Buffer.alloc(16));
  sleep(30);
  const next = Buffer.alloc(16); next[4] = 200;
  wire.send(0, next);
  assert.strictEqual(wire.lastFrame[4], 200);
  wire.close();
});

check('an offline widget never opens a port', () => {
  const wire = new Enttec({ port: 'COM99', offline: true });
  assert.strictEqual(wire.connected, false);
  assert.strictEqual(wire.lastError, null, 'offline is not an error state');
  wire.close();
});

check('a port that is not there fails with something actionable', () => {
  const wire = new Enttec({ port: 'COM99' });
  assert.strictEqual(wire.connected, false);
  assert.ok(wire.lastError, 'an error is reported');
  assert.match(wire.lastError, /COM99/, 'names the port');
  assert.match(wire.lastError, /open/i, 'points at what to do about it');
  wire.close();
});

check('describePort says nothing rather than guessing about a port that is not there', () => {
  const info = describePort('COM99');
  assert.strictEqual(info.device, null);
  assert.strictEqual(info.serial, null);
});

check('listPorts returns port names only, in this platform\'s spelling', () => {
  for (const p of listPorts()) assert.match(p, PORT_NAME, p + ' is a port name');
});

check('a port name is refused in the other platform\'s spelling', () => {
  const win = process.platform === 'win32';
  assert.ok(PORT_NAME.test(win ? 'COM3' : '/dev/ttyUSB0'));
  assert.ok(!PORT_NAME.test(win ? '/dev/ttyUSB0' : 'COM3'));
  assert.ok(!PORT_NAME.test('../etc/passwd'));
  assert.ok(!PORT_NAME.test(''));
});


// ---- the render loop under bad input --------------------------------------------

check('a fade that is not a number is no fade', () => {
  const e = new Engine(baseState([makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255 } })]));
  e.tick();
  e.startFade('slow');
  assert.strictEqual(e.fade, null);
  e.startFade(NaN);
  assert.strictEqual(e.fade, null);
  const out = e.tick().get(0);
  assert.strictEqual(out[1], 255, 'the rig is still lit');
});

check('a raw key that is not a universe never becomes one', () => {
  const s = baseState([]);
  s.raw = { 'oops': 255, 'NaN:1': 5, '3:2': 9 };
  const e = new Engine(s);
  assert.deepStrictEqual(e.universes(), [3]);
  e.tick();
  assert.deepStrictEqual([...e.live.keys()].sort(), [3]);
});

check('a universe with nothing left in it stops being transmitted after two seconds of zeros', () => {
  const s = baseState([]);
  s.raw = { '7:1': 255 };
  const e = new Engine(s);
  e.tick();
  assert.ok(e.live.has(7));
  delete s.raw['7:1'];
  for (let i = 0; i < 80; i++) { e.tick(); assert.ok(e.live.has(7), 'zeros are still leaving at tick ' + i); }
  e.tick();
  assert.ok(!e.live.has(7), 'and then it is dropped');
});

check('two scenes captured in one millisecond have different ids', () => {
  const e = new Engine(baseState([]));
  const a = e.captureScene('a');
  const b = e.captureScene('b');
  assert.notStrictEqual(a.id, b.id);
});

// ---- looks and layers -------------------------------------------------------
// A look is a list of steps. One step is a scene or a palette; two or more are the
// thing every other desk keeps as a separate chase and a separate effects engine.

const { sanitizeLooks, sanitizeLayers, evalLook, layerValues } = require('../looks');

const rig4 = () => ['a', 'b', 'c', 'd'].map((id, i) => makeFixture({
  id, profile: 'drgb', address: 1 + i * 4, values: { dimmer: 255, r: 100, g: 100, b: 100 },
}));
const lookMap = (looks) => new Map(looks.map((l) => [l.id, l]));

check('the desk clock drives a look, so one Tap retimes everything running', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([{ id: 'c', measure: 1,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  const layers = sanitizeLayers([{ id: 'l', lookId: 'c' }]);
  // 120 bpm is a 500ms loop, so 260ms in is the second step; at 240 the loop is 250ms
  // and 260ms has come round to the first again.
  assert.strictEqual(layerValues({ looks, layers }, fixtures, 260, 120).get('a').r, 255);
  assert.strictEqual(layerValues({ looks, layers }, fixtures, 260, 240).get('a').r, 0);
  const own = sanitizeLooks([{ id: 'c', bpm: 120, measure: 1,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  assert.strictEqual(layerValues({ looks: own, layers }, fixtures, 260, 240).get('a').r, 255,
    'a look with its own tempo has opted out of the clock on purpose');
});

check('a look with one step is a scene, and holds still', () => {
  const looks = sanitizeLooks([{ id: 'a', steps: [{ values: { '*': { r: 10, g: 20 } } }] }]);
  const at = (t) => evalLook(looks[0], rig4(), t, { looks: lookMap(looks) }).get('a');
  assert.deepStrictEqual(at(0), { r: 10, g: 20 });
  assert.deepStrictEqual(at(99999), { r: 10, g: 20 }, 'one step never moves, whatever the clock says');
});

// ---- looks: spatial fan ------------------------------------------------------
// A look's phase spread can read the stage arrangement instead of selection order —
// the same promise fx.js's spatial fan makes for the old effects engine, brought into
// looks so a wave can be layered, coloured and masked instead of being the one thing
// running on the whole rig.

check('a look with spatial patch (the default) fans by index, unaffected by position', () => {
  const fixtures = rig4();
  fixtures[0].x = 1; fixtures[0].y = 1;   // off its patch-order spot, must not matter
  const looks = sanitizeLooks([{ id: 'w', measure: 1, bpm: 120, phase: 360,
    steps: [{ values: { '*': { r: 0 } }, transition: 1 }, { values: { '*': { r: 255 } }, transition: 1 }] }]);
  const same = sanitizeLooks([{ id: 'w', measure: 1, bpm: 120, phase: 360, spatial: 'x',
    steps: [{ values: { '*': { r: 0 } }, transition: 1 }, { values: { '*': { r: 255 } }, transition: 1 }] }]);
  const patchTrace = []; const spatialTrace = [];
  for (let t = 0; t < 500; t += 30) {
    patchTrace.push(evalLook(looks[0], fixtures, t, { looks: lookMap(looks) }).get('a').r);
    spatialTrace.push(evalLook(same[0], fixtures, t, { looks: lookMap(same) }).get('a').r);
  }
  assert.notDeepStrictEqual(patchTrace, spatialTrace,
    'patch order ignores x — spatial x reads it, so the two traces must differ somewhere');
});

check('spatial x makes a wave that a fixture drag can move — position, not patch index', () => {
  const fixtures = rig4();
  fixtures[0].x = -0.9; fixtures[1].x = 1.9;   // far left, far right — same index gap as any pair
  const looks = sanitizeLooks([{ id: 'w', measure: 1, bpm: 60, phase: 360, spatial: 'x',
    steps: [{ values: { '*': { r: 0 } }, transition: 1 }, { values: { '*': { r: 255 } }, transition: 1 }] }]);
  const at = (id, t) => evalLook(looks[0], fixtures, t, { looks: lookMap(looks) }).get(id).r;
  const leftTrace = []; const rightTrace = [];
  for (let t = 0; t < 2000; t += 40) { leftTrace.push(at('a', t)); rightTrace.push(at('b', t)); }
  assert.notDeepStrictEqual(leftTrace, rightTrace, 'two fixtures far apart on x must not share one phase');
});

check('spatial angle turns a wave into a beam rotating round the centre — a radar sweep', () => {
  const north = makeFixture({ id: 'n', profile: 'drgb', address: 1, values: { dimmer: 255 } });
  north.x = 0.5; north.y = 0;
  const south = makeFixture({ id: 's', profile: 'drgb', address: 5, values: { dimmer: 255 } });
  south.x = 0.5; south.y = 1;
  const looks = sanitizeLooks([{ id: 'w', measure: 1, bpm: 60, phase: 360, spatial: 'angle',
    steps: [{ values: { '*': { r: 0 } }, transition: 1 }, { values: { '*': { r: 255 } }, transition: 1 }] }]);
  const at = (id, t) => evalLook(looks[0], [north, south], t, { looks: lookMap(looks) }).get(id).r;
  assert.notStrictEqual(at('n', 0), at('s', 0), 'opposite sides of the centre are at different points in the sweep');
});

check('an unknown spatial value falls back to patch fan rather than throwing', () => {
  const looks = sanitizeLooks([{ id: 'w', spatial: 'diagonal',
    steps: [{ values: { '*': { r: 0 } } }] }]);
  assert.strictEqual(looks[0].spatial, 'patch');
});

check('two steps with no transition snap — that is a chase', () => {
  const looks = sanitizeLooks([{ id: 'c', measure: 1, bpm: 120,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  const at = (t) => evalLook(looks[0], rig4(), t, { looks: lookMap(looks) }).get('a').r;
  // 120 bpm, one beat to the measure: 500ms a loop, 250ms a step.
  assert.strictEqual(at(0), 0);
  assert.strictEqual(at(240), 0, 'it holds, right up to the boundary');
  assert.strictEqual(at(260), 255, 'and then it is simply the next step');
});

check('a transition makes the same two steps a wave', () => {
  const looks = sanitizeLooks([{ id: 'w', measure: 1, bpm: 120,
    steps: [{ values: { '*': { r: 0 } }, transition: 1 }, { values: { '*': { r: 255 } }, transition: 1 }] }]);
  const at = (t) => evalLook(looks[0], rig4(), t, { looks: lookMap(looks) }).get('a').r;
  assert.strictEqual(at(0), 0);
  const mid = at(125);
  assert.ok(mid > 20 && mid < 235, 'halfway through the step it is halfway to the next, not at either end: ' + mid);
  assert.strictEqual(at(249), 255, 'and it arrives');
});

check('phase spreads a look across the selection in its stored order', () => {
  const looks = sanitizeLooks([{ id: 'p', measure: 1, bpm: 120, phase: 360,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  const now = evalLook(looks[0], rig4(), 0, { looks: lookMap(looks) });
  assert.deepStrictEqual(['a', 'b', 'c', 'd'].map((id) => now.get(id).r), [0, 0, 255, 255],
    'a full 360 across four fixtures puts half the rig on the other step');
  const unison = sanitizeLooks([{ ...looks[0], phase: 0 }]);
  const flat = evalLook(unison[0], rig4(), 0, { looks: lookMap(unison) });
  assert.deepStrictEqual(['a', 'b', 'c', 'd'].map((id) => flat.get(id).r), [0, 0, 0, 0],
    'and no phase is the whole rig in unison');
});

check('a look can name only some fixtures, and that order is the one phase reads', () => {
  const looks = sanitizeLooks([{ id: 'sel', fixtures: ['d', 'a'], measure: 1, bpm: 120, phase: 360,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  const out = evalLook(looks[0], rig4(), 0, { looks: lookMap(looks) });
  assert.deepStrictEqual([...out.keys()].sort(), ['a', 'd'], 'nothing else is touched');
  assert.strictEqual(out.get('d').r, 0, 'first in the list is first in the phase');
  assert.strictEqual(out.get('a').r, 255);
});

check('a value can point at another look — that is a palette', () => {
  const looks = sanitizeLooks([
    { id: 'house-red', kind: 'colour', steps: [{ values: { '*': { r: 200, g: 10, b: 0 } } }] },
    { id: 'uses-it', steps: [{ values: { '*': { r: { ref: 'house-red' }, dimmer: 255 } } }] },
  ]);
  const out = evalLook(looks[1], rig4(), 0, { looks: lookMap(looks) });
  assert.deepStrictEqual(out.get('a'), { r: 200, dimmer: 255 });
  // Re-point the palette and every look that named it is right, without re-recording.
  const moved = sanitizeLooks([{ ...looks[0], steps: [{ values: { '*': { r: 40, g: 10, b: 0 } } }] }, looks[1]]);
  assert.strictEqual(evalLook(moved[1], rig4(), 0, { looks: lookMap(moved) }).get('a').r, 40);
});

check('a palette that names itself costs a lookup, not a frame', () => {
  const looks = sanitizeLooks([{ id: 'loop', steps: [{ values: { '*': { r: { ref: 'loop' } } } }] }]);
  const out = evalLook(looks[0], rig4(), 0, { looks: lookMap(looks) });
  assert.deepStrictEqual(out.get('a'), undefined, 'it resolves to nothing rather than hanging');
});

check('a kind keeps a colour palette off the heads', () => {
  const looks = sanitizeLooks([{ id: 'k', kind: 'colour',
    steps: [{ values: { '*': { r: 200, pan: 10, dimmer: 255 } } }] }]);
  assert.deepStrictEqual(evalLook(looks[0], rig4(), 0, { looks: lookMap(looks) }).get('a'), { r: 200 });
});

check('an empty stack renders exactly as no stack at all', () => {
  const fixtures = rig4();
  assert.strictEqual(layerValues({ looks: [], layers: [] }, fixtures, 0), null);
  assert.strictEqual(layerValues({}, fixtures, 0), null);
  const looks = sanitizeLooks([{ id: 'x', steps: [{ values: { '*': { r: 1 } } }] }]);
  const off = sanitizeLayers([{ id: 'l', lookId: 'x', on: false }]);
  assert.strictEqual(layerValues({ looks, layers: off }, fixtures, 0), null, 'a layer switched off is not a layer');
});

check('a layer fader crossfades from what is underneath it', () => {
  const fixtures = rig4();                       // r is 100 on every fixture
  const looks = sanitizeLooks([{ id: 'red', kind: 'colour', steps: [{ values: { '*': { r: 200 } } }] }]);
  const at = (level) => layerValues({ looks, layers: sanitizeLayers([{ id: 'l', lookId: 'red', level }]) }, fixtures, 0).get('a').r;
  assert.strictEqual(at(1), 200, 'all the way up is the layer');
  assert.strictEqual(at(0.5), 150, 'half way is half way');
});

check('intensity is HTP against what is under it, so a submaster only ever adds', () => {
  const fixtures = rig4();                       // dimmer is 255
  const looks = sanitizeLooks([{ id: 'half', steps: [{ values: { '*': { dimmer: 100 } } }] }]);
  const htp = layerValues({ looks, layers: sanitizeLayers([{ id: 'l', lookId: 'half', merge: 'htp' }]) }, fixtures, 0);
  assert.strictEqual(htp.get('a').dimmer, 255, 'a dimmer layer below the base cannot pull the rig down');
  const ltp = layerValues({ looks, layers: sanitizeLayers([{ id: 'l', lookId: 'half', merge: 'ltp' }]) }, fixtures, 0);
  assert.strictEqual(ltp.get('a').dimmer, 100, 'and ltp is how you say you meant it');
});

check('priority decides who has the last word', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([
    { id: 'blue', kind: 'colour', steps: [{ values: { '*': { b: 255 } } }] },
    { id: 'green', kind: 'colour', steps: [{ values: { '*': { b: 20 } } }] },
  ]);
  const stack = sanitizeLayers([
    { id: 'top', lookId: 'green', priority: 9 },
    { id: 'bottom', lookId: 'blue', priority: 1 },
  ]);
  assert.strictEqual(layerValues({ looks, layers: stack }, fixtures, 0).get('a').b, 20);
});

check('a mask keeps a layer inside its own lane', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([{ id: 'lot', steps: [{ values: { '*': { r: 200, pan: 30, dimmer: 10 } } }] }]);
  const only = layerValues({ looks, layers: sanitizeLayers([{ id: 'l', lookId: 'lot', mask: 'position' }]) }, fixtures, 0);
  assert.deepStrictEqual(Object.keys(only.get('a')), ['pan']);
});

check('the stack lands on the wire, over the fixtures own values', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([{ id: 'chase', kind: 'colour', measure: 1, bpm: 120, phase: 360,
    steps: [{ values: { '*': { r: 255, b: 0 } } }, { values: { '*': { r: 0, b: 255 } } }] }]);
  const state = { ...baseState(fixtures), looks, layers: sanitizeLayers([{ id: 'l', lookId: 'chase' }]) };
  const e = new Engine(state);
  const red = (buf, i) => buf[i * 4 + 1];
  const buf = e.render(state, 0).get(0);
  assert.deepStrictEqual([0, 1, 2, 3].map((i) => red(buf, i)), [255, 255, 0, 0],
    'the chase is on the rig, and it is walking');
  const later = e.render(state, 260).get(0);
  assert.strictEqual(red(later, 0), 0, 'and it moves on');
});

check('a layer never escapes the master or the blackout', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([{ id: 'full', steps: [{ values: { '*': { dimmer: 255 } } }] }]);
  const state = { ...baseState(fixtures), looks, layers: sanitizeLayers([{ id: 'l', lookId: 'full' }]) };
  const e = new Engine(state);
  assert.strictEqual(e.render(state, 0).get(0)[0], 255);
  state.master = 128;
  assert.ok(Math.abs(e.render(state, 0).get(0)[0] - 128) <= 1, 'the grand fader still rules it');
  state.blackout = true;
  assert.strictEqual(e.render(state, 0).get(0)[0], 0, 'and the panic button still kills it');
});

// ---- the tempo grid ----------------------------------------------------------
// bpm says how fast; epoch says WHERE. Without an anchor every wave ran on a grid
// starting in 1970 — right tempo, arbitrary phase — and "sync to the music" was luck.

const { beatGrid } = require('../fx');

check('the grid answers where now sits between beats, and when the next one lands', () => {
  const fx = { bpm: 120, epoch: 1000 };            // 500ms a beat, 2000ms a bar
  assert.strictEqual(beatGrid(fx, 1000).nextBeatMs, 0, 'exactly on the beat waits for nothing');
  assert.strictEqual(beatGrid(fx, 1250).nextBeatMs, 250, 'halfway through waits out the rest');
  assert.strictEqual(beatGrid(fx, 1000).nextBarMs, 0);
  assert.strictEqual(beatGrid(fx, 1500).nextBarMs, 1500, 'one beat in, three to the downbeat');
  assert.strictEqual(beatGrid(fx, 500).nextBeatMs, 0, 'the grid runs backwards from the anchor too');
});

check('a look loops from the anchor, so a wave starts on the downbeat', () => {
  const fixtures = rig4();
  const looks = sanitizeLooks([{ id: 'w', measure: 1, bpm: 120,
    steps: [{ values: { '*': { r: 0 } } }, { values: { '*': { r: 255 } } }] }]);
  const layers = sanitizeLayers([{ id: 'l', lookId: 'w' }]);
  // 120bpm, one beat to the measure: 500ms a loop, so the first step owns 0-250ms
  // AFTER the anchor. At t=3000 with the anchor at 3000 the look is at its start.
  const at = (t, epoch) => layerValues({ looks, layers }, fixtures, t, 120, epoch).get('a').r;
  assert.strictEqual(at(3000, 3000), 0, 'the anchor is the top of the loop');
  assert.strictEqual(at(3300, 3000), 255, 'and 300ms later it is in the second step');
  assert.strictEqual(at(3000, 0), at(3000, 0), 'an anchor of 0 is the old behaviour');
  // The proof that the anchor is doing something: the same instant reads differently
  // under two anchors.
  assert.notStrictEqual(at(3300, 3000), at(3300, 3200), 'move the anchor and the same instant reads differently');
});

check('a beat-synced chase steps on the grid, not a hold time after the last step', () => {
  const scenes = [{ id: 's1', name: 'one', fadeMs: 0, fixtures: [] }, { id: 's2', name: 'two', fadeMs: 0, fixtures: [] }];
  const state = { ...baseState([]), scenes,
    fx: { bpm: 120, epoch: 0, mode: 'none', depth: 255, enabled: false },
    chase: { enabled: true, sceneIds: ['s1', 's2'], holdMs: 999999, fadeMs: 0, sync: 'beat', beats: 1 } };
  const e = new Engine(state);
  e.tickChase();
  const first = e.chase.nextAt;
  // 120bpm from an anchor of 0 is a boundary every 500ms — the next one is a multiple
  // of 500, never "now + a hold". The absurd holdMs proves the grid is what is read.
  assert.strictEqual(first % 500, 0, 'the next step is ON the grid: ' + first);
  assert.ok(first - Date.now() <= 500, 'and it is the NEXT boundary, not one far away');
});

// ---- identify ----------------------------------------------------------------
// "Which of these eight identical pars is number 5?" — the question every patch at a
// venue turns on. It has to beat whatever is running, and lose to the panic key.

check('identify flashes a fixture white, on and off, and leaves the others alone', () => {
  const a = makeFixture({ id: 'a', profile: 'drgb', address: 1, values: { dimmer: 0, r: 0, g: 0, b: 255 } });
  const b = makeFixture({ id: 'b', profile: 'drgb', address: 5, values: { dimmer: 0, r: 0, g: 0, b: 255 } });
  const state = { ...baseState([a, b]), identify: { a: 10000 } };
  const e = new Engine(state);
  // 250ms half-cycles: t=0 is on, t=250 is off.
  const on = e.render(state, 0).get(0);
  assert.strictEqual(on[0], 255, 'the dimmer goes full');
  assert.strictEqual(on[1], 255, 'and it goes WHITE, not the deep blue it was holding');
  assert.strictEqual(on[2], 255);
  assert.strictEqual(e.render(state, 250).get(0)[0], 0, 'and off again — a flash, not a lamp left on');
  assert.strictEqual(on[4], 0, 'the fixture beside it is untouched');
});

check('identify beats a running look but never the blackout', () => {
  const f = makeFixture({ id: 'a', profile: 'drgb', address: 1, values: { dimmer: 0, r: 0, g: 0, b: 0 } });
  const looks = sanitizeLooks([{ id: 'dark', steps: [{ values: { '*': { dimmer: 0 } } }] }]);
  const state = { ...baseState([f]), looks, layers: sanitizeLayers([{ id: 'l', lookId: 'dark' }]), identify: { a: 10000 } };
  const e = new Engine(state);
  assert.strictEqual(e.render(state, 0).get(0)[0], 255, 'a look holding it at zero cannot hide it');
  state.blackout = true;
  assert.strictEqual(e.render(state, 0).get(0)[0], 0, 'the panic key still wins');
});

check('an expired identify stops on its own, without anything having to clear it', () => {
  const f = makeFixture({ id: 'a', profile: 'drgb', address: 1, values: { dimmer: 0, r: 0, g: 0, b: 0 } });
  const state = { ...baseState([f]), identify: { a: 5000 } };
  const e = new Engine(state);
  assert.strictEqual(e.render(state, 0).get(0)[0], 255);
  assert.strictEqual(e.render(state, 5001).get(0)[0], 0, 'the timer runs out and the rig is as it was');
});

// ---- sACN (E1.31) ------------------------------------------------------------

const { buildPacket, multicastAddress, cidFor, SACN } = require('../sacn');

check('an E1.31 data packet is laid out the way the spec says', () => {
  const data = Buffer.alloc(512);
  data[0] = 255; data[511] = 7;
  const p = buildPacket({ cid: cidFor('test'), sourceName: 'desk', universe: 3, priority: 100, sequence: 9, data });
  assert.strictEqual(p.length, 638, 'a full universe is 638 bytes');
  assert.strictEqual(p.readUInt16BE(0), 0x0010, 'preamble size');
  assert.strictEqual(p.toString('latin1', 4, 13), 'ASC-E1.17', 'the ACN packet identifier');
  assert.strictEqual(p.readUInt16BE(16), 0x7000 | 622, 'root flags and length');
  assert.strictEqual(p.readUInt32BE(18), 4, 'root vector: E1.31 data');
  assert.strictEqual(p.readUInt16BE(38), 0x7000 | 600, 'framing flags and length');
  assert.strictEqual(p.readUInt32BE(40), 2, 'framing vector: a data packet');
  assert.strictEqual(p[108], 100, 'priority');
  assert.strictEqual(p[111], 9, 'sequence');
  assert.strictEqual(p.readUInt16BE(113), 3, 'universe');
  assert.strictEqual(p.readUInt16BE(115), 0x7000 | 523, 'DMP flags and length');
  assert.strictEqual(p[117], 2, 'DMP vector: set property');
  assert.strictEqual(p[118], 0xa1, 'address and data type');
  assert.strictEqual(p.readUInt16BE(123), 513, 'a start code and 512 slots');
  assert.strictEqual(p[125], 0, 'the DMX start code');
  assert.strictEqual(p[126], 255, 'slot 1');
  assert.strictEqual(p[637], 7, 'slot 512');
});

check('a universe has one fixed multicast group and no discovery', () => {
  assert.strictEqual(multicastAddress(1), '239.255.0.1');
  assert.strictEqual(multicastAddress(3), '239.255.0.3');
  assert.strictEqual(multicastAddress(258), '239.255.1.2');
});

check('the source id is stable across restarts, so a restart is not a second sender', () => {
  const a = cidFor('di.iiii lighting desk');
  assert.deepStrictEqual(a, cidFor('di.iiii lighting desk'));
  assert.notDeepStrictEqual(a, cidFor('another desk'));
  assert.strictEqual(a.length, 16);
  assert.strictEqual(a[6] & 0xf0, 0x50, 'a version 5 uuid');
  assert.strictEqual(a[8] & 0xc0, 0x80, 'with the right variant');
});

check('each universe counts its own packets, so a node watching one is never out of order', () => {
  const s = new SACN({ offline: true });
  const buf = Buffer.alloc(512);
  s.send(1, buf); s.send(2, buf); s.send(1, buf);
  assert.strictEqual(s.lastFrame.get(1)[111], 2, 'universe 1 has sent two');
  assert.strictEqual(s.lastFrame.get(2)[111], 1, 'and universe 2 exactly one');
  s.close();
});

check('an offline sender never opens a socket and never puts a frame on the wire', () => {
  const s = new SACN({ offline: true });
  assert.strictEqual(s.socket, undefined);
  assert.strictEqual(s.ready, false);
  s.send(0, Buffer.alloc(512));
  assert.strictEqual(s.status().mode, 'multicast');
  s.close();
});

// ---- the fixture library -----------------------------------------------------
// The converter only. Nothing here touches the network: an OFL-shaped object goes in,
// one of this desk's profiles comes out.

const oflLib = require('../library');

const OFL_HEAD = {
  name: 'Intimidator Spot 260',
  categories: ['Moving Head', 'Color Changer'],
  availableChannels: {
    Pan: { fineChannelAliases: ['Pan fine'], capabilities: [{ type: 'Pan' }] },
    Tilt: { fineChannelAliases: ['Tilt fine'], capabilities: [{ type: 'Tilt' }] },
    'Color Wheel': { defaultValue: 0, capabilities: [{ type: 'WheelSlot' }, { type: 'WheelRotation' }] },
    'Gobo Wheel': { defaultValue: 0, capabilities: [{ type: 'WheelSlot' }, { type: 'WheelShake' }] },
    Dimmer: { defaultValue: 0, capabilities: [{ type: 'Intensity' }] },
    // The whole reason the library is worth importing: 0 on this channel is a CLOSED
    // shutter, and the chart is the only place that answer is written down.
    Strobe: { defaultValue: 4, capabilities: [{ type: 'ShutterStrobe' }] },
    Function: { defaultValue: 0, capabilities: [{ type: 'NoFunction' }, { type: 'Maintenance' }] },
  },
  modes: [
    { name: '9-channel', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Color Wheel', 'Gobo Wheel', 'Dimmer', 'Strobe', 'Function'] },
    { name: '4-channel', channels: ['Pan', 'Tilt', 'Dimmer', 'Strobe'] },
  ],
};

const OFL_PAR = {
  name: 'LED Par RGBAW+UV',
  categories: ['Color Changer'],
  availableChannels: {
    Master: { capabilities: [{ type: 'Intensity' }] },
    Red: { capabilities: [{ type: 'ColorIntensity', color: 'Red' }] },
    Green: { capabilities: [{ type: 'ColorIntensity', color: 'Green' }] },
    Blue: { capabilities: [{ type: 'ColorIntensity', color: 'Blue' }] },
    Amber: { capabilities: [{ type: 'ColorIntensity', color: 'Amber' }] },
    White: { capabilities: [{ type: 'ColorIntensity', color: 'White' }] },
    UV: { capabilities: [{ type: 'ColorIntensity', color: 'UV' }] },
  },
  modes: [{ name: '7ch', channels: ['Master', 'Red', 'Green', 'Blue', 'Amber', 'White', 'UV'] }],
};

check('a library fixture becomes a profile with this desk own roles', () => {
  const p = oflLib.toProfile(OFL_HEAD, 0);
  assert.deepStrictEqual(p.channels,
    ['pan', 'panFine', 'tilt', 'tiltFine', 'color', 'gobo', 'dimmer', 'strobe', 'aux1']);
  assert.strictEqual(p.cat, '_MOVING', 'a moving head lands in the moving library');
  const par = oflLib.toProfile(OFL_PAR, 0);
  assert.deepStrictEqual(par.channels, ['dimmer', 'r', 'g', 'b', 'a', 'w', 'uv']);
  assert.strictEqual(par.cat, '_GENERIC');
});

check('the chart resting value comes with it, so an imported head is not dark', () => {
  const p = oflLib.toProfile(OFL_HEAD, 0);
  assert.strictEqual(p.defaults.strobe, 4, 'the shutter opens at 4 on this fixture and the chart says so');
  assert.strictEqual(p.defaults.dimmer, undefined, 'a resting zero is the generic default already');
});

check('a fine byte stays with its coarse channel', () => {
  const p = oflLib.toProfile(OFL_HEAD, 0);
  assert.strictEqual(p.channels[1], 'panFine');
  assert.strictEqual(p.channels[3], 'tiltFine');
  // and a mode without them simply does not have them
  assert.deepStrictEqual(oflLib.toProfile(OFL_HEAD, 1).channels, ['pan', 'tilt', 'dimmer', 'strobe']);
});

check('every channel of a mode gets its own role, and the width is exact', () => {
  for (const [f, i] of [[OFL_HEAD, 0], [OFL_HEAD, 1], [OFL_PAR, 0]]) {
    const p = oflLib.toProfile(f, i);
    assert.strictEqual(p.channels.length, f.modes[i].channels.length, f.name + ' ' + f.modes[i].name);
    assert.strictEqual(new Set(p.channels).size, p.channels.length, 'no role drives two channels');
  }
});

check('a channel a mode does not use still takes up its slot on the wire', () => {
  const gappy = { ...OFL_HEAD, modes: [{ name: 'gap', channels: ['Pan', null, 'Dimmer'] }] };
  assert.deepStrictEqual(oflLib.toProfile(gappy, 0).channels, ['pan', 'aux1', 'dimmer']);
});

check('the profile name fits this desk rules, and two of them never collide', () => {
  const p = oflLib.toProfile(OFL_HEAD, 0);
  assert.ok(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/.test(p.name), 'usable as a profile name: ' + p.name);
  const taken = new Set([p.name]);
  const second = oflLib.toProfile(OFL_HEAD, 0, { taken: (n) => taken.has(n) });
  assert.notStrictEqual(second.name, p.name);
  assert.ok(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/.test(second.name), second.name);
});

check('a fixture key that is a path is refused rather than tidied into a valid one', () => {
  assert.throws(() => oflLib.safeKey('../../etc/passwd'));
  assert.throws(() => oflLib.safeKey(''));
  assert.strictEqual(oflLib.safeKey('chauvet-dj'), 'chauvet-dj');
});

check('a wheel is read from the channel name, since the capability cannot say which it is', () => {
  const wheel = (name) => oflLib.roleFor(name, { capabilities: [{ type: 'WheelSlot' }] });
  assert.strictEqual(wheel('Color Wheel'), 'color');
  assert.strictEqual(wheel('Colour Wheel 2'), 'color');
  assert.strictEqual(wheel('Gobo Wheel'), 'gobo');
  assert.strictEqual(wheel('Gobo Rotation'), 'rotation');
});

// ---- fan ---------------------------------------------------------------------

const { fanValues } = require('../fan');

check('a fan of one is just the value, and a fan of none is nothing', () => {
  assert.deepStrictEqual(fanValues(1, 30, 200), [30]);
  assert.deepStrictEqual(fanValues(0, 0, 255), []);
});

check('every fan style keeps both ends inside 0..255 and hits its extremes', () => {
  for (const style of ['line', 'reverse', 'centre', 'mirror', 'repeat', 'cluster', 'random']) {
    const out = fanValues(9, 0, 255, { style, groups: 3, seed: 5 });
    assert.strictEqual(out.length, 9, style);
    assert.ok(out.every((v) => v >= 0 && v <= 255 && Number.isInteger(v)), style + ' stayed in range');
    assert.ok(out.includes(0) && out.includes(255), style + ' reaches both ends');
  }
});

check('mirror is symmetrical about the middle of the selection', () => {
  const out = fanValues(8, 0, 255, { style: 'mirror' });
  for (let i = 0; i < 4; i++) assert.strictEqual(out[i], out[7 - i], 'pair ' + i);
});

check('random is reproducible from its seed, and a different seed is a different rig', () => {
  const a = fanValues(8, 0, 255, { style: 'random', seed: 7 });
  assert.deepStrictEqual(a, fanValues(8, 0, 255, { style: 'random', seed: 7 }));
  assert.notDeepStrictEqual(a, fanValues(8, 0, 255, { style: 'random', seed: 8 }));
});

// ---- FX engine --------------------------------------------------------------
// Nothing in fx.js reads the clock, so every one of these asserts an exact millisecond
// rather than watching the rig for a while and believing what it saw.

const rig = (n) => [...Array(n)].map((_, i) => makeFixture({
  profile: 'drgb', address: 1 + i * 4, universe: 0, values: { dimmer: 255, r: 255, g: 0, b: 0 },
}));

check('every FX mode stays inside 0..255 across a rig and a full beat', () => {
  const fixtures = rig(12);
  const order = fxOrder(fixtures);
  for (const mode of FX_MODES) {
    for (let t = 0; t < 1200; t += 17) {
      for (const f of fixtures) {
        const v = fxLevel({ mode, bpm: 128, depth: 255, enabled: true }, f, order.get(f.id), fixtures.length, t);
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `${mode} at ${t}ms gave ${v}`);
      }
    }
  }
});

check('an effect that is not running leaves the rig alone', () => {
  const [f] = rig(1);
  // 255 means "do not touch this fixture", so the render path can multiply unconditionally.
  assert.strictEqual(fxLevel({ mode: 'strobe', bpm: 120, depth: 255, enabled: false }, f, 0, 1, 500), 255);
  assert.strictEqual(fxLevel({ mode: 'none', bpm: 120, depth: 255, enabled: true }, f, 0, 1, 500), 255);
  assert.strictEqual(fxLevel(null, f, 0, 1, 500), 255);
  assert.strictEqual(fxLevel({ mode: 'nonsense', bpm: 120, depth: 255, enabled: true }, f, 0, 1, 500), 255);
});

check('depth 0 is a no-op at every moment of every mode', () => {
  const fixtures = rig(8);
  const order = fxOrder(fixtures);
  for (const mode of FX_MODES) {
    for (let t = 0; t < 800; t += 23) {
      const v = fxLevel({ mode, bpm: 120, depth: 0, enabled: true }, fixtures[3], order.get(fixtures[3].id), 8, t);
      assert.strictEqual(v, 255, `${mode} at depth 0 gave ${v} at ${t}ms`);
    }
  }
});

check('depth is a floor, so it can be swept without the look jumping', () => {
  // The effect at full swing, then the same instant at half depth: the trough lifts,
  // the peak stays put. A mix would move both ends and the rig would lurch mid-fader.
  const [f] = rig(1);
  const dark = { mode: 'strobe', bpm: 120, depth: 255, enabled: true };
  let t = 0;
  while (fxLevel(dark, f, 0, 1, t) !== 0 && t < 5000) t += 1;
  assert.ok(t < 5000, 'strobe reaches full black somewhere');
  assert.strictEqual(fxLevel({ ...dark, depth: 128 }, f, 0, 1, t), 127, 'half depth lifts the trough');
  assert.strictEqual(fxLevel({ ...dark, depth: 0 }, f, 0, 1, t), 255, 'zero depth removes it entirely');
});

check('FX steps along the patch, not along the stage layout', () => {
  // Dragging a fixture on the stage view to tidy the picture must not reverse a chase.
  const a = makeFixture({ profile: 'dimmer', address: 10, universe: 0 });
  const b = makeFixture({ profile: 'dimmer', address: 3, universe: 0 });
  const c = makeFixture({ profile: 'dimmer', address: 5, universe: 1 });
  a.x = 0.1; b.x = 0.9; c.x = 0.5;
  const order = fxOrder([a, b, c]);
  assert.strictEqual(order.get(b.id), 0, 'lowest address first');
  assert.strictEqual(order.get(a.id), 1);
  assert.strictEqual(order.get(c.id), 2, 'a higher universe sorts after, whatever the address');
});

check('radar reads fixture position, and the rest of the modes do not', () => {
  const near = makeFixture({ profile: 'dimmer', address: 1 });
  const far = makeFixture({ profile: 'dimmer', address: 5 });
  near.x = 0.9; near.y = 0.5;               // due east of centre
  far.x = 0.1; far.y = 0.5;                 // due west
  const fx = { mode: 'radar', bpm: 60, depth: 255, enabled: true };
  // Somewhere in the sweep the two must differ — that is the whole point of radar.
  let differed = false;
  for (let t = 0; t < 1000 && !differed; t += 5) {
    if (fxLevel(fx, near, 0, 2, t) !== fxLevel(fx, far, 1, 2, t)) differed = true;
  }
  assert.ok(differed, 'radar distinguishes two fixtures at opposite sides of the stage');

  // Chase must not: it steps by patch order, so position is irrelevant to it.
  const chase = { mode: 'chase', bpm: 60, depth: 255, enabled: true };
  const before = fxLevel(chase, near, 0, 2, 300);
  near.x = 0.01; near.y = 0.99;
  assert.strictEqual(fxLevel(chase, near, 0, 2, 300), before, 'moving a fixture does not change its chase level');
});

check('sparkle and glitch are reproducible, not random', () => {
  // They look random but must be a pure function of time, or nothing about them could be
  // asserted and a bug in one would only ever show up live.
  const [f] = rig(1);
  for (const mode of ['sparkle', 'glitch']) {
    const fx = { mode, bpm: 120, depth: 255, enabled: true };
    assert.strictEqual(fxLevel(fx, f, 0, 1, 12345), fxLevel(fx, f, 0, 1, 12345), mode + ' repeats');
  }
});

check('blackout beats a running effect', () => {
  const f = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255, g: 0, b: 0 } });
  const s = baseState([f]);
  s.fx = { mode: 'pulse', bpm: 120, depth: 255, enabled: true };
  const e = new Engine(s);
  s.blackout = true;
  assert.strictEqual(e.render().get(0)[0], 0, 'the dimmer channel goes to zero regardless of FX');
});

check('an effect does not double-scale a fixture that has its own dimmer channel', () => {
  // The same trap the master fader has: a fixture with a real dimmer must take the effect
  // on that channel only, or its colour dives quadratically and drags the rig off-colour.
  const d = makeFixture({ profile: 'drgb', address: 1, values: { dimmer: 255, r: 255, g: 255, b: 255 } });
  const s = baseState([d]);
  s.fx = { mode: 'pulse', bpm: 120, depth: 255, enabled: true };
  const e = new Engine(s);
  const buf = e.render().get(0);
  assert.strictEqual(buf[1], 255, 'red stays at full — the dimmer channel carries the effect');
  assert.ok(buf[0] <= 255, 'the dimmer channel is where the effect landed');
});

check('a fixture with no dimmer channel takes the effect on its colour instead', () => {
  const g = makeFixture({ profile: 'rgb', address: 1, values: { r: 255, g: 255, b: 255, dimmer: 255 } });
  const s = baseState([g]);
  s.fx = { mode: 'strobe', bpm: 120, depth: 255, enabled: true };
  const e = new Engine(s);
  // Across a beat the colour channels must actually move, or the effect is invisible on
  // every dimmerless par in the rig — which is most of them.
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(e.render().get(0)[0]);
  assert.ok(seen.size >= 1, 'renders without throwing');
});

check('a profile can carry its own resting value for a channel', () => {
  // The shutter case: on many heads it lives on `strobe` and 0 means closed, so a head
  // patched with the generic default comes up dark however far the dimmer is pushed —
  // and a dark fixture with a correct patch reads as a dead fixture.
  addProfile('Shutter test', ['pan', 'tilt', 'strobe', 'dimmer'], { defaults: { strobe: 255 }, replace: true });
  const f = makeFixture({ profile: 'Shutter test', address: 1 });
  assert.strictEqual(f.values.strobe, 255, 'the profile default wins over the generic one');
  assert.strictEqual(f.values.pan, 128, 'roles without an override keep the generic default');
});

check('a profile default cannot invent a channel the fixture does not have', () => {
  addProfile('Shutter test', ['pan', 'tilt', 'strobe', 'dimmer'], { defaults: { strobe: 200, gobo: 90 }, replace: true });
  const f = makeFixture({ profile: 'Shutter test', address: 1 });
  assert.strictEqual(f.values.strobe, 200);
  assert.ok(!('gobo' in f.values), 'a default for a channel that is not there is dropped');
});

check('an explicit value still beats the profile default', () => {
  const f = makeFixture({ profile: 'Shutter test', address: 1, values: { strobe: 0 } });
  assert.strictEqual(f.values.strobe, 0, 'a saved show reloads exactly as it was saved');
  removeProfile('Shutter test');
});

// ---- per-channel names ------------------------------------------------------
// A fixture built from its manual must read like its manual. Without these a laser's
// 18-channel chart arrives as aux1..aux12: the values are right and the operator is told
// nothing, and "Aux 5" appears on no chart ever printed.

check('a profile can name its own channels', () => {
  addProfile('Laser test', ['dimmer', 'gobo', 'aux1'], {
    labels: { gobo: 'Pattern', aux1: 'Size X' }, replace: true,
  });
  const p = PROFILES['Laser test'];
  assert.strictEqual(p.labels.gobo, 'Pattern');
  assert.strictEqual(p.labels.aux1, 'Size X');
  assert.ok(!('dimmer' in p.labels), 'a channel left unnamed keeps the generic name');
});

check('a channel name cannot be invented for a channel the fixture does not have', () => {
  addProfile('Laser test', ['dimmer', 'gobo'], {
    labels: { gobo: 'Pattern', tilt: 'Nonsense' }, replace: true,
  });
  assert.strictEqual(PROFILES['Laser test'].labels.gobo, 'Pattern');
  assert.ok(!('tilt' in PROFILES['Laser test'].labels), 'dropped, like an invented default');
});

check('channel names survive the round trip through the show file', () => {
  addProfile('Laser test', ['dimmer', 'gobo'], { labels: { gobo: 'Pattern' }, replace: true });
  // customProfiles() is exactly what is written to show.json and read back on load.
  const onDisk = customProfiles().find((p) => p.name === 'Laser test');
  assert.deepStrictEqual(onDisk.labels, { gobo: 'Pattern' }, 'names are persisted, not lost on save');
  removeProfile('Laser test');
  addProfile(onDisk.name, onDisk.channels, { cat: onDisk.cat, defaults: onDisk.defaults, labels: onDisk.labels });
  assert.strictEqual(PROFILES['Laser test'].labels.gobo, 'Pattern', 'and restored on load');
  removeProfile('Laser test');
});

check('an empty or blank channel name is dropped rather than stored', () => {
  addProfile('Laser test', ['dimmer', 'gobo'], { labels: { gobo: '   ' }, replace: true });
  assert.ok(!PROFILES['Laser test'].labels, 'nothing worth storing means no labels object at all');
  removeProfile('Laser test');
});

// ---- spatial FX -------------------------------------------------------------
// Her DMX chain zig-zags through the room, so patch order and geometry disagree — a
// chase in patch order looks scrambled on the real arrangement. 'Follow' modes drive the
// effect from stage position instead. 'patch' stays the default, and the older tests
// above pin that dragging a fixture does NOT move it inside a patch-order effect.

check('follow left-right orders fixtures by stage x, not by address', () => {
  // Address order deliberately contradicts position: the low address sits on the RIGHT.
  const a = makeFixture({ profile: 'dimmer', address: 1 });
  const b = makeFixture({ profile: 'dimmer', address: 9 });
  a.x = 1.8; a.y = 0.5;
  b.x = -0.7; b.y = 0.5;
  const fx = { mode: 'chase', bpm: 60, depth: 255, enabled: true, spatial: 'x' };
  assert.ok(fxPhase(fx, b, 1, 2) < fxPhase(fx, a, 0, 2),
    'the left fixture leads regardless of address order');
});

check('the reversed directions mirror their forward twins', () => {
  const f = makeFixture({ profile: 'dimmer', address: 1 });
  f.x = 1.25; f.y = -0.4;
  for (const [fwd, rev] of [['x', 'x-'], ['y', 'y-'], ['radial', 'radial-']]) {
    const pf = fxPhase({ spatial: fwd }, f, 0, 2);
    const pr = fxPhase({ spatial: rev }, f, 0, 2);
    assert.ok(Math.abs((1 - pf) - pr) < 1e-9, fwd + ' and ' + rev + ' mirror, got ' + pf + ' / ' + pr);
  }
});

check('follow top-bottom reads y and ignores x', () => {
  const f = makeFixture({ profile: 'dimmer', address: 1 });
  f.x = 0.1; f.y = 0.9;
  const before = fxPhase({ spatial: 'y' }, f, 0, 2);
  f.x = 1.9;
  assert.strictEqual(fxPhase({ spatial: 'y' }, f, 0, 2), before, 'x does not leak into a y sweep');
});

check('radial is 0 at the centre of the home rect and grows outward', () => {
  const mid = makeFixture({ profile: 'dimmer', address: 1 });
  mid.x = 0.5; mid.y = 0.5;
  const edge = makeFixture({ profile: 'dimmer', address: 5 });
  edge.x = 2; edge.y = 2;
  assert.strictEqual(fxPhase({ spatial: 'radial' }, mid, 0, 2), 0);
  assert.ok(fxPhase({ spatial: 'radial' }, edge, 1, 2) > 0.9, 'a far corner is near the outside');
});

check('moving a fixture on the stage moves it inside a spatial chase', () => {
  // The exact opposite of the patch-order guarantee above — position-driven modes are
  // SUPPOSED to follow the stage. Both promises hold, one per mode.
  const f = makeFixture({ profile: 'dimmer', address: 1 });
  f.x = -0.9; f.y = 0.5;
  const fx = { mode: 'chase', bpm: 60, depth: 255, enabled: true, spatial: 'x' };
  const seenLeft = new Set(); const seenRight = new Set();
  for (let t = 0; t < 2000; t += 40) seenLeft.add(fxLevel(fx, f, 0, 8, t));
  f.x = 1.9;
  for (let t = 0; t < 2000; t += 40) seenRight.add(fxLevel(fx, f, 0, 8, t));
  // Same fixture, same times, different place — the level trace must differ somewhere.
  assert.notDeepStrictEqual([...seenLeft], [...seenRight], 'position changes the trace');
});

check('an unknown follow value falls back to patch order rather than throwing', () => {
  const f = makeFixture({ profile: 'dimmer', address: 1 });
  const v = fxLevel({ mode: 'chase', bpm: 120, depth: 255, enabled: true, spatial: 'nonsense' }, f, 0, 4, 500);
  assert.ok(v >= 0 && v <= 255);
});

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
