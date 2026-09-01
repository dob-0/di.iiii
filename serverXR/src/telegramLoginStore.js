// Telegram sign-in hand-offs — the storage half. Modelled on inviteStore.js,
// with one deliberate difference: an invite is multi-use by design (one link,
// a whole workshop), and a login token is the opposite. This one names a
// person, so it must be worth nothing to the second reader.
//
// Why this exists at all: the people it is for cannot hold a Google account —
// children, and anyone who should not have to make an account somewhere else
// to open their own work. Telegram has already proven who they are by
// delivering a message to them; this turns that proof into a session here.
//
// The secret never touches the database, only its SHA-256. A token is
// therefore unrecoverable from a stolen db file, and `consumed_at` makes a
// forwarded chat message worthless the moment the first person opens it.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const PREFIX = 'dii_tglogin_'
// Minutes, not hours: the link rides a chat message, and a chat message is
// forwardable, screenshot-able and backed up to somebody's cloud.
const DEFAULT_TTL_MS = 10 * 60 * 1000

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'hex')
  const bufB = Buffer.from(String(b || ''), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Returns { token, expiresAt }. The token is shown once and never stored.
const mintLoginToken = ({ telegramId, displayName = null, avatarUrl = null, returnTo = null, ttlMs = DEFAULT_TTL_MS }) => {
  const id = crypto.randomBytes(8).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + Math.max(60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS)

  getDb().prepare(`
    INSERT INTO telegram_login_tokens
      (id, secret_hash, telegram_id, display_name, avatar_url, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sha256Hex(secret), String(telegramId), displayName || null, avatarUrl || null, returnTo || null, now, expiresAt)

  return { token: `${PREFIX}${id}.${secret}`, expiresAt }
}

// Verify AND consume in one step. There is no "peek" on purpose: a caller that
// could check a token without spending it would eventually be used to check a
// token without spending it, and that is the whole protection.
//
// Returns the claim, or null for every failure mode — unknown, expired,
// already used, wrong secret. The caller must not be able to tell those apart;
// the difference is only ever useful to someone probing.
const consumeLoginToken = (token = '') => {
  const value = String(token || '').trim()
  if (!value.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const id = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!id || !secret) return null

  const db = getDb()
  let row
  try { row = db.prepare('SELECT * FROM telegram_login_tokens WHERE id = ?').get(id) } catch { return null }
  if (!row) return null
  if (row.consumed_at) return null
  if (Date.now() > row.expires_at) return null
  if (!constantTimeEqualHex(sha256Hex(secret), row.secret_hash)) return null

  // Mark spent BEFORE the caller acts on it. If issuing the session then
  // fails, the person asks the bot for a new link — which is the safe way
  // round. The other order hands a retry to whoever forwarded the message.
  const spent = db.prepare(
    'UPDATE telegram_login_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL'
  ).run(Date.now(), id)
  // Two opens racing: exactly one gets the row. `changes === 0` means the
  // other one won.
  if (!spent || spent.changes !== 1) return null

  return {
    telegramId: row.telegram_id,
    displayName: row.display_name || null,
    avatarUrl: row.avatar_url || null,
    returnTo: row.return_to || null
  }
}

// Spent and expired rows are dead weight; nothing reads them. Called on the
// same interval as the other sweeps rather than on every mint, so a burst of
// sign-ins never pays for the cleanup.
const pruneLoginTokens = (now = Date.now()) => {
  try {
    const result = getDb().prepare(
      'DELETE FROM telegram_login_tokens WHERE expires_at < ? OR consumed_at IS NOT NULL'
    ).run(now)
    return result?.changes || 0
  } catch {
    return 0
  }
}

module.exports = { mintLoginToken, consumeLoginToken, pruneLoginTokens, PREFIX, DEFAULT_TTL_MS }
