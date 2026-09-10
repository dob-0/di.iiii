const crypto = require('node:crypto')
const { getDb } = require('./db')
const { normalizeAuthRole } = require('./authAccess')

// `spaces` is always an array of granted space ids (or empty = deny-all).
// "Unrestricted" (access to every space) is now the explicit is_unrestricted
// flag, not a magic null — see backfillUserUnrestricted in db.js.
const parseSpaces = (value) => {
  if (value === null || value === undefined) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const rowToUser = (row) => row
  ? {
      ...row,
      spaces: parseSpaces(row.spaces),
      isUnrestricted: Boolean(row.is_unrestricted),
      tokenVersion: Number(row.token_version) || 0
    }
  : null

const upsertUser = ({ provider, providerId, email, displayName, avatarUrl, role = 'editor' }) => {
  const db = getDb()
  const now = Date.now()
  const normalizedRole = normalizeAuthRole(role, 'editor')

  const existing = db.prepare(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
  ).get(provider, String(providerId))

  if (existing) {
    db.prepare(`
      UPDATE users SET
        email = ?,
        display_name = ?,
        avatar_url = ?,
        updated_at = ?
      WHERE id = ?
    `).run(email || existing.email, displayName || existing.display_name, avatarUrl || existing.avatar_url, now, existing.id)
    return rowToUser({ ...existing, email: email || existing.email, display_name: displayName || existing.display_name, avatar_url: avatarUrl || existing.avatar_url, updated_at: now })
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO users (id, provider, provider_id, email, display_name, avatar_url, role, spaces, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, provider, String(providerId), email || null, displayName || null, avatarUrl || null, normalizedRole, '[]', now, now)

  return rowToUser({ id, provider, provider_id: String(providerId), email: email || null, display_name: displayName || null, avatar_url: avatarUrl || null, role: normalizedRole, spaces: '[]', created_at: now, updated_at: now })
}

const findUserById = (id) => {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id))
}

// The same pair `upsertUser` keys on, read rather than written. Telegram's bot
// half needs it to answer "is this person signed in, and to what" without
// minting anything — a lookup is not a login.
// An address is one account, however it is typed. Case and surrounding space
// are not identity — "Gevorg@Example.com " and "gevorg@example.com" are one
// person, and letting them be two is how a person ends up locked out of their
// own work by a capital letter.
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

// The name someone types when there is no email at all. Deliberately narrow:
// no spaces, no dots, nothing that could be mistaken for an address, and
// lowercase for the same reason as above.
const normalizeUsername = (value) => String(value || '').trim().toLowerCase()
const isValidUsername = (value) => /^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalizeUsername(value))

const findUserByProvider = (provider, providerId) => {
  return rowToUser(getDb().prepare(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
  ).get(String(provider || ''), String(providerId || '')))
}

const listUsers = () => {
  return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(rowToUser)
}

// ── first-party accounts (provider 'password') ────────────────────────────
//
// They live in the same table as the OAuth ones, keyed the same way: the
// provider is 'password' and the provider_id is the identifier the person signs
// in with — their address, or their username where there is no mail. One shape
// for every account means roles, scope and sessions have exactly one code path.

const findPasswordUserByEmail = (email) => {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  return rowToUser(getDb().prepare(
    'SELECT * FROM users WHERE provider = ? AND LOWER(email) = ?'
  ).get('password', normalized))
}

const findPasswordUserByUsername = (username) => {
  const normalized = normalizeUsername(username)
  if (!normalized) return null
  return rowToUser(getDb().prepare(
    'SELECT * FROM users WHERE provider = ? AND username = ?'
  ).get('password', normalized))
}

/** Whichever of the two the person typed. */
const findPasswordUser = (identifier) => {
  const value = String(identifier || '').trim()
  if (!value) return null
  return value.includes('@') ? findPasswordUserByEmail(value) : findPasswordUserByUsername(value)
}

/**
 * Returns { user } or { error }. Refuses rather than overwrites: an address or
 * a username that is already somebody's is not a thing to quietly take over,
 * whichever provider holds it.
 */
const createPasswordUser = ({ email = null, username = null, displayName = null, passwordHash }) => {
  const db = getDb()
  const now = Date.now()
  const normalizedEmail = normalizeEmail(email) || null
  const normalizedUsername = normalizeUsername(username) || null
  if (!normalizedEmail && !normalizedUsername) return { error: 'identifier_required' }
  if (!passwordHash) return { error: 'password_required' }
  if (normalizedUsername && !isValidUsername(normalizedUsername)) return { error: 'username_invalid' }

  // Any provider, not just this one: signing up with a password on an address
  // that already signed in with Google would make two accounts for one person,
  // and the second one would look empty to them.
  if (normalizedEmail) {
    const taken = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail)
    if (taken) return { error: 'email_taken' }
  }
  if (normalizedUsername && findPasswordUserByUsername(normalizedUsername)) {
    return { error: 'username_taken' }
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO users (id, provider, provider_id, email, username, display_name, avatar_url, role, spaces,
                       password_hash, email_verified_at, created_at, updated_at)
    VALUES (?, 'password', ?, ?, ?, ?, NULL, 'editor', '[]', ?, NULL, ?, ?)
  `).run(id, normalizedEmail || normalizedUsername, normalizedEmail, normalizedUsername,
    displayName || normalizedUsername || normalizedEmail, passwordHash, now, now)

  return { user: findUserById(id) }
}

const setUserPasswordHash = (id, passwordHash) => {
  getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(String(passwordHash), Date.now(), String(id))
  return findUserById(id)
}

const markEmailVerified = (id, at = Date.now()) => {
  getDb().prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
    .run(Number(at), Date.now(), String(id))
  return findUserById(id)
}

const setUserSpaces = (id, spaces = []) => {
  const db = getDb()
  const normalized = Array.isArray(spaces)
    ? Array.from(new Set(spaces.map((s) => String(s || '').trim()).filter(Boolean)))
    : []
  db.prepare('UPDATE users SET spaces = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(normalized), Date.now(), id)
  return findUserById(id)
}

const setUserUnrestricted = (id, unrestricted) => {
  const db = getDb()
  db.prepare('UPDATE users SET is_unrestricted = ?, updated_at = ? WHERE id = ?').run(unrestricted ? 1 : 0, Date.now(), id)
  return findUserById(id)
}

const setUserRole = (id, role) => {
  const db = getDb()
  const normalized = normalizeAuthRole(role, 'editor')
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(normalized, Date.now(), id)
  return findUserById(id)
}

// null (not 0) for a subject with no user row: guests, API-token identities and
// sandbox subjects have no stored version, and their sessions must keep
// verifying exactly as before.
const getUserTokenVersion = (id) => {
  const row = getDb().prepare('SELECT token_version FROM users WHERE id = ?').get(id)
  return row ? Number(row.token_version) || 0 : null
}

const bumpUserTokenVersion = (id) => {
  const db = getDb()
  db.prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  return getUserTokenVersion(id)
}

module.exports = {
  upsertUser,
  findUserById,
  findUserByProvider,
  findPasswordUser,
  findPasswordUserByEmail,
  findPasswordUserByUsername,
  createPasswordUser,
  setUserPasswordHash,
  markEmailVerified,
  normalizeEmail,
  normalizeUsername,
  isValidUsername,
  listUsers,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole,
  getUserTokenVersion,
  bumpUserTokenVersion
}
