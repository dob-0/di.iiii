'use strict';
// DMX INPUT — the desk as a receiver. A console (grandMA3, Eos, MagicQ, onPC) sends
// Art-Net or sACN at this machine, and the desk's frame follows it, so the space's lamps
// draw what the console is doing: the room works as a visualiser.
//
// This file is PURE: packet parsers and builders laid out byte-for-byte from the published
// specs, the sequence rule, and the merge. No sockets, no clock of its own (every call is
// handed `now`), so every rule here is tested against the spec's own numbers without a
// network. The sockets live in dmxin-net.js.
//
// Specs, by the versions this was built and tested against:
//   ART-NET 4 — Artistic Licence, "Art-Net 4 Protocol Release V1.4", document revision
//     1.4dp, 23/10/2025 (https://art-net.org.uk/downloads/art-net.pdf).
//     ArtPoll (OpPoll 0x2000, min length 14), ArtPollReply (OpPollReply 0x2100, 239 bytes,
//     receivers accept >= 207), ArtDmx (OpOutput 0x5000). Style code 0x06 = StVisual.
//   sACN — ANSI E1.31-2018, "Lightweight streaming protocol for transport of DMX512 using
//     ACN" (ESTA, CP/2014-1009r6). Root layer §5, framing layer §6.2, DMP layer §7,
//     receiver timing §6.7 (network data loss 2.5 s §6.7.1; sequence rule §6.7.2),
//     multicast 239.255.hi.lo §9.3.1.

// ---------------------------------------------------------------------------------------
// Art-Net 4
// ---------------------------------------------------------------------------------------

const ARTNET_ID = Buffer.from('Art-Net\0', 'latin1');
const ARTNET_PORT = 6454;                 // 0x1936
const OP_POLL = 0x2000;
const OP_POLL_REPLY = 0x2100;
const OP_DMX = 0x5000;
const PROT_VER = 14;
// Art-Net 4 §ArtPollReply: 239 bytes as defined; a receiver must accept 207 or more.
const POLL_REPLY_LENGTH = 239;
// Table 4, Style codes. We are neither a node that converts to DMX nor a console: we are
// a visualiser, and saying so lets a console list us in the right column.
const ST_VISUAL = 0x06;
// OEM 0x00ff is "OemUnknown" in the Art-Net OEM table: the honest value for a product
// without an assigned code. ESTA manufacturer 0x0000 likewise: none registered.
const OEM_UNKNOWN = 0x00ff;

function isArtNet(msg) {
  return Buffer.isBuffer(msg) && msg.length >= 10 && msg.compare(ARTNET_ID, 0, 8, 0, 8) === 0;
}

function artOpcode(msg) { return isArtNet(msg) ? msg.readUInt16LE(8) : null; }

// Port-Address: 15 bits, Net (7) : Sub-Net (4) : Universe (4).
function splitPortAddress(pa) {
  const p = pa & 0x7fff;
  return { net: (p >> 8) & 0x7f, sub: (p >> 4) & 0x0f, uni: p & 0x0f };
}
function portAddressLabel(pa) {
  const { net, sub, uni } = splitPortAddress(pa);
  return `${net}:${sub}:${uni}`;
}

// ArtDmx — Art-Net 4 §ArtDmx packet definition. 18-byte header, then Length slots.
// Returns null for anything that is not a well-formed ArtDmx (it is then ignored, as the
// spec says of every packet a node does not accept).
function parseArtDmx(msg) {
  if (artOpcode(msg) !== OP_DMX || msg.length < 18) return null;
  const length = (msg[16] << 8) | msg[17];
  // "an even number in the range 2 – 512". Odd lengths are seen from real consoles, so
  // they are accepted; zero, over 512, or more than the datagram carries are not.
  if (length < 1 || length > 512 || msg.length < 18 + length) return null;
  return {
    protVer: (msg[10] << 8) | msg[11],
    sequence: msg[12],                    // 0 = sequencing disabled
    physical: msg[13],
    portAddress: ((msg[15] & 0x7f) << 8) | msg[14],
    length,
    data: msg.subarray(18, 18 + length),
  };
}

// ArtPoll — Art-Net 4 §ArtPoll. Min length 14; missing fields read as zero.
function parseArtPoll(msg) {
  if (artOpcode(msg) !== OP_POLL || msg.length < 14) return null;
  const at = (i) => (i < msg.length ? msg[i] : 0);
  const flags = at(12);
  return {
    protVer: (at(10) << 8) | at(11),
    flags,
    targeted: !!(flags & 0x20),           // bit 5: Targeted Mode
    replyOnChange: !!(flags & 0x02),      // bit 1
    diagPriority: at(13),
    targetTop: (at(14) << 8) | at(15),
    targetBottom: (at(16) << 8) | at(17),
  };
}

// Does a (possibly targeted) poll ask about us? Targeted mode: reply only when one of our
// Port-Addresses lies inclusively in [bottom, top].
function pollWantsUs(poll, portAddresses) {
  if (!poll.targeted) return true;
  return portAddresses.some((pa) => pa >= poll.targetBottom && pa <= poll.targetTop);
}

function writeCstr(buf, text, at, size) {
  buf.fill(0, at, at + size);
  buf.write(String(text || '').slice(0, size - 1), at, size - 1, 'latin1');
}

// ArtPollReply — Art-Net 4 §ArtPollReply packet definition, every offset from the table.
// One reply describes up to FOUR ports that share Net and Sub-Net; more universes than that
// (or universes on another Net/Sub-Net) are described by further replies with BindIndex
// 1, 2, 3 … — the spec's own mechanism for one IP carrying many ports.
function buildArtPollReply({
  ip, portAddresses, shortName, longName, report = '', bindIndex = 1,
  active = [], mergingLtp = [], merging = [], mac = null, acnPriority = 100, refreshHz = 44,
}) {
  const ports = portAddresses.slice(0, 4);
  const first = ports.length ? splitPortAddress(ports[0]) : { net: 0, sub: 0 };
  const buf = Buffer.alloc(POLL_REPLY_LENGTH);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL_REPLY, 8);
  String(ip).split('.').map(Number).forEach((o, i) => { buf[10 + i] = o & 0xff; });
  buf.writeUInt16LE(ARTNET_PORT, 14);          // Port: always 0x1936, low byte first
  buf[16] = 0; buf[17] = 1;                    // VersInfo: firmware 1
  buf[18] = first.net & 0x7f;                  // NetSwitch
  buf[19] = first.sub & 0x0f;                  // SubSwitch
  buf[20] = (OEM_UNKNOWN >> 8) & 0xff;         // OemHi
  buf[21] = OEM_UNKNOWN & 0xff;                // Oem
  buf[22] = 0;                                 // Ubea
  // Status1: indicators normal (11), port-address set by network (10), no RDM, flash boot.
  buf[23] = 0b11100000;
  buf[24] = 0; buf[25] = 0;                    // EstaMan: none registered
  writeCstr(buf, shortName, 26, 18);           // PortName (a.k.a. ShortName)
  writeCstr(buf, longName, 44, 64);
  writeCstr(buf, report, 108, 64);             // NodeReport
  buf.writeUInt16BE(ports.length, 172);        // NumPorts (Hi, Lo)
  for (let i = 0; i < ports.length; i++) {
    const pa = ports[i];
    buf[174 + i] = 0x80;                       // PortTypes: can OUTPUT from Art-Net, DMX512
    buf[178 + i] = 0x08;                       // GoodInput: input disabled (we take none)
    let good = 0;
    if (active.includes(pa)) good |= 0x80;     // data being output
    if (merging.includes(pa)) good |= 0x08;    // output is merging Art-Net data
    if (mergingLtp.includes(pa)) good |= 0x02; // merge mode is LTP
    buf[182 + i] = good;                       // GoodOutputA
    buf[186 + i] = 0;                          // SwIn
    buf[190 + i] = pa & 0x0f;                  // SwOut: low nibble of the Port-Address
    buf[213 + i] = 0xc0 | 0x20;                // GoodOutputB: RDM off, continuous, no discovery
  }
  buf[194] = acnPriority & 0xff;               // AcnPriority
  buf[200] = ST_VISUAL;                        // Style
  if (mac && mac.length === 6) mac.forEach((b, i) => { buf[201 + i] = b & 0xff; });
  String(ip).split('.').map(Number).forEach((o, i) => { buf[207 + i] = o & 0xff; }); // BindIp
  buf[211] = bindIndex & 0xff;                 // BindIndex
  // Status2: bit 3 set = 15-bit Port-Address (Art-Net 3/4); bit 0 = web configuration.
  buf[212] = 0x08 | 0x01;
  buf[217] = 0;                                // Status3: failsafe "hold last state"
  buf.writeUInt16BE(Math.max(0, Math.min(65535, refreshHz | 0)), 226); // RefreshRate
  return buf;
}

// The replies for a set of Port-Addresses: grouped by Net:Sub-Net, four ports a page.
function buildArtPollReplies(opts) {
  const groups = new Map();
  for (const pa of [...new Set(opts.portAddresses)].sort((a, b) => a - b)) {
    const key = pa >> 4;                       // Net + Sub-Net
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pa);
  }
  const pages = [];
  for (const list of groups.values()) for (let i = 0; i < list.length; i += 4) pages.push(list.slice(i, i + 4));
  if (!pages.length) pages.push([]);           // a node with nothing patched still answers
  return pages.map((ports, i) => buildArtPollReply({ ...opts, portAddresses: ports, bindIndex: i + 1 }));
}

// Builders for the sender side of the tests and the bench (tools/dmx-send.js). Not used by
// the desk's receive path; kept here so the parser and the builder share one layout.
function buildArtDmx(portAddress, sequence, data) {
  const len = data.length + (data.length & 1);
  const buf = Buffer.alloc(18 + len);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_DMX, 8);
  buf[10] = 0; buf[11] = PROT_VER;
  buf[12] = sequence & 0xff;
  buf[13] = 0;
  buf[14] = portAddress & 0xff;
  buf[15] = (portAddress >> 8) & 0x7f;
  buf[16] = (len >> 8) & 0xff;
  buf[17] = len & 0xff;
  Buffer.from(data).copy(buf, 18);
  return buf;
}

function buildArtPoll({ flags = 0, top = 0, bottom = 0 } = {}) {
  const buf = Buffer.alloc(22);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL, 8);
  buf[10] = 0; buf[11] = PROT_VER;
  buf[12] = flags;
  buf[13] = 0;
  buf.writeUInt16BE(top, 14);
  buf.writeUInt16BE(bottom, 16);
  return buf;
}

// ---------------------------------------------------------------------------------------
// sACN — ANSI E1.31-2018
// ---------------------------------------------------------------------------------------

const SACN_PORT = 5568;
const ACN_PID = Buffer.from('ASC-E1.17\0\0\0', 'latin1');
const VECTOR_ROOT_E131_DATA = 0x00000004;
const VECTOR_ROOT_E131_EXTENDED = 0x00000008;
const VECTOR_E131_DATA_PACKET = 0x00000002;
const VECTOR_DMP_SET_PROPERTY = 0x02;
const OPT_PREVIEW = 0x80;                 // §6.2.6 bit 7
const OPT_TERMINATED = 0x40;              // §6.2.6 bit 6
const NETWORK_DATA_LOSS_MS = 2500;        // §6.7.1 E131_NETWORK_DATA_LOSS_TIMEOUT
const UNIVERSE_MIN = 1;                   // §6.2.7: 1 … 63999
const UNIVERSE_MAX = 63999;

function sacnMulticast(universe) {       // §9.3.1: 239.255.<hi>.<lo>
  const u = universe & 0xffff;
  return `239.255.${(u >> 8) & 0xff}.${u & 0xff}`;
}

function cidString(cid) {
  const h = cid.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// An E1.31 packet, checked layer by layer against the "receivers shall discard" rules.
// Returns { kind: 'data', … } for a data packet, { kind: 'other' } for a well-formed
// synchronization/discovery packet (extended root vector — ignored here, which §6.5
// permits a receiver that does not do synchronization), or null with nothing accepted.
// `why` is filled for a refused packet so the status can say what is arriving and wrong.
function parseE131(msg, why = {}) {
  const no = (reason) => { why.reason = reason; return null; };
  if (!Buffer.isBuffer(msg) || msg.length < 38) return no('short');
  // Root layer §5.1–5.5
  if (msg.readUInt16BE(0) !== 0x0010) return no('preamble');
  if (msg.readUInt16BE(2) !== 0x0000) return no('postamble');
  if (msg.compare(ACN_PID, 0, 12, 4, 16) !== 0) return no('acn-pid');
  const rootVector = msg.readUInt32BE(18);
  const cid = msg.subarray(22, 38);
  if (rootVector === VECTOR_ROOT_E131_EXTENDED) return { kind: 'other', cid: cidString(cid) };
  if (rootVector !== VECTOR_ROOT_E131_DATA) return no('root-vector');
  if (msg.length < 126) return no('short');
  // Framing layer §6.2
  if (msg.readUInt32BE(40) !== VECTOR_E131_DATA_PACKET) return no('framing-vector');
  const nameEnd = msg.indexOf(0, 44);
  const sourceName = msg.toString('utf8', 44, nameEnd === -1 || nameEnd > 108 ? 108 : nameEnd);
  const priority = msg[108];
  const syncAddress = msg.readUInt16BE(109);
  const sequence = msg[111];
  const options = msg[112];
  const universe = msg.readUInt16BE(113);
  if (universe < UNIVERSE_MIN || universe > UNIVERSE_MAX) return no('universe');
  // DMP layer §7.2–7.6
  if (msg[117] !== VECTOR_DMP_SET_PROPERTY) return no('dmp-vector');
  if (msg[118] !== 0xa1) return no('address-type');
  if (msg.readUInt16BE(119) !== 0x0000) return no('first-address');
  if (msg.readUInt16BE(121) !== 0x0001) return no('increment');
  const count = msg.readUInt16BE(123);            // START code + slots, 1 … 513
  if (count < 1 || count > 513 || msg.length < 125 + count) return no('count');
  return {
    kind: 'data',
    cid: cidString(cid),
    sourceName,
    // "No priority outside the range of 0 to 200 shall be transmitted" — a receiver
    // clamps rather than lets 255 outrank every lawful source.
    priority: Math.min(200, priority),
    syncAddress,
    sequence,
    preview: !!(options & OPT_PREVIEW),
    terminated: !!(options & OPT_TERMINATED),
    universe,
    startCode: msg[125],
    data: msg.subarray(126, 125 + count),
  };
}

// The sender side, for tests and the bench. Same layout as sacn.js's output builder, with
// the options byte and a variable slot count exposed.
function buildE131({ cid, sourceName = 'test', universe, priority = 100, sequence = 0, data = Buffer.alloc(512), options = 0, startCode = 0 }) {
  const slots = Math.min(512, data.length);
  const total = 126 + slots;
  const buf = Buffer.alloc(total);
  buf.writeUInt16BE(0x0010, 0);
  buf.writeUInt16BE(0x0000, 2);
  ACN_PID.copy(buf, 4);
  buf.writeUInt16BE(0x7000 | (total - 16), 16);
  buf.writeUInt32BE(VECTOR_ROOT_E131_DATA, 18);
  cid.copy(buf, 22);
  buf.writeUInt16BE(0x7000 | (total - 38), 38);
  buf.writeUInt32BE(VECTOR_E131_DATA_PACKET, 40);
  buf.write(String(sourceName).slice(0, 63), 44, 63, 'utf8');
  buf[108] = priority;
  buf.writeUInt16BE(0, 109);
  buf[111] = sequence & 0xff;
  buf[112] = options;
  buf.writeUInt16BE(universe, 113);
  buf.writeUInt16BE(0x7000 | (total - 115), 115);
  buf[117] = VECTOR_DMP_SET_PROPERTY;
  buf[118] = 0xa1;
  buf.writeUInt16BE(0, 119);
  buf.writeUInt16BE(1, 121);
  buf.writeUInt16BE(slots + 1, 123);
  buf[125] = startCode;
  Buffer.from(data).copy(buf, 126, 0, slots);
  return buf;
}

// E1.31-2018 §6.7.2: "If, using signed 8-bit binary arithmetic, B - A is less than or
// equal to 0, but greater than -20, the packet containing sequence number B shall be
// deemed out of sequence and discarded." A jump of 20 or more backwards is a reset and is
// taken. The same rule is applied to Art-Net's non-zero Sequence (Art-Net 4 says only that
// it exists "to allow the receiving node to re-sequence"; dropping a late frame is the
// conservative reading, and 0 still means "sequencing disabled").
function sequenceAccept(last, next) {
  if (last == null) return true;
  let d = (next - last) & 0xff;
  if (d > 127) d -= 256;
  return !(d <= 0 && d > -20);
}

// ---------------------------------------------------------------------------------------
// Universe numbering — one rule, said everywhere.
// The desk counts universes from 0 internally and shows "Universe N+1".
//   desk universe u  ←  Art-Net Port-Address u   (so Universe 1 = Art-Net 0:0:0)
//   desk universe u  ←  sACN universe u + 1      (so Universe 1 = sACN 1; sACN has no 0)
// That is the convention most consoles default to (Universe 1 ↔ Art-Net 0 ↔ sACN 1).
// ---------------------------------------------------------------------------------------
const deskFromArtNet = (pa) => pa & 0x7fff;
const deskFromSacn = (u) => u - 1;
const artNetFromDesk = (u) => u;
const sacnFromDesk = (u) => u + 1;

// ---------------------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------------------

// How long a silent source is still counted. sACN: fixed by E1.31 §6.7.1 at 2.5 s.
// Art-Net: the spec's merge rule holds a failed source for 10 s ("If either (but not both)
// sources of ArtDmx stop, the failed source is held in the merge buffer for 10 seconds"),
// and an idle Art-Net input may legally re-transmit only every ~4 s, so a shorter timeout
// would drop a console that is simply holding a look.
const LOSS_MS = { sacn: NETWORK_DATA_LOSS_MS, artnet: 10000 };
// Art-Net 4: "Merging is limited to two sources, any additional sources will be ignored".
// sACN leaves the number to the receiver (§6.2.3.4 asks that it be declared): eight.
const MAX_SOURCES = { artnet: 2, sacn: 8 };
// Art-Net carries no priority; for arbitration against sACN it stands at sACN's default.
const ARTNET_PRIORITY = 100;
const MERGES = ['htp', 'ltp'];
const WITH_DESK = ['follow', 'htp'];
const LOSS_POLICIES = ['hold', 'release'];

function sanitizeInputConfig(given) {
  const g = given && typeof given === 'object' ? given : {};
  const seen = new Set();
  const universes = (Array.isArray(g.universes) ? g.universes : []).slice(0, 64).map((u) => {
    const n = Number(u && u.universe);
    if (!Number.isInteger(n) || n < 0 || n > 32767 || seen.has(n)) return null;
    seen.add(n);
    return {
      universe: n,
      merge: MERGES.includes(u.merge) ? u.merge : 'htp',
      desk: WITH_DESK.includes(u.desk) ? u.desk : 'follow',
    };
  }).filter(Boolean).sort((a, b) => a.universe - b.universe);
  const ifaces = (Array.isArray(g.interfaces) ? g.interfaces : [])
    .filter((a) => typeof a === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(a)).slice(0, 8);
  return {
    // OFF until someone turns it on, like output inside di.iiii: a dev box never opens a
    // UDP listener nobody asked for.
    enabled: g.enabled === true,
    artnet: g.artnet !== false,
    sacn: g.sacn !== false,
    interfaces: [...new Set(ifaces)],
    universes,
    loss: LOSS_POLICIES.includes(g.loss) ? g.loss : 'release',
    name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 17) : 'di.iiii visual',
  };
}

function signalFps(times, now) {
  // Packets in the last second, from a small ring of arrival times.
  let n = 0;
  for (const t of times) if (now - t <= 1000) n++;
  return n;
}

class InputMerger {
  constructor(config) {
    this.setConfig(config);
    this.u = new Map();        // desk universe -> { sources: Map, ltp, lastOut, lastAt, … }
    this.unlistened = new Map(); // desk universe -> { protocol, from, at } — arriving, not listened to
    this.stats = { accepted: 0, outOfSequence: 0, preview: 0, terminated: 0, exceeded: 0, refused: 0, otherStart: 0, self: 0 };
    this.refusals = new Map(); // reason -> count (malformed sACN, what and how often)
  }

  setConfig(config) {
    this.config = sanitizeInputConfig(config);
    this.lines = new Map(this.config.universes.map((l) => [l.universe, l]));
    if (this.u) for (const key of [...this.u.keys()]) if (!this.lines.has(key)) this.u.delete(key);
  }

  universe(u) {
    if (!this.u.has(u)) this.u.set(u, { sources: new Map(), ltp: null, ltpSet: '', lastOut: null, lastAt: null, lostAt: 0, lastFrom: null });
    return this.u.get(u);
  }

  refuse(reason) { this.stats.refused++; this.refusals.set(reason, (this.refusals.get(reason) || 0) + 1); }

  // One packet, already parsed and mapped to a desk universe.
  // pkt: { protocol, universe, key, name, ip, priority, sequence, data, terminated, preview }
  // Returns what happened, for tests and counters.
  feed(pkt, now) {
    const proto = pkt.protocol;
    if (!this.config.enabled || !this.config[proto]) return 'off';
    const line = this.lines.get(pkt.universe);
    if (!line) {
      this.unlistened.set(pkt.universe, { protocol: proto, from: pkt.ip, name: pkt.name || null, at: now });
      return 'unlistened';
    }
    const U = this.universe(pkt.universe);
    let src = U.sources.get(pkt.key);
    if (pkt.preview) { this.stats.preview++; return 'preview'; }
    // Sequence is judged per source per universe (§6.7.2), and only against a source
    // still counted as present: one back from the dead starts afresh.
    if (src && !src.lost && pkt.sequence != null && !(proto === 'artnet' && pkt.sequence === 0)) {
      if (!sequenceAccept(src.sequence, pkt.sequence)) { this.stats.outOfSequence++; src.outOfSequence++; return 'out-of-sequence'; }
    }
    if (pkt.terminated) {
      // §6.2.6: enter network data loss for that source now; property values ignored.
      this.stats.terminated++;
      if (src && !src.lost) { src.lost = true; src.lostAt = now; src.lostWhy = 'terminated'; }
      return 'terminated';
    }
    if (!src || src.lost) {
      const live = [...U.sources.values()].filter((s) => s.protocol === proto && !s.lost && !this.expired(s, now));
      if (live.length >= MAX_SOURCES[proto] && !(src && live.includes(src))) {
        // Sources exceeded: the extra source is refused — never an arbitrary pick between
        // it and the ones already merging (§6.2.3.3 warns against order-dependent picks;
        // Art-Net 4 says "any additional sources will be ignored"). The status says so.
        this.stats.exceeded++;
        U.exceeded = { key: pkt.key, name: pkt.name || pkt.ip, ip: pkt.ip, at: now };
        return 'exceeded';
      }
      src = {
        key: pkt.key, protocol: proto, name: pkt.name || null, ip: pkt.ip,
        priority: proto === 'artnet' ? ARTNET_PRIORITY : pkt.priority,
        data: new Uint8Array(512), prev: null, sequence: null, firstAt: now,
        lastAt: now, lost: false, lostAt: 0, lostWhy: null, packets: 0, outOfSequence: 0, times: [],
      };
      U.sources.set(pkt.key, src);
    }
    src.sequence = pkt.sequence;
    src.priority = proto === 'artnet' ? ARTNET_PRIORITY : pkt.priority;
    if (pkt.name) src.name = pkt.name;
    src.ip = pkt.ip;
    src.lastAt = now;
    src.packets++;
    src.times.push(now);
    if (src.times.length > 64) src.times.shift();
    const prev = src.data;
    const next = new Uint8Array(512);
    next.set(pkt.data.subarray(0, 512));
    src.prev = prev;
    src.data = next;
    this.stats.accepted++;
    U.lastAt = now;
    U.lastFrom = src.key;
    // LTP is kept slot by slot as packets arrive: a slot takes the value of whichever
    // winning source CHANGED it last. A source's first packet writes every slot.
    if (line.merge === 'ltp') this.ltpApply(U, src, now);
    return 'ok';
  }

  expired(src, now) { return src.lost || now - src.lastAt > LOSS_MS[src.protocol]; }

  // The sources that currently decide the universe: present, and at the highest priority
  // among the present (E1.31 §6.2.3 — "the highest priority as the definitive data").
  winners(U, now) {
    const live = [...U.sources.values()].filter((s) => !this.expired(s, now));
    if (!live.length) return [];
    const top = Math.max(...live.map((s) => s.priority));
    return live.filter((s) => s.priority === top);
  }

  ltpApply(U, src, now) {
    const win = this.winners(U, now);
    if (!win.includes(src)) return;
    const set = win.map((s) => s.key).sort().join('|');
    if (!U.ltp || U.ltpSet !== set) {
      // The winning set changed (a source came or went, a priority moved): start from the
      // most recent winner's whole frame, so nothing is left over from a loser.
      const newest = win.reduce((a, b) => (b.lastAt > a.lastAt ? b : a));
      U.ltp = Uint8Array.from(newest.data);
      U.ltpSet = set;
      if (newest === src) return;
    }
    const first = src.packets === 1;
    for (let i = 0; i < 512; i++) if (first || src.data[i] !== src.prev[i]) U.ltp[i] = src.data[i];
  }

  // What input says universe u is RIGHT NOW: { data, mode, state, sources } or null when
  // the desk has the universe to itself (no line, or no signal and loss = release).
  frame(u, now) {
    const line = this.lines.get(u);
    if (!line || !this.config.enabled) return null;
    const U = this.u.get(u);
    if (!U) return null;
    for (const s of U.sources.values()) {
      if (!s.lost && now - s.lastAt > LOSS_MS[s.protocol]) { s.lost = true; s.lostAt = s.lastAt + LOSS_MS[s.protocol]; s.lostWhy = 'timeout'; }
    }
    const win = this.winners(U, now);
    if (!win.length) {
      if (U.lastOut && !U.lostAt) U.lostAt = now;
      if (this.config.loss === 'hold' && U.lastOut) return { data: U.lastOut, desk: line.desk, state: 'held' };
      return null;
    }
    U.lostAt = 0;
    let data;
    if (win.length === 1) data = win[0].data;
    else if (line.merge === 'ltp' && U.ltp && U.ltpSet === win.map((s) => s.key).sort().join('|')) data = U.ltp;
    else {
      data = new Uint8Array(512);
      for (const s of win) for (let i = 0; i < 512; i++) if (s.data[i] > data[i]) data[i] = s.data[i];
    }
    U.lastOut = data;
    return { data, desk: line.desk, state: 'live', merging: win.length > 1 };
  }

  // Forget every held frame (the operator pressed "release" on a held universe).
  release() { for (const U of this.u.values()) { U.lastOut = null; U.ltp = null; } }

  // Live counts for the status: per universe, its sources and what is winning.
  status(now) {
    const lines = this.config.universes.map((line) => {
      const U = this.u.get(line.universe);
      const f = U ? this.frame(line.universe, now) : null;
      const win = U ? this.winners(U, now) : [];
      const sources = U ? [...U.sources.values()]
        .filter((s) => !s.lost || now - s.lostAt < 60000)
        .map((s) => ({
          key: s.key, protocol: s.protocol, name: s.name, ip: s.ip, priority: s.priority,
          fps: s.lost ? 0 : signalFps(s.times, now), ageMs: now - s.lastAt,
          packets: s.packets, outOfSequence: s.outOfSequence,
          winning: win.includes(s), lost: s.lost, lostWhy: s.lostWhy,
        })) : [];
      return {
        universe: line.universe, merge: line.merge, desk: line.desk,
        artnet: portAddressLabel(artNetFromDesk(line.universe)), sacn: sacnFromDesk(line.universe),
        state: f ? f.state : (U && U.lastAt != null ? 'lost' : 'waiting'),
        lastAt: U ? U.lastAt : null,
        ageMs: U && U.lastAt != null ? now - U.lastAt : null,
        sources,
        exceeded: U && U.exceeded && now - U.exceeded.at < 10000 ? U.exceeded : null,
      };
    });
    const unlistened = [...this.unlistened.entries()]
      .filter(([, v]) => now - v.at < 10000)
      .map(([u, v]) => ({ universe: u, ...v, ageMs: now - v.at }));
    return { lines, unlistened, stats: { ...this.stats }, refusals: Object.fromEntries(this.refusals) };
  }
}

module.exports = {
  // Art-Net
  ARTNET_PORT, OP_POLL, OP_POLL_REPLY, OP_DMX, POLL_REPLY_LENGTH, ST_VISUAL,
  isArtNet, artOpcode, parseArtDmx, parseArtPoll, pollWantsUs, buildArtPollReply, buildArtPollReplies,
  buildArtDmx, buildArtPoll, splitPortAddress, portAddressLabel,
  // sACN
  SACN_PORT, NETWORK_DATA_LOSS_MS, parseE131, buildE131, sacnMulticast, cidString, OPT_PREVIEW, OPT_TERMINATED,
  // shared
  sequenceAccept, deskFromArtNet, deskFromSacn, artNetFromDesk, sacnFromDesk,
  LOSS_MS, MAX_SOURCES, MERGES, WITH_DESK, LOSS_POLICIES, sanitizeInputConfig, InputMerger,
};
