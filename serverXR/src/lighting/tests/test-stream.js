'use strict';
// The pushed frame (dmxstream.js): Server-Sent Events from the desk's loop to a room.
// A throwaway desk on an ephemeral port, offline; a raw SSE reader over node's http.
// Run with: node serverXR/src/lighting/tests/test-stream.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createDesk } = require('../desk');
const { deltaRuns, parseUniverses } = require('../dmxstream');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(dir) {
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} });
  const server = http.createServer((req, res) => desk.handle(req, res));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const base = 'http://127.0.0.1:' + port;
    const POST = async (route, body) => {
      const r = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      return { status: r.status, body: await r.json() };
    };
    resolve({ desk, base, port, POST, stop: () => new Promise((done) => { desk.close(); server.closeAllConnections?.(); server.close(() => done()); }) });
  }));
}

// A stream reader: every `frame` event parsed, in order; `.close()` hangs up.
function listen(d, query = '') {
  const events = [];
  const waiters = [];
  let buffer = '';
  let headers = null;
  const req = http.get(d.base + '/api/dmx/stream' + query, (res) => {
    headers = res.headers;
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const lines = block.split('\n');
        const ev = (lines.find((l) => l.startsWith('event: ')) || '').slice(7);
        const data = lines.filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
        if (ev === 'frame') {
          events.push({ at: Date.now(), ...JSON.parse(data) });
          for (const w of waiters.splice(0)) w();
        }
      }
    });
  });
  req.on('error', () => {});
  const next = (pred, ms = 2000) => new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('no frame matched within ' + ms + ' ms')), ms);
    const look = () => {
      const hit = events.find(pred);
      if (hit) { clearTimeout(deadline); resolve(hit); } else waiters.push(look);
    };
    look();
  });
  return { events, next, get headers() { return headers; }, close: () => req.destroy() };
}

const valueIn = (ev, u, ch) => {
  for (const [uu, start, vals] of ev.d) if (uu === u && ch - 1 >= start && ch - 1 < start + vals.length) return vals[ch - 1 - start];
  return undefined;
};

check('deltaRuns: nothing changed is no run; separate changes are separate runs; close ones join', () => {
  const a = Buffer.alloc(512);
  const b = Buffer.from(a);
  assert.deepStrictEqual(deltaRuns(a, b), []);
  b[10] = 5; b[12] = 6; b[200] = 7;
  assert.deepStrictEqual(deltaRuns(a, b), [[10, [5, 0, 6]], [200, [7]]]);
  assert.deepStrictEqual(deltaRuns(null, Buffer.from([1, 2])), [[0, [1, 2]]], 'no previous frame: all of it');
});

check('parseUniverses reads u=0,5 and ignores junk', () => {
  assert.deepStrictEqual([...parseUniverses(new URLSearchParams('u=0,5,x,-1'))], [0, 5]);
  assert.strictEqual(parseUniverses(new URLSearchParams('')), null);
});

let d;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));

check('a new listener gets SSE headers and a KEY frame with the meta', async () => {
  await d.POST('/api/raw', { universe: 0, channel: 1, value: 10 });
  const s = listen(d);
  const key = await s.next((e) => e.k === 1);
  assert.match(s.headers['content-type'], /^text\/event-stream/);
  assert.strictEqual(s.headers['cache-control'], 'no-store, no-transform');
  assert.strictEqual(valueIn(key, 0, 1), 10, 'the held channel is in the key frame');
  assert.ok(key.m && 'master' in key.m && Array.isArray(key.m.looks), 'meta rides the key frame');
  assert.ok(Math.abs(key.t - Date.now()) < 1000, 't is the desk clock');
  s.close();
});

check('a fader move arrives as a DELTA of only that run, immediately (not at the next tick)', async () => {
  const s = listen(d);
  await s.next((e) => e.k === 1);
  const sent = Date.now();
  await d.POST('/api/raw', { universe: 0, channel: 300, value: 222 });
  const ev = await s.next((e) => e.k === 0 && valueIn(e, 0, 300) === 222);
  assert.strictEqual(ev.d.length, 1, 'one run');
  assert.strictEqual(ev.d[0][1], 299, 'starting at the slot that moved');
  assert.ok(ev.d[0][2].length <= 1 + 6, 'only a few slots, not the universe');
  assert.ok(ev.at - sent < 200, `arrived ${ev.at - sent} ms after the POST`);
  s.close();
});

check('an unchanged desk sends no frames (after the key frame)', async () => {
  const s = listen(d);
  await s.next((e) => e.k === 1);
  const before = s.events.length;
  await sleep(300); // ~12 ticks at 40 Hz
  assert.strictEqual(s.events.length, before, 'nothing changed, nothing sent');
  s.close();
});

check('?u= keeps a listener to its universes', async () => {
  await d.POST('/api/raw', { universe: 3, channel: 1, value: 50 });
  const s = listen(d, '?u=3');
  const key = await s.next((e) => e.k === 1);
  assert.ok(key.d.every(([u]) => u === 3), 'only universe 3');
  await d.POST('/api/raw', { universe: 0, channel: 2, value: 99 });
  await d.POST('/api/raw', { universe: 3, channel: 2, value: 77 });
  const ev = await s.next((e) => valueIn(e, 3, 2) === 77);
  assert.ok(ev.d.every(([u]) => u === 3));
  s.close();
});

check('a look firing changes the meta once, not every frame', async () => {
  const look = { id: 'rig-x', name: 'X', kind: 'all', fixtures: [], steps: [{ values: {} }] };
  await d.POST('/api/looks/add', { look });
  const s = listen(d);
  await s.next((e) => e.k === 1);
  await d.POST('/api/looks/fire', { id: 'rig-x' });
  const ev = await s.next((e) => e.m && e.m.looks.some((l) => l.lookId === 'rig-x'));
  const l = ev.m.looks.find((x) => x.lookId === 'rig-x');
  assert.ok(Number.isFinite(l.firedAt), 'firedAt on the desk clock');
  await sleep(200);
  const metas = s.events.filter((e) => e.m && e.s > ev.s);
  assert.strictEqual(metas.length, 0, 'meta not re-sent while nothing changed');
  s.close();
});

check('a reconnect starts again from a key frame (the browser\'s own retry)', async () => {
  const a = listen(d);
  await a.next((e) => e.k === 1);
  a.close();
  await sleep(50);
  const b = listen(d);
  const key = await b.next((e) => e.k === 1);
  assert.strictEqual(key.s, 1, 'a new stream counts from 1');
  b.close();
});

check('a sustained change streams at the desk rate (~40 fps)', async () => {
  const s = listen(d);
  await s.next((e) => e.k === 1);
  // An FX-like change every tick: a raw channel moved 40 times in a second.
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    await d.POST('/api/raw', { universe: 0, channel: 5, value: i * 5 });
    await sleep(20);
  }
  const span = (Date.now() - t0) / 1000;
  const moved = s.events.filter((e) => valueIn(e, 0, 5) !== undefined).length;
  assert.ok(moved >= 38, `${moved} frames carried the change in ${span.toFixed(2)} s`);
  s.close();
});

(async () => {
  d = await start(dir);
  try {
    for (const t of tests) {
      try { await t.fn(); console.log('  ok   ' + t.name); }
      catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + e.message); }
    }
  } finally {
    await d.stop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('');
  console.log(failures ? '  ' + failures + ' failing' : '  all passing');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
