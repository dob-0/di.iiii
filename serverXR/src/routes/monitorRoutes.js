// Private overview for Preferences → Monitor. It lists machines, session titles, spaces
// and the owner's open asks, so it is for ONE account, not for every admin:
//
//   local  loopback + non-production (or DI_LOCAL=1), then admin   (404 / 403)
//   dev    only an account in MONITOR_OWNER_USER_IDS, signed in as itself (a browser session; a
//          terminal login `di login` for the report route only). Everyone else gets the same 404
//          an unknown route gives: another admin, an API token, di.bo's act token, a sync key, a
//          visitor. An unset list is nobody (fail closed).
//   prod   404, always — and so is any deploy name this file does not know (`standby`, the Mac's
//          prod tier, is prod: monitorHub.tierOfDeployEnv fails closed)
//
// The tier comes from the release manifest (releaseInfo.deployEnv), never from a header.
// POST /api/monitor/report also takes a terminal login whose ACCOUNT is the owner: that login is
// capped below admin everywhere else, and this one write of the machine's own telemetry is the
// only thing the cap is lifted for.

const { createMonitorStore } = require('../monitorStore')
const { createHub, createAskStore, fingerprint, tierOfDeployEnv, REPORT_MAX_BYTES } = require('../monitorHub')
const { createLedger } = require('../monitorLedger')
const { config } = require('../config')
const { isLocalOperatorRequest, isAdminCaller } = require('./agentBoardRoutes')

const TASK_WRITES_PER_MIN = 30
const STREAM_MIN_MS = 2000
const HEARTBEAT_MS = 15000
const STREAM_MAX_MS = 15 * 60 * 1000
const STREAMS_PER_SUBJECT = 4
const STREAM_BUFFER_MAX = 1024 * 1024

/** An expiry in ms or seconds → ms, or null. */
const expiryMs = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 1e11 ? n * 1000 : n
}

function registerMonitorRoutes(router, {
  store = createMonitorStore(),
  hub = null,
  requireAuth = () => config.requireAuth,
  deployEnv = () => null,
  ownerIds = () => config.monitorOwnerUserIds,
  prList = null,
  ledger = null,
  now = () => Date.now()
} = {}) {
  const overview = hub || createHub({ store })
  const tasks = ledger || createLedger()
  const selfBase = () => `http://127.0.0.1:${config.port}${config.basePath || ''}`
  // A refusal says nothing of its own: the request falls through to whatever answers a path
  // that does not exist, so the page's existence is not shown (spec: "404, not 403").
  const HIDDEN = 'hidden'
  const notFound = () => HIDDEN

  // dev tier: the owner's own login. `actor` marks someone else's errand (di.bo) or a terminal
  // login; only the report route takes the second.
  const isOwner = (req, { terminal = false } = {}) => {
    const state = req.authState || {}
    if (!requireAuth() || !state.authenticated || !state.subject) return false
    if (state.type !== 'session' && state.type !== 'cli-token') return false
    // a session minted from an API token is the token's, not the person signing in
    if (state.session?.via === 'token') return false
    if (state.actor === 'di.cli' ? !(terminal && state.cliDbRole === 'admin') : Boolean(state.actor)) return false
    const list = (ownerIds() || []).map((id) => String(id).trim()).filter(Boolean)
    return list.includes(String(state.subject))
  }

  const refuse = (req, res, opts) => {
    const tier = tierOfDeployEnv(deployEnv())
    if (tier === 'prod') return notFound()
    if (tier === 'dev') return isOwner(req, opts) ? false : notFound()
    if (!isLocalOperatorRequest(req)) return notFound()
    if (!isAdminCaller(req, requireAuth())) {
      res.status(403).json({ error: 'admins only' })
      return true
    }
    return false
  }
  const gate = (req, res, next) => {
    const out = refuse(req, res)
    if (out === HIDDEN) next('route')
    else if (!out) next()
  }

  // A terminal login is capped below admin; its account's real role rides along
  // as cliDbRole (index.js). Only the report route reads it.
  const reportGate = (req, res, next) => {
    const state = req.authState || {}
    if (state.actor === 'di.cli' && state.authenticated) {
      const tier = tierOfDeployEnv(deployEnv())
      if (tier === 'prod') { next('route'); return }
      if (tier === 'dev') { if (isOwner(req, { terminal: true })) next(); else next('route'); return }
      if (!isLocalOperatorRequest(req)) { next('route'); return }
      if (state.cliDbRole === 'admin') { next(); return }
      res.status(403).json({ error: 'admins only' })
      return
    }
    gate(req, res, next)
  }

  router.get('/api/monitor', gate, async (req, res) => {
    try {
      res.json(await overview.getSnapshot({ selfBase: selfBase() }))
    } catch (error) {
      res.status(500).json({ error: error.message || 'monitor scan failed' })
    }
  })

  // Open pull requests (read-only). Same gate as the page; without a source it answers "not set up".
  router.get('/api/monitor/prs', gate, async (req, res) => {
    try {
      res.json(prList ? await prList.list() : { ok: false, repo: null, reason: 'no-source', message: 'No pull request source on this server.' })
    } catch (error) {
      res.status(500).json({ error: error.message || 'pull request list failed' })
    }
  })

  // Tasks lane: the owner's open asks (read) and ONE owner-only write that goes through ledger-add.
  router.get('/api/monitor/tasks', gate, async (req, res) => {
    try {
      const id = req.query?.id
      res.json(id ? await tasks.detail(String(id)) : await tasks.list({ days: req.query?.days }))
    } catch (error) {
      res.status(500).json({ error: error.message || 'tasks failed' })
    }
  })

  // The one write here changes the owner's ledger: a browser may only send it from this same origin
  // (Sec-Fetch-Site / Origin), and no more than TASK_WRITES_PER_MIN per minute per caller (429).
  const taskWrites = new Map()
  const sameOrigin = (req) => {
    const h = req.headers || {}
    const site = h['sec-fetch-site']
    if (site) return site === 'same-origin'
    if (h.origin) { try { return new URL(h.origin).host === h.host } catch { return false } }
    return true // no browser headers: a terminal tool, still behind the owner gate
  }
  const taskGuard = (req, res, next) => {
    if (!sameOrigin(req)) { res.status(403).json({ error: 'cross_origin' }); return }
    const key = String(req.authState?.subject || 'local')
    const t = now()
    const recent = (taskWrites.get(key) || []).filter((x) => t - x < 60000)
    if (recent.length >= TASK_WRITES_PER_MIN) { taskWrites.set(key, recent); res.status(429).json({ error: 'too_many' }); return }
    recent.push(t)
    taskWrites.set(key, recent)
    next()
  }

  router.post('/api/monitor/tasks', gate, taskGuard, async (req, res) => {
    try {
      const b = req.body || {}
      const out = await tasks.change({ id: b.id, action: b.action, text: b.text, evidence: b.evidence, next: b.next, by: req.authState?.subject || 'local' })
      if (out.error) { res.status(out.status || 400).json({ error: out.error, ...(out.message ? { message: out.message } : {}) }); return }
      res.json(out)
    } catch (error) {
      res.status(500).json({ error: error.message || 'task change failed' })
    }
  })

  router.post('/api/monitor/report', reportGate, (req, res) => {
    const length = Number(req.headers?.['content-length'] || 0)
    if (length > REPORT_MAX_BYTES * 2) { res.status(413).json({ error: 'too_large', max: REPORT_MAX_BYTES }); return }
    // past the gate the sender is the owner (dev) or this machine's admin (local): ledger asks are theirs
    const result = overview.reports.put(req.body, { subject: req.authState?.subject || 'local', ledger: true })
    if (result.error) { res.status(result.status).json({ error: result.error, ...(result.max ? { max: result.max } : {}) }); return }
    res.json({ ok: true, host: result.host })
  })

  router.post('/api/monitor/ask', gate, (req, res) => {
    // a browser SESSION, never a terminal login: the cap above is kept for everything but the report
    try {
      const result = overview.asks.add({ text: req.body?.text, by: req.authState?.subject || null })
      if (result.error) { res.status(result.status).json({ error: result.error, ...(result.max ? { max: result.max } : {}) }); return }
      res.json({ id: result.id })
    } catch (error) {
      res.status(500).json({ error: error.message || 'ask failed' })
    }
  })

  // Server-sent events. ONE poller builds the snapshot once per tick for every open stream
  // (at most every 2 s, only while someone listens); each client gets the same text. A client
  // that cannot keep up (1 MB queued) is dropped, a subject holds at most 4 streams, and a
  // stream ends at its session's expiry or after 15 minutes so EventSource (retry 3000)
  // comes back through the gate.
  const clients = new Set()
  let poll = null
  let beat = null
  let busy = false
  let lastPrint = null
  let lastPayload = null
  // When each panel was last read (server clock). Clients get AGES (how many ms ago), computed at send time,
  // so a browser clock that is wrong never makes a panel look old or fresh.
  let lastPanelAt = null
  const panelAt = (snap) => ({
    ...Object.fromEntries(Object.entries(snap?.panels || {}).filter(([, p]) => p && typeof p.at === 'number').map(([k, p]) => [k, p.at])),
    tiers: typeof snap?.tiers?.at === 'number' ? snap.tiers.at : null,
    chats: snap?.chats?.heardSecondsAgo != null ? now() - snap.chats.heardSecondsAgo * 1000 : null
  })
  const ages = () => Object.fromEntries(Object.entries(lastPanelAt || {}).filter(([, at]) => typeof at === 'number').map(([k, at]) => [k, Math.max(0, now() - at)]))
  const heartbeat = () => `event: heartbeat\ndata: ${JSON.stringify({ at: new Date(now()).toISOString(), ages: ages() })}\n\n`

  const send = (client, text) => {
    if (client.closed) return
    if ((client.res.writableLength || 0) > STREAM_BUFFER_MAX) { client.close(); return }
    client.res.write(text)
  }
  const tick = async () => {
    if (busy || !clients.size) return
    busy = true
    try {
      const snapshot = await overview.getSnapshot({ selfBase: selfBase() })
      lastPanelAt = panelAt(snapshot)
      const print = fingerprint(snapshot)
      if (print !== lastPrint && clients.size) {
        lastPrint = print
        lastPayload = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
        for (const client of [...clients]) send(client, lastPayload)
      }
      // every tick says how old each panel is; a tick with changes carries the snapshot first
      if (clients.size) { const text = heartbeat(); for (const client of [...clients]) send(client, text) }
    } catch {
      // a failed scan is skipped; the next tick tries again
    } finally {
      busy = false
    }
  }
  const startPoller = () => {
    lastPrint = null
    lastPayload = null
    poll = setInterval(tick, STREAM_MIN_MS)
    beat = setInterval(() => { for (const client of [...clients]) send(client, heartbeat()) }, HEARTBEAT_MS)
    poll.unref?.()
    beat.unref?.()
  }
  const stopPoller = () => {
    clearInterval(poll)
    clearInterval(beat)
    poll = null
    beat = null
    lastPrint = null
    lastPayload = null
  }

  router.get('/api/monitor/stream', gate, (req, res) => {
    const subject = String(req.authState?.subject || 'local')
    let held = 0
    for (const c of clients) if (c.subject === subject) held += 1
    if (held >= STREAMS_PER_SUBJECT) { res.status(429).json({ error: 'too_many_streams', max: STREAMS_PER_SUBJECT }); return }

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders?.()
    res.write('retry: 3000\n\n')

    const client = { res, subject, closed: false, timer: null, close: null }
    client.close = () => {
      if (client.closed) return
      client.closed = true
      clearTimeout(client.timer)
      clients.delete(client)
      if (!clients.size) stopPoller()
      res.end()
    }
    const expires = expiryMs(req.authState?.session?.expiresAt)
    const life = Math.max(0, Math.min(STREAM_MAX_MS, expires ? expires - now() : STREAM_MAX_MS))
    client.timer = setTimeout(client.close, life)
    client.timer.unref?.()
    // gone before the listener below could hear it: never enters the set
    if (req.destroyed || res.writableEnded || res.destroyed) { client.close(); return }
    clients.add(client)
    req.on('close', client.close)

    if (poll) {
      // already polling: hand over the latest snapshot; nothing is built for a newcomer
      if (lastPayload) send(client, lastPayload)
    } else {
      startPoller()
      tick()
    }
  })

  // Shutdown: an open stream counts as a request in flight, so the stop would wait for it.
  const closeAll = () => { for (const client of [...clients]) client.close() }
  return { closeAll }
}

module.exports = { registerMonitorRoutes, STREAM_MIN_MS, HEARTBEAT_MS, STREAM_MAX_MS, STREAMS_PER_SUBJECT }
