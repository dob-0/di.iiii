'use strict';
// THE DESK'S FRAME, PUSHED — a Server-Sent Events stream of the live DMX, for a room
// that visualises the rig (src/rigMirror/useLightingMirror.js, RIG_BUILD.md §19).
//
// Why a push and why SSE. A room used to poll GET /api/dmx every 100 ms: 10 Hz, and up
// to 100 ms late before the page had even started drawing — too slow for a strobe or a
// chase (the desk runs at 40–44 Hz). A push at the desk's own frame rate removes the
// poll's wait. Server-Sent Events (WHATWG HTML Living Standard §9.2) rather than a
// WebSocket: the data only goes one way; it is plain HTTP, so it passes the install's
// own TLS and a reverse proxy (Caddy flushes `text/event-stream` as it arrives) with no
// upgrade to allow; the browser reconnects by itself (`retry:`); and it needs no
// dependency — the desk has none.
//
// What goes out, per client:
//   event `frame`  {s, t, k, d, m?}
//     s  sequence number (per client, from 1)
//     t  the desk's clock when the frame was rendered (ms since the epoch)
//     k  1 on a KEY frame (every listened universe, whole), else 0
//     d  [[universe, start, [values…]], …] — universe as the desk counts (0 = U1),
//        start 0-based; a key frame sends 512 slots, a delta sends only the RUNS of
//        slots that changed since this client's last frame (runs closer than GAP
//        slots are joined — one run is cheaper than two headers)
//     m  meta, only when it changed: {master, blackout, looks, cues} — the same
//        fields GET /api/dmx carries, so a room following the look needs no poll
//   A frame with nothing changed is not sent at all; a comment line every
//   KEEPALIVE_MS keeps proxies and the browser from calling the stream dead.
//
// Delta compression is per client (each keeps its own last frame), so a client that
// joins late starts from a key frame and never depends on what another client saw.
// A client that falls behind (its socket buffer over SLOW_BYTES) is sent a key frame
// once it drains, rather than a queue of stale deltas.

const GAP = 6;               // join runs separated by fewer unchanged slots than this
const KEEPALIVE_MS = 15000;  // an SSE comment, so an idle stream is never cut
const SLOW_BYTES = 256 * 1024;
const MAX_CLIENTS = 32;      // a runaway page cannot open streams until the desk stalls
const RETRY_MS = 1000;       // what the browser waits before reconnecting by itself

// The runs of slots that differ between `prev` (or nothing) and `next`. Pure.
function deltaRuns(prev, next, gap = GAP) {
  const runs = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < next.length; i++) {
    if (prev && prev[i] === next[i]) continue;
    if (start >= 0 && i - last <= gap) { last = i; continue; }
    if (start >= 0) runs.push([start, last]);
    start = i; last = i;
  }
  if (start >= 0) runs.push([start, last]);
  return runs.map(([a, b]) => [a, Array.from(next.subarray ? next.subarray(a, b + 1) : next.slice(a, b + 1))]);
}

// Which universes a client asked for: `u=0,1,5` (desk numbering), or all.
function parseUniverses(query) {
  const raw = query && query.get ? query.get('u') : null;
  if (!raw) return null;
  const set = new Set();
  for (const part of String(raw).split(',')) {
    const n = Number(part);
    if (Number.isInteger(n) && n >= 0 && n <= 32767) set.add(n);
    if (set.size >= 64) break;
  }
  return set.size ? set : null;
}

function createDmxStream({ now = () => Date.now(), log = () => {} } = {}) {
  const clients = new Set();
  let keepalive = null;

  const write = (c, text) => {
    try { c.res.write(text); } catch { drop(c); }
  };
  const drop = (c) => {
    if (!clients.delete(c)) return;
    try { c.res.end(); } catch { /* gone */ }
    if (!clients.size && keepalive) { clearInterval(keepalive); keepalive = null; }
  };

  // A new client: headers, the retry hint, and a key frame on the next tick.
  function subscribe(req, res, query) {
    if (clients.size >= MAX_CLIENTS) {
      res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5' });
      res.end(JSON.stringify({ error: `the desk is already streaming to ${MAX_CLIENTS} pages` }));
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // nginx (a hosted tier's front) buffers responses unless told; harmless elsewhere.
      'x-accel-buffering': 'no',
    });
    if (res.flushHeaders) res.flushHeaders();
    if (req.socket && req.socket.setNoDelay) req.socket.setNoDelay(true);
    const c = { res, universes: parseUniverses(query), last: new Map(), meta: '', seq: 0, key: true };
    clients.add(c);
    write(c, `retry: ${RETRY_MS}\n: di.iiii desk stream\n\n`);
    const gone = () => drop(c);
    req.on('close', gone);
    res.on('error', gone);
    if (!keepalive) keepalive = setInterval(() => { for (const x of [...clients]) write(x, ': ka\n\n'); }, KEEPALIVE_MS);
    if (keepalive.unref) keepalive.unref();
  }

  // One rendered frame from the desk's loop: Map(universe → Buffer(512)). `meta` is a
  // function, called only when somebody is listening.
  function frame(frames, metaOf) {
    if (!clients.size) return;
    const t = now();
    let metaText = null;
    for (const c of [...clients]) {
      if (c.res.writableLength > SLOW_BYTES) { c.key = true; continue; }
      const d = [];
      const key = c.key;
      for (const [u, buf] of frames) {
        if (c.universes && !c.universes.has(u)) continue;
        const prev = key ? null : c.last.get(u);
        const runs = key ? [[0, Array.from(buf)]] : deltaRuns(prev || null, buf);
        for (const [start, values] of runs) d.push([u, start, values]);
        if (runs.length || key) c.last.set(u, Buffer.from(buf));
      }
      if (metaText === null) metaText = JSON.stringify(metaOf ? metaOf() : null);
      const metaChanged = metaText !== c.meta;
      if (!d.length && !metaChanged && !key) continue;
      c.seq += 1;
      const body = { s: c.seq, t, k: key ? 1 : 0, d };
      if (metaChanged) { body.m = JSON.parse(metaText); c.meta = metaText; }
      c.key = false;
      write(c, `event: frame\ndata: ${JSON.stringify(body)}\n\n`);
    }
  }

  function close() {
    for (const c of [...clients]) drop(c);
    if (keepalive) { clearInterval(keepalive); keepalive = null; }
  }

  return { subscribe, frame, close, get size() { return clients.size; } };
}

module.exports = { createDmxStream, deltaRuns, parseUniverses, GAP, KEEPALIVE_MS };
