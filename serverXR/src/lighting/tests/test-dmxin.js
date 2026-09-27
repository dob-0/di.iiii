'use strict';
// DMX INPUT — the spec checks. Byte layouts from Art-Net 4 (rev 1.4dp, 23/10/2025) and
// ANSI E1.31-2018, the sequence rule of E1.31 §6.7.2, the 2.5 s data-loss timeout of
// §6.7.1, priority, stream-terminated, Art-Net's two-source merge limit, HTP and LTP, and
// the desk's own rules (follow vs HTP with the desk, blackout wins, no echo). Then the
// same path over real UDP sockets on loopback, on ports of their own so a running desk
// on 6454/5568 is never disturbed.
// Run with: node serverXR/src/lighting/tests/test-dmxin.js

const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArtDmx, parseArtPoll, pollWantsUs, buildArtPollReply, buildArtPollReplies, buildArtDmx, buildArtPoll,
  parseE131, buildE131, sacnMulticast, sequenceAccept, InputMerger, sanitizeInputConfig,
  deskFromArtNet, deskFromSacn, OPT_TERMINATED, POLL_REPLY_LENGTH, ST_VISUAL, LOSS_MS,
} = require('../dmxin');
const { buildDmx } = require('../artnet');
const { buildPacket, cidFor } = require('../sacn');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
const frameOf = (pairs) => { const b = Buffer.alloc(512); for (const [ch, v] of pairs) b[ch - 1] = v; return b; };
const CID_A = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const CID_B = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');

// ---- Art-Net 4 ----------------------------------------------------------------------

check('ArtDmx: parses the desk\'s own builder (header 18 bytes, LE opcode, BE length)', () => {
  const p = parseArtDmx(buildDmx(0x0123, 9, frameOf([[1, 255], [512, 7]])));
  assert.strictEqual(p.portAddress, 0x0123);
  assert.strictEqual(p.sequence, 9);
  assert.strictEqual(p.length, 512);
  assert.strictEqual(p.data[0], 255);
  assert.strictEqual(p.data[511], 7);
  assert.strictEqual(p.protVer, 14);
});

check('ArtDmx: Port-Address = Net(7) : SubUni(8) — byte 14 low, byte 15 high & 0x7f', () => {
  const b = buildArtDmx(0, 1, Buffer.alloc(2));
  b[14] = 0x34; b[15] = 0x92;     // top bit of Net must be ignored
  assert.strictEqual(parseArtDmx(b).portAddress, 0x1234);
});

check('ArtDmx: refuses length 0, > 512, and a length longer than the datagram', () => {
  const b = buildArtDmx(0, 1, Buffer.alloc(4));
  b[16] = 0; b[17] = 0; assert.strictEqual(parseArtDmx(b), null);
  b[16] = 0x02; b[17] = 0x02; assert.strictEqual(parseArtDmx(b), null);
  b[16] = 0; b[17] = 64; assert.strictEqual(parseArtDmx(b), null);
  assert.strictEqual(parseArtDmx(Buffer.from('Art-Net\0')), null);
  assert.strictEqual(parseArtDmx(Buffer.from('not art-net at all, not at all')), null);
});

check('ArtDmx: a short frame (2 slots) is accepted as 2 slots', () => {
  const p = parseArtDmx(buildArtDmx(3, 0, Buffer.from([10, 20])));
  assert.strictEqual(p.length, 2);
  assert.deepStrictEqual([...p.data], [10, 20]);
});

check('ArtPoll: 14-byte minimum, missing fields read as zero; targeted mode is bit 5', () => {
  const min = buildArtPoll().subarray(0, 14);
  const p = parseArtPoll(min);
  assert.strictEqual(p.targeted, false);
  assert.strictEqual(p.targetTop, 0);
  assert.strictEqual(parseArtPoll(buildArtPoll().subarray(0, 13)), null);
  const t = parseArtPoll(buildArtPoll({ flags: 0x20, top: 10, bottom: 5 }));
  assert.strictEqual(t.targeted, true);
  assert.strictEqual(t.targetTop, 10);
  assert.strictEqual(t.targetBottom, 5);
  assert.strictEqual(pollWantsUs(t, [4]), false);
  assert.strictEqual(pollWantsUs(t, [5]), true, 'inclusive bottom');
  assert.strictEqual(pollWantsUs(t, [10]), true, 'inclusive top');
  assert.strictEqual(pollWantsUs(p, []), true, 'untargeted always answers');
});

check('ArtPollReply: every field at its Art-Net 4 offset', () => {
  const r = buildArtPollReply({
    ip: '192.168.88.231', portAddresses: [0x0120, 0x0121, 0x0123], shortName: 'di visual',
    longName: 'di.iiii lighting desk (visualiser)', report: '#0001 [0001] ok',
    active: [0x0121], mergingLtp: [0x0123], merging: [0x0123], mac: [1, 2, 3, 4, 5, 6], bindIndex: 2,
  });
  assert.strictEqual(r.length, POLL_REPLY_LENGTH);
  assert.strictEqual(r.toString('latin1', 0, 8), 'Art-Net\0');
  assert.strictEqual(r.readUInt16LE(8), 0x2100, 'OpPollReply, low byte first');
  assert.deepStrictEqual([...r.subarray(10, 14)], [192, 168, 88, 231], 'IP, MSB first');
  assert.strictEqual(r.readUInt16LE(14), 0x1936, 'Port 6454, low byte first');
  assert.strictEqual(r[18], 0x01, 'NetSwitch = bits 14-8');
  assert.strictEqual(r[19], 0x02, 'SubSwitch = bits 7-4');
  assert.strictEqual(r.readUInt16BE(20), 0x00ff, 'OEM unknown');
  assert.strictEqual(r.toString('latin1', 26, 35), 'di visual');
  assert.strictEqual(r[26 + 17], 0, 'PortName null-terminated within 18');
  assert.strictEqual(r.toString('latin1', 44, 44 + 34), 'di.iiii lighting desk (visualiser)');
  assert.strictEqual(r.toString('latin1', 108, 108 + 15), '#0001 [0001] ok');
  assert.strictEqual(r.readUInt16BE(172), 3, 'NumPorts');
  assert.deepStrictEqual([...r.subarray(174, 178)], [0x80, 0x80, 0x80, 0], 'PortTypes: output from Art-Net, DMX512');
  assert.deepStrictEqual([...r.subarray(182, 186)], [0x00, 0x80, 0x0a, 0], 'GoodOutputA: data / merging+LTP');
  assert.deepStrictEqual([...r.subarray(190, 194)], [0x0, 0x1, 0x3, 0], 'SwOut = low nibble');
  assert.strictEqual(r[194], 100, 'AcnPriority');
  assert.strictEqual(r[200], ST_VISUAL, 'Style = StVisual (0x06)');
  assert.deepStrictEqual([...r.subarray(201, 207)], [1, 2, 3, 4, 5, 6], 'MAC');
  assert.deepStrictEqual([...r.subarray(207, 211)], [192, 168, 88, 231], 'BindIp');
  assert.strictEqual(r[211], 2, 'BindIndex');
  assert.ok(r[212] & 0x08, 'Status2 bit 3: 15-bit Port-Address');
  assert.strictEqual(r.readUInt16BE(226), 44, 'RefreshRate 44 Hz');
});

check('ArtPollReply: the desk\'s own discovery parser reads our reply back (round trip)', () => {
  // artnet.js parsePollReply is not exported; the same fields by hand, as it reads them.
  const r = buildArtPollReply({ ip: '10.0.0.9', portAddresses: [0x0005], shortName: 'x', longName: 'y' });
  const net = r[18], sub = r[19], swOut = r[190];
  assert.strictEqual(((net & 0x7f) << 8) | ((sub & 0x0f) << 4) | (swOut & 0x0f), 5);
});

check('ArtPollReply pages: 4 ports a page, one page per Net:Sub-Net, BindIndex 1..n', () => {
  const pages = buildArtPollReplies({ ip: '10.0.0.1', portAddresses: [0, 1, 2, 3, 4, 0x10, 0x100], shortName: 'a', longName: 'b' });
  assert.strictEqual(pages.length, 4);
  assert.deepStrictEqual(pages.map((p) => p.readUInt16BE(172)), [4, 1, 1, 1]);
  assert.deepStrictEqual(pages.map((p) => p[211]), [1, 2, 3, 4]);
  assert.deepStrictEqual(pages.map((p) => [p[18], p[19]]), [[0, 0], [0, 0], [0, 1], [1, 0]]);
  assert.strictEqual(buildArtPollReplies({ ip: '10.0.0.1', portAddresses: [], shortName: 'a', longName: 'b' }).length, 1, 'a node with nothing listened to still answers');
});

// ---- sACN / E1.31-2018 --------------------------------------------------------------

check('E1.31: parses the desk\'s own sacn.js output packet (root / framing / DMP layers)', () => {
  const cid = cidFor('test source');
  const pkt = buildPacket({ cid, sourceName: 'grandMA3', universe: 7, priority: 150, sequence: 42, data: frameOf([[1, 200], [512, 9]]) });
  const p = parseE131(pkt);
  assert.strictEqual(p.kind, 'data');
  assert.strictEqual(p.universe, 7);
  assert.strictEqual(p.priority, 150);
  assert.strictEqual(p.sequence, 42);
  assert.strictEqual(p.sourceName, 'grandMA3');
  assert.strictEqual(p.startCode, 0);
  assert.strictEqual(p.data.length, 512);
  assert.strictEqual(p.data[0], 200);
  assert.strictEqual(p.data[511], 9);
  assert.strictEqual(p.terminated, false);
  assert.strictEqual(p.cid, cid.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'));
});

check('E1.31: builder byte layout — offsets of Table 4-1', () => {
  const b = buildE131({ cid: CID_A, sourceName: 'S', universe: 0x0102, priority: 99, sequence: 5, data: Buffer.alloc(512), options: OPT_TERMINATED });
  assert.strictEqual(b.length, 638);
  assert.strictEqual(b.readUInt16BE(0), 0x0010, 'preamble');
  assert.strictEqual(b.toString('latin1', 4, 13), 'ASC-E1.17');
  assert.strictEqual(b.readUInt16BE(16), 0x7000 | 622, 'root flags & length');
  assert.strictEqual(b.readUInt32BE(18), 4, 'VECTOR_ROOT_E131_DATA');
  assert.strictEqual(b.readUInt16BE(38), 0x7000 | 600, 'framing flags & length');
  assert.strictEqual(b.readUInt32BE(40), 2, 'VECTOR_E131_DATA_PACKET');
  assert.strictEqual(b[108], 99);
  assert.strictEqual(b[111], 5);
  assert.strictEqual(b[112], 0x40);
  assert.strictEqual(b.readUInt16BE(113), 0x0102);
  assert.strictEqual(b.readUInt16BE(115), 0x7000 | 523, 'DMP flags & length');
  assert.strictEqual(b[117], 0x02);
  assert.strictEqual(b[118], 0xa1);
  assert.strictEqual(b.readUInt16BE(123), 513);
});

check('E1.31: each "receivers shall discard" rule refuses the packet, and says which', () => {
  const good = () => buildE131({ cid: CID_A, universe: 1, data: Buffer.alloc(512) });
  const cases = [
    ['preamble', (b) => b.writeUInt16BE(0x0011, 0)],
    ['acn-pid', (b) => { b[4] = 0x42; }],
    ['root-vector', (b) => b.writeUInt32BE(3, 18)],
    ['framing-vector', (b) => b.writeUInt32BE(1, 40)],
    ['universe', (b) => b.writeUInt16BE(0, 113)],
    ['universe', (b) => b.writeUInt16BE(64000, 113)],
    ['dmp-vector', (b) => { b[117] = 1; }],
    ['address-type', (b) => { b[118] = 0xa2; }],
    ['first-address', (b) => b.writeUInt16BE(1, 119)],
    ['increment', (b) => b.writeUInt16BE(2, 121)],
    ['count', (b) => b.writeUInt16BE(514, 123)],
  ];
  for (const [reason, spoil] of cases) {
    const b = good(); spoil(b);
    const why = {};
    assert.strictEqual(parseE131(b, why), null, reason);
    assert.strictEqual(why.reason, reason);
  }
  assert.strictEqual(parseE131(good()).kind, 'data');
});

check('E1.31: a priority over 200 is clamped, not allowed to outrank every lawful source', () => {
  const b = buildE131({ cid: CID_A, universe: 1, priority: 255 });
  assert.strictEqual(parseE131(b).priority, 200);
});

check('E1.31: fewer than 512 slots (count 1..513) parse to that many slots', () => {
  const p = parseE131(buildE131({ cid: CID_A, universe: 1, data: Buffer.from([1, 2, 3]) }));
  assert.strictEqual(p.data.length, 3);
});

check('E1.31: extended root vector (sync / discovery) is recognised and not acted on', () => {
  const b = buildE131({ cid: CID_A, universe: 1 });
  b.writeUInt32BE(8, 18);
  assert.strictEqual(parseE131(b).kind, 'other');
});

check('E1.31 §9.3.1: multicast group 239.255.hi.lo', () => {
  assert.strictEqual(sacnMulticast(1), '239.255.0.1');
  assert.strictEqual(sacnMulticast(256), '239.255.1.0');
  assert.strictEqual(sacnMulticast(63999), '239.255.249.255');
});

// ---- sequence §6.7.2 ----------------------------------------------------------------

check('E1.31 §6.7.2: B-A in (-20, 0] is discarded; everything else taken', () => {
  assert.strictEqual(sequenceAccept(null, 7), true, 'first packet');
  assert.strictEqual(sequenceAccept(10, 11), true);
  assert.strictEqual(sequenceAccept(10, 10), false, 'duplicate: 0');
  assert.strictEqual(sequenceAccept(10, 9), false, '-1');
  assert.strictEqual(sequenceAccept(30, 11), false, '-19');
  assert.strictEqual(sequenceAccept(30, 10), true, '-20 is a reset: taken');
  assert.strictEqual(sequenceAccept(255, 0), true, 'wrap 255 -> 0 is +1');
  assert.strictEqual(sequenceAccept(0, 255), false, '0 -> 255 is -1');
  assert.strictEqual(sequenceAccept(5, 250), false, '-11 across the wrap');
  assert.strictEqual(sequenceAccept(100, 227), true, '+127');
});

// ---- the merge ----------------------------------------------------------------------

const cfg = (lines, more = {}) => ({ enabled: true, artnet: true, sacn: true, interfaces: ['127.0.0.1'], universes: lines, ...more });
const sacnPkt = (o) => ({ protocol: 'sacn', universe: 0, key: 'sacn:' + (o.cid || 'a'), name: o.name || 'A', ip: '10.0.0.1', priority: 100, sequence: 1, data: Buffer.alloc(512), terminated: false, preview: false, ...o });
const artPkt = (o) => ({ protocol: 'artnet', universe: 0, key: 'artnet:' + (o.ip || '10.0.0.1') + ':0', name: null, ip: '10.0.0.1', priority: null, sequence: 0, data: Buffer.alloc(512), terminated: false, preview: false, ...o });

check('merge: off, or a universe not listened to, changes nothing — and the second is reported', () => {
  const m = new InputMerger(cfg([{ universe: 0 }], { enabled: false }));
  assert.strictEqual(m.feed(sacnPkt({}), 0), 'off');
  const n = new InputMerger(cfg([{ universe: 0 }]));
  assert.strictEqual(n.feed(sacnPkt({ universe: 4 }), 0), 'unlistened');
  assert.strictEqual(n.status(10).unlistened[0].universe, 4);
  assert.strictEqual(n.frame(4, 10), null);
});

check('merge: one source passes its frame through', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(sacnPkt({ data: frameOf([[1, 77]]) }), 0);
  const f = m.frame(0, 10);
  assert.strictEqual(f.data[0], 77);
  assert.strictEqual(f.state, 'live');
  assert.strictEqual(f.desk, 'follow');
});

check('merge: out-of-sequence packets are dropped per source', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(sacnPkt({ sequence: 50, data: frameOf([[1, 1]]) }), 0);
  assert.strictEqual(m.feed(sacnPkt({ sequence: 49, data: frameOf([[1, 99]]) }), 1), 'out-of-sequence');
  assert.strictEqual(m.frame(0, 2).data[0], 1);
  assert.strictEqual(m.feed(sacnPkt({ sequence: 51, data: frameOf([[1, 2]]) }), 3), 'ok');
  // another source has its own counter
  assert.strictEqual(m.feed(sacnPkt({ cid: 'b', sequence: 10 }), 4), 'ok');
  assert.strictEqual(m.stats.outOfSequence, 1);
});

check('merge: Art-Net sequence 0 disables the check', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(artPkt({ sequence: 0 }), 0);
  assert.strictEqual(m.feed(artPkt({ sequence: 0 }), 1), 'ok');
  m.feed(artPkt({ sequence: 9 }), 2);
  assert.strictEqual(m.feed(artPkt({ sequence: 8 }), 3), 'out-of-sequence');
});

check('merge: highest priority wins outright; a lower one is ignored until the higher goes', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(sacnPkt({ cid: 'hi', priority: 150, data: frameOf([[1, 10]]) }), 0);
  m.feed(sacnPkt({ cid: 'lo', priority: 100, data: frameOf([[1, 250], [2, 250]]) }), 0);
  assert.deepStrictEqual([...m.frame(0, 10).data.subarray(0, 2)], [10, 0], 'HTP does not cross priorities');
  // The high source falls silent: 2.5 s later the low one is the universe.
  m.feed(sacnPkt({ cid: 'lo', priority: 100, sequence: 2, data: frameOf([[1, 250], [2, 250]]) }), 2400);
  assert.strictEqual(m.frame(0, 2499).data[0], 10, 'still inside 2.5 s');
  assert.strictEqual(m.frame(0, 2501).data[0], 250, 'after E1.31 network data loss');
});

check('merge: HTP between equal-priority sources, slot by slot', () => {
  const m = new InputMerger(cfg([{ universe: 0, merge: 'htp' }]));
  m.feed(sacnPkt({ cid: 'a', data: frameOf([[1, 10], [2, 200]]) }), 0);
  m.feed(sacnPkt({ cid: 'b', data: frameOf([[1, 90], [2, 20]]) }), 0);
  const f = m.frame(0, 1);
  assert.deepStrictEqual([...f.data.subarray(0, 2)], [90, 200]);
  assert.strictEqual(f.merging, true);
});

check('merge: LTP — each slot follows whichever source changed it last', () => {
  const m = new InputMerger(cfg([{ universe: 0, merge: 'ltp' }]));
  m.feed(sacnPkt({ cid: 'a', sequence: 1, data: frameOf([[1, 10], [2, 10]]) }), 0);
  m.feed(sacnPkt({ cid: 'b', sequence: 1, data: frameOf([[1, 20], [2, 20]]) }), 1);
  assert.deepStrictEqual([...m.frame(0, 2).data.subarray(0, 2)], [20, 20], 'b arrived last: whole frame');
  m.feed(sacnPkt({ cid: 'a', sequence: 2, data: frameOf([[1, 5], [2, 10]]) }), 3);   // a moves ch1 only
  assert.deepStrictEqual([...m.frame(0, 4).data.subarray(0, 2)], [5, 20], 'ch1 from a, ch2 still b');
  m.feed(sacnPkt({ cid: 'b', sequence: 2, data: frameOf([[1, 20], [2, 20]]) }), 5);   // b repeats: no change
  assert.deepStrictEqual([...m.frame(0, 6).data.subarray(0, 2)], [5, 20], 'a repeat is not a change');
});

check('merge: stream terminated (§6.2.6) drops the source at once, its data ignored', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(sacnPkt({ cid: 'a', data: frameOf([[1, 99]]) }), 0);
  assert.strictEqual(m.feed(sacnPkt({ cid: 'a', sequence: 2, terminated: true, data: frameOf([[1, 1]]) }), 5), 'terminated');
  assert.strictEqual(m.frame(0, 6), null, 'released at once, not after 2.5 s');
  const s = m.status(6).lines[0].sources[0];
  assert.strictEqual(s.lostWhy, 'terminated');
});

check('merge: preview data (§6.2.6 bit 7) never drives the output', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  assert.strictEqual(m.feed(sacnPkt({ preview: true, data: frameOf([[1, 99]]) }), 0), 'preview');
  assert.strictEqual(m.frame(0, 1), null);
});

check('merge: loss = release hands the universe back to the desk; hold keeps the last look', () => {
  const r = new InputMerger(cfg([{ universe: 0 }], { loss: 'release' }));
  r.feed(sacnPkt({ data: frameOf([[1, 40]]) }), 0);
  assert.strictEqual(r.frame(0, 2501), null);
  assert.strictEqual(r.status(2600).lines[0].state, 'lost');
  const h = new InputMerger(cfg([{ universe: 0 }], { loss: 'hold' }));
  h.feed(sacnPkt({ data: frameOf([[1, 40]]) }), 0);
  h.frame(0, 100);
  const f = h.frame(0, 3000);
  assert.strictEqual(f.state, 'held');
  assert.strictEqual(f.data[0], 40);
  h.release();
  assert.strictEqual(h.frame(0, 3001), null, 'release lets go of the held look');
});

check('merge: Art-Net times out at 10 s (the spec\'s merge hold), not 2.5 s', () => {
  assert.strictEqual(LOSS_MS.artnet, 10000);
  assert.strictEqual(LOSS_MS.sacn, 2500);
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(artPkt({ data: frameOf([[1, 3]]) }), 0);
  assert.ok(m.frame(0, 9999));
  assert.strictEqual(m.frame(0, 10001), null);
});

check('merge: Art-Net merges at most TWO sources; a third is refused and reported', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  assert.strictEqual(m.feed(artPkt({ ip: '10.0.0.1', data: frameOf([[1, 1]]) }), 0), 'ok');
  assert.strictEqual(m.feed(artPkt({ ip: '10.0.0.2', data: frameOf([[2, 2]]) }), 0), 'ok');
  assert.strictEqual(m.feed(artPkt({ ip: '10.0.0.3', data: frameOf([[3, 3]]) }), 0), 'exceeded');
  assert.deepStrictEqual([...m.frame(0, 1).data.subarray(0, 3)], [1, 2, 0]);
  assert.strictEqual(m.status(1).lines[0].exceeded.ip, '10.0.0.3');
  // when one of the two goes, the third may come in
  assert.strictEqual(m.feed(artPkt({ ip: '10.0.0.3', data: frameOf([[3, 3]]) }), 5000), 'exceeded');
  m.feed(artPkt({ ip: '10.0.0.1', sequence: 0, data: frameOf([[1, 1]]) }), 9000);
  assert.strictEqual(m.feed(artPkt({ ip: '10.0.0.3', data: frameOf([[3, 3]]) }), 10500), 'ok', '10.0.0.2 timed out');
});

check('merge: Art-Net stands at priority 100 against sACN', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  m.feed(artPkt({ data: frameOf([[1, 50]]) }), 0);
  m.feed(sacnPkt({ priority: 120, data: frameOf([[1, 5]]) }), 0);
  assert.strictEqual(m.frame(0, 1).data[0], 5, 'sACN at 120 beats Art-Net');
});

check('merge: status lists sources with name / ip / priority / fps / age', () => {
  const m = new InputMerger(cfg([{ universe: 0 }]));
  for (let i = 0; i < 44; i++) m.feed(sacnPkt({ sequence: i + 1, name: 'grandMA3 onPC' }), i * 22.7);
  const st = m.status(1000).lines[0];
  assert.strictEqual(st.sources[0].name, 'grandMA3 onPC');
  assert.strictEqual(st.sources[0].priority, 100);
  assert.ok(st.sources[0].fps >= 43 && st.sources[0].fps <= 44, 'fps ' + st.sources[0].fps);
  assert.strictEqual(st.sacn, 1, 'desk Universe 1 is sACN 1');
  assert.strictEqual(st.artnet, '0:0:0', 'and Art-Net 0:0:0');
  assert.strictEqual(st.state, 'live');
});

check('config: sanitised — off by default, bad universes and interfaces dropped', () => {
  const d = sanitizeInputConfig({});
  assert.strictEqual(d.enabled, false);
  assert.deepStrictEqual(d.universes, []);
  const c = sanitizeInputConfig({ enabled: 'yes', interfaces: ['1.2.3.4', 'x', '1.2.3.4'], universes: [{ universe: 2, merge: 'zzz', desk: 'htp' }, { universe: -1 }, { universe: 2 }, { universe: 99999 }], loss: 'bad' });
  assert.strictEqual(c.enabled, false, 'only true turns it on');
  assert.deepStrictEqual(c.interfaces, ['1.2.3.4']);
  assert.deepStrictEqual(c.universes, [{ universe: 2, merge: 'htp', desk: 'htp' }]);
  assert.strictEqual(c.loss, 'release');
});

check('numbering: desk Universe 1 = Art-Net 0:0:0 = sACN 1', () => {
  assert.strictEqual(deskFromArtNet(0), 0);
  assert.strictEqual(deskFromSacn(1), 0);
  assert.strictEqual(deskFromArtNet(0x8005), 5, 'bit 15 is not part of a Port-Address');
});

// ---- the desk: engine overlay, blackout, echo ---------------------------------------

check('desk: follow replaces the desk frame, htp takes the higher, blackout beats input', () => {
  const { createDesk } = require('../desk');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmxin-desk-'));
  const desk = createDesk({ dataDir: dir, offline: true, outputEnabledDefault: false, log: () => {} });
  try {
    const st = desk.state;
    st.raw['0:1'] = 100;   // the desk's own playback: ch1 at 100 on Universe 1
    st.raw['1:1'] = 100;   // and on Universe 2
    desk.engine.tick();
    const c = cfg([{ universe: 0, desk: 'follow' }, { universe: 1, desk: 'htp' }]);
    st.output.input = sanitizeInputConfig(c);
    desk.input.configure(st.output.input);
    const now = Date.now();
    desk.input.merger.feed(sacnPkt({ universe: 0, data: frameOf([[2, 50]]) }), now);
    desk.input.merger.feed(sacnPkt({ universe: 1, cid: 'z', data: frameOf([[1, 40], [2, 60]]) }), now);
    const out = desk.engine.toBuffers();
    assert.deepStrictEqual([...out.get(0).subarray(0, 2)], [0, 50], 'follow: console frame replaces desk');
    assert.deepStrictEqual([...out.get(1).subarray(0, 2)], [100, 60], 'htp: higher of desk and console');
    st.blackout = true;
    desk.engine.tick();
    const dark = desk.engine.toBuffers();
    assert.strictEqual(dark.get(0)[1], 0, 'blackout: input not applied');
    assert.strictEqual(dark.get(1)[1], 0);
    st.blackout = false;
    // a universe the desk has nothing on still appears (a lamp in the room can follow it)
    st.output.input = sanitizeInputConfig(cfg([{ universe: 5 }]));
    desk.input.configure(st.output.input);
    desk.input.merger.feed(sacnPkt({ universe: 5, cid: 'q', data: frameOf([[1, 9]]) }), Date.now());
    assert.strictEqual(desk.engine.toBuffers().get(5)[0], 9);
  } finally { desk.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- real sockets, loopback, private ports ------------------------------------------

async function sockets() {
  const { DmxInput } = require('../dmxin-net');
  const AP = 26454 + Math.floor(Math.random() * 500);
  const SP = 25568 + Math.floor(Math.random() * 500);
  const own = cidFor('di.iiii lighting desk').toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const inp = new DmxInput({ artnetPort: AP, sacnPort: SP, selfCids: () => [own] });
  inp.configure(cfg([{ universe: 0 }, { universe: 1, merge: 'ltp' }], { name: 'test visual' }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(150);
  const tx = dgram.createSocket('udp4');
  await new Promise((r) => tx.bind(0, '127.0.0.1', r));
  const send = (buf, port, host = '127.0.0.1') => new Promise((r) => tx.send(buf, port, host, r));
  try {
    await checkAsync('sockets: listening on loopback only, both protocols, no errors', async () => {
      const st = inp.status();
      assert.ok(st.listening.some((l) => l.protocol === 'artnet' && l.address === '127.0.0.1' && l.ok));
      assert.ok(st.listening.some((l) => l.protocol === 'sacn' && l.ok));
      assert.ok(!st.listening.some((l) => l.protocol === 'artnet' && l.address === '0.0.0.0'), 'never the Art-Net wildcard');
    });
    await checkAsync('sockets: ArtDmx over UDP reaches the merger', async () => {
      await send(buildArtDmx(0, 1, frameOf([[1, 123]])), AP);
      await wait(50);
      assert.strictEqual(inp.merger.frame(0, Date.now()).data[0], 123);
    });
    await checkAsync('sockets: E1.31 unicast reaches the merger (sACN 2 -> desk Universe 2)', async () => {
      await send(buildE131({ cid: CID_B, sourceName: 'onPC', universe: 2, sequence: 1, data: frameOf([[3, 33]]) }), SP);
      await wait(50);
      const f = inp.merger.frame(1, Date.now());
      assert.strictEqual(f.data[2], 33);
      assert.strictEqual(inp.status().lines[1].sources[0].name, 'onPC');
    });
    await checkAsync('sockets: our own sACN CID coming back is not a source', async () => {
      const before = inp.merger.stats.self;
      await send(buildE131({ cid: cidFor('di.iiii lighting desk'), universe: 1, sequence: 1 }), SP);
      await wait(50);
      assert.strictEqual(inp.merger.stats.self, before + 1);
    });
    await checkAsync('sockets: ArtPoll is answered with an ArtPollReply naming our ports', async () => {
      // The poller sits on 127.0.0.2 so it does not share 127.0.0.1:AP with the listener.
      const poller = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const got = new Promise((resolve, reject) => {
        poller.on('message', (msg) => { if (msg.readUInt16LE(8) === 0x2100) resolve(msg); });
        setTimeout(() => reject(new Error('no ArtPollReply within 1.5 s')), 1500);
      });
      await new Promise((r) => poller.bind(AP, '127.0.0.2', r));
      await new Promise((r) => poller.send(buildArtPoll(), AP, '127.0.0.1', r));
      const reply = await got.finally(() => poller.close());
      assert.strictEqual(reply.length, POLL_REPLY_LENGTH);
      assert.deepStrictEqual([...reply.subarray(10, 14)], [127, 0, 0, 1]);
      assert.strictEqual(reply.readUInt16BE(172), 2, 'two ports');
      assert.deepStrictEqual([...reply.subarray(190, 192)], [0, 1]);
      assert.strictEqual(reply.toString('latin1', 26, 37), 'test visual');
      assert.strictEqual(reply[200], ST_VISUAL);
    });
    await checkAsync('sockets: a source outside the chosen subnets is dropped and counted', async () => {
      // Only loopback is chosen; nothing from the LAN may pass. Send from the LAN address
      // to the sACN wildcard socket if this machine has one.
      const lan = require('../dmxin-net').inputInterfaces().find((i) => !i.internal);
      if (!lan) return;
      const s = dgram.createSocket('udp4');
      await new Promise((r) => s.bind(0, lan.address, r));
      const before = inp.foreign;
      await new Promise((r) => s.send(buildE131({ cid: CID_A, universe: 1, sequence: 1 }), SP, lan.address, r));
      await wait(80);
      s.close();
      assert.strictEqual(inp.foreign, before + 1);
    });
  } finally {
    tx.close();
    inp.close();
  }
}

sockets().then(() => {
  console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
  process.exit(failures ? 1 : 0);
});
