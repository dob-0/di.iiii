'use strict';
// OSC 1.0 — the packet layer, PURE: encode and decode messages, decode bundles, match
// address patterns. No sockets, no clock. The sockets live in oscBridge.js.
//
// Written from the specification, the way laser/lasercubeProtocol.js was written from its
// spec: "The Open Sound Control 1.0 Specification", Matt Wright, CNMAT, UC Berkeley, 2002
// (opensoundcontrol.org/spec-1_0). The sections this follows, by their headings there:
//   Atomic Data Types — int32 and float32 big-endian; OSC-string = ASCII + 1 to 4 NULs to
//     a multiple of 4 bytes; OSC-blob = int32 size, the bytes, 0 to 3 NULs to a multiple
//     of 4. Every size in a packet is a multiple of 4.
//   OSC Packets / OSC Messages — Address Pattern, OSC Type Tag String (begins with ','),
//     then the arguments, in the order of the tags.
//   OSC Type Tag String — i f s b are the standard tags. "Nonstandard" tags the spec lists
//     and that this decodes, because senders use them: h (int64), d (float64), T F N I
//     (True, False, Nil, Infinitum: no argument bytes). A tag it does not know stops the
//     decode (its size is unknown, so nothing after it can be read).
//   OSC Bundles — "#bundle", an OSC Time Tag (64-bit NTP), then elements, each an int32
//     size and that many bytes of a message or a bundle.
//   OSC Message Dispatching and Pattern Matching — ? * [chars] [!chars] [a-z] {a,b}.
//
// Values arrive as { type, value }: the type is the tag, so a receiver can tell an int 1
// from a float 1.0 (QLab and TouchDesigner treat them differently).

const BUNDLE_TAG = '#bundle';
// The characters the spec forbids in an OSC Method name (the parts of an address):
// ' ' # * , / ? [ ] { }. In a PATTERN, * , ? [ ] { } and ! - carry meaning; # and space
// are never allowed.
const ADDRESS_FORBIDDEN = /[\s#]/;

const pad4 = (n) => (n + 3) & ~3;

// OSC-string: the bytes, then at least one NUL, to a multiple of 4.
function encodeString(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  const out = Buffer.alloc(pad4(bytes.length + 1));
  bytes.copy(out, 0);
  return out;
}

function readString(buf, at) {
  let end = at;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) throw new Error(`OSC-string at byte ${at} has no NUL terminator`);
  const next = pad4(end + 1);
  if (next > buf.length) throw new Error(`OSC-string at byte ${at} runs past the packet`);
  return { value: buf.toString('utf8', at, end), next };
}

function isAddress(text) {
  return typeof text === 'string' && text.length > 1 && text[0] === '/' && !ADDRESS_FORBIDDEN.test(text);
}

// A plain JS value as one OSC argument. Numbers go as float32 unless asked for int32:
// an LFO that passes through exactly 1 must not flip a receiver's type between frames.
function toArgument(value, { numbers = 'float' } = {}) {
  if (value && typeof value === 'object' && typeof value.type === 'string' && 'value' in value) return value;
  if (typeof value === 'boolean') return { type: value ? 'T' : 'F', value };
  if (value === null || value === undefined) return { type: 'N', value: null };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value > 0 ? { type: 'I', value: Infinity } : { type: 'N', value: null };
    return numbers === 'int' ? { type: 'i', value: Math.round(value) } : { type: 'f', value };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { type: 'b', value: Buffer.from(value) };
  return { type: 's', value: String(value) };
}

function encodeArgument({ type, value }) {
  switch (type) {
    case 'i': {
      const b = Buffer.alloc(4);
      // int32 wraps like the wire does; a value outside the range is the sender's choice.
      b.writeInt32BE(Number(value) | 0, 0);
      return b;
    }
    case 'f': { const b = Buffer.alloc(4); b.writeFloatBE(Number(value), 0); return b; }
    case 'd': { const b = Buffer.alloc(8); b.writeDoubleBE(Number(value), 0); return b; }
    case 'h': { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(value), 0); return b; }
    case 's': return encodeString(value);
    case 'b': {
      const bytes = Buffer.from(value);
      const out = Buffer.alloc(4 + pad4(bytes.length));
      out.writeInt32BE(bytes.length, 0);
      bytes.copy(out, 4);
      return out;
    }
    case 'T': case 'F': case 'N': case 'I': return Buffer.alloc(0);
    default: throw new Error(`OSC type tag '${type}' cannot be encoded`);
  }
}

// One OSC Message: address, type tags, arguments. `args` is an array of plain values or
// { type, value } pairs.
function encodeMessage(address, args = [], options = {}) {
  if (!isAddress(address)) throw new Error(`not an OSC address: ${JSON.stringify(address)} (must start with / and hold no space or #)`);
  const list = (Array.isArray(args) ? args : [args]).map((a) => toArgument(a, options));
  return Buffer.concat([
    encodeString(address),
    encodeString(',' + list.map((a) => a.type).join('')),
    ...list.map(encodeArgument),
  ]);
}

function readArgument(buf, at, tag) {
  const need = (n) => { if (at + n > buf.length) throw new Error(`argument '${tag}' at byte ${at} runs past the packet`); };
  switch (tag) {
    case 'i': need(4); return { value: buf.readInt32BE(at), next: at + 4 };
    case 'f': need(4); return { value: buf.readFloatBE(at), next: at + 4 };
    case 'd': need(8); return { value: buf.readDoubleBE(at), next: at + 8 };
    case 'h': {
      need(8);
      const big = buf.readBigInt64BE(at);
      // A safe integer stays a number; beyond that the exact value is kept as a string.
      const value = big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big.toString();
      return { value, next: at + 8 };
    }
    case 's': case 'S': return readString(buf, at);
    case 'c': need(4); return { value: String.fromCharCode(buf.readUInt32BE(at)), next: at + 4 };
    case 'r': need(4); return { value: buf.readUInt32BE(at), next: at + 4 };
    case 'm': need(4); return { value: [...buf.subarray(at, at + 4)], next: at + 4 };
    case 't': need(8); return { value: timeTag(buf, at), next: at + 8 };
    case 'b': {
      need(4);
      const size = buf.readInt32BE(at);
      if (size < 0 || at + 4 + size > buf.length) throw new Error(`OSC-blob at byte ${at} claims ${size} bytes the packet does not hold`);
      return { value: Buffer.from(buf.subarray(at + 4, at + 4 + size)), next: at + 4 + pad4(size) };
    }
    case 'T': return { value: true, next: at };
    case 'F': return { value: false, next: at };
    case 'N': return { value: null, next: at };
    case 'I': return { value: Infinity, next: at };
    default: throw new Error(`OSC type tag '${tag}' is not one this decoder knows; the rest of the message cannot be read`);
  }
}

function timeTag(buf, at) {
  const seconds = buf.readUInt32BE(at);
  const fraction = buf.readUInt32BE(at + 4);
  // "The time tag value consisting of 63 zero bits followed by a one in the least
  // significant bit is a special case meaning 'immediately.'"
  return { seconds, fraction, immediately: seconds === 0 && fraction === 1 };
}

function decodeMessage(buf) {
  const address = readString(buf, 0);
  if (address.value[0] !== '/') throw new Error(`an OSC message starts with '/', this one with ${JSON.stringify(address.value.slice(0, 16))}`);
  // "Note: some older implementations of OSC may omit the OSC Type Tag string. Until all
  // such implementations are updated, OSC implementations should be robust in the case of
  // a missing OSC Type Tag String." — no tags: no arguments read.
  if (address.next >= buf.length) return { address: address.value, args: [] };
  const tags = readString(buf, address.next);
  if (tags.value[0] !== ',') return { address: address.value, args: [], untagged: true };
  const args = [];
  let at = tags.next;
  for (const tag of tags.value.slice(1)) {
    // Arrays ([ ]) carry no bytes of their own; their members are read in line.
    if (tag === '[' || tag === ']') continue;
    const r = readArgument(buf, at, tag);
    args.push({ type: tag, value: r.value });
    at = r.next;
  }
  return { address: address.value, args };
}

// A packet is a message or a bundle. A bundle comes back as { bundle: true, timeTag,
// elements } (elements may be bundles again); depth is capped so a hostile packet cannot
// recurse the stack away.
function decodePacket(buf, depth = 0) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length === 0 || buf.length % 4 !== 0) throw new Error(`an OSC packet is a multiple of 4 bytes; this one is ${buf.length}`);
  if (buf[0] === 0x23) {
    const head = readString(buf, 0);
    if (head.value !== BUNDLE_TAG) throw new Error('a packet starting with # must be a #bundle');
    if (depth > 8) throw new Error('bundles nested deeper than 8');
    if (head.next + 8 > buf.length) throw new Error('a #bundle without its time tag');
    const elements = [];
    let at = head.next + 8;
    while (at < buf.length) {
      if (at + 4 > buf.length) throw new Error(`bundle element size at byte ${at} runs past the packet`);
      const size = buf.readInt32BE(at);
      if (size <= 0 || size % 4 !== 0 || at + 4 + size > buf.length) throw new Error(`bundle element at byte ${at} has a bad size (${size})`);
      elements.push(decodePacket(buf.subarray(at + 4, at + 4 + size), depth + 1));
      at += 4 + size;
    }
    return { bundle: true, timeTag: timeTag(buf, head.next), elements };
  }
  return decodeMessage(buf);
}

// Every message a packet holds, bundles opened, in order.
function messagesOf(packet) {
  if (!packet) return [];
  if (!packet.bundle) return [packet];
  return packet.elements.flatMap(messagesOf);
}

// A bundle of messages, sent "immediately" (time tag 1). Used by tests and the rehearsal
// to prove the decoder opens what a sender like TouchDesigner sends.
function encodeBundle(elements, { seconds = 0, fraction = 1 } = {}) {
  const tt = Buffer.alloc(8);
  tt.writeUInt32BE(seconds >>> 0, 0);
  tt.writeUInt32BE(fraction >>> 0, 4);
  const parts = [encodeString(BUNDLE_TAG), tt];
  for (const el of elements) {
    const size = Buffer.alloc(4);
    size.writeInt32BE(el.length, 0);
    parts.push(size, el);
  }
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------------------

// One part of a pattern against one part of an address. The rules, from the spec:
//   ?  any single character        *  any sequence of zero or more characters
//   [string] any character in it; a - between two characters is the range between them
//   (a - at the start or end is itself); a ! first negates the set
//   {foo,bar} any of the comma-separated strings
//   anything else matches itself.
// Iterative backtracking on *, so a long pattern cannot blow up exponentially.
function matchPart(pattern, text) {
  // Expand braces first: {a,b}c → [ac, bc]; small and bounded by the pattern's own size.
  const open = pattern.indexOf('{');
  if (open >= 0) {
    const close = pattern.indexOf('}', open);
    if (close < 0) return false;
    const head = pattern.slice(0, open);
    const tail = pattern.slice(close + 1);
    return pattern.slice(open + 1, close).split(',').some((alt) => matchPart(head + alt + tail, text));
  }
  let p = 0, t = 0, starP = -1, starT = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') { starP = p++; starT = t; continue; }
    if (p < pattern.length) {
      const step = matchOne(pattern, p, text[t]);
      if (step) { p = step; t++; continue; }
    }
    if (starP >= 0) { p = starP + 1; t = ++starT; continue; }
    return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

// Does pattern[p] (a ?, a [set] or a literal) match ch? Returns the index after it, or 0.
function matchOne(pattern, p, ch) {
  const c = pattern[p];
  if (c === '?') return p + 1;
  if (c === '[') {
    const end = pattern.indexOf(']', p + 1);
    if (end < 0) return c === ch ? p + 1 : 0;
    let body = pattern.slice(p + 1, end);
    let negate = false;
    if (body[0] === '!') { negate = true; body = body.slice(1); }
    let hit = false;
    for (let i = 0; i < body.length; i++) {
      if (body[i + 1] === '-' && i + 2 < body.length) {
        if (ch >= body[i] && ch <= body[i + 2]) hit = true;
        i += 2;
      } else if (body[i] === ch) hit = true;
    }
    return hit !== negate ? end + 1 : 0;
  }
  return c === ch ? p + 1 : 0;
}

// An OSC Address Pattern against an OSC Address, part by part ('/' never matches inside
// a part, as the spec dispatches by container). An empty pattern matches everything.
// Bounded: a pattern over 256 characters or with more than 4 {…} groups matches nothing
// (brace alternatives multiply, and a pattern comes from a wire).
const MAX_PATTERN = 256;
const MAX_BRACES = 4;
function matchAddress(pattern, address) {
  if (!pattern) return true;
  if (typeof address !== 'string') return false;
  if (pattern.length > MAX_PATTERN || (pattern.match(/\{/g) || []).length > MAX_BRACES) return false;
  const pp = pattern.split('/');
  const ap = address.split('/');
  if (pp.length !== ap.length) return false;
  for (let i = 0; i < pp.length; i++) if (!matchPart(pp[i], ap[i])) return false;
  return true;
}

module.exports = {
  BUNDLE_TAG,
  encodeString, encodeMessage, encodeBundle, toArgument,
  decodeMessage, decodePacket, messagesOf,
  isAddress, matchAddress,
};
