'use strict';
// Minimal Art-Net 4 implementation: DMX output + node discovery.
// Spec refs: ArtDmx op 0x5000, ArtPoll 0x2000, ArtPollReply 0x2100.

const dgram = require('dgram');
const os = require('os');

const ID = Buffer.from('Art-Net\0', 'latin1');
const OP_DMX = 0x5000;
const OP_POLL = 0x2000;
const OP_POLL_REPLY = 0x2100;
const PROTO_HI = 0;
const PROTO_LO = 14;
// Offsets of the retry burst behind each poll, in ms.
const POLL_BURST_MS = [0, 180, 520];

function buildDmx(portAddress, sequence, data) {
  const len = data.length;                     // must be even, 2..512
  const buf = Buffer.alloc(18 + len);
  ID.copy(buf, 0);
  buf.writeUInt16LE(OP_DMX, 8);
  buf[10] = PROTO_HI;
  buf[11] = PROTO_LO;
  buf[12] = sequence & 0xff;                   // 0 = disable sequencing
  buf[13] = 0;                                 // physical input port (informative)
  buf[14] = portAddress & 0xff;                // Sub-Net + Universe
  buf[15] = (portAddress >> 8) & 0x7f;         // Net
  buf[16] = (len >> 8) & 0xff;                 // length hi
  buf[17] = len & 0xff;                        // length lo
  data.copy(buf, 18);
  return buf;
}

function buildPoll() {
  const buf = Buffer.alloc(14);
  ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL, 8);
  buf[10] = PROTO_HI;
  buf[11] = PROTO_LO;
  buf[12] = 0x00;                              // TalkToMe: reply on poll only
  buf[13] = 0x00;                              // DiagPriority
  return buf;
}

function cstr(buf, start, len) {
  const end = buf.indexOf(0, start);
  const stop = end === -1 || end > start + len ? start + len : end;
  return buf.toString('latin1', start, Math.min(stop, buf.length)).trim();
}

function parsePollReply(msg, rinfo) {
  if (msg.length < 26 || msg.compare(ID, 0, 8, 0, 8) !== 0) return null;
  if (msg.readUInt16LE(8) !== OP_POLL_REPLY) return null;
  const ip = `${msg[10]}.${msg[11]}.${msg[12]}.${msg[13]}`;
  const net = msg.length > 18 ? msg[18] : 0;
  const sub = msg.length > 19 ? msg[19] : 0;
  const numPorts = msg.length > 173 ? msg.readUInt16BE(172) : 0;
  const universes = [];
  for (let i = 0; i < Math.min(numPorts, 4); i++) {
    const swOut = msg.length > 190 + i ? msg[190 + i] : 0;
    universes.push(((net & 0x7f) << 8) | ((sub & 0x0f) << 4) | (swOut & 0x0f));
  }
  return {
    ip: ip === '0.0.0.0' ? rinfo.address : ip,
    from: rinfo.address,
    shortName: cstr(msg, 26, 18),
    longName: cstr(msg, 44, 64),
    net, sub, universes,
    seen: Date.now(),
  };
}

// All IPv4 broadcast addresses on this machine, plus the Art-Net limited broadcast.
function broadcastAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = (a.netmask || '255.255.255.0').split('.').map(Number);
      const bc = ip.map((o, i) => (o & mask[i]) | (~mask[i] & 0xff)).join('.');
      if (!out.includes(bc)) out.push(bc);
    }
  }
  if (!out.includes('255.255.255.255')) out.push('255.255.255.255');
  return out;
}

function localAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, address: a.address, netmask: a.netmask });
    }
  }
  return out;
}

class ArtNet {
  constructor({ port = 6454, bind = '0.0.0.0', bindPort = null, offline = false } = {}) {
    // Offline builds the packets but never puts them on the wire, so a test run cannot
    // flicker a real rig that is listening on the same broadcast address.
    this.offline = offline;
    this.port = port;                                    // where packets are sent
    this.bindPort = bindPort == null ? port : bindPort;  // local port (0 = ephemeral)
    this.bind = bind;
    this.nodes = new Map();
    this.sequence = 0;
    this.packetsSent = 0;
    this.lastError = null;
    this.ready = false;
    // Offline never touches the network at all — not even a bind. With reuseAddr a test
    // server bound to 6454 would steal poll replies from a live desk on the same box.
    if (this.offline) { this.socket = null; return; }
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('error', (e) => { this.lastError = e.message; });
    this.socket.on('message', (msg, rinfo) => {
      const node = parsePollReply(msg, rinfo);
      if (node) this.nodes.set(node.ip, { ...(this.nodes.get(node.ip) || {}), ...node });
    });
    this.socket.bind(this.bindPort, this.bind, () => {
      try { this.socket.setBroadcast(true); } catch (e) { this.lastError = e.message; }
      this.ready = true;
    });
  }

  send(target, portAddress, data) {
    if (this.offline || !this.ready) return;
    const pkt = buildDmx(portAddress, this.sequence, data);
    this.sequence = (this.sequence + 1) % 256;
    if (this.sequence === 0) this.sequence = 1;
    this.socket.send(pkt, 0, pkt.length, this.port, target, (err) => {
      if (err) this.lastError = `${target}: ${err.message}`;
      else this.packetsSent++;
    });
  }

  // Where a poll goes: every broadcast address, plus any node we already know about and
  // any address handed in (the configured unicast targets, or one typed into the UI).
  // Some nodes never answer a broadcast poll and only reply when asked directly, and a
  // node on a foreign subnet cannot hear our broadcast at all — both need the unicast.
  pollTargets(extra = []) {
    const out = broadcastAddresses();
    for (const ip of this.nodes.keys()) if (!out.includes(ip)) out.push(ip);
    for (const a of extra) {
      if (typeof a === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(a) && !out.includes(a)) out.push(a);
    }
    return out;
  }

  // ArtPoll is one UDP datagram with no retransmit, and a node that is booting, busy or
  // behind a wifi AP that throttles broadcast will simply miss it — which looks identical
  // to a node that is not there. A short burst costs three packets and removes most of
  // the false negatives; it is not a flood, and the interval poll is still every 10s.
  poll(extra = []) {
    if (this.offline || !this.ready) return;
    const pkt = buildPoll();
    const targets = this.pollTargets(extra);
    this.lastPoll = Date.now();
    POLL_BURST_MS.forEach((delay) => {
      const fire = () => {
        for (const t of targets) {
          this.socket.send(pkt, 0, pkt.length, this.port, t, (err) => {
            // A refused unicast to an address nothing answers on is expected, not a fault
            // worth showing in the UI; only surface broadcast failures.
            if (err && targets.indexOf(t) < broadcastAddresses().length) {
              this.lastError = `poll ${t}: ${err.message}`;
            }
          });
        }
      };
      if (delay === 0) fire();
      else { const t = setTimeout(fire, delay); if (t.unref) t.unref(); }
    });
  }

  // Drop nodes that have stopped answering. Without this a node that was unplugged an
  // hour ago still sits in the list, which is actively misleading when the rig is dark
  // and the list is the thing you are using to decide whether the node is reachable.
  pruneNodes(maxAgeMs = 60000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [ip, n] of this.nodes) if (!n.seen || n.seen < cutoff) this.nodes.delete(ip);
    return this.nodes.size;
  }

  nodeList() {
    const now = Date.now();
    return [...this.nodes.values()]
      .map((n) => ({ ...n, ageMs: n.seen ? now - n.seen : null }))
      .sort((a, b) => a.ip.localeCompare(b.ip));
  }

  close() { try { if (this.socket) this.socket.close(); } catch (e) {} }
}

module.exports = { ArtNet, broadcastAddresses, localAddresses, buildDmx, buildPoll };
