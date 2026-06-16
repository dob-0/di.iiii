const crypto = require('node:crypto')
const { getDb } = require('./db')
const { normalizeAuthRole } = require('./authAccess')

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
    return { ...existing, email: email || existing.email, display_name: displayName || existing.display_name, avatar_url: avatarUrl || existing.avatar_url, updated_at: now }
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO users (id, provider, provider_id, email, display_name, avatar_url, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, provider, String(providerId), email || null, displayName || null, avatarUrl || null, normalizedRole, now, now)

  return { id, provider, provider_id: String(providerId), email: email || null, display_name: displayName || null, avatar_url: avatarUrl || null, role: normalizedRole, created_at: now, updated_at: now }
}

const findUserById = (id) => {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null
}

module.exports = { upsertUser, findUserById }
