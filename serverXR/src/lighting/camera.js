'use strict';
// The desk's camera: any v4l2 camera, named in <data dir>/camera.json, shown as JPEG frames
// on demand (the "Camera" page). Nothing here knows a maker or a production.
//
// The camera is opened ONLY while a page asks for frames and let go of after `idleMs`
// without one (default 10 s), so a desk nobody is looking at holds no camera and spends no
// CPU. The camera's own MJPEG frames are passed through (`-c:v copy`): no decode, no
// re-encode, so the cost of a viewer is a pipe read, not a transcode, whatever the size.
// A camera another program holds is not taken from it: the open fails, the page says so,
// and the next try is no sooner than `retryMs`.

const fs = require('fs');
const path = require('path');
const { spawn: realSpawn } = require('child_process');

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const BUF_MAX = 16 * 1024 * 1024;       // a runaway pipe is dropped, never grown

// The capture nodes of every camera (one per physical camera: index 0), named from sysfs.
function listCameras(fsRoot) {
  const root = fsRoot || '/';
  const base = path.join(root, 'sys/class/video4linux');
  let names = [];
  try { names = fs.readdirSync(base); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    const m = /^video(\d+)$/.exec(n);
    if (!m) continue;
    let index = '0';
    try { index = fs.readFileSync(path.join(base, n, 'index'), 'utf8').trim(); } catch (e) { /* single-node */ }
    if (index !== '0') continue;
    let name = null;
    try { name = fs.readFileSync(path.join(base, n, 'name'), 'utf8').trim(); } catch (e) { /* unnamed */ }
    out.push({ device: '/dev/' + n, name, num: Number(m[1]) });
  }
  return out.sort((a, b) => a.num - b.num).map(({ device, name }) => ({ device, name }));
}

// Split a byte stream of back-to-back JPEGs: a frame ends where the next one starts.
function createFrameSplitter(onFrame) {
  let buf = Buffer.alloc(0);
  return function push(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    if (buf.length > BUF_MAX) { buf = Buffer.alloc(0); return; }
    for (;;) {
      if (buf.length < 3 || buf.compare(SOI, 0, 3, 0, 3) !== 0) {
        const at = buf.indexOf(SOI);
        // No start yet: keep the last two bytes, a start marker may be cut across chunks.
        if (at < 0) { buf = buf.subarray(Math.max(0, buf.length - 2)); return; }
        buf = buf.subarray(at);
      }
      const next = buf.indexOf(SOI, 3);
      if (next < 0) return;
      onFrame(buf.subarray(0, next));
      buf = buf.subarray(next);
    }
  };
}

function createCamera(opts) {
  const o = opts || {};
  const file = o.dataDir ? path.join(o.dataDir, 'camera.json') : null;
  const spawn = o.spawn || realSpawn;
  const now = o.now || Date.now;
  const idleMs = o.idleMs != null ? o.idleMs : 10000;
  const retryMs = o.retryMs != null ? o.retryMs : 3000;
  const firstFrameMs = o.firstFrameMs != null ? o.firstFrameMs : 4000;
  const log = o.log || (() => {});
  const fsRoot = o.fsRoot || '/';

  let cfg = {};
  try { if (file) cfg = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { cfg = {}; }

  let proc = null;
  let latest = null;            // { buf, at }
  let frames = 0;
  let lastWanted = 0;
  let lastError = null;
  let lastStartAt = 0;
  let waiters = [];
  let watch = null;

  function resolveDevice() {
    const cams = listCameras(fsRoot);
    if (cfg.device) return cfg.device;
    if (cfg.name) {
      const want = String(cfg.name).toLowerCase();
      const hit = cams.find((c) => c.name && c.name.toLowerCase().includes(want));
      return hit ? hit.device : null;
    }
    return null;
  }

  function ffmpegArgs(device) {
    const a = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'v4l2', '-input_format', 'mjpeg'];
    if (cfg.size) a.push('-video_size', String(cfg.size));
    if (cfg.fps) a.push('-framerate', String(cfg.fps));
    a.push('-i', device, '-c:v', 'copy', '-f', 'image2pipe', '-');
    return a;
  }

  function release() {
    if (watch) { clearInterval(watch); watch = null; }
    const p = proc;
    proc = null;
    if (!p) return;
    try { p.kill('SIGTERM'); } catch (e) { /* gone */ }
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) { /* gone */ } }, 2000);
    if (t.unref) t.unref();
    log('camera released');
  }

  function settle(frame) {
    const w = waiters; waiters = [];
    w.forEach((fn) => fn(frame));
  }

  function start(device) {
    lastStartAt = now();
    lastError = null;
    latest = null;
    let stderr = '';
    let p;
    try { p = spawn(o.ffmpeg || 'ffmpeg', ffmpegArgs(device), { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { lastError = 'cannot start ffmpeg: ' + e.message; return; }
    proc = p;
    log('camera opened ' + device);
    const split = createFrameSplitter((f) => {
      latest = { buf: Buffer.from(f), at: now() };
      frames++;
      settle(latest);
    });
    p.stdout.on('data', split);
    p.stderr.on('data', (c) => { stderr = (stderr + c).slice(-400); });
    p.on('error', (e) => { if (proc === p) { lastError = 'cannot start ffmpeg: ' + e.message; proc = null; settle(null); } });
    p.on('close', () => {
      if (proc !== p) return;
      proc = null;
      if (watch) { clearInterval(watch); watch = null; }
      const busy = /busy/i.test(stderr);
      lastError = busy ? 'the camera is in use by another program' : (stderr.trim().split('\n').pop() || 'the camera stopped');
      settle(null);
    });
    watch = setInterval(() => { if (now() - lastWanted > idleMs) release(); }, Math.min(1000, Math.max(50, idleMs / 4)));
    if (watch.unref) watch.unref();
  }

  // The newest frame, opening the camera first when nobody has it open. Resolves
  // { buf, at } or { error }.
  function frame() {
    lastWanted = now();
    const device = resolveDevice();
    if (!device) return Promise.resolve({ error: 'no camera chosen', code: 'unconfigured' });
    if (!proc) {
      if (lastError && now() - lastStartAt < retryMs) return Promise.resolve({ error: lastError, code: 'unavailable' });
      start(device);
      if (!proc) return Promise.resolve({ error: lastError || 'the camera did not open', code: 'unavailable' });
    }
    if (latest) return Promise.resolve(latest);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        waiters = waiters.filter((w) => w !== done);
        resolve({ error: 'no picture yet', code: 'waiting' });
      }, firstFrameMs);
      function done(f) { clearTimeout(t); resolve(f || { error: lastError || 'the camera did not open', code: 'unavailable' }); }
      waiters.push(done);
    });
  }

  function status() {
    const device = resolveDevice();
    return {
      configured: !!device,
      device,
      config: { device: cfg.device || null, name: cfg.name || null, size: cfg.size || null, fps: cfg.fps || null },
      cameras: listCameras(fsRoot),
      active: !!proc,
      frames,
      frameAgeMs: latest ? now() - latest.at : null,
      error: lastError,
      idleMs,
    };
  }

  // Keys left out stay; null clears one. Only what the page may set is kept.
  function configure(body) {
    const b = body || {};
    const next = { ...cfg };
    for (const k of ['device', 'name', 'size', 'fps']) {
      if (!(k in b)) continue;
      if (b[k] == null || b[k] === '') { delete next[k]; continue; }
      const v = String(b[k]);
      if (k === 'device' && !/^\/dev\/video\d+$/.test(v)) { const e = new Error('device must be /dev/videoN'); e.status = 400; throw e; }
      if (k === 'size' && !/^\d{2,5}x\d{2,5}$/.test(v)) { const e = new Error('size must look like 2880x1440'); e.status = 400; throw e; }
      if (k === 'fps' && !/^\d{1,3}$/.test(v)) { const e = new Error('fps must be a whole number'); e.status = 400; throw e; }
      if (k === 'name' && v.length > 80) { const e = new Error('name too long'); e.status = 400; throw e; }
      next[k] = v;
    }
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    }
    const changed = JSON.stringify(next) !== JSON.stringify(cfg);
    cfg = next;
    if (changed) { release(); latest = null; lastError = null; }
    return status();
  }

  function close() { release(); settle(null); }

  return { frame, status, configure, close, listCameras: () => listCameras(fsRoot) };
}

module.exports = { createCamera, listCameras, createFrameSplitter };
