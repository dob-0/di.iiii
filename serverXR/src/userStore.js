const crypto = require('node:crypto')
const { getDb } = require('./db')
const { normalizeAuthRole } = require('./authAccess')

// SQL NULL (column never written, e.g. pre-existing rows from before this
// column existed) means "never granted anything" -> deny-all ([]).
// The JSON string "null" (explicitly stored) means "unrestricted", same
// null-means-allow-all convention used everywhere else in authAccess.js.
const parseSpaces = (value) => {
  if (value === null || value === undefined) return []
  try {
    const parsed = JSON.parse(value)
    if (parsed === null) return null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const rowToUser = (row) => row ? { ...row, spaces: parseSpaces(row.spaces) } : null

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

const listUsers = () => {
  return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(rowToUser)
}

const setUserSpaces = (id, spaces = []) => {
  const db = getDb()
  const normalized = spaces === null
    ? null
    : Array.isArray(spaces)
      ? Array.from(new Set(spaces.map((s) => String(s || '').trim()).filter(Boolean)))
      : []
  db.prepare('UPDATE users SET spaces = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(normalized), Date.now(), id)
  return findUserById(id)
}

module.exports = { upsertUser, findUserById, listUsers, setUserSpaces }
