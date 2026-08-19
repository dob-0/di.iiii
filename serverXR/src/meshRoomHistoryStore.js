// Durable lines for mesh rooms — the persistence behind "the room keeps its
// chat". Only the channels the hub lists as persistent ever land here (talk,
// keeper:say by default); presence and motion stay ephemeral. Lines survive
// deploys, so the same conversation greets every device.

const { getDb } = require('./db')

const DEFAULT_KEEP = 5000

function appendLine(id, roomId, channel, fromId, payload, ts, { keep = DEFAULT_KEEP } = {}) {
  if (!id || !roomId || !channel) return false
  const db = getDb()
  db.prepare(`
    INSERT INTO mesh_room_lines (id, room_id, channel, from_id, payload, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(id), String(roomId), String(channel), String(fromId || ''), JSON.stringify(payload ?? null), Number(ts) || Date.now())
  // prune beyond the cap in the same call — a busy room must not grow unbounded
  db.prepare(`
    DELETE FROM mesh_room_lines WHERE room_id = ? AND rowid <= (
      SELECT rowid FROM mesh_room_lines WHERE room_id = ?
      ORDER BY rowid DESC LIMIT 1 OFFSET ?
    )
  `).run(String(roomId), String(roomId), keep)
  return true
}

// The LAST N lines, oldest-first — ASC LIMIT would freeze the window at the
// room's first day forever (same trap aiChatStore paid for).
function listRecent(roomId, { limit = 200 } = {}) {
  if (!roomId) return []
  const db = getDb()
  return db.prepare(`
    SELECT id, channel, from_id, payload, ts FROM mesh_room_lines
    WHERE room_id = ? ORDER BY rowid DESC LIMIT ?
  `).all(String(roomId), limit).reverse().map((row) => ({
    id: row.id,
    channel: row.channel,
    from: row.from_id,
    payload: safeParse(row.payload),
    ts: row.ts
  }))
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}

module.exports = { appendLine, listRecent }
