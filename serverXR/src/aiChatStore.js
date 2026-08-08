// Per-user Claude chats — the persistence behind the Raw `agent` node.
// Every query is scoped by user_id; a chat is never readable across users.
// Content is plain text per message; token counts are recorded per assistant
// turn so per-user metering has ground truth from day one.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const newId = () => crypto.randomUUID()

function createChat(userId, { title = null, nodeId = null, projectId = null } = {}) {
  if (!userId) throw new Error('createChat: userId required')
  const db = getDb()
  const now = Date.now()
  const id = newId()
  db.prepare(`
    INSERT INTO ai_chats (id, user_id, title, node_id, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, title, nodeId, projectId, now, now)
  return getChat(userId, id)
}

function getChat(userId, chatId) {
  if (!userId || !chatId) return null
  const db = getDb()
  return db.prepare('SELECT * FROM ai_chats WHERE id = ? AND user_id = ?').get(chatId, userId) || null
}

function listChats(userId, { limit = 100 } = {}) {
  if (!userId) return []
  const db = getDb()
  return db.prepare(`
    SELECT * FROM ai_chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?
  `).all(userId, limit)
}

function renameChat(userId, chatId, title) {
  const db = getDb()
  db.prepare('UPDATE ai_chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title || null, Date.now(), chatId, userId)
  return getChat(userId, chatId)
}

function deleteChat(userId, chatId) {
  const db = getDb()
  const result = db.prepare('DELETE FROM ai_chats WHERE id = ? AND user_id = ?').run(chatId, userId)
  return result.changes > 0
}

function listMessages(userId, chatId, { limit = 200 } = {}) {
  const chat = getChat(userId, chatId)
  if (!chat) return null
  const db = getDb()
  return db.prepare(`
    SELECT id, role, content, model, input_tokens, output_tokens, created_at
    FROM ai_messages WHERE chat_id = ? ORDER BY rowid ASC LIMIT ?
  `).all(chatId, limit)
}

function appendMessage(userId, chatId, { role, content, model = null, inputTokens = null, outputTokens = null }) {
  const chat = getChat(userId, chatId)
  if (!chat) throw new Error('appendMessage: chat not found')
  if (role !== 'user' && role !== 'assistant') throw new Error('appendMessage: bad role')
  const db = getDb()
  const now = Date.now()
  const id = newId()
  db.prepare(`
    INSERT INTO ai_messages (id, chat_id, role, content, model, input_tokens, output_tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, chatId, role, String(content), model, inputTokens, outputTokens, now)
  db.prepare('UPDATE ai_chats SET updated_at = ? WHERE id = ?').run(now, chatId)
  return { id, role, content, model, input_tokens: inputTokens, output_tokens: outputTokens, created_at: now }
}

// The local-CLI backend's continuity handle: Claude Code's own session id,
// created on the first turn and --resume'd on every later one.
function setClaudeSession(userId, chatId, sessionId) {
  const db = getDb()
  db.prepare('UPDATE ai_chats SET claude_session_id = ? WHERE id = ? AND user_id = ?')
    .run(sessionId || null, chatId, userId)
}

// Ground truth for metering: tokens this user consumed in the trailing window.
function usageSince(userId, sinceMs) {
  const db = getDb()
  const row = db.prepare(`
    SELECT COALESCE(SUM(m.input_tokens), 0) AS input, COALESCE(SUM(m.output_tokens), 0) AS output
    FROM ai_messages m JOIN ai_chats c ON c.id = m.chat_id
    WHERE c.user_id = ? AND m.created_at >= ?
  `).get(userId, sinceMs)
  return { inputTokens: row?.input || 0, outputTokens: row?.output || 0 }
}

module.exports = { createChat, getChat, listChats, renameChat, deleteChat, listMessages, appendMessage, setClaudeSession, usageSince }
