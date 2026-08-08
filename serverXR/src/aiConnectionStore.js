// Per-user external AI tool credentials ("connect your own Claude key").
// One row per (user_id, provider); the key itself is encrypted at rest
// (AES-256-GCM), same approach as driveTokenStore.js, but with its own key
// domain so a compromise of one store doesn't help decrypt the other.

const crypto = require('node:crypto')
const { getDb } = require('./db')
const { config } = require('./config')
const logger = require('./logger')

if (!config.auth.sessionSecret) {
  logger.warn('[aiConnectionStore] No AUTH_SESSION_SECRET configured — AI connection keys are encrypted with a random key that will not survive a server restart. Set AUTH_SESSION_SECRET for stable encryption.')
}
const KEY = crypto.createHash('sha256')
  .update(`ai-connection:${config.auth.sessionSecret || crypto.randomBytes(32).toString('hex')}`)
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

function saveKey(userId, provider, apiKey, label = '') {
  if (!userId) throw new Error('saveKey: userId required')
  if (!provider) throw new Error('saveKey: provider required')
  if (!apiKey) throw new Error('saveKey: apiKey required')
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    INSERT INTO user_ai_connections (user_id, provider, label, api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      label = excluded.label,
      api_key = excluded.api_key,
      updated_at = excluded.updated_at
  `).run(userId, provider, label || '', encrypt(apiKey), now, now)
  return getConnection(userId, provider)
}

// Decrypted key for actual use (server-side calls only — never send to the client).
function getKey(userId, provider) {
  if (!userId || !provider) return ''
  const row = getDb().prepare('SELECT api_key FROM user_ai_connections WHERE user_id = ? AND provider = ?').get(userId, provider)
  return row ? decrypt(row.api_key) : ''
}

// Status-only view for the client: never includes the decrypted key, just
// enough to render "connected" plus a trailing-4-chars hint.
function getConnection(userId, provider) {
  if (!userId || !provider) return null
  const row = getDb().prepare('SELECT * FROM user_ai_connections WHERE user_id = ? AND provider = ?').get(userId, provider)
  if (!row) return null
  const key = decrypt(row.api_key)
  return {
    provider: row.provider,
    label: row.label || '',
    last4: key ? key.slice(-4) : '',
    updatedAt: row.updated_at
  }
}

function deleteConnection(userId, provider) {
  if (!userId || !provider) return
  getDb().prepare('DELETE FROM user_ai_connections WHERE user_id = ? AND provider = ?').run(userId, provider)
}

module.exports = { saveKey, getKey, getConnection, deleteConnection }
