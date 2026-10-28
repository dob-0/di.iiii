// di.bo acting as a team member — the storage half. Owner's decision,
// 2026-10-07 ("go build all"); plan: the team-assistant plan in dob-0/di-bo, step 2.
//
// A Telegram login token (telegramLoginStore.js) turns into a browser session
// for the person who opens it. This is the other thing a bot needs: to do one
// errand AS that person — upload a file into their space, list their projects
// — with their own access and never more, and with every write saying it came
// through di.bo. So the token is:
//   - bound to one existing account (the route only mints for a Telegram id
//     that is already bound; it never creates a user),
//   - short: 15 minutes by default, 60 at most,
//   - stored as a SHA-256 only, like every other token here,
//   - dead the moment the account signs out everywhere (token_version), the
//     same rule that kills the person's own cookies.
//
// The request side (what such a token may and may not reach) is actTokenGate.js.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const PREFIX = 'dii_tgact_'
// Long enough for one errand (an upload that waits on a slow phone link), short
// enough that a leaked log line or a stolen bot process buys very little.
const DEFAULT_TTL_MS = 15 * 60 * 1000
const MIN_TTL_MS = 60 * 1000
const MAX_TTL_MS = 60 * 60 * 1000

const clampTtlMs = (ttlMs) => {
  const value = Number(ttlMs)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TTL_MS
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.floor(value)))
}

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'hex')
  const bufB = Buffer.from(String(b || ''), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Returns { token, id, expiresAt }. The token is shown once and never stored.
const mintActToken = ({ userId, telegramId, label = null, tokenVersion = 0, ttlMs = DEFAULT_TTL_MS, now = Date.now() }) => {
  if (!userId) throw new Error('An act token needs the account it acts as.')
  const id = crypto.randomBytes(8).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const expiresAt = now + clampTtlMs(ttlMs)

  getDb().prepare(`
    INSERT INTO telegram_act_tokens
      (id, secret_hash, user_id, telegram_id, label, token_version, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sha256Hex(secret), String(userId), String(telegramId || ''), label ? String(label).slice(0, 120) : null,
    Number(tokenVersion) || 0, now, expiresAt)

  return { token: `${PREFIX}${id}.${secret}`, id, expiresAt }
}

// The claim, or null for every failure — unknown, malformed, expired, revoked,
// wrong secret — and the caller cannot tell them apart. Reusable on purpose
// (unlike a login token): one errand is several requests.
//
// It does NOT check the account itself (exists? signed out everywhere?): that
// needs the user store, and index.js does it on every request, against the
// same token_version a cookie is checked against.
const resolveActToken = (token = '', now = Date.now()) => {
  const value = String(token || '').trim()
  if (!value.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const id = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!id || !secret) return null

  let row
  try { row = getDb().prepare('SELECT * FROM telegram_act_tokens WHERE id = ?').get(id) } catch { return null }
  if (!row) return null
  if (row.revoked_at) return null
  if (now > row.expires_at) return null
  if (!constantTimeEqualHex(sha256Hex(secret), row.secret_hash)) return null

  return {
    tokenId: row.id,
    userId: row.user_id,
    telegramId: row.telegram_id,
    label: row.label || null,
    tokenVersion: Number(row.token_version) || 0,
    expiresAt: row.expires_at
  }
}

// Ending a token before its time: one, or every one held for an account.
const revokeActToken = (id, now = Date.now()) => {
  try {
    return getDb().prepare('UPDATE telegram_act_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now, String(id || '')).changes || 0
  } catch {
    return 0
  }
}

const revokeActTokensForUser = (userId, now = Date.now()) => {
  try {
    return getDb().prepare('UPDATE telegram_act_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(now, String(userId || '')).changes || 0
  } catch {
    return 0
  }
}

// Expired and revoked rows are worthless; this only stops the table growing.
// Rides the same half-hour sweep as pruneLoginTokens (index.js).
const pruneActTokens = (now = Date.now()) => {
  try {
    const result = getDb().prepare(
      'DELETE FROM telegram_act_tokens WHERE expires_at < ? OR revoked_at IS NOT NULL'
    ).run(now)
    return result?.changes || 0
  } catch {
    return 0
  }
}

module.exports = {
  mintActToken,
  resolveActToken,
  revokeActToken,
  revokeActTokensForUser,
  pruneActTokens,
  clampTtlMs,
  PREFIX,
  DEFAULT_TTL_MS,
  MIN_TTL_MS,
  MAX_TTL_MS
}
