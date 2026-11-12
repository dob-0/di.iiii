// Agent mail over HTTP. Rules and storage: ../agentMailStore.js; why and the
// threat model: docs/ai/decisions/2026-11-12-agent-mail.md.
//
// Signed-in people only: a guest is a disposable browser identity and cannot be
// somebody a message comes from. A terminal login (`di login`) is the same
// person, so `di tell` works from it (cliTokenGate + catalogue/entries/agentMail.js).
//
// A recipient is a handle the server already knows: the account's username
// (first-party accounts) or its id. An email address is never accepted, so this
// is not a way to ask whether an address has an account.

const store = require('../agentMailStore')
const { findUserById, listUsers } = require('../userStore')
const { isGuestSubject } = require('../authAccess')
const { getDb } = require('../db')

const handleOf = (user) => user?.username || user?.id || null

const registerAgentMailRoutes = (router, { deps = {} } = {}) => {
  const s = { ...store, ...deps.store }
  const users = { findUserById, listUsers, ...deps.users }
  const spaceInfo = deps.spaceInfo || ((id) => {
    try { return getDb().prepare('SELECT kind, is_public FROM spaces WHERE id = ?').get(String(id)) } catch { return null }
  })

  const accountOf = (req) => {
    const state = req.authState
    if (!state?.authenticated || state.type !== 'session') return null
    if (!state.subject || isGuestSubject(state.subject)) return null
    return state
  }

  // A space counts only if it is somebody's own to share: not the communal open space (kind 'global', index.js
  // ensureOpenSpace), not an account's sandbox, not anything public to all (spaces.is_public, db.js). Every account
  // can hold the open space, so counting it would make every pair "share" and leave the stranger gate empty.
  // users.spaces is a flat list of granted ids (userStore.js); roles are per account (users.role), not per space,
  // so "has a grant" is the membership there is. An id with no spaces row is treated as an ordinary space.
  const countsAsShared = (spaceId) => {
    const row = spaceInfo(spaceId)
    return !(row && (row.kind === 'global' || row.kind === 'sandbox' || Number(row.is_public) === 1))
  }

  // Only the SENDER being unrestricted (the owner or an admin writing out) skips the gate. A recipient being
  // unrestricted must not: the admin is the account strangers will target most.
  const sharesASpace = (mine, theirs) => {
    if (mine.isUnrestricted) return true
    const set = new Set(Array.isArray(mine.spaces) ? mine.spaces : [])
    return (Array.isArray(theirs.spaces) ? theirs.spaces : []).some((id) => set.has(id) && countsAsShared(id))
  }

  const find = (handle) => {
    const wanted = String(handle || '').trim().toLowerCase()
    if (!wanted || wanted.includes('@')) return null
    return users.listUsers().find((u) => String(u.username || '').toLowerCase() === wanted)
      || users.findUserById(String(handle).trim())
      || null
  }

  const labelFor = (id) => handleOf(users.findUserById(id)) || id
  const outMessage = (m) => ({
    id: m.id, from: labelFor(m.fromUser), fromAgent: m.fromAgent, toAgent: m.toAgent, body: m.body,
    threadId: m.threadId, replyTo: m.replyTo, createdAt: m.createdAt, readAt: m.readAt
  })

  const guard = (handler) => (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in to use agent mail.' })
    return handler(req, res, me)
  }

  const fail = (res, result) => {
    const body = { error: result.error }
    if (result.max) body.max = result.max
    if (result.retryAfterSeconds) res.set?.('Retry-After', String(result.retryAfterSeconds))
    return res.status(result.status).json(body)
  }

  router.post('/api/agent-mail', guard((req, res, me) => {
    const { to, toAgent, fromAgent, body, replyTo } = req.body || {}
    const them = find(to)
    if (!them) return res.status(404).json({ error: 'no_such_user' })
    const result = s.sendMessage({
      from: me.subject,
      fromAgent,
      to: them.id,
      toAgent,
      body,
      replyTo,
      shares: sharesASpace(me, { spaces: them.spaces, isUnrestricted: them.isUnrestricted })
    })
    if (result.error) return fail(res, result)
    return res.status(201).json({
      id: result.message.id,
      threadId: result.message.threadId,
      status: result.message.state === 'pending' ? 'request_sent' : 'delivered'
    })
  }))

  router.get('/api/agent-mail/inbox', guard((req, res, me) => {
    const { messages, requests } = s.inbox(me.subject, {
      since: req.query?.since,
      unreadOnly: req.query?.unread === '1' || req.query?.unread === 'true',
      limit: req.query?.limit
    })
    return res.json({
      messages: messages.map(outMessage),
      requests: requests.map((r) => ({ id: r.id, from: labelFor(r.fromUser), fromAgent: r.fromAgent, preview: r.preview, createdAt: r.createdAt }))
    })
  }))

  router.post('/api/agent-mail/:id/read', guard((req, res, me) => {
    const result = s.markRead(me.subject, req.params.id)
    if (result.error) return fail(res, result)
    return res.json({ message: outMessage(result.message) })
  }))

  router.get('/api/agent-mail/contacts', guard((req, res, me) => {
    return res.json({ contacts: s.listContacts(me.subject).map((c) => ({ user: labelFor(c.user), state: c.state, createdAt: c.createdAt })) })
  }))

  router.post('/api/agent-mail/contacts', guard((req, res, me) => {
    const state = req.body?.state
    if (state !== 'allowed' && state !== 'blocked') return res.status(400).json({ error: 'state_must_be_allowed_or_blocked' })
    const them = find(req.body?.user)
    if (!them) return res.status(404).json({ error: 'no_such_user' })
    if (them.id === me.subject) return res.status(400).json({ error: 'not_yourself' })
    if (state === 'allowed') s.allow(me.subject, them.id)
    else s.block(me.subject, them.id)
    return res.json({ user: labelFor(them.id), state })
  }))
}

module.exports = { registerAgentMailRoutes }
