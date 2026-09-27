'use strict';
// DMX INPUT, the wire half: the sockets that hear a console, and the ArtPollReply that
// lets a console find us. Everything it decides is in dmxin.js (pure, tested against the
// specs' byte layouts); this file only binds, filters by address, and hands packets on.
//
// SECURITY. The listener is OFF until switched on, and then it listens ONLY on the
// interfaces chosen in Setup → Input:
//   Art-Net (UDP 6454): one socket bound to each chosen interface's own address (unicast;
//     and broadcast on Windows, which delivers it there), plus one bound to that
//     interface's directed-broadcast address where the OS allows it (Linux/macOS deliver a
//     broadcast only to a socket bound to the broadcast address or the wildcard). Never
//     the wildcard: the desk's Art-Net OUTPUT socket already holds 0.0.0.0:6454, and two
//     wildcard sockets on one port share unicast unpredictably.
//   sACN (UDP 5568): multicast needs the wildcard bind on every OS, so one socket binds
//     0.0.0.0:5568 and joins 239.255.hi.lo ONLY on the chosen interfaces.
// Every packet on either protocol is then checked: its source address must lie inside a
// chosen interface's subnet (127.0.0.0/8 for loopback). Anything else is dropped and
// counted — a Tailscale peer or a routed stranger cannot drive the rig.

const dgram = require('dgram');
const os = require('os');
const {
  ARTNET_PORT, SACN_PORT, OP_POLL, OP_POLL_REPLY, OP_DMX, artOpcode, parseArtDmx, parseArtPoll, pollWantsUs,
  buildArtPollReplies, buildArtPoll, parseE131, sacnMulticast, deskFromArtNet, deskFromSacn,
  artNetFromDesk, sacnFromDesk, InputMerger,
} = require('./dmxin');

const ipNum = (ip) => ip.split('.').reduce((n, o) => ((n << 8) | (Number(o) & 0xff)) >>> 0, 0);
const numIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 0xff).join('.');

// Every IPv4 interface this machine has, loopback included (it is where a console
// running on this same machine — grandMA3 onPC, a test sender — arrives).
function inputInterfaces() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      const mask = a.internal ? '255.0.0.0' : (a.netmask || '255.255.255.0');
      const m = ipNum(mask);
      const net = ipNum(a.address) & m;
      out.push({
        iface: name, address: a.address, netmask: mask, internal: !!a.internal,
        broadcast: a.internal ? null : numIp((net | (~m >>> 0)) >>> 0),
        mac: a.mac && a.mac !== '00:00:00:00:00:00' ? a.mac : null,
      });
    }
  }
  return out;
}

function inSubnet(ip, iface) {
  const m = ipNum(iface.netmask);
  return ((ipNum(ip) & m) >>> 0) === ((ipNum(iface.address) & m) >>> 0);
}

class DmxInput {
  // isSelfArtNet(ip, portAddress, data): true when the packet is our own output coming
  // back. selfCids: the CIDs our own sACN output uses. Both stop a loop latching.
  constructor({ offline = false, log = () => {}, isSelfArtNet = () => false, selfCids = () => [], artnetPort = ARTNET_PORT, sacnPort = SACN_PORT, now = Date.now } = {}) {
    this.offline = offline;
    this.log = log;
    this.isSelfArtNet = isSelfArtNet;
    this.selfCids = selfCids;
    this.artnetPort = artnetPort;
    this.sacnPort = sacnPort;
    this.now = now;
    this.merger = new InputMerger({});
    this.art = [];          // [{ socket, bind, iface, ok, error }]
    this.sacn = null;       // { socket, ok, error, groups: Set<"group|iface"> }
    this.chosen = [];       // interface records actually in use
    this.problems = [];     // what did not work, in words, for the status line
    this.binding = [];      // bind promises of the current sockets (configure() resolves them)
    this.foreign = 0;       // packets dropped for coming from outside the chosen subnets
    this.names = new Map(); // ip -> the name a console gave in its ArtPollReply
    this.asked = new Set(); // ips we have already asked (one unicast ArtPoll each)
    this.pollsAnswered = 0;
    this.repliesSent = 0;
    this.lastPollFrom = null;
    this.sig = '';
  }

  // (Re)build the listeners for a config. Cheap to call on every change; sockets are only
  // torn down and rebuilt when what they bind to actually changed. Resolves once every
  // socket has bound or failed (at most ~1 s), so a caller can answer with the truth.
  configure(config, { lanAllowed = true } = {}) {
    this.merger.setConfig(config);
    const cfg = this.merger.config;
    const all = inputInterfaces();
    // No LAN allowed (a di.iiii started without --lan): loopback only, whatever was saved.
    const wanted = cfg.enabled ? cfg.interfaces : [];
    this.chosen = all.filter((i) => wanted.includes(i.address) && (lanAllowed || i.internal));
    this.problems = [];
    for (const a of wanted) {
      if (!all.some((i) => i.address === a)) this.problems.push(`${a} is not an address of this machine now`);
      else if (!lanAllowed && !all.find((i) => i.address === a).internal) this.problems.push(`${a}: LAN devices are not allowed on this start (di up --lan)`);
    }
    const sig = JSON.stringify([cfg.enabled, cfg.artnet, cfg.sacn, this.chosen.map((i) => i.address)]);
    if (sig !== this.sig) {
      this.sig = sig;
      this.closeSockets();
      if (!this.offline && cfg.enabled && this.chosen.length) {
        if (cfg.artnet) this.openArtNet();
        if (cfg.sacn) this.openSacn();
      }
    }
    this.syncGroups();
    const settle = (p) => Promise.race([p, new Promise((r) => { const t = setTimeout(r, 1000); if (t.unref) t.unref(); })]);
    return Promise.all(this.binding.map(settle)).then(() => undefined);
  }

  // A socket's bind as a promise: resolves on bound, and on error too (the error is kept
  // on the entry and shown) — a failed listener must never hang the route that asked.
  track(socket, address, port, entry, after) {
    this.binding.push(new Promise((resolve) => {
      socket.once('error', () => resolve());
      socket.bind(port, address, () => { entry.ok = true; if (after) after(); resolve(); });
    }));
  }

  openArtNet() {
    for (const iface of this.chosen) {
      const binds = [iface.address];
      if (iface.broadcast && process.platform !== 'win32') binds.push(iface.broadcast);
      for (const address of binds) {
        const entry = { socket: null, bind: address, iface, ok: false, error: null, broadcast: address !== iface.address };
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        entry.socket = s;
        s.on('error', (e) => { entry.error = e.message; entry.ok = false; this.log(`  input: Art-Net ${address}:${this.artnetPort} — ${e.message}`); });
        s.on('message', (msg, rinfo) => this.onArtNet(msg, rinfo, entry));
        this.track(s, address, this.artnetPort, entry, () => {
          try { s.setBroadcast(true); } catch (e) { /* receive-only is fine */ }
        });
        this.art.push(entry);
      }
    }
  }

  openSacn() {
    const entry = { socket: null, ok: false, error: null, groups: new Set(), groupErrors: [] };
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    entry.socket = s;
    s.on('error', (e) => { entry.error = e.message; entry.ok = false; this.log(`  input: sACN :${this.sacnPort} — ${e.message}`); });
    s.on('message', (msg, rinfo) => this.onSacn(msg, rinfo));
    this.track(s, '0.0.0.0', this.sacnPort, entry, () => this.syncGroups());
    this.sacn = entry;
  }

  // Multicast membership follows the universe list: join the group of every listened
  // universe on every chosen interface, leave the ones no longer listened to.
  syncGroups() {
    const e = this.sacn;
    if (!e || !e.ok) return;
    const want = new Set();
    for (const line of this.merger.config.universes) {
      const su = sacnFromDesk(line.universe);
      if (su < 1 || su > 63999) continue;
      for (const iface of this.chosen) want.add(`${sacnMulticast(su)}|${iface.address}`);
    }
    e.groupErrors = [];
    for (const key of [...e.groups]) {
      if (want.has(key)) continue;
      const [g, i] = key.split('|');
      try { e.socket.dropMembership(g, i); } catch (err) { /* already gone */ }
      e.groups.delete(key);
    }
    for (const key of want) {
      if (e.groups.has(key)) continue;
      const [g, i] = key.split('|');
      try { e.socket.addMembership(g, i); e.groups.add(key); }
      catch (err) {
        // Loopback usually carries no multicast. Unicast sACN to 127.0.0.1 still works,
        // and a local multicast sender loops back on the LAN interface's join instead.
        e.groupErrors.push(`${g} on ${i}: ${err.code || err.message}`);
      }
    }
  }

  ifaceFor(ip) { return this.chosen.find((i) => inSubnet(ip, i)) || null; }

  onArtNet(msg, rinfo, entry) {
    const iface = this.ifaceFor(rinfo.address);
    if (!iface) { this.foreign++; return; }
    const op = artOpcode(msg);
    if (op === OP_DMX) {
      const p = parseArtDmx(msg);
      if (!p) { this.merger.refuse('artnet-malformed'); return; }
      if (this.isSelfArtNet(rinfo.address, p.portAddress, p.data)) { this.merger.stats.self++; return; }
      const u = deskFromArtNet(p.portAddress);
      const r = this.merger.feed({
        protocol: 'artnet', universe: u, key: `artnet:${rinfo.address}:${p.physical}`,
        name: this.names.get(rinfo.address) || null, ip: rinfo.address,
        priority: null, sequence: p.sequence, data: p.data, terminated: false, preview: false,
      }, this.now());
      // Never ask ourselves: a sender on one of our own addresses would be answered by us.
      if (r === 'ok' && !this.asked.has(rinfo.address) && !this.chosen.some((i) => i.address === rinfo.address)) this.askName(rinfo.address, iface, p.portAddress);
      return;
    }
    if (op === OP_POLL) {
      const poll = parseArtPoll(msg);
      if (!poll) return;
      this.lastPollFrom = { ip: rinfo.address, at: this.now() };
      const pas = this.merger.config.universes.map((l) => artNetFromDesk(l.universe));
      if (!pollWantsUs(poll, pas)) return;
      this.pollsAnswered++;
      // Art-Net 4: "The device should wait for a random delay of up to 1s before sending
      // the reply" — so a hall of nodes does not answer in one burst.
      const t = setTimeout(() => this.reply(rinfo.address, iface), Math.floor(Math.random() * 1000));
      if (t.unref) t.unref();
      return;
    }
    // (Our own reply, heard back when the desk's output polls this network, names us —
    // not the sender at that address — so a reply from one of our addresses is skipped.)
    if (op === OP_POLL_REPLY && msg.length >= 44 && !this.chosen.some((i) => i.address === rinfo.address)) {
      // A console answering our one poll: the name the engineer gave it.
      const end = msg.indexOf(0, 26);
      const name = msg.toString('latin1', 26, end === -1 || end > 44 ? 44 : end).trim();
      if (name) this.names.set(rinfo.address, name.slice(0, 18));
    }
  }

  // One unicast, targeted ArtPoll to a new sender, to learn its name. Targeted mode is
  // what the spec asks of a unicast poll ("Allowed, with Targeted Mode").
  askName(ip, iface, portAddress) {
    this.asked.add(ip);
    const s = this.socketFor(iface);
    if (!s) return;
    const pkt = buildArtPoll({ flags: 0x20, top: portAddress, bottom: portAddress });
    s.send(pkt, 0, pkt.length, this.artnetPort, ip, () => {});
  }

  socketFor(iface) {
    const e = this.art.find((a) => a.ok && !a.broadcast && a.iface.address === iface.address);
    return e ? e.socket : null;
  }

  // ArtPollReply, unicast to the poller (Art-Net 4 mandates unicast for the reply).
  replies(iface) {
    const cfg = this.merger.config;
    const now = this.now();
    const st = this.merger.status(now);
    const pas = cfg.universes.map((l) => artNetFromDesk(l.universe));
    const live = st.lines.filter((l) => l.state === 'live').map((l) => artNetFromDesk(l.universe));
    const ltp = cfg.universes.filter((l) => l.merge === 'ltp').map((l) => artNetFromDesk(l.universe));
    const merging = st.lines.filter((l) => l.sources.filter((s) => s.winning).length > 1).map((l) => artNetFromDesk(l.universe));
    const mac = iface.mac ? iface.mac.split(':').map((h) => parseInt(h, 16)) : null;
    this.reportCount = ((this.reportCount || 0) + 1) % 10000;
    const report = `#0001 [${String(this.reportCount).padStart(4, '0')}] ${live.length ? 'receiving ' + live.length + ' universe(s)' : 'listening'}`;
    return buildArtPollReplies({
      ip: iface.address, portAddresses: pas, shortName: cfg.name,
      longName: `${cfg.name} - di.iiii lighting desk (visualiser)`, report,
      active: live, mergingLtp: ltp, merging, mac, refreshHz: 44,
    });
  }

  reply(to, iface) {
    const s = this.socketFor(iface);
    if (!s) return;
    for (const pkt of this.replies(iface)) {
      s.send(pkt, 0, pkt.length, this.artnetPort, to, (err) => { if (!err) this.repliesSent++; });
    }
  }

  onSacn(msg, rinfo) {
    if (!this.ifaceFor(rinfo.address)) { this.foreign++; return; }
    const why = {};
    const p = parseE131(msg, why);
    if (!p) { this.merger.refuse('sacn-' + why.reason); return; }
    if (p.kind !== 'data') return;   // sync / discovery: not acted on (E1.31 §6.5 permits)
    if (this.selfCids().includes(p.cid)) { this.merger.stats.self++; return; }
    if (p.startCode !== 0x00) { this.merger.stats.otherStart++; return; } // only NULL START Code is levels
    this.merger.feed({
      protocol: 'sacn', universe: deskFromSacn(p.universe), key: `sacn:${p.cid}`,
      name: p.sourceName || null, ip: rinfo.address, priority: p.priority,
      sequence: p.sequence, data: p.data, terminated: p.terminated, preview: p.preview,
    }, this.now());
  }

  status() {
    const now = this.now();
    const m = this.merger.status(now);
    const cfg = this.merger.config;
    return {
      config: cfg,
      interfaces: inputInterfaces().map(({ iface, address, internal, netmask }) => ({ iface, address, internal, netmask })),
      listening: [
        ...this.art.map((a) => ({ protocol: 'artnet', address: a.bind, port: this.artnetPort, ok: a.ok, error: a.error, broadcast: a.broadcast })),
        ...(this.sacn ? [{ protocol: 'sacn', address: '0.0.0.0', port: this.sacnPort, ok: this.sacn.ok, error: this.sacn.error,
          groups: [...this.sacn.groups].map((k) => k.replace('|', ' on ')), groupErrors: this.sacn.groupErrors }] : []),
      ],
      problems: this.problems,
      foreign: this.foreign,
      polls: { answered: this.pollsAnswered, repliesSent: this.repliesSent, last: this.lastPollFrom ? { ip: this.lastPollFrom.ip, ageMs: now - this.lastPollFrom.at } : null },
      ...m,
    };
  }

  closeSockets() {
    this.binding = [];
    for (const a of this.art) { try { a.socket.close(); } catch (e) { /* closed */ } }
    this.art = [];
    if (this.sacn) { try { this.sacn.socket.close(); } catch (e) { /* closed */ } }
    this.sacn = null;
  }

  close() { this.closeSockets(); this.sig = ''; }
}

module.exports = { DmxInput, inputInterfaces, inSubnet };
