// Space invites — owner-minted share links that grant space access on redeem.
// An invite grants scope membership to exactly ONE space; the redeemer's own
// role still governs what they can do inside it. Companion of syncKeyStore.js.
//
// Token format:  dii_invite_<inviteId>.<secret>
//   inviteId — stored in clear, used to fetch one row (no hash-scan per request)
//   secret   — only sha256(secret) is stored; plaintext is shown once at mint time
//
// Security notes:
//  - constant-time compare on the secret hash
//  - revoked / expired invites resolve to null, indistinguishably
//  - redeem is explicit (redeemInvite bumps use_count); resolve never mutates

const crypto = require('node:crypto')
const { getDb } = require('./db')
const logger = require('./logger')

const PREFIX = 'dii_invite_'
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a), 'hex')
  const bufB = Buffer.from(String(b), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

const rowToPublic = (row) => row && ({
  id: row.id,
  spaceId: row.space_id,
  label: row.label || '',
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at || null,
  expiresAt: row.expires_at || null,
  revoked: !!row.revoked,
  useCount: row.use_count || 0
})

// Mint an invite for an already-existing, canonical spaceId. Returns the
// plaintext token ONCE plus the public record. Caller must have verified ownership.
const mintInvite = ({ spaceId, createdByUserId = null, label = '', ttlMs = DEFAULT_TTL_MS }) => {
  const inviteId = crypto.randomBytes(8).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const token = `${PREFIX}${inviteId}.${secret}`
  const now = Date.now()
  const expiresAt = ttlMs ? now + ttlMs : null
  getDb().prepare(
    `INSERT INTO space_invites (id, space_id, created_by_user_id, secret_hash, label, created_at, last_used_at, expires_at, revoked, use_count)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, 0)`
  ).run(inviteId, spaceId, createdByUserId, sha256(secret), String(label || '').slice(0, 80), now, expiresAt)
  const row = getDb().prepare('SELECT * FROM space_invites WHERE id = ?').get(inviteId)
  return { token, invite: rowToPublic(row) }
}

// Resolve a token to { inviteId, spaceId } or null. Fail closed, never mutates.
const resolveInvite = (token = '') => {
  const value = String(token || '').trim()
  if (!value.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const inviteId = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!inviteId || !secret) return null

  let row
  try { row = getDb().prepare('SELECT * FROM space_invites WHERE id = ?').get(inviteId) } catch { return null }
  if (!row || row.revoked) return null
  if (row.expires_at && Date.now() > row.expires_at) return null
  if (!constantTimeEqualHex(sha256(secret), row.secret_hash)) return null
  return { inviteId, spaceId: row.space_id }
}

// Called by the route layer after a redeem actually succeeded — usage stats
// are informational, so a failed bump never affects the grant.
const markInviteUsed = (inviteId) => {
  try {
    getDb().prepare(
      'UPDATE space_invites SET use_count = use_count + 1, last_used_at = ? WHERE id = ?'
    ).run(Date.now(), inviteId)
  } catch (err) {
    logger.warn('[inviteStore] use_count bump failed:', err?.message || err)
  }
}

const listInvites = (spaceId) => {
  const rows = getDb().prepare(
    'SELECT * FROM space_invites WHERE space_id = ? AND revoked = 0 ORDER BY created_at DESC'
  ).all(spaceId)
  return rows.map(rowToPublic)
}

const revokeInvite = (spaceId, id) => {
  const res = getDb().prepare(
    'UPDATE space_invites SET revoked = 1 WHERE id = ? AND space_id = ? AND revoked = 0'
  ).run(id, spaceId)
  return res.changes > 0
}

module.exports = { mintInvite, resolveInvite, markInviteUsed, listInvites, revokeInvite, PREFIX, DEFAULT_TTL_MS }
