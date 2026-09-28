'use strict';
// DMX INPUT BENCH — latency and sustained rate, measured against a running desk.
//
//   node bench-input.js --base http://127.0.0.1:4371/light --host 192.168.88.231 [--seconds 60] [--trials 200]
//
// The desk must have input ON, listening on the interface of --host, universes 1-3.
//
// 1. LATENCY (packet in -> desk state). For each trial a new value is written to one
//    slot, the packet is sent, and GET api/dmx is asked in a tight loop until the value is
//    there. That time includes one or more HTTP round trips, so the HTTP round trip on its
//    own (GET api/dmx with nothing changing) is measured the same way and reported beside
//    it: the difference is what input adds. Both protocols.
// 2. SUSTAINED. 44 Hz x 3 universes (sACN multicast, then Art-Net unicast) for --seconds.
//    Slot 1 carries a frame counter (mod 256). Reported: packets sent vs the desk's
//    accepted count, dropped/out-of-sequence, the desk's own fps per source, how many
//    frames behind the sender the desk's state is when sampled (x 22.7 ms), and the desk
//    process's CPU over the window (from /proc/<pid>/stat, --pid).

const fs = require('fs');
const { makeSender } = require('./dmx-send');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1]; i++; }
  return out;
}
const a = args(process.argv.slice(2));
const BASE = a.base || 'http://127.0.0.1:4371/light';
const HOST = a.host || '127.0.0.1';
const SECONDS = Number(a.seconds || 60);
const TRIALS = Number(a.trials || 200);
const PID = a.pid ? Number(a.pid) : null;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = (xs) => ({ n: xs.length, p50: +q(xs, 0.5).toFixed(2), p95: +q(xs, 0.95).toFixed(2), max: +Math.max(...xs).toFixed(2), mean: +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) });
const getJson = async (p) => (await fetch(BASE + p)).json();
const cpuTicks = (pid) => { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return Number(f[11]) + Number(f[12]); };

async function latency(proto) {
  const tx = makeSender({ proto, host: HOST, multicast: false, name: 'bench-latency-' + proto });
  await tx.ready;
  const frame = Buffer.alloc(512);
  const got = [];
  for (let i = 0; i < TRIALS; i++) {
    const v = (i % 250) + 1;
    frame[9] = v;
    const t0 = now();
    await tx.send(0, frame);
    let ok = false;
    while (now() - t0 < 1000) {
      const d = await getJson('/api/dmx');
      if (d.dmx['0'] && d.dmx['0'][9] === v) { ok = true; break; }
    }
    if (!ok) throw new Error(`${proto}: value ${v} never reached the desk`);
    got.push(now() - t0);
  }
  tx.close();
  return summary(got);
}

// The same path without HTTP: a DmxInput of its own on private ports, the packet sent
// over loopback UDP, the merger asked on every turn of the event loop until the value
// is there. This is the receive path's own cost: socket -> parse -> merge -> frame().
async function inProcess(proto) {
  const { DmxInput } = require('../dmxin-net');
  const AP = 36454, SP = 35568;
  const inp = new DmxInput({ artnetPort: AP, sacnPort: SP });
  await inp.configure({ enabled: true, interfaces: ['127.0.0.1'], universes: [{ universe: 0 }] });
  const tx = makeSender({ proto, host: '127.0.0.1', port: proto === 'sacn' ? SP : AP, name: 'inproc-' + proto });
  await tx.ready;
  const frame = Buffer.alloc(512);
  const xs = [];
  for (let i = 0; i < TRIALS; i++) {
    const v = (i % 250) + 1;
    frame[9] = v;
    const t0 = now();
    tx.send(0, frame);
    while (true) {
      const f = inp.merger.frame(0, Date.now());
      if (f && f.data[9] === v) break;
      if (now() - t0 > 1000) throw new Error('in-process: value never arrived');
      await new Promise((r) => setImmediate(r));
    }
    xs.push(now() - t0);
  }
  tx.close(); inp.close();
  return summary(xs);
}

async function httpBaseline() {
  const xs = [];
  for (let i = 0; i < TRIALS; i++) { const t0 = now(); await getJson('/api/dmx'); xs.push(now() - t0); }
  return summary(xs);
}

async function sustained(proto, multicast) {
  const before = await getJson('/api/input');
  const tx = makeSender({ proto, host: HOST, multicast, iface: multicast ? HOST : null, name: 'bench-' + proto });
  await tx.ready;
  const frames = [Buffer.alloc(512), Buffer.alloc(512), Buffer.alloc(512)];
  let counter = 0;
  const lag = [];
  const cpu0 = PID ? cpuTicks(PID) : null;
  const t0 = now();
  let n = 0;
  let stop = false;
  // A sampler reading the desk twice a second while the sender runs.
  const sampler = (async () => {
    await sleep(1000);
    while (!stop) {
      const sent = counter;
      const d = await getJson('/api/dmx');
      const seen = d.dmx['0'] ? d.dmx['0'][0] : null;
      // Signed: the sender may move on while the GET is in flight, so the desk can be
      // one frame AHEAD of the counter read before it (-1), which is not lag.
      if (seen != null) { let dl = ((sent - seen) + 256) % 256; if (dl > 128) dl -= 256; lag.push(dl); }
      await sleep(500);
    }
  })();
  let fpsSample = null;
  while (now() - t0 < SECONDS * 1000) {
    counter = (counter + 1) % 256;
    for (let u = 0; u < 3; u++) { frames[u][0] = counter; frames[u][1] = u + 1; tx.send(u, frames[u]); }
    n++;
    if (!fpsSample && now() - t0 > SECONDS * 500) {
      getJson('/api/input').then((st) => { fpsSample = st.lines.map((l) => Math.max(0, ...l.sources.filter((x) => x.protocol === proto && !x.lost).map((x) => x.fps))); });
      fpsSample = 'pending';
    }
    const due = n * (1000 / 44) - (now() - t0);
    if (due > 0) await sleep(due);
  }
  const wall = (now() - t0) / 1000;
  stop = true;
  await sampler;
  await sleep(200);
  const cpu1 = PID ? cpuTicks(PID) : null;
  const after = await getJson('/api/input');
  tx.close();
  const st = tx.stats();
  const d = (k) => after.stats[k] - before.stats[k];
  return {
    proto: proto + (multicast ? ' multicast' : ' unicast'),
    seconds: +wall.toFixed(2),
    sent: st.sent, sendErrors: st.errors,
    sentRate: +(st.sent / wall).toFixed(1),
    accepted: d('accepted'), outOfSequence: d('outOfSequence'), refused: d('refused'),
    lost: st.sent - d('accepted') - d('outOfSequence'),
    deskFpsPerUniverseAtMidpoint: fpsSample,
    framesBehind: lag.length ? summary(lag) : null,
    cpuPercentOfOneCore: PID ? +(((cpu1 - cpu0) / 100) / wall * 100).toFixed(1) : null,
  };
}

(async () => {
  const out = { base: BASE, host: HOST, when: new Date().toISOString() };
  out.inProcessSacn = await inProcess('sacn');
  out.inProcessArtNet = await inProcess('artnet');
  out.httpRoundTrip = await httpBaseline();
  // Between phases each source is let go of first (sACN 2.5 s, Art-Net 10 s): two live
  // sources on one universe are HTP-merged, which is right, and would hide the value.
  out.latencySacn = await latency('sacn');
  await sleep(3000);
  out.latencyArtNet = await latency('artnet');
  await sleep(10500);
  out.sustainedSacn = await sustained('sacn', true);
  await sleep(3000);
  out.sustainedArtNet = await sustained('artnet', false);
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
