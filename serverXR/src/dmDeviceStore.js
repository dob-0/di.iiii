// The public half of people's end-to-end keys.
//
// This store is a phone book, not a vault. Every value in it is a PUBLIC key,
// published on purpose so that two browsers can find each other; the private
// halves are made in a browser and never leave it. A stolen copy of this table
// lets somebody see who has devices and start a conversation — it does not let
// them read one, because the words are sealed before they reach any server.
//
// One row per device, not per person: a phone and a desktop are two key pairs
// with no secret between them. That is the cost of the server holding nothing,
// and it is the reason a conversation opened on a laptop cannot be read on a
// phone. Say so in the interface rather than papering over it.

const crypto = require('node:crypto')
const { getDb } = require('./db')

// A P-256 public key is 65 raw bytes, which is 88 characters of base64. Fixing
// the shape here means the registry cannot be used as a general-purpose place
// to park arbitrary strings against somebody's account.
const KEY_PATTERN = /^[A-Za-z0-9+/]{86,90}={0,2}$/
const MAX_DEVICES_PER_USER = 12

const isPublicKey = (value) => KEY_PATTERN.test(String(value || ''))

const rowToDevice = (row) => (row
  ? {
      id: row.id,
      userId: row.user_id,
      publicKey: row.public_key,
      label: row.label || null,
      createdAt: Number(row.created_at),
      lastSeenAt: Number(row.last_seen_at)
    }
  : null)

/**
 * Publish (or refresh) this device's key. Returns { device } or { error }.
 *
 * Idempotent on (user, key): a browser that reloads and republishes the same
 * key touches `last_seen_at` and nothing else, rather than filling the table
 * with one row per page load.
 */
const publishDevice = ({ userId, publicKey, label = null }) => {
  if (!userId) return { error: 'user_required' }
  if (!isPublicKey(publicKey)) return { error: 'not_a_public_key' }

  const db = getDb()
  const now = Date.now()
  const existing = db.prepare('SELECT * FROM dm_devices WHERE user_id = ? AND public_key = ?')
    .get(String(userId), String(publicKey))
  if (existing) {
    db.prepare('UPDATE dm_devices SET last_seen_at = ?, label = COALESCE(?, label) WHERE id = ?')
      .run(now, label || null, existing.id)
    return { device: rowToDevice({ ...existing, last_seen_at: now, label: label || existing.label }) }
  }

  // A bound, so one account cannot grow an unbounded list. The OLDEST goes:
  // the device somebody has not used in a year is the one they have forgotten,
  // and the one they are holding now is the one that must keep working.
  const count = db.prepare('SELECT COUNT(*) AS c FROM dm_devices WHERE user_id = ?').get(String(userId)).c
  if (count >= MAX_DEVICES_PER_USER) {
    db.prepare(`
      DELETE FROM dm_devices WHERE id IN (
        SELECT id FROM dm_devices WHERE user_id = ? ORDER BY last_seen_at ASC LIMIT ?
      )
    `).run(String(userId), count - MAX_DEVICES_PER_USER + 1)
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO dm_devices (id, user_id, public_key, label, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, String(userId), String(publicKey), label || null, now, now)
  return { device: rowToDevice(db.prepare('SELECT * FROM dm_devices WHERE id = ?').get(id)) }
}

/** Everything published for one person, newest first. Public by nature. */
const listDevices = (userId) => {
  if (!userId) return []
  return getDb().prepare('SELECT * FROM dm_devices WHERE user_id = ? ORDER BY last_seen_at DESC')
    .all(String(userId)).map(rowToDevice)
}

/** A person taking a device back: the key stops being offered to anyone. */
const forgetDevice = ({ userId, deviceId }) => {
  if (!userId || !deviceId) return false
  // Scoped to the owner in the statement itself, so a caller that forgot to
  // check cannot delete somebody else's device.
  return getDb().prepare('DELETE FROM dm_devices WHERE id = ? AND user_id = ?')
    .run(String(deviceId), String(userId)).changes > 0
}

const forgetAllDevices = (userId) => {
  if (!userId) return 0
  return getDb().prepare('DELETE FROM dm_devices WHERE user_id = ?').run(String(userId)).changes
}

module.exports = { publishDevice, listDevices, forgetDevice, forgetAllDevices, isPublicKey, MAX_DEVICES_PER_USER }
