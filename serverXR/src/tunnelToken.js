// The tunnel token — serverXR's half. A crossing continues into a private
// Telegram thread with di.bo; this mints the link that says WHICH crossing is
// arriving. The protocol and the byte layout live in the di-bo repo, as
// the-tunnel.md and a shared vector, tunnel-vector.json, that BOTH
// implementations assert against.
//
// Why a shared vector and not just matching code: this is the third protocol on
// this estate with two implementations, and the first two both drifted silently
// while every test on both sides passed — each side asserted only that it agreed
// with itself. tunnelToken.test.js reproduces the vector byte for byte, so a
// change here fails there rather than at the end of someone's ritual.
//
// DETERMINISTIC, not random: the signature IS the binding, which is why there is
// no token table, no TTL sweep, and nothing for the two halves to get out of
// sync about. di.bo verifies statelessly and enforces single-use itself, being
// the only party that needs to know whether a token has been spent.

const crypto = require('node:crypto')

const VERSION = 1
const HEAD_BYTES = 21          // 1 version + 16 inscription + 4 expiry
const TOKEN_BYTES = 37         // + 16 mac
const TOKEN_CHARS = 50         // base64url of 37 bytes; Telegram caps ?start= at 64
const TTL_MINUTES = 24 * 60

// Telegram's ?start= payload permits A-Za-z0-9_- and nothing else, which is
// exactly base64url. A dotted `v1.<id>.<sig>` would be rejected outright by
// Telegram — and that is a thing you find out at the end of a ritual, not in CI.
const TELEGRAM_PAYLOAD = /^[A-Za-z0-9_-]+$/

const inscriptionBytes = (id) => {
  const hex = String(id || '').replace(/^insc-/, '').replace(/-/g, '')
  return /^[0-9a-f]{32}$/i.test(hex) ? Buffer.from(hex, 'hex') : null
}

const mac = (secret, head) =>
  crypto.createHmac('sha256', secret).update(head).digest().subarray(0, 16)

// Returns null rather than throwing when the id is not an inscription: the
// caller has already checked, and a mint that throws turns a bad request into
// a 500.
function mintTunnelToken(inscriptionId, secret, { now = Date.now(), ttlMinutes = TTL_MINUTES } = {}) {
  const raw = inscriptionBytes(inscriptionId)
  if (!raw || !secret) return null
  const head = Buffer.alloc(HEAD_BYTES)
  head[0] = VERSION
  raw.copy(head, 1)
  head.writeUInt32BE(Math.floor(now / 60000) + ttlMinutes, 17)
  const token = Buffer.concat([head, mac(secret, head)]).toString('base64url')
  return { token, expiresAt: (Math.floor(now / 60000) + ttlMinutes) * 60000 }
}

const tunnelUrl = (username, token) =>
  `https://t.me/${String(username || '').replace(/^@/, '')}?start=${token}`

module.exports = {
  mintTunnelToken,
  tunnelUrl,
  TOKEN_BYTES,
  TOKEN_CHARS,
  TTL_MINUTES,
  TELEGRAM_PAYLOAD,
}
