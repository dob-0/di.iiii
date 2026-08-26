// Durable lines for space-wide chat — the persistence behind "a kid who joins
// at 11:10 can read what the room said at 11:00". Project chat next door is
// deliberately ephemeral; this one is not, because the camp runs for days and
// Raw reloads constantly, and amnesia-on-reload was the whole complaint.
//
// Persistence removes the one accidental moderation these messages had, so
// removeMessage/clearSpace exist alongside append from the first commit — see
// the admin-only `space-chat-remove` handler in socketHandlers.js.

const { getDb } = require('./db')

const DEFAULT_KEEP = 500

function appendMessage(message, { keep = DEFAULT_KEEP } = {}) {
  const { id, spaceId, userId, userName, text, ts } = message || {}
  if (!id || !spaceId || !text) return false
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO space_chat_lines (id, space_id, user_id, user_name, text, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(id),
    String(spaceId),
    String(userId || ''),
    String(userName || ''),
    String(text),
    Number(ts) || Date.now()
  )
  // Prune past the cap in the same call — a room left open all week must not
  // grow unbounded. Same idiom as meshRoomHistoryStore.
  db.prepare(`
    DELETE FROM space_chat_lines WHERE space_id = ? AND rowid <= (
      SELECT rowid FROM space_chat_lines WHERE space_id = ?
      ORDER BY rowid DESC LIMIT 1 OFFSET ?
    )
  `).run(String(spaceId), String(spaceId), keep)
  return true
}

// The LAST N lines, oldest-first. ASC LIMIT would freeze the replay window at
// the room's first hour forever (the trap aiChatStore and the mesh store both
// paid for).
function listRecent(spaceId, { limit = 100 } = {}) {
  if (!spaceId) return []
  const db = getDb()
  return db.prepare(`
    SELECT id, user_id, user_name, text, ts FROM space_chat_lines
    WHERE space_id = ? ORDER BY rowid DESC LIMIT ?
  `).all(String(spaceId), limit).reverse().map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    text: row.text,
    timestamp: row.ts
  }))
}

// Scoped by space as well as id: an admin scoped to one space must not be able
// to reach into another space's room by guessing a message id.
function removeMessage(spaceId, id) {
  if (!spaceId || !id) return false
  const db = getDb()
  const result = db.prepare(
    'DELETE FROM space_chat_lines WHERE space_id = ? AND id = ?'
  ).run(String(spaceId), String(id))
  return Number(result?.changes || 0) > 0
}

function clearSpace(spaceId) {
  if (!spaceId) return 0
  const db = getDb()
  const result = db.prepare('DELETE FROM space_chat_lines WHERE space_id = ?').run(String(spaceId))
  return Number(result?.changes || 0)
}

module.exports = { appendMessage, listRecent, removeMessage, clearSpace, DEFAULT_KEEP }
