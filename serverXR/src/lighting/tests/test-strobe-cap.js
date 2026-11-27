'use strict';
// The room's flash rule AT THE DESK (PR #1397 round 4), since 2026-11-27 (owner N7618) a desk SETTING, OFF by default: with
// output.strobeLimit off there is no cap; with it on, no more than 3 flashes a second whoever asks, a software strobe
// that flashes the DMX, and one that cannot outlive its page. Spawns its own desk (ephemeral ports, throwaway data dir,
// ARTNET_OFFLINE) and reads the wire back through GET /api/dmx. Run with: node serverXR/src/lighting/tests/test-strobe-cap.js
//  R3-I1  api/raw: a strobe-role channel is capped (DMX 14 = 2.92 Hz), a light channel takes 3 rising edges a second, any owner
//  R3-I2  software strobe = a lease: expires on its own, api/fx {clearFlash} lets go of all of it
//  R3-I3  the software strobe reaches the DMX on a DARK fixture, at most 3 rising edges in any second

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let base = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, route, body) {
  const res = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, body: json };
}
const GET = (r) => api('GET', r);
const POST = (r, b) => api('POST', r, b || {});
const wire = async (u, ch) => ((await GET('/api/dmx')).body.dmx[u] || [])[ch - 1];
const tests = [];
// `limit`: the desk setting output.strobeLimit for this check (N7618: OFF by default = no cap; ON = the old 3 a second).
const check = (name, fn, limit) => tests.push({ name, fn, limit: !!limit });
// Rising edges (crossing up through 128) of one channel, sampled every 20 ms for `ms`; the most inside any 1000 ms window.
async function edges(u, ch, ms) {
  const t0 = Date.now(); const rises = []; let prev = null;
  while (Date.now() - t0 < ms) {
    const v = await wire(u, ch);
    if (prev != null && prev < 128 && v >= 128) rises.push(Date.now() - t0);
    prev = v; await sleep(20);
  }
  let max = 0;
  for (const t of rises) max = Math.max(max, rises.filter((x) => x >= t && x < t + 1000).length);
  return { total: rises.length, max };
}
const dark = async (f) => POST('/api/fixture', { id: f.id, values: { dimmer: 0, r: 0, g: 0, b: 0, w: 0 } });
const add = async (profile, address) => (await POST('/api/fixtures/add', { profile, count: 1, address })).body.added[0];

check('R3-I1: a raw write to a strobe channel is capped at DMX 14, and a value past the band is open', async () => {
  const f = await add('drgbs', 1);                // dimmer r g b strobe: strobe is address + 4
  const ch = f.address + 4;
  for (const [asked, held] of [[103, 14], [50, 14], [14, 14], [4, 4], [2, 2], [200, 0], [255, 0]]) {
    await POST('/api/raw', { channel: ch, universe: f.universe, value: asked, owner: 'someone-else' });
    assert.strictEqual((await GET('/api/state')).body.raw[f.universe + ':' + ch], held, 'asked ' + asked);
  }
  await POST('/api/raw', { channel: ch, universe: f.universe, value: 103 });
  await sleep(120);
  assert.strictEqual(await wire(f.universe, ch), 14, 'the wire carries the capped value');
  await POST('/api/raw', { clear: true, all: true });
}, true);

check('R3-I1: a fixture takes 3 rising edges a second through api/raw, from any client', async () => {
  const f = await add('drgb', 10);
  const ch = f.address;                            // dimmer
  let refused = 0, accepted = 0;
  for (let i = 0; i < 12; i++) {                   // two clients mashing at ~8 a second
    const owner = i % 2 ? 'client-a' : 'client-b';
    const up = await POST('/api/raw', { channel: ch, universe: f.universe, value: 255, owner, all: true });
    if (up.body.refused && up.body.refused.rate) refused++; else accepted++;
    await POST('/api/raw', { channel: ch, universe: f.universe, value: -1, owner, all: true });
    await sleep(120);
  }
  assert.ok(accepted <= 6, 'accepted ' + accepted + ' of 12 in about 1.5 s: at most 3 a second');
  assert.ok(refused >= 6, 'refused ' + refused);
  await sleep(1100);
  const again = await POST('/api/raw', { channel: ch, universe: f.universe, value: 255 });
  assert.ok(!(again.body.refused && again.body.refused.rate), 'a second later it takes one again');
  await POST('/api/raw', { clear: true, all: true });
}, true);

check('R3-I3: the software strobe puts flashes on the DMX of a dark mover, at most 3 a second', async () => {
  const f = await add('ptdrgbws', 40);
  await dark(f);
  const dim = f.address + 2;
  await sleep(150);
  assert.strictEqual(await wire(f.universe, dim), 0, 'dark before the hit');
  await POST('/api/fx', { mode: 'strobe', flash: true, ids: [f.id] });
  const e = await edges(f.universe, dim, 2200);
  assert.ok(e.total >= 3, 'flashes on the wire: ' + e.total);
  assert.ok(e.max <= 3, 'never more than 3 rising edges in one second, saw ' + e.max);
  await POST('/api/fx', { mode: 'rig', ids: [f.id] });
  await sleep(150);
  assert.strictEqual(await wire(f.universe, dim), 0, 'back to the dark look after release');
}, true);

check('R3-I2: the software strobe expires by itself and is gone from the saved fixtures', async () => {
  const f = await add('ptdrgbws', 60);
  await dark(f);
  await POST('/api/fx', { mode: 'strobe', flash: true, ids: [f.id] });
  const own = async () => (await GET('/api/state')).body.fixtures.find((x) => x.id === f.id).fx;
  assert.ok(await own(), 'the lease is on');
  await sleep(3500);                               // nobody renews it: the page is gone
  assert.strictEqual(await own(), undefined, 'lease expired');
  const e = await edges(f.universe, f.address + 2, 600);
  assert.strictEqual(e.total, 0, 'no flash after the lease');
});

check('R3-I2: ARM / release clears every lease with api/fx {clearFlash}', async () => {
  const a = await add('ptdrgbws', 80), b = await add('ptdrgbws', 100);
  await POST('/api/fx', { mode: 'strobe', flash: true, ids: [a.id, b.id] });
  const r = await POST('/api/fx', { clearFlash: true });
  assert.strictEqual(r.body.cleared, 2);
  const fx = (await GET('/api/state')).body.fixtures.filter((x) => x.id === a.id || x.id === b.id).map((x) => x.fx);
  assert.deepStrictEqual(fx, [undefined, undefined]);
});

check('R4-I1 (pins the scope): the cap is api/raw ONLY; api/fixture values and scene recall are NOT capped, until the owner decides', async () => {
  const f = await add('drgbs', 120);
  const ch = f.address + 4;
  await POST('/api/fixture', { id: f.id, values: { strobe: 255 } });
  await sleep(150);
  assert.strictEqual(await wire(f.universe, ch), 255, 'api/fixture strobe=255 reaches the wire uncapped (scene strobe speed is the owner\'s call)');
  const sc = (await POST('/api/scenes/save', { name: 'strobe-scope' })).body.scene;
  await POST('/api/fixture', { id: f.id, values: { strobe: 0 } });
  await POST('/api/scenes/recall', { id: sc.id });
  await sleep(150);
  assert.strictEqual(await wire(f.universe, ch), 255, 'a recalled scene carries its strobe value uncapped');
  await POST('/api/scenes/remove', { ids: [sc.id] });
  await POST('/api/fixture', { id: f.id, values: { strobe: 0 } });
});

check('R4-L5: the 3 raw flashes a second are spaced, not a burst', async () => {
  const f = await add('drgb', 140);
  const ch = f.address, ok = [];
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {                    // an unpaced mash for ~1.2 s
    const up = await POST('/api/raw', { channel: ch, universe: f.universe, value: 255 });
    if (!(up.body.refused && up.body.refused.rate)) ok.push(Date.now() - t0);
    await POST('/api/raw', { channel: ch, universe: f.universe, value: -1 });
    await sleep(60);
  }
  assert.ok(ok.length >= 2 && ok.length <= 4, 'accepted ' + ok.length);
  for (let i = 1; i < ok.length; i++) assert.ok(ok[i] - ok[i - 1] >= 320, 'gap ' + (ok[i] - ok[i - 1]) + ' ms');
  await POST('/api/raw', { clear: true, all: true });
}, true);

check('N7618 (default, switch off): a raw strobe channel and the rise rate are NOT capped', async () => {
  const f = await add('drgbs', 160);
  const ch = f.address + 4;
  for (const v of [103, 50, 14, 200, 255]) {
    await POST('/api/raw', { channel: ch, universe: f.universe, value: v, owner: 'someone-else' });
    assert.strictEqual((await GET('/api/state')).body.raw[f.universe + ':' + ch], v, 'asked ' + v + ' held as asked');
  }
  await POST('/api/raw', { clear: true, all: true });
  const g = await add('drgb', 180);
  let refused = 0;
  for (let i = 0; i < 12; i++) {
    const up = await POST('/api/raw', { channel: g.address, universe: g.universe, value: 255 });
    if (up.body.refused && up.body.refused.rate) refused++;
    await POST('/api/raw', { channel: g.address, universe: g.universe, value: -1 });
  }
  assert.strictEqual(refused, 0, 'no rising edge refused with the switch off');
  await POST('/api/raw', { clear: true, all: true });
});

check('N7618 (default, switch off): the software strobe goes past 3 flashes a second on the wire', async () => {
  const f = await add('ptdrgbws', 200);
  await dark(f);
  await POST('/api/fx', { bpm: 300 });
  await POST('/api/fx', { mode: 'strobe', flash: true, ids: [f.id] });
  const e = await edges(f.universe, f.address + 2, 2200);
  assert.ok(e.max > 3, 'more than 3 rising edges in one second, saw ' + e.max);
  await POST('/api/fx', { mode: 'rig', ids: [f.id] });
});

(async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strobecap-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'standalone.js')], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, ARTNET_BIND_PORT: '0', ARTNET_OFFLINE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '', failures = 0;
  try {
    const port = await new Promise((resolve, reject) => {
      const bail = setTimeout(() => reject(new Error('server did not start in 10s:\n' + log)), 10000);
      child.stdout.on('data', (c) => { log += c; const m = log.match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(bail); resolve(Number(m[1])); } });
      child.stderr.on('data', (c) => { log += c; });
      child.on('exit', (code) => { clearTimeout(bail); reject(new Error('server exited (' + code + '):\n' + log)); });
    });
    base = 'http://127.0.0.1:' + port;
    for (const t of tests) {
      await POST('/api/output', { strobeLimit: t.limit });
      try { await t.fn(); console.log('  ok   ' + t.name); } catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + e.message); }
    }
  } catch (e) { failures++; console.log(e.message); }
  child.kill();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(failures ? '  ' + failures + ' failing' : '  all passing');
  process.exit(failures ? 1 : 0);
})();
