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
//
// A camera that stops sending (ffmpeg blocked on a stalled device) is NOT shown as live: a frame
// older than `staleMs` (default 2 s, camera.json "staleMs") is answered as code "stalled" with
// its age, and status() says stalled.
//
// WIFI COST, per phone (viewers are capped at `viewerFps` frame requests a second, default 2,
// camera.json "viewerFps", and each answer is one whole JPEG because `-c:v copy` is kept: a
// re-encode would load the CPU that drives the lights). Mbit/s = size x 8 x fps / 1e6:
//   148 KB frame x 2/s = 2.4 Mbit/s;  1 MB x 2/s = 16.8 Mbit/s;  2 MB x 2/s = 33.6 Mbit/s
// (before the cap the page asked every 700 ms, 1.4/s, but nothing stopped a faster client).
// Two phones double it; a 2.4 GHz wifi link that carries 20-30 Mbit/s fits one phone at 2 MB.

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
// Only the NEW bytes are scanned (indexOf from where the last scan stopped, minus the two bytes
// a start marker may be cut across), each chunk is copied once into one growing buffer, and
// only the frame in progress is kept: no re-concat and no re-scan per 64 KB pipe chunk.
function createFrameSplitter(onFrame) {
  let cur = Buffer.allocUnsafe(256 * 1024);
  let len = 0;
  let started = false;
  let scanFrom = 0;
  return function push(chunk) {
    if (!chunk.length) return;
    if (len + chunk.length > cur.length) {
      if (len + chunk.length > BUF_MAX) { len = 0; started = false; scanFrom = 0; return; }   // a runaway pipe is dropped
      const bigger = Buffer.allocUnsafe(Math.min(BUF_MAX, Math.max(cur.length * 2, len + chunk.length)));
      cur.copy(bigger, 0, 0, len);
      cur = bigger;
    }
    chunk.copy(cur, len);
    len += chunk.length;
    for (;;) {
      const at = cur.subarray(0, len).indexOf(SOI, scanFrom);
      if (!started) {
        // No start yet: keep the last two bytes, a start marker may be cut across chunks.
        if (at < 0) { if (len > 2) { cur.copy(cur, 0, len - 2, len); len = 2; } scanFrom = 0; return; }
        cur.copy(cur, 0, at, len); len -= at; started = true; scanFrom = 3;
        continue;
      }
      if (at < 0) { scanFrom = Math.max(3, len - 2); return; }
      onFrame(Buffer.from(cur.subarray(0, at)));
      cur.copy(cur, 0, at, len); len -= at; scanFrom = 3;
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
  const killMs = o.killMs != null ? o.killMs : 2000;           // SIGTERM, then SIGKILL after this
  const sysCacheMs = o.sysCacheMs != null ? o.sysCacheMs : 2000;

  let cfg = {};
  try { if (file) cfg = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { cfg = {}; }
  // Settings read from camera.json (or opts): a frame older than staleMs is "stalled";
  // one viewer may ask for at most viewerFps frames a second.
  const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
  const staleMs = num(o.staleMs != null ? o.staleMs : cfg.staleMs, 2000);
  const viewerFps = num(o.viewerFps != null ? o.viewerFps : cfg.viewerFps, 2);
  const viewers = new Map();    // viewer key -> time of its last accepted request

  let proc = null;
  let latest = null;            // { buf, at }
  let frames = 0;
  let lastWanted = 0;
  let lastError = null;
  let lastStartAt = 0;
  let waiters = [];
  let watch = null;
  let camsCache = null, camsAt = 0;
  const releasing = new Set();  // every ffmpeg being let go: close() waits for all of them, not only the latest
  let restartP = null;          // the old ffmpeg is being let go before the new one starts
  let closed = false;           // after close() frame() never starts ffmpeg again
  let restarts = 0;             // stalled restarts in a row, for the backoff
  let stallSeenAt = 0;          // when this stall was first seen
  let lastRestartAt = 0;
  const BACKOFF_MS = o.backoffMs || [1000, 2000, 5000, 10000];   // then 10 s at most

  // /sys is read at most once per sysCacheMs, not on every frame request.
  function cameras() {
    const t = now();
    if (!camsCache || t - camsAt >= sysCacheMs || t < camsAt) { camsCache = listCameras(fsRoot); camsAt = t; }
    return camsCache;
  }

  function resolveDevice() {
    if (cfg.device) return cfg.device;
    const cams = cameras();
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

  function stopWatch() { if (watch) { clearInterval(watch); watch = null; } }

  // Let the camera go: SIGTERM, then SIGKILL after killMs. Resolves when the process has ended
  // (or, last resort, 1 s after the SIGKILL), so a caller can wait for /dev/videoN to be free.
  function release() {
    stopWatch();
    const p = proc;
    proc = null;
    if (!p) return Promise.resolve();
    log('camera released');
    const pr = new Promise((resolve) => {
      let done = false, kill = null, grace = null;
      const end = () => { if (done) return; done = true; clearTimeout(kill); clearTimeout(grace); resolve(); };
      p.once('close', end); p.once('exit', end);
      try { p.kill('SIGTERM'); } catch (e) { end(); return; }
      kill = setTimeout(() => {
        try { p.kill('SIGKILL'); } catch (e) { /* gone */ }
        grace = setTimeout(end, 1000);
      }, killMs);
    });
    releasing.add(pr);
    pr.then(() => releasing.delete(pr));
    return pr;
  }

  function settle(frame) {
    const w = waiters; waiters = [];
    w.forEach((fn) => fn(frame));
  }

  function start(device) {
    stopWatch();                // never two timers: a start that failed earlier left none, this keeps it so
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
      frames++;
      latest = { buf: f, at: now(), seq: frames };
      settle(latest);
    });
    p.stdout.on('data', split);
    p.stderr.on('data', (c) => { stderr = (stderr + c).slice(-400); });
    p.on('error', (e) => { if (proc === p) { lastError = 'cannot start ffmpeg: ' + e.message; proc = null; stopWatch(); settle(null); } });
    p.on('close', () => {
      if (proc !== p) return;
      proc = null;
      stopWatch();
      const busy = /busy/i.test(stderr);
      lastError = busy ? 'the camera is in use by another program' : (stderr.trim().split('\n').pop() || 'the camera stopped');
      settle(null);
    });
    watch = setInterval(() => { if (now() - lastWanted > idleMs) release(); }, Math.min(1000, Math.max(50, idleMs / 4)));
    if (watch.unref) watch.unref();
  }

  // Let the stuck ffmpeg go and start a new one, no sooner than the backoff allows.
  function restartStalled(device, age) {
    if (closed || restartP) return;
    if (!stallSeenAt) stallSeenAt = now();
    if (now() - stallSeenAt < BACKOFF_MS[Math.min(restarts, BACKOFF_MS.length - 1)]) return;
    stallSeenAt = 0; lastRestartAt = now();
    restarts++;
    log('camera stalled ' + age + ' ms, restarting ffmpeg (try ' + restarts + ')');
    restartP = release().then(() => {
      restartP = null;
      // Only the camera chosen NOW is opened: a configure() during the restart has already moved on.
      if (!closed && !proc && resolveDevice() === device) { lastError = null; start(device); }
    });
  }

  // The newest frame, opening the camera first when nobody has it open. Resolves
  // { buf, at } or { error }.
  function frame(viewer) {
    if (closed) return Promise.resolve({ error: 'the camera is shut', code: 'unavailable' });
    lastWanted = now();
    if (viewer != null && viewerFps > 0) {
      const minGap = 1000 / viewerFps, t = now(), prev = viewers.get(viewer);
      if (prev != null && t >= prev && t - prev < minGap - 1) {
        return Promise.resolve({ error: 'too many requests from this device', code: 'rate', retryMs: Math.ceil(minGap - (t - prev)) });
      }
      if (viewers.size > 200) for (const [k, v] of viewers) if (t - v > 10000) viewers.delete(k);
      viewers.set(viewer, t);
    }
    const device = resolveDevice();
    if (!device) return Promise.resolve({ error: 'no camera chosen', code: 'unconfigured' });
    if (restartP) return Promise.resolve({ error: 'camera restarting', code: 'stalled', ageMs: latest ? now() - latest.at : null });
    if (!proc) {
      if (lastError && now() - lastStartAt < retryMs) return Promise.resolve({ error: lastError, code: 'unavailable' });
      start(device);
      if (!proc) return Promise.resolve({ error: lastError || 'the camera did not open', code: 'unavailable' });
    }
    if (latest) {
      const age = now() - latest.at;
      if (age > staleMs) {
        // A page keeps asking but the pictures stopped (ffmpeg blocked on a stalled device): let that
        // process go and start a new one, no sooner than the backoff (1, 2, 5, then 10 s). With a page
        // polling, the measured gaps are about 4, 12, 14 and 21 s (the first from the last picture to the
        // first restart, the rest between restarts: backoff plus the stall check and the restart itself), so the view returns when the camera does.
        const lastAt = latest.at;
        restartStalled(device, age);
        if (restartP) return Promise.resolve({ error: 'camera stalled', code: 'stalled', ageMs: age, at: lastAt });
        return Promise.resolve({ error: 'camera stalled', code: 'stalled', ageMs: age, at: latest.at });
      }
      stallSeenAt = 0;
      if (now() - lastRestartAt > 10000) restarts = 0;   // the camera has stayed up: the backoff starts over
      return Promise.resolve(latest);
    }
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        waiters = waiters.filter((w) => w !== done);
        if (proc && !latest) restartStalled(device, now() - lastStartAt);   // opened but never sent a picture
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
      cameras: cameras(),
      active: !!proc,
      frames,
      frameAgeMs: latest ? now() - latest.at : null,
      stalled: !!(proc && latest && now() - latest.at > staleMs),
      staleMs,
      viewerFps,
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
    camsCache = null;
    if (changed) { release(); latest = null; lastError = null; }
    return status();
  }

  // Resolves once the camera process has ended, so a shutdown can wait before it exits.
  function close() { closed = true; const done = release(); settle(null); return Promise.all([done, ...releasing]).then(() => {}); }

  return { frame, status, configure, close, listCameras: () => cameras() };
}

module.exports = { createCamera, listCameras, createFrameSplitter };
