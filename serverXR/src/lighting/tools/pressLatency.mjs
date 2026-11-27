#!/usr/bin/env node
// Press latency bench for the light desk (measure the server half of "a pad press feels instant").
//
//   node serverXR/src/lighting/tools/pressLatency.mjs <desk base url> [--n 20] [--gap 1500] [--burst 4] [--out file.json]
//   e.g. http://127.0.0.1:4327/light/space/reika/        (a di-dev scratch desk with output OFF; never the live desk)
//
// Each press fires a look through POST api/looks/fire, alternating between looks, and times:
//   post     send -> reply (the client's wire + the server's time for the route)
//   frame    send -> the first pushed DMX frame (SSE api/dmx/stream) whose meta names the new look on the cue layer:
//            the moment the rig output carries the new look
//   probe    the worst GET api/clock-class answer inside 1.5 s after the press: the event loop held by the fire and its save
//   state    GET api/state?looksRev=... right after the reply, as the page's refresh does
// Then a burst of --burst presses 30 ms apart: the time of the LAST press' frame (the pad queue's job is done there).
// Output: one line per link with median and p95 over --n runs, and JSON when --out is given.
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkSimTarget } from './simGuard.mjs';

const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/?$/, '/');
if (!/^http/.test(base)) { console.error('usage: pressLatency.mjs <desk base url> [--n 20] [--gap 1500] [--burst 4] [--out f.json]'); process.exit(2); }
{ let ls = ''; try { ls = execFileSync('di-dev', ['ls'], { encoding: 'utf8' }); } catch { /* the guard then refuses */ }
  const why = checkSimTarget(base, ls); if (why) { console.error(why); process.exit(2); } }   // a scratch tree only (R3 L4)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const N = Number(opt('n', 20));
const GAP = Number(opt('gap', 1500));
const BURST = Number(opt('burst', 4));
const out = opt('out', null);
const agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const u = new URL(base);

const now = () => performance.now();
function call(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + p, method, agent,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN; };
const stat = (a) => ({ n: a.length, median: +pct(a, 0.5).toFixed(1), p95: +pct(a, 0.95).toFixed(1), max: +Math.max(...a).toFixed(1) });

// The stream: remember each frame's arrival time and the look the cue layer carried in it.
const frames = [];   // { at, look }
let curLook = null;
const sse = http.request({ host: u.hostname, port: u.port, path: u.pathname + 'api/dmx/stream', agent: new http.Agent({ keepAlive: false }) }, (res) => {
  let buf = '';
  res.setEncoding('utf8');
  res.on('data', (c) => {
    const at = now();
    buf += c;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const m = /^data: (.*)$/m.exec(block);
      if (!m) continue;
      let f; try { f = JSON.parse(m[1]); } catch { continue; }
      if (f.m && f.m.looks) { const l = f.m.looks.find((x) => x.layer === 'cue'); curLook = l ? l.lookId : null; }
      frames.push({ at, look: curLook });
    }
  });
});
sse.end();

// The probe: a tiny GET every 10 ms; its answer time is the event loop's availability.
const probes = [];
let probing = true;
(async () => {
  while (probing) { const t = now(); try { await call('GET', 'api/cues'); } catch { /* keep going */ } probes.push({ at: t, ms: now() - t }); await sleep(10); }
})();

function waitFrame(look, after, ms = 3000) {
  return new Promise((resolve) => {
    const t0 = now();
    const tick = () => {
      const f = frames.find((x) => x.at >= after && x.look === look);
      if (f) return resolve(f.at);
      if (now() - t0 > ms) return resolve(NaN);
      setTimeout(tick, 1);
    };
    tick();
  });
}

const fire = await call('GET', 'api/fireable');
const looks = JSON.parse(fire.text).looks.map((l) => l.id).slice(0, 8);
if (looks.length < 3) { console.error('need 3 looks on the desk'); process.exit(1); }
await sleep(500);   // the stream's key frame

const post = [], frame = [], probe = [], stateMs = [], burstLast = [];
let rev = null;
for (let i = 0; i < N + 2; i++) {
  const id = looks[i % looks.length];
  const t0 = now();
  const r = await call('POST', 'api/looks/fire', { id });
  const tPost = now();
  const tFrame = await waitFrame(id, t0 - 1);
  const s = await call('GET', 'api/state' + (rev ? '?looksRev=' + rev : ''));
  const tState = now();
  if (!rev) { try { rev = JSON.parse(s.text).looksRev; } catch { /* stays null */ } }
  await sleep(GAP);
  if (i < 2) continue;   // two warm-up presses
  if (r.status !== 200) { console.error('fire answered', r.status, r.text.slice(0, 100)); continue; }
  post.push(tPost - t0); frame.push(tFrame - t0); stateMs.push(tState - tPost);
  probe.push(Math.max(0, ...probes.filter((p) => p.at >= t0 && p.at < t0 + GAP).map((p) => p.ms)));
}
for (let i = 0; i < Math.max(5, Math.ceil(N / 4)); i++) {
  const ids = Array.from({ length: BURST }, (_, k) => looks[(i + k + 1) % looks.length]);
  const t0 = now();
  const rs = [];
  for (const id of ids) { rs.push(call('POST', 'api/looks/fire', { id })); await sleep(30); }
  await Promise.all(rs);
  const last = ids[ids.length - 1];
  const tf = await waitFrame(last, t0);
  burstLast.push(tf - t0);
  await sleep(GAP);
}
probing = false;
sse.destroy();
const idle = probes.filter((p) => p.ms < 5).length;
const result = {
  base, n: post.length,
  'POST looks/fire (send to reply)': stat(post),
  'send to first DMX frame with the new look': stat(frame),
  'worst probe answer in 1.5 s after a press (event loop hold)': stat(probe),
  'GET api/state?looksRev right after': stat(stateMs),
  [`burst of ${BURST} presses 30 ms apart: send of first to frame of last`]: stat(burstLast),
  probeSamples: probes.length, probeUnder5ms: idle,
};
console.log(JSON.stringify(result, null, 1));
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
agent.destroy();
