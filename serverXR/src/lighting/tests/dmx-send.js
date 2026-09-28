'use strict';
// A small console stand-in: sends Art-Net (ArtDmx) or sACN (E1.31) at a desk, so DMX
// input can be proven on a machine with no console. The packets come from the same
// builders the spec tests check (dmxin.js), so what this sends is what they verify.
//
//   node dmx-send.js --proto sacn --host 127.0.0.1 --universes 1,2,3 --hz 44 --seconds 10 --set 1=255,2=128
//   node dmx-send.js --proto sacn --multicast --iface 192.168.88.231 --universes 1 --set 1=255
//   node dmx-send.js --proto artnet --host 192.168.88.231 --universes 1 --set 1=255
//   node dmx-send.js --proto sacn --host 127.0.0.1 --universes 1 --terminate
//
// Universes are the DESK's numbers (Universe 1 = Art-Net 0:0:0 = sACN 1). `--seconds 0`
// sends one packet a universe and stops. `--terminate` sends E1.31's three
// stream-terminated packets (§6.2.6). Exit code 0 when every packet was handed to the OS.

const dgram = require('dgram');
const crypto = require('crypto');
const { buildArtDmx, buildE131, sacnMulticast, artNetFromDesk, sacnFromDesk, OPT_TERMINATED } = require('../dmxin');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function makeSender({ proto = 'sacn', host = '127.0.0.1', port, multicast = false, iface = null, name = 'dmx-send', priority = 100, bindAddress = null } = {}) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const cid = crypto.createHash('sha1').update('dmx-send:' + name).digest().subarray(0, 16);
  // A random first sequence number, as a real source restarting would have: two one-shot
  // runs both starting at 1 would otherwise read as a duplicate (E1.31 §6.7.2) and the
  // second would rightly be dropped.
  const seq = new Map();
  const seq0 = 1 + crypto.randomInt(250);
  let sent = 0;
  let errors = 0;
  const ready = new Promise((resolve) => socket.bind(0, bindAddress || undefined, () => {
    try { socket.setBroadcast(true); } catch (e) { /* not needed for unicast */ }
    if (multicast) {
      socket.setMulticastTTL(1);
      socket.setMulticastLoopback(true);
      if (iface) socket.setMulticastInterface(iface);
    }
    resolve();
  }));
  const to = (u) => (proto === 'sacn' && multicast ? sacnMulticast(sacnFromDesk(u)) : host);
  const dstPort = port || (proto === 'sacn' ? 5568 : 6454);
  function send(deskUniverse, data, { options = 0 } = {}) {
    const s = ((seq.has(deskUniverse) ? seq.get(deskUniverse) : seq0) % 255) + 1;   // 1..255 (Art-Net 0 = off)
    seq.set(deskUniverse, s);
    const pkt = proto === 'sacn'
      ? buildE131({ cid, sourceName: name, universe: sacnFromDesk(deskUniverse), priority, sequence: s, data, options })
      : buildArtDmx(artNetFromDesk(deskUniverse), s, data);
    return new Promise((resolve) => socket.send(pkt, dstPort, to(deskUniverse), (err) => {
      if (err) errors++; else sent++;
      resolve(!err);
    }));
  }
  return { ready, send, close: () => socket.close(), stats: () => ({ sent, errors }), cid };
}

async function main() {
  const a = args(process.argv.slice(2));
  const proto = a.proto === 'artnet' ? 'artnet' : 'sacn';
  const universes = String(a.universes || '1').split(',').map((n) => Number(n) - 1).filter((n) => n >= 0);
  const hz = Math.max(1, Math.min(200, Number(a.hz || 44)));
  const seconds = Number(a.seconds == null ? 0 : a.seconds);
  const frame = Buffer.alloc(512);
  for (const pair of String(a.set || '').split(',').filter(Boolean)) {
    const [ch, v] = pair.split('=').map(Number);
    if (ch >= 1 && ch <= 512) frame[ch - 1] = Math.max(0, Math.min(255, v | 0));
  }
  const tx = makeSender({ proto, host: a.host || '127.0.0.1', multicast: !!a.multicast, iface: a.iface || null, name: a.name || 'dmx-send', priority: Number(a.priority || 100) });
  await tx.ready;
  if (a.terminate) {
    for (let i = 0; i < 3; i++) for (const u of universes) await tx.send(u, frame, { options: OPT_TERMINATED });
  } else if (!seconds) {
    for (const u of universes) await tx.send(u, frame);
  } else {
    const period = 1000 / hz;
    const t0 = process.hrtime.bigint();
    let n = 0;
    while (true) {
      const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
      if (elapsed >= seconds * 1000) break;
      for (const u of universes) tx.send(u, frame);
      n++;
      const due = n * period - (Number(process.hrtime.bigint() - t0) / 1e6);
      if (due > 0) await new Promise((r) => setTimeout(r, due));
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  const st = tx.stats();
  console.log(JSON.stringify({ proto, universes: universes.map((u) => u + 1), ...st }));
  tx.close();
  process.exit(st.errors ? 1 : 0);
}

if (require.main === module) main();
module.exports = { makeSender };
