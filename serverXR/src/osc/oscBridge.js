'use strict';
// OSC, the wire half: the UDP sockets that let a Nodes graph hear and speak OSC to the
// other machines of a show (TouchDesigner, Resolume, QLab, VCV Cardinal, a console).
// Every byte rule is in oscProtocol.js (pure, tested against the spec's examples); this
// file only binds, keeps what arrived, and sends.
//
// HEARING. A listener opens on a port when a page asks to read it (OSC In), and closes
// itself after IDLE_MS with nobody asking, so a deleted node frees its port. It binds the
// loopback (127.0.0.1) unless DI_ALLOW_LAN_DEVICES=1 (di up --lan), then every interface:
// the same rule as the desk's DMX input. It keeps the last KEEP messages, each numbered,
// so a page polling slower than the sender still sees every message since its last read.
//
// SPEAKING. One unbound UDP socket sends. A target must be an IPv4 address on this machine
// or a private network (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16) — the route that
// calls this is a door a page holds, and it must not become a UDP relay to the internet.

const dgram = require('dgram');
const { decodePacket, messagesOf, encodeMessage, isAddress, matchAddress } = require('./oscProtocol');

const IDLE_MS = 60000;
const KEEP = 64;
const MAX_LISTENERS = 8;
const MAX_ARGS = 64;
const RECV_BUFFER = 4 * 1024 * 1024;

const isPortNumber = (n, min = 1) => Number.isInteger(n) && n >= min && n <= 65535;

const PRIVATE_V4 = [
  [0x7f000000, 0xff000000], // 127/8
  [0x0a000000, 0xff000000], // 10/8
  [0xac100000, 0xfff00000], // 172.16/12
  [0xc0a80000, 0xffff0000], // 192.168/16
  [0xa9fe0000, 0xffff0000], // 169.254/16
];
function ipv4Number(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ''));
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts.reduce((n, p) => ((n << 8) | p) >>> 0, 0);
}
// Why a target is refused, in words, or null when it may be sent to.
function targetProblem(host) {
  const name = String(host || '').trim();
  if (!name) return 'no target host';
  const ip = name === 'localhost' ? '127.0.0.1' : name;
  const n = ipv4Number(ip);
  if (n === null) return `"${name}" is not an IPv4 address (write it as four numbers, like 192.168.1.20)`;
  if (!PRIVATE_V4.some(([net, mask]) => ((n & mask) >>> 0) === net)) return `${ip} is not on this machine or a private network`;
  if ((n & 0xff) === 255) return `${ip} is a broadcast address; name the one machine to send to`;
  return null;
}

// A received argument as JSON can carry it: blobs as base64, int64 beyond 2^53 as text.
const jsonArg = (a) => (Buffer.isBuffer(a.value) ? { type: a.type, value: a.value.toString('base64') } : a);

function createOscBridge({ lanAllowed = () => process.env.DI_ALLOW_LAN_DEVICES === '1', now = Date.now, log = () => {}, idleMs = IDLE_MS, keep = KEEP } = {}) {
  const listeners = new Map(); // port -> { socket, port, bind, ok, error, seq, messages, received, refused, lastRefusal, askedAt, ready }
  let sender = null;
  const sent = { messages: 0, bytes: 0, errors: 0, lastError: null };

  function listen(port) {
    if (!isPortNumber(port, 1024)) return Promise.resolve({ ok: false, port, error: 'a listen port is a whole number from 1024 to 65535' });
    const have = listeners.get(port);
    if (have) { have.askedAt = now(); return have.ready; }
    if (listeners.size >= MAX_LISTENERS) return Promise.resolve({ ok: false, port, error: `already listening on ${MAX_LISTENERS} ports; close one first` });
    const bind = lanAllowed() ? '0.0.0.0' : '127.0.0.1';
    const entry = { socket: null, port, bind, ok: false, error: null, seq: 0, messages: [], received: 0, refused: 0, lastRefusal: null, askedAt: now(), ready: null };
    const socket = dgram.createSocket('udp4');
    entry.socket = socket;
    socket.on('message', (msg, rinfo) => {
      let packet;
      try { packet = decodePacket(msg); } catch (error) {
        entry.refused++;
        entry.lastRefusal = { error: error.message, from: rinfo.address, at: now() };
        return;
      }
      for (const m of messagesOf(packet)) {
        entry.received++;
        entry.messages.push({ seq: ++entry.seq, address: m.address, args: m.args.map(jsonArg), from: rinfo.address, at: now() });
        if (entry.messages.length > keep) entry.messages.shift();
      }
    });
    entry.ready = new Promise((resolve) => {
      socket.once('error', (error) => {
        entry.ok = false;
        entry.error = error.code === 'EADDRINUSE' ? `port ${port} is already taken by another program on this machine` : error.message;
        log(`[osc] listen ${bind}:${port} — ${entry.error}`);
        try { socket.close(); } catch { /* never bound */ }
        // A failed port is forgotten, so the next ask tries again (the other program may have quit).
        if (listeners.get(port) === entry) listeners.delete(port);
        resolve(describe(entry));
      });
      socket.bind(port, bind, () => {
        entry.ok = true;
        // A sender in a burst (a whole cue list, a controller's snapshot) outruns the OS
        // default receive buffer (212992 bytes on Linux: ~256 small datagrams, measured by
        // scripts/osc/osc-loopback-rehearsal.mjs). Ask for 4 MB; the OS caps it at its own max.
        try { socket.setRecvBufferSize(RECV_BUFFER); } catch { /* the default stands */ }
        entry.recvBuffer = (() => { try { return socket.getRecvBufferSize(); } catch { return null; } })();
        resolve(describe(entry));
      });
    });
    listeners.set(port, entry);
    return entry.ready;
  }

  function describe(e) {
    return { ok: e.ok, port: e.port, bind: e.bind, recvBuffer: e.recvBuffer ?? null, error: e.error, received: e.received, refused: e.refused, lastRefusal: e.lastRefusal, seq: e.seq };
  }

  // What arrived on `port` after message number `since`, filtered by an OSC address
  // pattern. A reader that has fallen more than KEEP messages behind is told how many it
  // missed, never handed a silent gap.
  function read(port, { pattern = '', since = 0 } = {}) {
    const e = listeners.get(port);
    if (!e) return { ok: false, listening: false, port, error: 'not listening on this port', messages: [], seq: 0 };
    e.askedAt = now();
    const after = Number.isFinite(Number(since)) ? Number(since) : 0;
    const fresh = e.messages.filter((m) => m.seq > after);
    const oldest = e.messages.length ? e.messages[0].seq : e.seq + 1;
    const missed = after > 0 && after < oldest - 1 ? oldest - 1 - after : 0;
    return { ...describe(e), listening: e.ok, missed, messages: fresh.filter((m) => matchAddress(pattern, m.address)) };
  }

  async function send({ host, port, address, args = [], numbers = 'float' } = {}) {
    const problem = targetProblem(host);
    if (problem) return { ok: false, error: problem };
    if (!isPortNumber(Number(port))) return { ok: false, error: 'a target port is a whole number from 1 to 65535' };
    if (!isAddress(address)) return { ok: false, error: `not an OSC address: ${JSON.stringify(address)} (it starts with / and holds no space or #)` };
    const list = Array.isArray(args) ? args : [args];
    if (list.length > MAX_ARGS) return { ok: false, error: `at most ${MAX_ARGS} arguments in one message` };
    let packet;
    try { packet = encodeMessage(address, list, { numbers: numbers === 'int' ? 'int' : 'float' }); } catch (error) { return { ok: false, error: error.message }; }
    if (!sender) {
      sender = dgram.createSocket('udp4');
      sender.on('error', (error) => { sent.errors++; sent.lastError = error.message; });
    }
    const ip = String(host).trim() === 'localhost' ? '127.0.0.1' : String(host).trim();
    return new Promise((resolve) => {
      sender.send(packet, Number(port), ip, (error) => {
        if (error) { sent.errors++; sent.lastError = error.message; resolve({ ok: false, error: error.message }); return; }
        sent.messages++;
        sent.bytes += packet.length;
        resolve({ ok: true, bytes: packet.length, to: `${ip}:${Number(port)}` });
      });
    });
  }

  // Close every listener nobody has asked about for idleMs.
  function sweep() {
    const t = now();
    for (const [port, e] of listeners) {
      if (t - e.askedAt > idleMs) { try { e.socket.close(); } catch { /* closed */ } listeners.delete(port); }
    }
  }
  const timer = setInterval(sweep, Math.min(idleMs, 10000));
  if (timer.unref) timer.unref();

  function state() {
    return { lanAllowed: lanAllowed(), listeners: [...listeners.values()].map(describe), sent: { ...sent } };
  }

  function close() {
    clearInterval(timer);
    for (const e of listeners.values()) { try { e.socket.close(); } catch { /* closed */ } }
    listeners.clear();
    if (sender) { try { sender.close(); } catch { /* closed */ } sender = null; }
  }

  return { listen, read, send, sweep, state, close };
}

module.exports = { createOscBridge, targetProblem, IDLE_MS, KEEP, MAX_LISTENERS };
