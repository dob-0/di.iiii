'use strict';
// Where the page gets the live DMX from: the desk's pushed stream when it offers one, the
// 10 Hz poll of api/dmx when it does not (or when the stream cannot be trusted).
//
// The stream is `GET api/dmx/stream` (dmxstream.js on the full desk): Server-Sent Events, event
// `frame`, data {s, t, k, d, m?}; d is [[universe, start, [values…]], …] — a key frame (k=1)
// carries whole universes, a delta only the runs that changed. A frame with nothing changed is
// not sent at all, so a quiet desk is silent: silence alone does not mean the stream is dead.
//
// The rule (held by serverXR/src/lighting/tests/test-dmxfeed.js):
//   stream on  -> frames paint, no poll.
//   2 s without a frame -> the poll resumes at once, and its first answer settles what the
//     silence was: the same frame we already hold and the stream still open = the desk is
//     idle, the stream is trusted again and the poll stops; anything else = the stream is
//     stalled, it is closed and retried with back-off (1 s, 2 s, 4 s … 30 s) while the poll
//     carries on.
//   a frame arrives while polling -> the poll stops.
//   an error on the stream -> the poll resumes, the stream is retried with back-off.
//
// Plain script, no DOM here: app.js hands in the EventSource, the timers and the poll, and
// paints what `dmx` holds when `onUpdate` fires.

(function (root) {
  const SILENT_MS = 2000;
  const POLL_MS = 100;
  const PAINT_MS = 100;        // frames are painted at most this often: the page paints what the poll made it paint
  const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

  // d entries into `dmx` (universe -> array of numbers). Returns true when a value changed.
  function applyFrame(dmx, frame) {
    let changed = false;
    for (const run of (frame && frame.d) || []) {
      const u = run[0], start = run[1], vals = run[2];
      if (!Array.isArray(vals)) continue;
      let buf = dmx[u];
      if (!Array.isArray(buf)) { buf = dmx[u] = new Array(512).fill(0); changed = true; }
      for (let i = 0; i < vals.length; i++) {
        if (buf[start + i] !== vals[i]) { buf[start + i] = vals[i]; changed = true; }
      }
    }
    return changed;
  }

  function same(a, b) {
    const ka = Object.keys(a || {}), kb = Object.keys(b || {});
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      const x = a[k], y = b[k];
      if (!Array.isArray(y) || x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    }
    return true;
  }

  // deps: open(url) -> EventSource-like {onmessage-less: addEventListener, close, readyState};
  //       poll() -> Promise<dmx object | null>; onUpdate(dmx); timers (setTimeout etc.) and now().
  function createFeed(deps) {
    const d = Object.assign({
      url: 'api/dmx/stream', silentMs: SILENT_MS, pollMs: POLL_MS, paintMs: PAINT_MS,
      setTimeout: root.setTimeout && root.setTimeout.bind(root),
      clearTimeout: root.clearTimeout && root.clearTimeout.bind(root),
      setInterval: root.setInterval && root.setInterval.bind(root),
      clearInterval: root.clearInterval && root.clearInterval.bind(root),
      now: () => Date.now(),
    }, deps);

    const f = {
      dmx: {},
      mode: 'poll',            // 'stream' | 'poll'
      allowed: false,
      paused: false,
      es: null,
      fails: 0,
      frames: 0, polls: 0,
    };
    let pollTimer = null, watchdog = null, retryTimer = null, paintTimer = null, lastPaint = 0, polling = false;

    const paint = () => {
      const wait = d.paintMs - (d.now() - lastPaint);
      if (wait <= 0) { lastPaint = d.now(); d.onUpdate(f.dmx); return; }
      if (!paintTimer) paintTimer = d.setTimeout(() => { paintTimer = null; lastPaint = d.now(); d.onUpdate(f.dmx); }, wait);
    };

    function startPoll() {
      if (pollTimer || f.paused) return;
      pollTimer = d.setInterval(pollOnce, d.pollMs);
      pollOnce();
    }
    function stopPoll() { if (pollTimer) { d.clearInterval(pollTimer); pollTimer = null; } }

    async function pollOnce() {
      if (polling) return;                      // a slow answer never stacks requests
      polling = true;
      let got = null;
      try { got = await d.poll(); } catch (e) { got = null; } finally { polling = false; }
      if (f.mode !== 'poll' || !got) return;    // a frame arrived while the answer was on its way
      f.polls++;
      const idle = !!f.es && f.es.readyState === 1 && same(got, f.dmx) && f.silenceCheck;
      if (idle) {                               // the desk is quiet, the stream is fine
        f.silenceCheck = false;
        f.mode = 'stream';
        stopPoll();
        arm();
        return;
      }
      if (f.silenceCheck) { f.silenceCheck = false; closeStream(); scheduleRetry(); }   // changed behind the stream's back: it is stalled
      f.dmx = got;
      paint();
    }

    function arm() {
      if (watchdog) d.clearTimeout(watchdog);
      watchdog = d.setTimeout(onSilent, d.silentMs);
    }
    function disarm() { if (watchdog) { d.clearTimeout(watchdog); watchdog = null; } }

    function onSilent() {
      watchdog = null;
      if (f.mode !== 'stream') return;
      f.mode = 'poll';
      f.silenceCheck = true;
      startPoll();
    }

    function onFrame(ev) {
      let frame;
      try { frame = JSON.parse(ev.data); } catch (e) { return; }
      f.frames++;
      f.gotFrame = true;
      f.fails = 0;
      if (f.mode === 'poll') { f.mode = 'stream'; f.silenceCheck = false; stopPoll(); }
      arm();
      if (applyFrame(f.dmx, frame) || frame.k) paint();
    }

    function closeStream() {
      if (f.es) { try { f.es.close(); } catch (e) { /* gone */ } f.es = null; }
      disarm();
    }

    function scheduleRetry() {
      if (retryTimer || !f.allowed || f.paused) return;
      const wait = BACKOFF[Math.min(f.fails, BACKOFF.length - 1)];
      f.fails++;
      retryTimer = d.setTimeout(() => { retryTimer = null; openStream(); }, wait);
    }

    function openStream() {
      if (f.es || !f.allowed || f.paused) return;
      let es;
      try { es = d.open(d.url); } catch (e) { f.mode = 'poll'; startPoll(); scheduleRetry(); return; }
      f.es = es;
      es.addEventListener('frame', onFrame);
      es.addEventListener('error', () => {
        // The browser would reconnect by itself; we close instead so the back-off is ours.
        if (f.es !== es) return;
        closeStream();
        f.mode = 'poll';
        f.silenceCheck = false;
        startPoll();
        scheduleRetry();
      });
      // Until the first frame arrives the poll carries on; the first frame (the desk sends a
      // key frame on subscribe) stops it. A stream that never says anything is closed and retried.
      f.mode = 'poll';
      f.silenceCheck = false;
      f.gotFrame = false;
      startPoll();
      disarm();
      watchdog = d.setTimeout(() => {
        watchdog = null;
        if (f.es === es && !f.gotFrame) { closeStream(); scheduleRetry(); }
      }, d.silentMs);
    }

    f.setAllowed = (on) => {
      on = !!on;
      if (on === f.allowed) return;
      f.allowed = on;
      if (on) openStream();
      else { closeStream(); if (retryTimer) { d.clearTimeout(retryTimer); retryTimer = null; } f.mode = 'poll'; startPoll(); }
    };
    f.start = () => { f.paused = false; startPoll(); if (f.allowed) openStream(); };
    f.pause = () => {
      f.paused = true;
      closeStream(); stopPoll();
      if (retryTimer) { d.clearTimeout(retryTimer); retryTimer = null; }
      f.mode = 'poll';
    };
    f.resume = () => { if (!f.paused) return; f.fails = 0; f.start(); };
    return f;
  }

  const api = { SILENT_MS, POLL_MS, PAINT_MS, BACKOFF, applyFrame, same, createFeed };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.dmxFeed = api;
})(typeof window !== 'undefined' ? window : this);
