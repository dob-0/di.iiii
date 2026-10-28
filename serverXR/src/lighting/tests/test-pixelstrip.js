'use strict';
// The pixel strip (pixelstrip.js): how pixels are cut into universes, the colour order, what a bad patch is
// refused for, how a strip renders in the engine, and the routes a page or a video source calls — on a
// throwaway desk. Plain node, like the other suites: node tests/test-pixelstrip.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createDesk } = require('../desk');
const { Engine, makeFixture } = require('../engine');
const S = require('../pixelstrip');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

const plan = (raw) => {
  const p = S.planStrip(raw);
  assert.ok(p.ok, p.error);
  return p.plan;
};
const refused = (raw) => {
  const p = S.planStrip(raw);
  assert.strictEqual(p.ok, false, 'should have been refused');
  return p.error;
};
const shape = (p) => p.spans.map((s) => `U${s.universe + 1}:${s.address}+${s.count}`);

// ---- the universe split ----------------------------------------------------------

check('RGB: 170 pixels fill one universe exactly, the 171st opens the next', () => {
  assert.deepStrictEqual(shape(plan({ pixels: 170 })), ['U1:1+170']);
  assert.deepStrictEqual(shape(plan({ pixels: 171 })), ['U1:1+170', 'U2:1+1']);
  assert.strictEqual(plan({ pixels: 170 }).spans[0].channels, 510, '2 channels of the universe stay unused');
});

check('RGB: 300 pixels are 170 + 130 over two universes, ending at channel 390', () => {
  const p = plan({ pixels: 300, startUniverse: 4 });
  assert.deepStrictEqual(shape(p), ['U5:1+170', 'U6:1+130']);
  assert.deepStrictEqual(p.universes, [4, 5]);
  assert.deepStrictEqual(p.end, { universe: 5, channel: 390 });
});

check('RGBW: 128 pixels fill one universe, 300 are 128 + 128 + 44', () => {
  assert.strictEqual(S.maxPixelsPerUniverse('RGBW'), 128);
  assert.deepStrictEqual(shape(plan({ pixels: 128, order: 'RGBW' })), ['U1:1+128']);
  assert.deepStrictEqual(shape(plan({ pixels: 129, order: 'RGBW' })), ['U1:1+128', 'U2:1+1']);
  assert.deepStrictEqual(shape(plan({ pixels: 300, order: 'GRBW' })), ['U1:1+128', 'U2:1+128', 'U3:1+44']);
});

check('a lower pixels-per-universe is a fixed cut; above the ceiling it is refused', () => {
  assert.deepStrictEqual(shape(plan({ pixels: 300, pixelsPerUniverse: 150 })), ['U1:1+150', 'U2:1+150']);
  assert.match(refused({ pixels: 10, pixelsPerUniverse: 171 }), /1 to 170 for RGB/);
  assert.match(refused({ pixels: 10, order: 'RGBW', pixelsPerUniverse: 129 }), /1 to 128 for RGBW/);
});

check('a start address inside the universe shortens the first span, never splits a pixel', () => {
  const p = plan({ pixels: 300, startAddress: 100 });
  assert.deepStrictEqual(shape(p), ['U1:100+137', 'U2:1+163']);
  assert.deepStrictEqual(S.pixelAt(p, 136), { universe: 0, channel: 100 + 136 * 3 });
  assert.deepStrictEqual(S.pixelAt(p, 137), { universe: 1, channel: 1 });
  assert.strictEqual(S.pixelAt(p, 300), null);
  assert.deepStrictEqual(shape(plan({ pixels: 3, startAddress: 510 })), ['U1:510+1', 'U2:1+2']);
});

check('defaults are the settings, none of them a rig: 60 RGB pixels from U1.1', () => {
  const p = plan({});
  assert.deepStrictEqual(shape(p), ['U1:1+60']);
  assert.strictEqual(p.order, 'RGB');
  assert.strictEqual(S.DEFAULTS.output.driver, '');
});

// ---- order -----------------------------------------------------------------------

check('the colour order maps r,g,b(,w) to the channels the strip wants', () => {
  assert.deepStrictEqual(S.encodePixel('RGB', [10, 20, 30, 0]), [10, 20, 30]);
  assert.deepStrictEqual(S.encodePixel('GRB', [10, 20, 30, 0]), [20, 10, 30]);
  assert.deepStrictEqual(S.encodePixel('BGR', [10, 20, 30, 0]), [30, 20, 10]);
  assert.deepStrictEqual(S.encodePixel('RGBW', [10, 20, 30, 40]), [10, 20, 30, 40]);
  assert.deepStrictEqual(S.encodePixel('WRGB', [10, 20, 30, 40]), [40, 10, 20, 30]);
  assert.deepStrictEqual(S.encodePixel('GRBW', [10, 20, 30, 40]), [20, 10, 30, 40]);
});

check('auto white takes the common part out of r,g,b only when asked and w is not given', () => {
  assert.deepStrictEqual(S.encodePixel('RGBW', [200, 150, 100, 0], { autoWhite: true }), [100, 50, 0, 100]);
  assert.deepStrictEqual(S.encodePixel('RGBW', [200, 150, 100, 0]), [200, 150, 100, 0]);
  assert.deepStrictEqual(S.encodePixel('RGBW', [200, 150, 100, 7], { autoWhite: true }), [200, 150, 100, 7]);
});

check('orders: lower case is read, anything that is not an arrangement of RGB(W) is refused with the way out', () => {
  assert.strictEqual(S.normalizeOrder('grb').order, 'GRB');
  for (const bad of ['RGG', 'RG', 'RGBX', 'RGBWW', 'xyz']) {
    const o = S.normalizeOrder(bad);
    assert.strictEqual(o.ok, false, bad);
    assert.match(o.error, /RGB, GRB, RGBW/);
  }
  assert.match(refused({ order: 'RGX' }), /not an arrangement of R, G, B/);
});

// ---- refusals --------------------------------------------------------------------

check('an address that leaves no room for one pixel is refused, in the desk\'s numbers, with the way out', () => {
  assert.match(refused({ startAddress: 511 }), /address 511 leaves 2 channels in universe 1, and one RGB pixel needs 3 — start at 510 or lower/);
  assert.match(refused({ startAddress: 512, startUniverse: 2 }), /leaves 1 channel in universe 3/);
  assert.match(refused({ startAddress: 510, order: 'RGBW' }), /one RGBW pixel needs 4 — start at 509 or lower/);
});

check('addresses and counts outside their range are refused', () => {
  assert.match(refused({ startAddress: 0 }), /outside 1 to 512/);
  assert.match(refused({ startAddress: 513 }), /outside 1 to 512/);
  assert.match(refused({ startAddress: 'x' }), /outside 1 to 512/);
  assert.match(refused({ startUniverse: -1 }), /start universe/);
  assert.match(refused({ startUniverse: 32768 }), /start universe/);
  assert.match(refused({ pixels: 0 }), /1 to 8192 pixels/);
  assert.match(refused({ pixels: 8193 }), /1 to 8192 pixels/);
  assert.match(refused({ pixels: 1.5 }), /1 to 8192 pixels/);
});

check('a strip that runs past the last universe is refused and says how far it needed to go', () => {
  const msg = refused({ pixels: 400, startUniverse: 32766 });
  assert.match(msg, /need universes 32767 to 32769, and the highest is 32768/);
  assert.ok(S.planStrip({ pixels: 340, startUniverse: 32766 }).ok, 'exactly two universes still fits');
});

check('a receiver address must be an IPv4 address when a route is named', () => {
  assert.match(S.makeStrip({ output: { driver: 'artnet', host: 'wled.local' } }).error, /not an IPv4 address/);
  assert.strictEqual(S.makeStrip({ output: { driver: 'sacn', host: '192.168.4.20' } }).strip.output.host, '192.168.4.20');
  assert.deepStrictEqual(S.makeStrip({ output: { driver: 'nope', host: 'x' } }).strip.output, { driver: '', host: '' });
});

check('a patch that sits on a lamp or on another strip names who it sits on', () => {
  const lamp = makeFixture({ profile: 'rgb', address: 100, universe: 0, name: 'wash', index: 4 });
  const widthOf = () => 3;
  const mine = plan({ pixels: 60 });
  assert.match(S.findConflict(mine, { fixtures: [lamp], widthOf }), /channel 100 of universe 1 is taken by 4.wash/);
  assert.strictEqual(S.findConflict(plan({ pixels: 10 }), { fixtures: [lamp], widthOf }), null, '30 channels stop short of 100');
  const other = S.makeStrip({ name: 'roof', pixels: 200, startUniverse: 0 }).strip;
  assert.match(S.findConflict(plan({ pixels: 10, startUniverse: 1, startAddress: 50 }), { strips: [other] }), /channel 50 of universe 2 is taken by the strip "roof"/);
  assert.strictEqual(S.findConflict(mine, { strips: [other], ignoreId: other.id }), null, 'a strip never conflicts with itself');
});

// ---- the engine ------------------------------------------------------------------

const stateWith = (stripsIn, extra = {}) => ({
  master: 255, blackout: false, fixtures: [], raw: {}, scenes: [], activeScene: null, strips: stripsIn,
  chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 }, ...extra,
});

check('the engine renders a strip over its universes, in order, scaled by level; the rest stays dark', () => {
  const st = S.makeStrip({ pixels: 171, startUniverse: 2, order: 'GRB', color: { r: 255, g: 100, b: 0 }, level: 128 }).strip;
  const e = new Engine(stateWith([st]));
  assert.deepStrictEqual(e.universes(), [2, 3]);
  const out = e.render();
  const u = out.get(2);
  assert.deepStrictEqual([u[0], u[1], u[2]], [50, 128, 0], 'G R B at half level');
  assert.strictEqual(u[507], 50, 'pixel 169 (last of the universe) is lit');
  assert.strictEqual(u[510] + u[511], 0, 'the 2 unused slots stay 0');
  assert.deepStrictEqual([out.get(3)[0], out.get(3)[1], out.get(3)[3]], [50, 128, 0], 'pixel 170 opens universe 4');
});

check('master and blackout reach a strip; an off strip is dark', () => {
  const st = S.makeStrip({ pixels: 4, color: { r: 200, g: 200, b: 200 } }).strip;
  assert.strictEqual(new Engine(stateWith([st], { master: 128 })).render().get(0)[0], 100);
  assert.strictEqual(new Engine(stateWith([st], { blackout: true })).render().get(0)[0], 0);
  assert.strictEqual(new Engine(stateWith([{ ...st, on: false }])).render().get(0)[0], 0);
});

check('a live frame wins while fresh and hands back to the colour when it is stale', () => {
  const st = S.makeStrip({ pixels: 3, color: { r: 9, g: 9, b: 9 }, frameTtlMs: 1000 }).strip;
  const e = new Engine(stateWith([st]));
  e.setStripFrame(st.id, Uint8Array.from([255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0]), Date.now());
  let u = e.render().get(0);
  assert.deepStrictEqual([...u.slice(0, 9)], [255, 0, 0, 0, 255, 0, 0, 0, 255]);
  e.setStripFrame(st.id, Uint8Array.from([255, 0, 0, 0]), Date.now() - 5000);
  u = e.render().get(0);
  assert.deepStrictEqual([...u.slice(0, 3)], [9, 9, 9]);
});

check('the walk test lights one pixel and moves it end to end; colour tests fill the strip', () => {
  const st = S.makeStrip({ pixels: 5, test: 'walk', testRate: 10 }).strip;
  const e = new Engine(stateWith([st]));
  const lit = (now) => { const u = e.render(undefined, now).get(0); return [0, 1, 2, 3, 4].filter((i) => u[i * 3] === 255); };
  assert.deepStrictEqual(lit(0), [0]);
  assert.deepStrictEqual(lit(100), [1]);
  assert.deepStrictEqual(lit(400), [4]);
  assert.deepStrictEqual(lit(500), [0], 'it wraps');
  const red = new Engine(stateWith([{ ...st, test: 'red' }])).render().get(0);
  assert.deepStrictEqual([...red.slice(0, 6)], [255, 0, 0, 255, 0, 0]);
});

check('a lamp is never auto-patched onto a strip', () => {
  const st = S.makeStrip({ pixels: 10, startAddress: 1 }).strip;   // 30 channels
  const e = new Engine(stateWith([st]));
  assert.strictEqual(e.nextFreeAddress(0, 3), 31);
  assert.strictEqual(e.nextFreeAddress(1, 3), 1, 'another universe is free');
});

// ---- the desk over HTTP ------------------------------------------------------------

async function deskOn(existing) {
  const dir = existing || fs.mkdtempSync(path.join(os.tmpdir(), 'desk-strip-'));
  const desk = createDesk({ dataDir: dir, offline: true, log: () => {} });
  const server = http.createServer((q, r) => desk.handle(q, r));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, route, body) => {
    const r = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { desk, call, dir, close: () => { desk.close(); server.close(); }, stop: () => { desk.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

check('add, list, update and remove a strip over HTTP; the plan comes back with it', async () => {
  const d = await deskOn();
  const add = await d.call('POST', '/api/strips/add', { name: 'roof', pixels: 300, startUniverse: 1, order: 'grb' });
  assert.strictEqual(add.status, 200, JSON.stringify(add.body));
  assert.strictEqual(add.body.strip.order, 'GRB');
  assert.deepStrictEqual(add.body.strip.plan.spans.map((s) => s.count), [170, 130]);
  const id = add.body.strip.id;
  const list = await d.call('GET', '/api/strips');
  assert.strictEqual(list.body.strips.length, 1);
  assert.strictEqual(list.body.type.id, 'pixel-strip');
  const state = await d.call('GET', '/api/state');
  assert.strictEqual(state.body.strips[0].id, id, 'the page reads strips from the state');
  const up = await d.call('POST', '/api/strips/update', { id, pixels: 100, name: 'roof 2' });
  assert.strictEqual(up.status, 200);
  assert.strictEqual(up.body.strip.order, 'GRB', 'what was not sent is kept');
  assert.strictEqual(up.body.strip.plan.spans.length, 1);
  assert.strictEqual((await d.call('POST', '/api/strips/remove', { id })).status, 200);
  assert.strictEqual((await d.call('GET', '/api/strips')).body.strips.length, 0);
  assert.strictEqual((await d.call('POST', '/api/strips/remove', { id })).status, 404);
  d.stop();
});

check('over HTTP an overflow is refused with a clear message and nothing is added', async () => {
  const d = await deskOn();
  const a = await d.call('POST', '/api/strips/add', { pixels: 10, startAddress: 511 });
  assert.strictEqual(a.status, 400);
  assert.match(a.body.error, /address 511 leaves 2 channels/);
  const b = await d.call('POST', '/api/strips/add', { pixels: 100000 });
  assert.strictEqual(b.status, 400);
  assert.strictEqual((await d.call('GET', '/api/strips')).body.strips.length, 0);
  d.stop();
});

check('a strip and a lamp refuse each other\'s channels; force stacks them on purpose', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/fixtures/add', { profile: 'rgb', universe: 0, address: 10 });
  const clash = await d.call('POST', '/api/strips/add', { pixels: 20 });
  assert.strictEqual(clash.status, 409);
  assert.match(clash.body.error, /channel 10 of universe 1 is taken by/);
  assert.strictEqual((await d.call('POST', '/api/strips/add', { pixels: 20, startUniverse: 1 })).status, 200);
  const lamp = await d.call('POST', '/api/fixtures/add', { profile: 'rgb', universe: 1, address: 5 });
  assert.strictEqual(lamp.status, 409, 'a lamp cannot be typed onto the strip');
  assert.match(lamp.body.error, /taken by strip\./);
  assert.strictEqual((await d.call('POST', '/api/strips/add', { pixels: 20, force: true })).status, 200);
  d.stop();
});

check('a strip survives a reload of the show file', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/strips/add', { name: 'keep', pixels: 90, startUniverse: 3, startAddress: 20, order: 'BGR', output: { driver: 'sacn', host: '10.0.0.7' } });
  const dir = d.dir;
  d.close();
  const again = await deskOn(dir);
  const s = (await again.call('GET', '/api/strips')).body.strips[0];
  assert.strictEqual(s.name, 'keep');
  assert.deepStrictEqual([s.pixels, s.startUniverse, s.startAddress, s.order, s.output.host], [90, 3, 20, 'BGR', '10.0.0.7']);
  again.stop();
});

check('a pixel frame posted to the desk reaches the universes; a bad one is refused', async () => {
  const d = await deskOn();
  const id = (await d.call('POST', '/api/strips/add', { pixels: 3, order: 'GRB' })).body.strip.id;
  assert.strictEqual((await d.call('POST', '/api/strips/pixels', { id, pixels: [[255, 0, 0], [0, 255, 0]] })).status, 200);
  await new Promise((r) => setTimeout(r, 120));
  const dmx = (await d.call('GET', '/api/dmx')).body.dmx;
  assert.deepStrictEqual([...dmx[0].slice(0, 9)], [0, 255, 0, 255, 0, 0, 0, 0, 0], 'GRB order, third pixel dark');
  const data = Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64');
  assert.strictEqual((await d.call('POST', '/api/strips/pixels', { id, data })).status, 200);
  assert.strictEqual((await d.call('POST', '/api/strips/pixels', { id, pixels: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]] })).status, 400);
  assert.strictEqual((await d.call('POST', '/api/strips/pixels', { id, data: Buffer.from([1, 2]).toString('base64') })).status, 400);
  assert.strictEqual((await d.call('POST', '/api/strips/pixels', { id: 'nope', pixels: [] })).status, 404);
  d.stop();
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok  ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log(`\npixelstrip: ${tests.length - failures}/${tests.length} passed`);
  process.exit(failures ? 1 : 0);
})();
