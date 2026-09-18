// Rig protocol 1 — the frozen core every di.iiii release speaks forever
// (docs/architecture/rig/PROTOCOL-1.md §2, §4, §5).
//
// Everything here is a READER first. A member of a newer release will send
// fields, features and nested objects this code has never heard of, and the
// promise of protocol 1 is that they are ignored, not refused. So each reader
// checks only the handful of things §2 says are required, fills §2.1's defaults
// for the rest, and returns a fresh object holding just the names it knows —
// the caller never touches the raw body again. `null` means "not a message of
// this kind at all"; the route decides what status that is.
const crypto = require('node:crypto')

const PROTOCOL = 1

const MAX_ID = 128
const MAX_TEXT = 256

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = MAX_TEXT) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null)
const finiteNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

// The core of every message: generation 1. A generation-2 body is a different
// shape by definition (§2), so it is not read as this one.
const isGeneration = (obj) => isObject(obj) && obj.rig === PROTOCOL

// §4 rule 3: a present-and-different kind is refused by the route; a missing
// kind is accepted. The readers stay neutral and let the route say it.
const kindMismatch = (obj, kind) => isObject(obj) && obj.kind !== undefined && obj.kind !== kind

// `{ id, name }` of a machine. The id is the only identity there is; a name is
// display, so a missing or odd one falls back to the id rather than refusing.
function readMachine(value) {
  if (!isObject(value)) return null
  const id = text(value.id, MAX_ID)
  if (!id) return null
  return { id, name: text(value.name, MAX_ID) || id }
}

// A feature table is kept whole for display (§4 rule 2) but only as
// name → value pairs of plain values; nested objects from the future are
// dropped here rather than stored in the member list unbounded.
function readFeatures(value) {
  const out = {}
  if (!isObject(value)) return out
  for (const [name, version] of Object.entries(value)) {
    if (name.length > MAX_ID) continue
    if (typeof version === 'number' || typeof version === 'string' || typeof version === 'boolean') {
      out[name] = version
    }
  }
  return out
}

// `room` null is the open room. A non-string room from a peer can't be
// compared honestly, so it reads as the open room rather than as an error.
const readRoom = (value) => text(value, MAX_TEXT)

// `defaults.port` is the port the request arrived on: §2.1's "http.port from
// the socket". A reader has no socket, so the route hands it in.
function readHello(obj, defaults = {}) {
  if (!isGeneration(obj)) return null
  const machine = readMachine(obj.machine)
  if (!machine) return null
  const http = isObject(obj.http) ? obj.http : {}
  const port = Number.isInteger(http.port) && http.port > 0 && http.port < 65536
    ? http.port
    : (Number.isInteger(defaults.port) ? defaults.port : null)
  return {
    rig: PROTOCOL,
    kind: 'hello',
    release: text(obj.release) || 'unknown',
    machine,
    // A part name from the future (a fourth part) is kept as written: display
    // only in step 1, and refusing it would lock a newer member out.
    part: text(obj.part, 64) || 'studio',
    room: readRoom(obj.room),
    // scheme + tls added 2026-09-16 (additive): a member serving https with a
    // certificate for a NAME is reached by address with that name as servername
    http: {
      port,
      base: text(http.base) || '/serverXR',
      scheme: http.scheme === 'https' ? 'https' : 'http',
      tls: text(http.tls, 253) || null
    },
    features: readFeatures(obj.features),
    sentAt: finiteNumber(obj.sentAt)
  }
}

function buildHello({ identity, release, part, room = null, port, base = '/serverXR', scheme = 'http', tls = null, features, now = Date.now } = {}) {
  return {
    rig: PROTOCOL,
    kind: 'hello',
    release: release || 'unknown',
    machine: { id: identity.id, name: identity.name || identity.id },
    part: part || 'studio',
    room: room || null,
    http: { port: port ?? null, base, scheme: scheme === 'https' ? 'https' : 'http', tls: tls || null },
    features: { ...(features || {}) },
    sentAt: typeof now === 'function' ? now() : now
  }
}

// A cue needs a name to be a cue. Everything else is optional: without an id
// the duplicate window simply can't apply, and args default to {}. An unknown
// NAME is still a valid cue — the sinks answer `unknown-cue`, not the reader.
function readCue(obj) {
  if (!isGeneration(obj)) return null
  const name = text(obj.name, MAX_ID)
  if (!name) return null
  return {
    rig: PROTOCOL,
    kind: 'cue',
    id: text(obj.id, MAX_ID),
    name,
    args: isObject(obj.args) ? obj.args : {},
    from: readMachine(obj.from),
    sentAt: finiteNumber(obj.sentAt)
  }
}

// `on` missing reads as true: a message whose kind is "blackout" and that says
// nothing else means black, and when in doubt a dark stage is the safe side.
// `on` of any non-boolean type is not a blackout we can act on honestly.
function readBlackout(obj) {
  if (!isGeneration(obj)) return null
  if (obj.on !== undefined && typeof obj.on !== 'boolean') return null
  return { on: obj.on === undefined ? true : obj.on, from: readMachine(obj.from) }
}

const toBuffer = (rawBody) => {
  if (Buffer.isBuffer(rawBody)) return rawBody
  if (rawBody == null) return Buffer.alloc(0)
  return Buffer.from(String(rawBody), 'utf8')
}

// §5: HMAC-SHA256 over the exact bytes that crossed the wire. Signing the
// re-serialised JSON would break the first time two releases order keys
// differently, which is exactly the situation this protocol lives in.
function sign(key, rawBody) {
  return crypto.createHmac('sha256', String(key)).update(toBuffer(rawBody)).digest('hex')
}

function verify(key, rawBody, sig) {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/i.test(sig)) return false
  const expected = Buffer.from(sign(key, rawBody), 'hex')
  const given = Buffer.from(sig, 'hex')
  // Lengths are equal by the regex above; timingSafeEqual would throw otherwise.
  return crypto.timingSafeEqual(expected, given)
}

module.exports = {
  PROTOCOL,
  readHello,
  buildHello,
  readCue,
  readBlackout,
  readMachine,
  kindMismatch,
  sign,
  verify
}
