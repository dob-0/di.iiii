// Per-user Google Drive OAuth tokens. One row per user_id; access/refresh tokens
// are encrypted at rest (AES-256-GCM) with a key derived from the server session
// secret, so a leaked DB file alone does not expose live Drive credentials.

const crypto = require('node:crypto')
const { getDb } = require('./db')
const { config } = require('./config')

const KEY = crypto.createHash('sha256')
  .update(`drive-token:${config.auth.sessionSecret || 'di-local-dev-secret'}`)
  .digest() // 32 bytes

function encrypt(plain) {
  if (plain == null || plain === '') return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

function decrypt(blob) {
  if (!blob) return ''
  try {
    const [ivB, tagB, dataB] = String(blob).split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

// tokens: { email, accessToken, refreshToken, scope, expiresAt }
// A re-connect that omits refreshToken (Google only returns it on first consent)
// keeps the previously stored one.
function saveTokens(userId, tokens = {}) {
  if (!userId) throw new Error('saveTokens: userId required')
  const db = getDb()
  const now = Date.now()
  const existing = db.prepare('SELECT refresh_token FROM user_drive_tokens WHERE user_id = ?').get(userId)
  const refreshEnc = tokens.refreshToken
    ? encrypt(tokens.refreshToken)
    : (existing?.refresh_token || '')
  db.prepare(`
    INSERT INTO user_drive_tokens (user_id, provider, email, access_token, refresh_token, scope, expires_at, created_at, updated_at)
    VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(
    userId,
    tokens.email || null,
    encrypt(tokens.accessToken),
    refreshEnc,
    tokens.scope || null,
    tokens.expiresAt || null,
    now,
    now
  )
  return getTokens(userId)
}

// Persist only a refreshed access token + expiry (leaves refresh token intact).
function updateAccessToken(userId, accessToken, expiresAt) {
  const db = getDb()
  db.prepare('UPDATE user_drive_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ?')
    .run(encrypt(accessToken), expiresAt || null, Date.now(), userId)
}

function getTokens(userId) {
  if (!userId) return null
  const row = getDb().prepare('SELECT * FROM user_drive_tokens WHERE user_id = ?').get(userId)
  if (!row) return null
  return {
    userId: row.user_id,
    email: row.email,
    accessToken: decrypt(row.access_token),
    refreshToken: decrypt(row.refresh_token),
    scope: row.scope,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at
  }
}

function deleteTokens(userId) {
  if (!userId) return
  getDb().prepare('DELETE FROM user_drive_tokens WHERE user_id = ?').run(userId)
}

function isConnected(userId) {
  if (!userId) return false
  return Boolean(getDb().prepare('SELECT 1 FROM user_drive_tokens WHERE user_id = ?').get(userId))
}

module.exports = { saveTokens, updateAccessToken, getTokens, deleteTokens, isConnected, _encrypt: encrypt, _decrypt: decrypt }
