'use strict';
// sACN — streaming ACN, ANSI E1.31. The protocol most nodes made this decade prefer,
// and the one worth having beside Art-Net.
//
// Two things make it better than Art-Net for a room full of gear:
//
//   MULTICAST. A universe has a fixed group address — 239.255.<hi>.<lo> — so a node
//   subscribes to the universes it cares about and the switch delivers only those. No
//   unicast list to keep, no broadcast storm, and nothing to configure when a node moves.
//
//   PRIORITY. Every packet carries a number 0..200. Two senders on one universe is no
//   longer "whoever spoke last wins" — the higher priority wins, and a receiver ignores
//   the loser. Art-Net cannot express this at all, which is why two Art-Net senders make
//   a rig flicker between them with nothing in the protocol able to say so.
//
// Nothing here is a dependency: a UDP socket and a 638-byte buffer laid out by the spec.

const dgram = require('dgram');
const crypto = require('crypto');

const PORT = 5568;
// Root, framing and DMP layers, then the start code and 512 slots.
const PACKET = 638;
const ACN_PID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]);
const VECTOR_ROOT = 0x00000004;
const VECTOR_FRAMING = 0x00000002;
const VECTOR_DMP = 0x02;
const DEFAULT_PRIORITY = 100;
// A receiver drops a source it has not heard from for this long. We refresh every frame
// anyway — DMX is continuous — but it is why a desk that stops transmitting releases the
// universe rather than holding it for ever.
const SOURCE_NAME_MAX = 64;

// Where universe N lives. The spec fixes this: no discovery, no configuration, a node
// that wants universe 3 joins 239.255.0.3 and that is the whole of it.
function multicastAddress(universe) {
  const u = universe & 0xffff;
  return `239.255.${(u >> 8) & 0xff}.${u & 0xff}`;
}

// A source's CID identifies THIS desk to every receiver, and must not change while it is
// transmitting — a new CID reads as a second, competing source. Derived from a stable
// name so a restart comes back as the same sender rather than a stranger.
function cidFor(name) {
  const hash = crypto.createHash('sha1').update(`di.iiii lighting desk:${name}`).digest();
  const cid = Buffer.from(hash.subarray(0, 16));
  cid[6] = (cid[6] & 0x0f) | 0x50;   // version 5
  cid[8] = (cid[8] & 0x3f) | 0x80;   // RFC 4122 variant
  return cid;
}

function buildPacket({ cid, sourceName, universe, priority, sequence, data, sync = 0 }) {
  const buf = Buffer.alloc(PACKET);
  // --- root layer
  buf.writeUInt16BE(0x0010, 0);              // preamble size
  buf.writeUInt16BE(0x0000, 2);              // postamble size
  ACN_PID.copy(buf, 4);
  buf.writeUInt16BE(0x7000 | (PACKET - 16), 16);
  buf.writeUInt32BE(VECTOR_ROOT, 18);
  cid.copy(buf, 22);
  // --- framing layer
  buf.writeUInt16BE(0x7000 | (PACKET - 38), 38);
  buf.writeUInt32BE(VECTOR_FRAMING, 40);
  buf.write(sourceName.slice(0, SOURCE_NAME_MAX - 1), 44, SOURCE_NAME_MAX - 1, 'utf8');
  buf.writeUInt8(priority, 108);
  buf.writeUInt16BE(sync, 109);
  buf.writeUInt8(sequence & 0xff, 111);
  buf.writeUInt8(0, 112);                    // options: not preview, not terminated
  buf.writeUInt16BE(universe & 0xffff, 113);
  // --- DMP layer
  buf.writeUInt16BE(0x7000 | (PACKET - 115), 115);
  buf.writeUInt8(VECTOR_DMP, 117);
  buf.writeUInt8(0xa1, 118);                 // address type & data type
  buf.writeUInt16BE(0x0000, 119);            // first property address
  buf.writeUInt16BE(0x0001, 121);            // address increment
  buf.writeUInt16BE(513, 123);               // start code + 512 slots
  buf.writeUInt8(0x00, 125);                 // DMX start code
  if (data && data.length) data.copy(buf, 126, 0, Math.min(data.length, 512));
  return buf;
}

class SACN {
  constructor(opts = {}) {
    this.offline = !!opts.offline;
    this.sourceName = String(opts.sourceName || 'di.iiii lighting desk').slice(0, SOURCE_NAME_MAX - 1);
    this.cid = cidFor(this.sourceName);
    this.priority = Math.max(0, Math.min(200, opts.priority == null ? DEFAULT_PRIORITY : opts.priority | 0));
    // Unicast targets, when a node cannot take multicast. Empty means multicast, which
    // is the point of the protocol and should be the normal case.
    this.targets = Array.isArray(opts.targets) ? opts.targets.slice(0, 32) : [];
    this.packetsSent = 0;
    this.lastError = null;
    this.ready = false;
    // A sequence number per universe: a receiver uses it to drop packets that arrive out
    // of order, and sharing one counter across universes makes every universe look
    // out of order to the node that only listens to one of them.
    this.sequence = new Map();
    this.lastFrame = new Map();
    if (this.offline) return;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('error', (e) => { this.lastError = e.message; });
    this.socket.bind(opts.bindPort == null ? 0 : opts.bindPort, () => {
      try {
        // 1 keeps the traffic on this subnet, which is where the rig is. A higher TTL
        // sends a show through a router at 40 Hz and someone will not thank us.
        this.socket.setMulticastTTL(opts.ttl == null ? 1 : opts.ttl);
        // Loopback ON: a visualiser, a soft node or a second desk running on this very
        // machine is a normal setup, and switching it off makes the desk invisible to
        // everything local — including anyone trying to prove it is transmitting.
        this.socket.setMulticastLoopback(opts.loopback !== false);
      } catch (e) { this.lastError = e.message; }
      this.ready = true;
    });
  }

  send(universe, data) {
    const seq = ((this.sequence.get(universe) || 0) + 1) & 0xff;
    this.sequence.set(universe, seq);
    const packet = buildPacket({
      cid: this.cid, sourceName: this.sourceName, universe,
      priority: this.priority, sequence: seq, data,
    });
    this.lastFrame.set(universe, packet);
    if (this.offline || !this.ready) { if (this.offline) this.packetsSent++; return true; }
    const to = this.targets.length ? this.targets : [multicastAddress(universe)];
    for (const address of to) {
      this.socket.send(packet, 0, packet.length, PORT, address, (err) => {
        if (err) this.lastError = `${address}: ${err.message}`;
        else { this.packetsSent++; this.lastError = null; }
      });
    }
    return true;
  }

  status() {
    return {
      protocol: 'sacn',
      priority: this.priority,
      mode: this.targets.length ? 'unicast' : 'multicast',
      targets: this.targets,
      universes: [...this.sequence.keys()].sort((a, b) => a - b),
      packetsSent: this.packetsSent,
      lastError: this.lastError,
    };
  }

  close() { try { if (this.socket) this.socket.close(); } catch (e) {} this.ready = false; }
}

module.exports = { SACN, buildPacket, multicastAddress, cidFor, PORT, PACKET };
