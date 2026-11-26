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
  const camera = createCamera({ dataDir: dir, spawn: f.spawn, fsRoot: tmp(), retryMs: 5000, viewerFps: 1000 });
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


// ---- review fixes (PR 1376, 2026-11-26): stalled camera, timer leak, shutdown, splitter, rate, guard ----

check('1 stalled: a frame older than staleMs is answered "stalled" with its age, status says so, fresh frames clear it', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), idleMs: 60000, staleMs: 150 });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); const first = await p;
  assert.ok(first.buf, 'a fresh frame is served');
  assert.strictEqual(cam.status().stalled, false);
  await sleep(300);
  const r = await cam.frame();
  assert.strictEqual(r.code, 'stalled', 'old picture is not served as live');
  assert.ok(r.ageMs >= 150, 'its age is said: ' + r.ageMs);
  assert.strictEqual(cam.status().stalled, true);
  f.calls[0].p.stdout.write(Buffer.concat([jpeg(3), jpeg(4)]));
  await sleep(10);
  const again = await cam.frame();
  assert.ok(again.buf && again.seq > first.seq, 'new frames clear the stall, the number moves');
  assert.strictEqual(cam.status().stalled, false);
  cam.close();
});

check('2 timer leak: ffmpeg that fails to start leaves no interval behind, however many requests', async () => {
  const live = new Set(); const si = global.setInterval, ci = global.clearInterval;
  global.setInterval = (...a) => { const t = si(...a); live.add(t); return t; };
  global.clearInterval = (t) => { live.delete(t); return ci(t); };
  try {
    const spawn = () => { const p = new EventEmitter(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.kill = () => {}; setImmediate(() => p.emit('error', new Error('spawn ENOENT'))); return p; };
    const cam = createCamera({ dataDir: tmp(), spawn, fsRoot: tmp(), retryMs: 0, idleMs: 60000 });
    cam.configure({ device: '/dev/video4' });
    for (let i = 0; i < 20; i++) { await cam.frame(); await sleep(2); }
    assert.ok(live.size <= 1, 'live intervals after 20 failed starts: ' + live.size);
    await cam.close();
    assert.strictEqual(live.size, 0, 'none after close: ' + live.size);
  } finally { global.setInterval = si; global.clearInterval = ci; for (const t of live) ci(t); }
});

check('3 shutdown: close() waits for ffmpeg; one that ignores SIGTERM gets SIGKILL after killMs', async () => {
  const calls = [];
  const spawn = () => {
    const p = new EventEmitter(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.killed = [];
    p.kill = (sig) => { p.killed.push(sig); if (sig === 'SIGKILL') setImmediate(() => p.emit('close', null)); };   // ignores SIGTERM
    calls.push(p); return p;
  };
  const cam = createCamera({ dataDir: tmp(), spawn, fsRoot: tmp(), idleMs: 60000, killMs: 150 });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame(); calls[0].stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  const t0 = Date.now();
  await cam.close();
  assert.ok(Date.now() - t0 >= 140, 'close() waited for the process, not just signalled it (' + (Date.now() - t0) + ' ms)');
  assert.deepStrictEqual(calls[0].killed, ['SIGTERM', 'SIGKILL']);
  assert.strictEqual(cam.status().active, false);
  // Both shutdown paths wait for it.
  const root = path.join(__dirname, '..', '..');
  // serverXR's own shutdown is only checked when serverXR is around (a lighting-only copy has no index.js above it).
  const host = path.join(root, 'index.js');
  if (fs.existsSync(host) && fs.existsSync(path.join(root, 'routes'))) assert.ok(/closeCamera\(\)/.test(fs.readFileSync(host, 'utf8')), 'serverXR shutdown closes the camera');
  assert.ok(/closeCamera\(\)/.test(fs.readFileSync(path.join(__dirname, '..', 'standalone.js'), 'utf8')), 'standalone shutdown closes the camera');
});

check('4 splitter: 2 MB frames in 64 KB chunks, byte-exact, odd chunk sizes, marker cut across chunks', () => {
  const big = (n, size) => { const b = Buffer.alloc(size, n); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[size - 2] = 0xff; b[size - 1] = 0xd9; return b; };
  const frames = [big(1, 2 * 1024 * 1024), big(2, 148 * 1024), big(3, 1024 * 1024), big(4, 200)];
  const all = Buffer.concat([Buffer.from([9, 9]), ...frames]);
  for (const step of [3, 4093, 64 * 1024, 100003]) {
    const got = []; const push = createFrameSplitter((f) => got.push(f));
    for (let i = 0; i < all.length; i += step) push(all.subarray(i, Math.min(all.length, i + step)));
    assert.strictEqual(got.length, 3, 'step ' + step + ': last frame held until the next starts');
    for (let i = 0; i < 3; i++) assert.ok(got[i].equals(frames[i]), 'step ' + step + ' frame ' + i);
  }
});

check('5 viewer cap: one device asking faster than viewerFps is refused with a retry time; another device is not', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), idleMs: 60000, viewerFps: 4 });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame('phone-a'); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  const r = await cam.frame('phone-a');
  assert.strictEqual(r.code, 'rate'); assert.ok(r.retryMs > 0 && r.retryMs <= 250);
  assert.ok((await cam.frame('phone-b')).buf, 'another viewer is served');
  await sleep(270);
  assert.ok((await cam.frame('phone-a')).buf, 'after the gap it is served again');
  cam.close();
});

check('6 /sys is read once per cache window, not once per frame request', async () => {
  const root = tmp(); fakeSys(root);
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: root, idleMs: 60000, sysCacheMs: 400 });
  cam.configure({ name: 'wide cam' });
  const p = cam.frame(); assert.strictEqual(f.calls[0].args.includes('/dev/video4'), true);
  f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  fs.rmSync(path.join(root, 'sys'), { recursive: true });
  assert.ok((await cam.frame()).buf, 'device still resolved from the cache');
  await sleep(450);
  assert.strictEqual(cam.status().cameras.length, 0, 'read again after the window');
  cam.close();
});

// The desk behind a tiny front door, as the real one is: a hook sets req.ip the way Express does behind a trusted proxy.
async function deskServer(opts, setIp) {
  const { createDesk } = require('../desk');
  const dir = tmp();
  const camera = createCamera({ dataDir: dir, ...opts });
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {}, camera });
  const server = http.createServer((req, res) => { if (setIp) req.ip = setIp(req); desk.handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const get = (p, headers) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers: headers || {} }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); }).on('error', reject);
  });
  const stop = async () => { server.close(); await desk.closeCamera(); desk.close(); };
  return { camera, desk, get, port, stop };
}

// What the phones really send: https via the aylmo gateway, Host local.thedi.studio, an https Referer, X-Forwarded-*.
const GATEWAY = { host: 'local.thedi.studio', referer: 'https://local.thedi.studio/light/', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'local.thedi.studio' };

check('7 camera routes have the desk\'s own read rule: the gateway case, own name and a foreign Host all answer like GET /api/state', async () => {
  const f = fakeSpawn();
  const d = await deskServer({ spawn: f.spawn, fsRoot: tmp(), staleMs: 100, viewerFps: 1000, idleMs: 60000 });
  try {
    for (const h of [GATEWAY, { host: 'localhost:' + d.port }, { host: 'evil.example.com' }, { host: 'local.thedi.studio', origin: 'https://other.example' }]) {
      const st = (await d.get('/api/state', h)).status, cams = (await d.get('/api/camera', h)).status;
      assert.strictEqual(st, 200, 'state answers ' + JSON.stringify(h));
      assert.strictEqual(cams, st, 'camera status is exactly as reachable as state: ' + JSON.stringify(h));
      assert.notStrictEqual((await d.get('/api/camera/frame', h)).status, 403, 'frame is never refused by a laser guard: ' + JSON.stringify(h));
    }
    d.camera.configure({ device: '/dev/video4' });
    const pending = d.get('/api/camera/frame', GATEWAY);
    await sleep(50); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1, 50), jpeg(2)]));
    const ok = await pending;
    assert.strictEqual(ok.status, 200, 'the gateway case gets the picture'); assert.ok(ok.headers['x-frame-seq']);
    assert.strictEqual((await d.get('/api/camera/frame', { host: '127.0.0.1:' + d.port })).status, 200, 'the machine\'s own name');
    await sleep(250);
    const st = await d.get('/api/camera/frame', { host: '127.0.0.1:' + d.port });
    assert.strictEqual(st.status, 503);
    const j = JSON.parse(st.body.toString()); assert.strictEqual(j.code, 'stalled'); assert.ok(j.ageMs >= 100);
    assert.ok(!/laser/i.test(st.body.toString()), 'no laser wording');
  } finally { await d.stop(); }
});

check('7b a request the desk\'s mount refuses (serverXR requireLocalRuntime) is refused for the camera too, in words that do not name lasers', async () => {
  let guard;
  try { guard = require('../../localRuntimeGuard'); } catch (e) { return; }   // a lighting-only copy has no serverXR around it
  const keep = { n: process.env.NODE_ENV, l: process.env.DI_LOCAL, a: process.env.DI_ALLOW_LAN_DEVICES };
  process.env.NODE_ENV = 'development'; delete process.env.DI_ALLOW_LAN_DEVICES;
  const d = await deskServer({ fsRoot: tmp(), viewerFps: 1000 }, (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  // the mount: requireLocalRuntime first, then the desk, as routes/lightingRoutes.js does
  const front = http.createServer((req, res) => {
    req.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const rs = Object.assign(res, { status(c) { res.statusCode = c; return res; }, json(o) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); } });
    guard.requireLocalRuntime(req, rs, () => d.desk.handle(req, res));
  });
  await new Promise((r) => front.listen(0, '127.0.0.1', r));
  const hit = (p, headers) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: front.address().port, path: p, headers }, (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(c).toString() })); }).on('error', reject));
  try {
    for (const p of ['/api/state', '/api/camera', '/api/camera/frame']) {
      assert.strictEqual((await hit(p, {})).status !== 403, true, 'this machine: ' + p);
      const r = await hit(p, { 'x-forwarded-for': '203.0.113.7' });
      assert.strictEqual(r.status, 403, 'a stranger is refused: ' + p);
      assert.ok(!/laser/i.test(r.text), 'the refusal does not name lasers: ' + r.text);
    }
  } finally {
    front.close(); await d.stop();
    for (const [k, v] of [['NODE_ENV', keep.n], ['DI_LOCAL', keep.l], ['DI_ALLOW_LAN_DEVICES', keep.a]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

check('8 lighting/ reaches nothing outside itself (it runs on its own on the club machine)', () => {
  const root = path.join(__dirname, '..');
  const bad = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['tests', 'tools', 'ui', 'node_modules', 'data'].includes(e.name)) walk(full); continue; }
      if (!e.name.endsWith('.js') || /\.test\.js$/.test(e.name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      // a file read that climbs out of the directory is the same reach as a require
      for (const m of src.matchAll(/(?:readFileSync|readdirSync|existsSync|statSync|createReadStream)\(\s*path\.(?:join|resolve)\(\s*__dirname\s*,\s*((?:'\.\.'\s*,?\s*)+)/g)) {
        if (m[1].includes('..')) bad.push(path.relative(root, full) + ' reads ' + m[0].slice(0, 70));
      }
      for (const m of src.matchAll(/require\(\s*['"](\.[^'"]*)['"]\s*\)/g)) {
        const target = path.resolve(path.dirname(full), m[1]);
        if (path.relative(root, target).startsWith('..')) bad.push(path.relative(root, full) + ' -> ' + m[1]);
      }
    }
  })(root);
  assert.deepStrictEqual(bad, []);
});

check('9 rate cap is per real client: two forwarded phones each get their own 2 fps', async () => {
  const f = fakeSpawn();
  const d = await deskServer({ spawn: f.spawn, fsRoot: tmp(), viewerFps: 2, idleMs: 60000 }, (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim());
  try {
    d.camera.configure({ device: '/dev/video4' });
    const first = d.get('/api/camera/frame', { 'x-forwarded-for': '203.0.113.1' });
    await sleep(50); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1, 50), jpeg(2)]));
    assert.strictEqual((await first).status, 200);
    assert.strictEqual((await d.get('/api/camera/frame', { 'x-forwarded-for': '203.0.113.2' })).status, 200, 'phone B is not throttled by phone A');
    assert.strictEqual((await d.get('/api/camera/frame', { 'x-forwarded-for': '203.0.113.1' })).status, 429, 'phone A asking again at once is');
  } finally { await d.stop(); }
});

check('10 close(): frame() never starts ffmpeg again', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), viewerFps: 1000, device: '/dev/video4' });
  cam.configure({ device: '/dev/video4' });
  const p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  await cam.close();
  const r = await cam.frame();
  assert.ok(r.error, 'answers an error');
  assert.strictEqual(f.calls.length, 1, 'no second ffmpeg');
});

check('11 stalled while a page keeps asking: ffmpeg is restarted with backoff and the view returns', async () => {
  const f = fakeSpawn();
  const logs = [];
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), viewerFps: 1000, staleMs: 60, idleMs: 60000, backoffMs: [120, 240], killMs: 50, log: (l) => logs.push(l) });
  cam.configure({ device: '/dev/video4' });
  let p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1, 50), jpeg(2)])); assert.ok((await p).buf);
  const poll = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { await cam.frame(); await sleep(15); } };
  await poll(60);                                     // the first ffmpeg now hangs: pictures go stale, inside the first backoff (120 ms)
  assert.strictEqual(f.calls.length, 1, 'not restarted at once');
  await poll(250);                                    // a page keeps asking
  assert.strictEqual(f.calls.length, 2, 'a second ffmpeg was started');
  assert.ok(f.calls[0].p.killed.includes('SIGTERM'), 'the hung one was let go');
  p = cam.frame(); await sleep(20); f.calls[1].p.stdout.write(Buffer.concat([jpeg(5, 50), jpeg(6)]));
  const r = await p; assert.ok(r.buf, 'the view returns when the camera does');
  // hangs again at once: the next restart waits for the longer backoff (240 ms), not sooner
  await poll(150);
  assert.strictEqual(f.calls.length, 2, 'inside the second backoff window: no third ffmpeg yet');
  await poll(450);
  assert.strictEqual(f.calls.length, 3, 'after the backoff: the third');
  await cam.close();
});

check('11b ffmpeg that dies is started again by the next request after retryMs', async () => {
  const f = fakeSpawn();
  const cam = createCamera({ dataDir: tmp(), spawn: f.spawn, fsRoot: tmp(), viewerFps: 1000, retryMs: 80, idleMs: 60000 });
  cam.configure({ device: '/dev/video4' });
  let p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  f.calls[0].p.emit('close', 1);
  assert.strictEqual((await cam.frame()).code, 'unavailable');
  await sleep(100);
  p = cam.frame(); await sleep(10); assert.strictEqual(f.calls.length, 2);
  f.calls[1].p.stdout.write(Buffer.concat([jpeg(3), jpeg(4)])); assert.ok((await p).buf);
  await cam.close();
});

check('12 configure() during a stall restart: the restart opens the camera chosen now, not the old one', async () => {
  const f = fakeSpawn();
  const plain = f.spawn;   // the old ffmpeg takes 80 ms to end after SIGTERM, so the restart is still waiting when the page picks
  f.spawn = (...a) => { const p = plain(...a); p.kill = (sig) => { p.killed.push(sig); setTimeout(() => p.emit('close', 0), 80); }; return p; };
  const cam = createCamera({ dataDir: tmp(), spawn: (...a) => f.spawn(...a), fsRoot: tmp(), viewerFps: 1000, staleMs: 40, idleMs: 60000, backoffMs: [30], killMs: 500 });
  cam.configure({ device: '/dev/video4' });
  let p = cam.frame(); f.calls[0].p.stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  const end = Date.now() + 400; let n = f.calls.length;
  while (Date.now() < end && f.calls.length === n && !f.calls[0].p.killed.length) { await cam.frame(); await sleep(10); }
  assert.ok(f.calls[0].p.killed.includes('SIGTERM'), 'the restart began');
  cam.configure({ device: '/dev/video6' });          // the page picks another camera while the old ffmpeg is going
  await sleep(150);
  assert.ok(f.calls.every((c) => !(c.args.includes('/dev/video4') && c !== f.calls[0])), 'no second ffmpeg on the old device');
  const st = cam.status();
  assert.strictEqual(st.device, '/dev/video6');
  assert.ok(!st.active || f.calls[f.calls.length - 1].args.includes('/dev/video6'), 'what runs is what status says');
  cam.configure({ device: null, name: null });        // chosen camera removed: nothing may open
  await sleep(100);
  assert.strictEqual(cam.status().active, false);
  await cam.close();
});

check('13 close() during a restart waits for the ffmpeg that ignores SIGTERM (SIGKILL after killMs)', async () => {
  const calls = [];
  const spawn = () => { const p = new EventEmitter(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.killed = [];
    p.kill = (sig) => { p.killed.push(sig); if (sig === 'SIGKILL') setImmediate(() => p.emit('close', 0)); }; calls.push(p); return p; };
  const cam = createCamera({ dataDir: tmp(), spawn, fsRoot: tmp(), viewerFps: 1000, staleMs: 40, idleMs: 60000, backoffMs: [20], killMs: 200 });
  cam.configure({ device: '/dev/video4' });
  let p = cam.frame(); calls[0].stdout.write(Buffer.concat([jpeg(1), jpeg(2)])); await p;
  const end = Date.now() + 500;
  while (Date.now() < end && !calls[0].killed.length) { await cam.frame(); await sleep(10); }
  assert.deepStrictEqual(calls[0].killed, ['SIGTERM'], 'the restart is waiting for the hung ffmpeg');
  const t0 = Date.now();
  await cam.close();
  assert.deepStrictEqual(calls[0].killed, ['SIGTERM', 'SIGKILL'], 'close() saw it through to the kill');
  assert.ok(Date.now() - t0 >= 100, 'close() waited (' + (Date.now() - t0) + ' ms), not 0');
  assert.strictEqual(calls.length, 1, 'and no new ffmpeg after');
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack || e)); }
  }
  console.log(failures ? failures + ' failing' : 'all passing');
  process.exit(failures ? 1 : 0);
})();
