// Space sync keys — per-space, self-serve editor tokens for the linked-space
// sync flow (scripts/space-sync.mjs / di-space.json). A key grants editor role
// scoped to exactly ONE space. Spec: docs/architecture/SPEC_space_sync_keys.md.
//
// Scope (§13, 2026-10-07): 'edit' — every key before, and every key minted
// without asking — or 'manage', which the space's owner gives one key on
// purpose, from a signed-in session: that key may also move a project of its
// space to the trash, make one private and (with a manage key of the other
// space) move one between spaces. Fixed at mint; nothing changes it.
//
// Token format:  dii_sync_<keyId>.<secret>
//   keyId  — stored in clear, used to fetch one row (no hash-scan per request)
//   secret — only sha256(secret) is stored; plaintext is shown once at mint time
//
// Security notes:
//  - constant-time compare on the secret hash
//  - revoked / expired keys resolve to null, indistinguishably
//  - last_used_at is written best-effort and SAMPLED (<=1/min) off the auth path

const crypto = require('node:crypto')
const { getDb } = require('./db')

const PREFIX = 'dii_sync_'
const SCOPES = ['edit', 'manage']
/** Anything that is not exactly 'manage' is 'edit': an unknown value never widens a key. */
const normalizeScope = (value) => (value === 'manage' ? 'manage' : 'edit')
// A manage key's id starts with 'm' (an edit key's id is hex only), so a
// client can tell a manage token from its text alone and refuse to send it
// over plain http before it ever leaves the machine (§13.4). The scope itself
// is always read from the row, never from the id.
const MANAGE_ID_MARK = 'm'
/** Does this token look like a manage key? For the client's own refusal only — never an authorisation. */
const looksLikeManageToken = (token = '') => String(token || '').trim().startsWith(`${PREFIX}${MANAGE_ID_MARK}`)
// Lifetimes (owner, 2026-10-07): a manage key 90 days, an edit key a year.
const DAY_MS = 24 * 60 * 60 * 1000
const TTL_MS = Object.freeze({ edit: 365 * DAY_MS, manage: 90 * DAY_MS })
const LAST_USED_SAMPLE_MS = 60 * 1000

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
  scope: normalizeScope(row.scope)
})

// Mint a key for an already-existing, canonical spaceId. Returns the plaintext
// token ONCE plus the public record. The caller must have verified ownership.
const mintSyncKey = ({ spaceId, ownerUserId = null, label = '', ttlMs = null, scope = 'edit' }) => {
  const keyId = normalizeScope(scope) === 'manage'
    ? `${MANAGE_ID_MARK}${crypto.randomBytes(8).toString('hex')}` // 'm' + 16 hex chars
    : crypto.randomBytes(8).toString('hex')                       // 16 hex chars
  const secret = crypto.randomBytes(32).toString('base64url')
  const token = `${PREFIX}${keyId}.${secret}`
  const now = Date.now()
  const expiresAt = ttlMs ? now + ttlMs : null
  getDb().prepare(
    `INSERT INTO space_sync_keys (id, space_id, owner_user_id, secret_hash, label, created_at, last_used_at, expires_at, revoked, scope)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)`
  ).run(keyId, spaceId, ownerUserId, sha256(secret), String(label || '').slice(0, 80), now, expiresAt, normalizeScope(scope))
  const row = getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ?').get(keyId)
  return { token, key: rowToPublic(row) }
}

// Resolve a bearer token to { keyId, spaceId, label, scope } or null. Fail closed.
const resolveSyncKey = (token = '') => {
  const value = String(token || '').trim()
  if (!value.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const keyId = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!keyId || !secret) return null

  let row
  try { row = getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ?').get(keyId) } catch { return null }
  if (!row || row.revoked) return null
  if (row.expires_at && Date.now() > row.expires_at) return null
  if (!constantTimeEqualHex(sha256(secret), row.secret_hash)) return null

  // sampled, best-effort last-used touch — never blocks/affects the auth result
  const now = Date.now()
  if (!row.last_used_at || now - row.last_used_at > LAST_USED_SAMPLE_MS) {
    try { getDb().prepare('UPDATE space_sync_keys SET last_used_at = ? WHERE id = ?').run(now, keyId) } catch {}
  }
  return { keyId, spaceId: row.space_id, label: row.label || '', scope: normalizeScope(row.scope), ownerUserId: row.owner_user_id || null, expiresAt: row.expires_at || null }
}

const listSyncKeys = (spaceId) => {
  const rows = getDb().prepare(
    'SELECT * FROM space_sync_keys WHERE space_id = ? AND revoked = 0 ORDER BY created_at DESC'
  ).all(spaceId)
  return rows.map(rowToPublic)
}

const revokeSyncKey = (spaceId, id) => {
  const res = getDb().prepare(
    'UPDATE space_sync_keys SET revoked = 1 WHERE id = ? AND space_id = ? AND revoked = 0'
  ).run(id, spaceId)
  return res.changes > 0
}

// One key of a space, revoked or not — for the owner's undo (§13.7).
const getSyncKey = (spaceId, id) => {
  const row = getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ? AND space_id = ?').get(id, spaceId)
  return rowToPublic(row) || null
}

// The live keys of a space other than `exceptId` — for "nobody new gains
// access" on a move (§13.2 item 4): every holder of one can read the space.
const otherLiveKeys = (spaceId, exceptId = null, now = Date.now()) => getDb().prepare(
  'SELECT id FROM space_sync_keys WHERE space_id = ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?) AND id != ?'
).all(spaceId, now, exceptId || '').map(row => row.id)

module.exports = { mintSyncKey, resolveSyncKey, listSyncKeys, revokeSyncKey, getSyncKey, otherLiveKeys, normalizeScope, looksLikeManageToken, SCOPES, TTL_MS, PREFIX }
