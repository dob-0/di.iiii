// Agent mail: the storage and the rules. The routes (routes/agentMailRoutes.js)
// only translate HTTP to these calls. Why it exists, who may write to whom and
// what a stranger can do: docs/ai/decisions/2026-11-12-agent-mail.md.
//
// The rules, once:
//   - a person you share a space with may write to you directly;
//   - anyone else gets ONE held request; more from them are refused until you
//     allow them (409 request_pending);
//   - you can block a sender: 403, and nothing about you in the answer;
//   - answering somebody who wrote to you opens the door back to them.
// Nothing here is end-to-end encrypted: the server can read a message. Say so
// wherever it is described; never put a secret in one.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const MAX_BODY = 4000
const PREVIEW = 200
const PER_HOUR = 30
const REQUESTS_PER_DAY = 5
const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// Plain text only: tab and newline stay, every other control character (and the
// Unicode bidi overrides that make text read backwards) goes. A message is
// information shown to another agent; it must not carry terminal escapes.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g
const cleanBody = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim()
const cleanAgent = (value) => {
  const text = String(value ?? '').replace(CONTROL, '').trim().slice(0, 40)
  return /^[A-Za-z0-9._-]+$/.test(text) ? text : null
}

const rowToMessage = (row) => (row
  ? {
      id: row.id,
      fromUser: row.from_user,
      fromAgent: row.from_agent || null,
      toUser: row.to_user,
      toAgent: row.to_agent || null,
      body: row.body,
      threadId: row.thread_id,
      replyTo: row.reply_to || null,
      state: row.state,
      createdAt: Number(row.created_at),
      readAt: row.read_at == null ? null : Number(row.read_at)
    }
  : null)

const contactState = (owner, other) => getDb()
  .prepare('SELECT state FROM agent_contacts WHERE owner_user = ? AND other_user = ?')
  .get(owner, other)?.state || null

const setContact = (owner, other, state, now = Date.now()) => {
  getDb().prepare(`
    INSERT INTO agent_contacts (owner_user, other_user, state, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (owner_user, other_user) DO UPDATE SET state = excluded.state
  `).run(owner, other, state, now)
}

const count = (sql, ...args) => Number(getDb().prepare(sql).get(...args)?.n || 0)

/**
 * Send. `shares` says whether the two people share a space (the route knows the
 * space model; the store does not). Returns { message } or { error, status }.
 */
const sendMessage = ({ from, fromAgent, to, toAgent, body, replyTo, shares, now = Date.now() }) => {
  const db = getDb()
  const text = cleanBody(body)
  if (!text) return { error: 'empty', status: 400 }
  if (text.length > MAX_BODY) return { error: 'too_long', status: 400, max: MAX_BODY }
  if (from === to) return { error: 'not_yourself', status: 400 }

  // A blocked sender learns nothing — not even that the receiver exists.
  if (contactState(to, from) === 'blocked') return { error: 'blocked', status: 403 }

  if (count('SELECT COUNT(*) AS n FROM agent_messages WHERE from_user = ? AND created_at > ?', from, now - HOUR) >= PER_HOUR) {
    return { error: 'rate_limited', status: 429, retryAfterSeconds: 3600 }
  }

  // They wrote to me (even a held request) and I am answering: that is allowing them.
  const answering = count('SELECT COUNT(*) AS n FROM agent_messages WHERE from_user = ? AND to_user = ?', to, from) > 0
  const knows = shares || answering || contactState(to, from) === 'allowed'
  let state = 'delivered'
  let request = 0
  if (!knows) {
    if (count("SELECT COUNT(*) AS n FROM agent_messages WHERE from_user = ? AND to_user = ? AND state = 'pending'", from, to) > 0) {
      return { error: 'request_pending', status: 409 }
    }
    if (count('SELECT COUNT(*) AS n FROM agent_messages WHERE from_user = ? AND request = 1 AND created_at > ?', from, now - DAY) >= REQUESTS_PER_DAY) {
      return { error: 'rate_limited', status: 429, retryAfterSeconds: 86400 }
    }
    state = 'pending'
    request = 1
  }

  let threadId = null
  let parent = null
  if (replyTo) {
    parent = db.prepare('SELECT * FROM agent_messages WHERE id = ? AND to_user = ?').get(String(replyTo), from)
    if (!parent) return { error: 'no_such_message', status: 404 }
    threadId = parent.thread_id
  }
  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO agent_messages (id, from_user, from_agent, to_user, to_agent, body, thread_id, reply_to, state, request, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, from, cleanAgent(fromAgent), to, cleanAgent(toAgent), text, threadId || id, parent ? parent.id : null, state, request, now)
  // Answering opens the door back: the other side's held request (if any) is released.
  if (answering && !shares && contactState(from, to) !== 'blocked') allow(from, to)
  return { message: rowToMessage(db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id)) }
}

const releasePending = (receiver, sender) => {
  getDb().prepare("UPDATE agent_messages SET state = 'delivered' WHERE to_user = ? AND from_user = ? AND state = 'pending'").run(receiver, sender)
}

/** { messages: delivered (newest first), requests: held ones with a capped preview }. */
const inbox = (user, { since = 0, unreadOnly = false, limit = 100 } = {}) => {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 200)
  const after = Number(since) || 0
  const messages = getDb().prepare(`
    SELECT * FROM agent_messages WHERE to_user = ? AND state = 'delivered' AND created_at > ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
    ORDER BY created_at DESC LIMIT ?
  `).all(user, after, cap).map(rowToMessage)
  const requests = getDb().prepare(`
    SELECT id, from_user, from_agent, body, created_at FROM agent_messages
    WHERE to_user = ? AND state = 'pending' AND created_at > ? ORDER BY created_at DESC LIMIT ?
  `).all(user, after, cap).map((row) => ({
    id: row.id,
    fromUser: row.from_user,
    fromAgent: row.from_agent || null,
    preview: row.body.length > PREVIEW ? `${row.body.slice(0, PREVIEW)}…` : row.body,
    createdAt: Number(row.created_at)
  }))
  return { messages, requests }
}

const markRead = (user, id, now = Date.now()) => {
  const row = getDb().prepare('SELECT * FROM agent_messages WHERE id = ? AND to_user = ?').get(String(id), user)
  if (!row) return { error: 'no_such_message', status: 404 }
  if (row.state === 'pending') return { error: 'request_pending', status: 409 }
  if (row.read_at == null) getDb().prepare('UPDATE agent_messages SET read_at = ? WHERE id = ?').run(now, row.id)
  return { message: rowToMessage(getDb().prepare('SELECT * FROM agent_messages WHERE id = ?').get(row.id)) }
}

const allow = (owner, other) => {
  setContact(owner, other, 'allowed')
  releasePending(owner, other)
}

const block = (owner, other) => {
  setContact(owner, other, 'blocked')
  // Held requests from a blocked sender are removed, not kept.
  getDb().prepare("DELETE FROM agent_messages WHERE to_user = ? AND from_user = ? AND state = 'pending'").run(owner, other)
}

const listContacts = (owner) => getDb()
  .prepare('SELECT other_user, state, created_at FROM agent_contacts WHERE owner_user = ? ORDER BY created_at DESC')
  .all(owner)
  .map((row) => ({ user: row.other_user, state: row.state, createdAt: Number(row.created_at) }))

module.exports = {
  sendMessage, inbox, markRead, allow, block, listContacts, contactState, cleanBody, cleanAgent,
  MAX_BODY, PREVIEW, PER_HOUR, REQUESTS_PER_DAY
}
