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

// Renew (owner, 2026-10-07; SPEC_space_sync_keys.md §14.1): the SAME key gets
// one more term — no new secret, so the machine keeps working without being
// paired again. It opens 14 days before the end (the same 14 days the panel and
// `di follows` warn), adds one full term to the CURRENT end (90 days for a
// manage key, a year for an edit key), and a key is renewed at most once every
// 90 days. So a renewed key never has more than one term and 14 days left, and
// its end day stays the same day of each term.
const RENEW_WINDOW_MS = 14 * DAY_MS
const RENEW_EVERY_MS = 90 * DAY_MS

// A machine's name is the owner's words: printable, one line, 80 characters.
// Control characters (\p{C}: newlines, escapes, bidi overrides) are dropped so
// a name cannot rewrite how a row reads.
const cleanMachineName = (value) => String(value ?? '')
  .replace(/\p{C}+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 80)

// What the follower says its hostname is. A HINT for the owner's eye, never an
// identity: anything holding the key can send any text. Only a hostname's own
// characters are kept (RFC 1123 letters, digits, dot, hyphen; underscore for
// the Windows names people really have), 64 at most; anything else is dropped.
const HOST_HINT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const cleanHostHint = (value) => {
  const text = String(value ?? '').trim()
  return HOST_HINT_RE.test(text) ? text : null
}
const HOST_HINT_SAMPLE_MS = 10 * 60 * 1000

const rowToPublic = (row) => row && ({
  id: row.id,
  spaceId: row.space_id,
  label: row.label || '',
  machineName: row.machine_name || '',
  // Untrusted: what the machine says it is called (§14.2).
  hostHint: row.host_hint || null,
  hostHintAt: row.host_hint_at || null,
  createdAt: row.created_at,
  // The last request made with this key, sampled to a minute: a follower asks
  // the host every few seconds while it runs, so this is its last sync.
  lastUsedAt: row.last_used_at || null,
  expiresAt: row.expires_at || null,
  renewedAt: row.renewed_at || null,
  revoked: !!row.revoked,
  scope: normalizeScope(row.scope)
})

// Mint a key for an already-existing, canonical spaceId. Returns the plaintext
// token ONCE plus the public record. The caller must have verified ownership.
const mintSyncKey = ({ spaceId, ownerUserId = null, label = '', ttlMs = null, scope = 'edit', machineName = '' }) => {
  const keyId = normalizeScope(scope) === 'manage'
    ? `${MANAGE_ID_MARK}${crypto.randomBytes(8).toString('hex')}` // 'm' + 16 hex chars
    : crypto.randomBytes(8).toString('hex')                       // 16 hex chars
  const secret = crypto.randomBytes(32).toString('base64url')
  const token = `${PREFIX}${keyId}.${secret}`
  const now = Date.now()
  const expiresAt = ttlMs ? now + ttlMs : null
  getDb().prepare(
    `INSERT INTO space_sync_keys (id, space_id, owner_user_id, secret_hash, label, created_at, last_used_at, expires_at, revoked, scope, machine_name)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`
  ).run(keyId, spaceId, ownerUserId, sha256(secret), String(label || '').slice(0, 80), now, expiresAt, normalizeScope(scope), cleanMachineName(machineName) || null)
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

// The live keys of a space (expired ones included: the owner still sees them
// and can renew a key in its last days). `includeRevoked` adds the revoked
// ones, for the panel's Keys view — a revoked key is a row of history there.
const listSyncKeys = (spaceId, { includeRevoked = false } = {}) => {
  const rows = getDb().prepare(
    `SELECT * FROM space_sync_keys WHERE space_id = ? ${includeRevoked ? '' : 'AND revoked = 0'} ORDER BY created_at DESC`
  ).all(spaceId)
  return rows.map(rowToPublic)
}

/**
 * May this key be renewed now? Reads the row; writes nothing. A dead key —
 * revoked or past its end — stays dead (T4): the owner adds the machine again.
 * @returns {{ ok: true, expiresAt: number } | { ok: false, code: string, status: number, reason: string, opensAt?: number }}
 */
const renewCheck = (row, now = Date.now()) => {
  if (!row) return { ok: false, code: 'not_found', status: 404, reason: 'Key not found.' }
  if (row.revoked) return { ok: false, code: 'key_revoked', status: 410, reason: 'This key was revoked. Add the machine again to give it a new key.' }
  if (!row.expires_at) return { ok: false, code: 'never_expires', status: 409, reason: 'This key has no end date, so there is nothing to renew.' }
  if (now >= row.expires_at) return { ok: false, code: 'key_expired', status: 410, reason: 'This key has ended. Add the machine again to give it a new key.' }
  if (row.expires_at - now > RENEW_WINDOW_MS) {
    return { ok: false, code: 'renew_not_open', status: 409, opensAt: row.expires_at - RENEW_WINDOW_MS, reason: 'A key can be renewed in its last 14 days.' }
  }
  if (row.renewed_at && now - row.renewed_at < RENEW_EVERY_MS) {
    return { ok: false, code: 'renew_too_soon', status: 429, opensAt: row.renewed_at + RENEW_EVERY_MS, reason: 'A key is renewed at most once every 90 days.' }
  }
  const scope = normalizeScope(row.scope)
  return { ok: true, expiresAt: row.expires_at + TTL_MS[scope] }
}

/**
 * Renew one key of a space: the same key, one more term (§14.1). The check and
 * the write are one statement apart in one synchronous call — node:sqlite is
 * synchronous and serverXR is one process (PR #728), so two renews cannot both
 * pass the check — and the UPDATE repeats the conditions, so it changes nothing
 * if the row moved underneath.
 */
const renewSyncKey = (spaceId, id, now = Date.now()) => {
  const row = getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ? AND space_id = ?').get(id, spaceId)
  const check = renewCheck(row, now)
  if (!check.ok) return { ...check, key: rowToPublic(row) || null }
  const res = getDb().prepare(
    `UPDATE space_sync_keys SET expires_at = ?, renewed_at = ?
     WHERE id = ? AND space_id = ? AND revoked = 0 AND expires_at = ? AND (renewed_at IS NULL OR renewed_at <= ?)`
  ).run(check.expiresAt, now, id, spaceId, row.expires_at, now - RENEW_EVERY_MS)
  if (res.changes !== 1) return { ok: false, code: 'renew_raced', status: 409, reason: 'The key changed while renewing; look again.', key: rowToPublic(row) }
  const after = getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ?').get(id)
  return { ok: true, key: rowToPublic(after), previousExpiresAt: row.expires_at }
}

/** The owner names the machine a key is for. Returns the key, or null when the space has no such key. */
const setMachineName = (spaceId, id, machineName) => {
  const res = getDb().prepare('UPDATE space_sync_keys SET machine_name = ? WHERE id = ? AND space_id = ?')
    .run(cleanMachineName(machineName) || null, id, spaceId)
  if (res.changes !== 1) return null
  return rowToPublic(getDb().prepare('SELECT * FROM space_sync_keys WHERE id = ?').get(id))
}

/**
 * What the follower says its hostname is (§14.2). Written only for a key that
 * just authenticated (the route passes its id from the auth state, never from
 * the body), only when it is a hostname, and at most every 10 minutes unless it
 * changed. Returns the stored hint, or null when the text was not a hostname.
 */
const noteHostHint = (keyId, value, now = Date.now()) => {
  const hint = cleanHostHint(value)
  if (!hint) return null
  try {
    const row = getDb().prepare('SELECT host_hint, host_hint_at FROM space_sync_keys WHERE id = ? AND revoked = 0').get(keyId)
    if (!row) return null
    if (row.host_hint === hint && row.host_hint_at && now - row.host_hint_at < HOST_HINT_SAMPLE_MS) return hint
    getDb().prepare('UPDATE space_sync_keys SET host_hint = ?, host_hint_at = ? WHERE id = ? AND revoked = 0').run(hint, now, keyId)
  } catch { return null }
  return hint
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

module.exports = { mintSyncKey, resolveSyncKey, listSyncKeys, revokeSyncKey, getSyncKey, otherLiveKeys, normalizeScope, looksLikeManageToken, renewCheck, renewSyncKey, setMachineName, noteHostHint, cleanMachineName, cleanHostHint, SCOPES, TTL_MS, PREFIX, RENEW_WINDOW_MS, RENEW_EVERY_MS }
