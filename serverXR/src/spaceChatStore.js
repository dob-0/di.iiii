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

// The socket handler already caps these, but the store must be safe on its
// own — anything else that ever calls appendMessage should not have to
// rediscover this the way socketHandlers.js did.
const IDENTITY_MAX_LENGTH = 64

const capIdentity = (value) => String(value || '').slice(0, IDENTITY_MAX_LENGTH)

// What a reply carries about the line it answers: who, and enough words to
// recognise it. Never the whole message — a chain of replies would otherwise
// carry the entire conversation inside its last line.
const REPLY_QUOTE_MAX_LENGTH = 160

function appendMessage(message, { keep = DEFAULT_KEEP } = {}) {
  const { id, spaceId, userId, userName, text, ts, replyTo, accountId } = message || {}
  if (!id || !spaceId || !text) return false
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO space_chat_lines
      (id, space_id, user_id, user_name, text, ts, account_id, reply_to_id, reply_to_name, reply_to_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(id),
    String(spaceId),
    capIdentity(userId),
    capIdentity(userName),
    String(text),
    Number(ts) || Date.now(),
    accountId ? capIdentity(accountId) : null,
    replyTo?.id ? String(replyTo.id) : null,
    replyTo?.id ? capIdentity(replyTo.userName) : null,
    replyTo?.id ? String(replyTo.text || '').slice(0, REPLY_QUOTE_MAX_LENGTH) : null
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

const rowToMessage = (row) => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name,
  text: row.text,
  timestamp: row.ts,
  // NOT sent to the room: the account is the delete check, not a fact the
  // other people in the room are owed about who is signed in as whom.
  accountId: row.account_id || null,
  ...(row.reply_to_id
    ? { replyTo: { id: row.reply_to_id, userName: row.reply_to_name || '', text: row.reply_to_text || '' } }
    : {})
})

// eslint-disable-next-line no-unused-vars
const withoutAccount = ({ accountId, ...rest }) => rest

// The LAST N lines, oldest-first. ASC LIMIT would freeze the replay window at
// the room's first hour forever (the trap aiChatStore and the mesh store both
// paid for).
function listRecent(spaceId, { limit = 100 } = {}) {
  if (!spaceId) return []
  const db = getDb()
  return db.prepare(`
    SELECT id, user_id, user_name, text, ts, account_id, reply_to_id, reply_to_name, reply_to_text
    FROM space_chat_lines
    WHERE space_id = ? ORDER BY rowid DESC LIMIT ?
  `).all(String(spaceId), limit).reverse().map(rowToMessage).map(withoutAccount)
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

// One line, by id — what a pin needs so the room can be told WHAT is pinned
// rather than an id it may no longer have in its window.
function getMessage(spaceId, id) {
  if (!spaceId || !id) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT id, user_id, user_name, text, ts, account_id, reply_to_id, reply_to_name, reply_to_text
    FROM space_chat_lines WHERE space_id = ? AND id = ?
  `).get(String(spaceId), String(id))
  return row ? rowToMessage(row) : null
}

// The pin is stored as an id and resolved on read, so an admin removing the
// message takes the pin with it instead of leaving a bar pointing at nothing.
function setPin(spaceId, { messageId, pinnedBy, pinnedByName }) {
  if (!spaceId || !messageId) return null
  const message = getMessage(spaceId, messageId)
  if (!message) return null
  getDb().prepare(`
    INSERT OR REPLACE INTO space_chat_pins (space_id, message_id, pinned_by, pinned_by_name, ts)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(spaceId), String(messageId), capIdentity(pinnedBy), capIdentity(pinnedByName), Date.now())
  return getPin(spaceId)
}

function getPin(spaceId) {
  if (!spaceId) return null
  const row = getDb().prepare(
    'SELECT message_id, pinned_by, pinned_by_name, ts FROM space_chat_pins WHERE space_id = ?'
  ).get(String(spaceId))
  if (!row) return null
  const message = getMessage(spaceId, row.message_id)
  // The pinned line is gone: the pin goes with it rather than being served as
  // an empty bar the room cannot dismiss.
  if (!message) {
    clearPin(spaceId)
    return null
  }
  return { message: withoutAccount(message), pinnedBy: row.pinned_by, pinnedByName: row.pinned_by_name, ts: row.ts }
}

function clearPin(spaceId) {
  if (!spaceId) return false
  const result = getDb().prepare('DELETE FROM space_chat_pins WHERE space_id = ?').run(String(spaceId))
  return Number(result?.changes || 0) > 0
}

function clearSpace(spaceId) {
  if (!spaceId) return 0
  const db = getDb()
  const result = db.prepare('DELETE FROM space_chat_lines WHERE space_id = ?').run(String(spaceId))
  clearPin(spaceId)
  return Number(result?.changes || 0)
}

module.exports = {
  appendMessage,
  listRecent,
  getMessage,
  removeMessage,
  setPin,
  getPin,
  clearPin,
  clearSpace,
  DEFAULT_KEEP,
  REPLY_QUOTE_MAX_LENGTH
}
