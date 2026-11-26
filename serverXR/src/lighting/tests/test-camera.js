'use strict';
// The camera page's server side, with the camera mocked: no /dev/video, no ffmpeg, no
// camera is ever opened by this file.
//   node tests/test-camera.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createCamera, listCameras, createFrameSplitter } = require('../camera');

let failures = 0;
const tests = [];
const check = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cam-test-'));

const jpeg = (n, size) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size || 20, n), Buffer.from([0xff, 0xd9])]);

// A fake ffmpeg: records how it was started and killed; the test pushes frames or closes it.
function fakeSpawn() {
  const calls = [];
  const spawn = (cmd, args) => {
    const p = new EventEmitter();
    p.stdout = new PassThrough(); p.stderr = new PassThrough();
    p.killed = [];
    p.kill = (sig) => { p.killed.push(sig); if (sig === 'SIGTERM') setImmediate(() => p.emit('close', 0)); };
    calls.push({ cmd, args, p });
    return p;
  };
  return { spawn, calls };
}

function fakeSys(root) {
  const base = path.join(root, 'sys/class/video4linux');
  const add = (n, name, index) => {
    fs.mkdirSync(path.join(base, 'video' + n), { recursive: true });
    fs.writeFileSync(path.join(base, 'video' + n, 'name'), name + '\n');
    fs.writeFileSync(path.join(base, 'video' + n, 'index'), index + '\n');
  };
  add(0, 'Cam A', 0); add(1, 'Cam A', 1); add(4, 'Wide Cam X', 0); add(5, 'Wide Cam X', 1);
}

check('listCameras: one entry per camera, capture node only, sorted', () => {
  const root = tmp(); fakeSys(root);
  assert.deepStrictEqual(listCameras(root), [{ device: '/dev/video0', name: 'Cam A' }, { device: '/dev/video4', name: 'Wide Cam X' }]);
  assert.deepStrictEqual(listCameras(path.join(root, 'nothing')), []);
});

check('frame splitter: frames cut across chunks, junk before the first frame dropped', () => {
  const got = [];
  const push = createFrameSplitter((f) => got.push(f));
  const all = Buffer.concat([Buffer.from([1, 2, 3]), jpeg(7), jpeg(8), jpeg(9)]);
  for (let i = 0; i < all.length; i += 5) push(all.subarray(i, i + 5));
  assert.strictEqual(got.length, 2, 'the last frame is held until the next one starts');
  assert.ok(got[0].equals(jpeg(7)) && got[1].equals(jpeg(8)));
});

check('not configured: no camera is opened', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp() });
  const r = await cam.frame();
  assert.strictEqual(r.code, 'unconfigured');
  assert.strictEqual(f.calls.length, 0);
  assert.strictEqual(cam.status().configured, false);
});

check('opens on the first frame request, passes MJPEG through, one process for many requests', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), idleMs: 5000 });
  cam.configure({ device: '/dev/video4', size: '2880x1440', fps: '30' });
  const first = cam.frame();
  assert.strictEqual(f.calls.length, 1);
  const a = f.calls[0].args.join(' ');
  assert.ok(a.includes('-i /dev/video4') && a.includes('-c:v copy') && a.includes('-input_format mjpeg') && a.includes('-video_size 2880x1440'), a);
  f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2), jpeg(3)]));
  const r = await first;
  assert.ok(r.buf.equals(jpeg(1)) || r.buf.equals(jpeg(2)));
  const again = await cam.frame();
  assert.ok(again.buf.length > 0);
  assert.strictEqual(f.calls.length, 1, 'still the one process');
  assert.strictEqual(cam.status().active, true);
  cam.close();
  assert.deepStrictEqual(f.calls[0].p.killed.slice(0, 1), ['SIGTERM']);
});

check('released after idleMs without a request, opened again by the next', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), idleMs: 120 });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  assert.strictEqual(cam.status().active, true);
  await sleep(450);
  assert.strictEqual(cam.status().active, false, 'camera let go');
  assert.ok(f.calls[0].p.killed.includes('SIGTERM'));
  const p2 = cam.frame(); assert.strictEqual(f.calls.length, 2, 'a new request opens it again');
  f.calls[1].p.stdout.write(Buffer.concat([jpeg(4), jpeg(5)])); await p2;
  cam.close();
});

check('a camera another program holds: said in words, not retried inside retryMs', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), retryMs: 300 });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame();
  f.calls[0].p.stderr.write('/dev/video4: Device or resource busy\n');
  await sleep(10);
  f.calls[0].p.emit('close', 1);
  const r = await p;
  assert.strictEqual(r.code, 'unavailable'); assert.match(r.error, /in use by another program/);
  const r2 = await cam.frame();
  assert.strictEqual(r2.code, 'unavailable'); assert.strictEqual(f.calls.length, 1, 'no hammering');
  await sleep(320);
  cam.frame(); assert.strictEqual(f.calls.length, 2, 'tries again after retryMs');
  cam.close();
});

check('a camera that sends nothing: "waiting", never a hang', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), firstFrameMs: 80 });
  cam.configure({ device: '/dev/video4' });
  const r = await cam.frame();
  assert.strictEqual(r.code, 'waiting');
  cam.close();
});

check('configure: validates, persists, resolves a name, restarts on change', async () => {
  const root = tmp(); fakeSys(root); const dir = tmp();
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: dir, spawn: f.spawn, fsRoot: root });
  assert.throws(() => cam.configure({ device: '/etc/passwd' }), /device must be/);
  assert.throws(() => cam.configure({ size: 'huge' }), /size must/);
  assert.throws(() => cam.configure({ fps: '1; rm' }), /fps must/);
  assert.strictEqual(cam.configure({ name: 'wide cam' }).device, '/dev/video4');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'camera.json'), 'utf8')), { name: 'wide cam' });
  const again = createCamera({ dataDir: dir, spawn: f.spawn, fsRoot: root });
  assert.strictEqual(again.status().device, '/dev/video4', 'read back on the next start');
  const p = again.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  again.configure({ device: '/dev/video0' });
  assert.ok(f.calls[0].p.killed.includes('SIGTERM'), 'the old camera is let go when the choice changes');
  assert.strictEqual(again.configure({ device: null, name: null }).configured, false);
  again.close();
});

check('desk routes: status, config, frame as image/jpeg, 404 unconfigured, 503 unavailable', async () => {
  const { createDesk } = require('../desk');
  const f = fakeSpawn();
  const dir = tmp();
  const camera = createCamera({ dataDir: dir, spawn: f.spawn, fsRoot: tmp(), retryMs: 5000 });
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {}, camera });
  const server = http.createServer((req, res) => desk.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    let r = await fetch(base + '/api/camera/frame');
    assert.strictEqual(r.status, 404);
    r = await fetch(base + '/api/camera'); const st = await r.json();
    assert.strictEqual(st.configured, false); assert.ok(Array.isArray(st.cameras));
    r = await fetch(base + '/api/camera/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: '/dev/video4' }) });
    assert.strictEqual((await r.json()).device, '/dev/video4');
    r = await fetch(base + '/api/camera/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: 'x' }) });
    assert.strictEqual(r.status, 400);
    const pending = fetch(base + '/api/camera/frame?t=1');
    await sleep(50);
    f.calls[0].p.stdout.write(Buffer.concat([jpeg(6, 100), jpeg(7)]));
    r = await pending;
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(jpeg(6, 100)));
    r = await fetch(base + '/space/anyshow/api/camera'); assert.strictEqual(r.status, 200, 'machine-level: any show key answers');
    f.calls[0].p.stderr.write('Device or resource busy'); f.calls[0].p.emit('close', 1);
    r = await fetch(base + '/api/camera/frame'); assert.strictEqual(r.status, 503);
  } finally { server.close(); desk.close(); }
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack || e)); }
  }
  console.log(failures ? failures + ' failing' : 'all passing');
  process.exit(failures ? 1 : 0);
})();
