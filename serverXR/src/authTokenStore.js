// One-shot tokens for a first-party account: verify an address, reset a
// password, sign in without one. Modelled on telegramLoginStore.js and holding
// to the same three rules, because they are the rules that make a token in an
// inbox safe:
//
//   · only the SHA-256 is stored, so a stolen database yields no usable token
//   · verify and consume are ONE step — there is no peek, because a caller that
//     could check a token without spending it would eventually be used to
//     check a token without spending it
//   · every failure answers null: unknown, expired, spent and forged must be
//     indistinguishable, or the difference becomes a way to probe
//
// Three kinds, one table. They differ only in what the caller does afterwards,
// and keeping them together means the expiry sweep and the single-use rule are
// written once rather than three times slightly differently.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const KINDS = Object.freeze({
  VERIFY: 'verify',
  RESET: 'reset',
  MAGIC: 'magic'
})

const PREFIX = 'dii_auth_'

// A reset link is a password in an inbox; a magic link is a session in an
// inbox. Both are short-lived for the same reason. Verification is gentler:
// people open their mail hours later, and the worst a stale one costs is a
// second click on "send it again".
const TTL_MS = Object.freeze({
  [KINDS.VERIFY]: 24 * 60 * 60 * 1000,
  [KINDS.RESET]: 30 * 60 * 1000,
  [KINDS.MAGIC]: 15 * 60 * 1000
})

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'hex')
  const bufB = Buffer.from(String(b || ''), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

const isKind = (kind) => Object.values(KINDS).includes(String(kind))

/**
 * Returns { token, expiresAt }. The token is shown once and never stored.
 *
 * Minting a new token of a kind SPENDS the person's older ones of that kind:
 * asking for a second reset link must make the first one dead, or a mailbox
 * that has been read once by someone else stays useful to them forever.
 */
const mintAuthToken = ({ kind, userId, ttlMs = null }) => {
  if (!isKind(kind) || !userId) return null
  const db = getDb()
  const now = Date.now()
  db.prepare('UPDATE auth_tokens SET consumed_at = ? WHERE user_id = ? AND kind = ? AND consumed_at IS NULL')
    .run(now, String(userId), String(kind))

  const id = crypto.randomBytes(8).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const expiresAt = now + Math.max(60 * 1000, Number(ttlMs) || TTL_MS[kind])

  db.prepare(`
    INSERT INTO auth_tokens (id, kind, user_id, token_hash, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(id, String(kind), String(userId), sha256Hex(secret), now, expiresAt)

  return { token: `${PREFIX}${id}.${secret}`, expiresAt }
}

/**
 * Verify and consume. Returns { userId, kind } or null.
 *
 * The kind is checked, not merely reported: a verification token must never be
 * spendable as a password reset, however it reaches that route.
 */
const consumeAuthToken = (token = '', expectedKind = null) => {
  const value = String(token || '').trim()
  if (!value.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const id = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!id || !secret) return null

  const db = getDb()
  const row = db.prepare('SELECT * FROM auth_tokens WHERE id = ?').get(id)
  if (!row) return null
  if (row.consumed_at) return null
  if (Number(row.expires_at) < Date.now()) return null
  if (expectedKind && String(row.kind) !== String(expectedKind)) return null
  if (!constantTimeEqualHex(row.token_hash, sha256Hex(secret))) return null

  // Spend it BEFORE the caller acts on it. If the process dies between these
  // two, the token is dead and the person clicks "send another" — the failure
  // that costs a click, rather than the one that leaves a live token behind.
  const spent = db.prepare('UPDATE auth_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
    .run(Date.now(), id)
  if (spent.changes !== 1) return null

  return { userId: row.user_id, kind: row.kind }
}

/** Housekeeping. Spent and expired rows are of no use to anyone. */
const pruneAuthTokens = (now = Date.now()) => {
  try {
    return getDb().prepare('DELETE FROM auth_tokens WHERE expires_at < ? OR consumed_at IS NOT NULL')
      .run(now).changes
  } catch {
    return 0
  }
}

module.exports = { mintAuthToken, consumeAuthToken, pruneAuthTokens, KINDS, TTL_MS, PREFIX }
