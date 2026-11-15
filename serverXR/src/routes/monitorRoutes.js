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
const { config } = require('../config')
const { isLocalOperatorRequest, isAdminCaller } = require('./agentBoardRoutes')

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
  now = () => Date.now()
} = {}) {
  const overview = hub || createHub({ store })
  const selfBase = () => `http://127.0.0.1:${config.port}${config.basePath || ''}`
  const notFound = (res) => { res.status(404).json({ error: 'not found' }); return true }

  // dev tier: the owner's own login. `actor` marks someone else's errand (di.bo) or a terminal
  // login; only the report route takes the second.
  const isOwner = (req, { terminal = false } = {}) => {
    const state = req.authState || {}
    if (!requireAuth() || !state.authenticated || !state.subject) return false
    if (state.type !== 'session' && state.type !== 'cli-token') return false
    if (state.actor === 'di.cli' ? !(terminal && state.cliDbRole === 'admin') : Boolean(state.actor)) return false
    const list = (ownerIds() || []).map((id) => String(id).trim()).filter(Boolean)
    return list.includes(String(state.subject))
  }

  const refuse = (req, res, opts) => {
    const tier = tierOfDeployEnv(deployEnv())
    if (tier === 'prod') return notFound(res)
    if (tier === 'dev') return isOwner(req, opts) ? false : notFound(res)
    if (!isLocalOperatorRequest(req)) return notFound(res)
    if (!isAdminCaller(req, requireAuth())) {
      res.status(403).json({ error: 'admins only' })
      return true
    }
    return false
  }
  const gate = (req, res, next) => { if (!refuse(req, res)) next() }

  // A terminal login is capped below admin; its account's real role rides along
  // as cliDbRole (index.js). Only the report route reads it.
  const reportGate = (req, res, next) => {
    const state = req.authState || {}
    if (state.actor === 'di.cli' && state.authenticated) {
      const tier = tierOfDeployEnv(deployEnv())
      if (tier === 'prod') { notFound(res); return }
      if (tier === 'dev') { if (isOwner(req, { terminal: true })) next(); else notFound(res); return }
      if (!isLocalOperatorRequest(req)) { notFound(res); return }
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
      const print = fingerprint(snapshot)
      if (print !== lastPrint && clients.size) {
        lastPrint = print
        lastPayload = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
        for (const client of [...clients]) send(client, lastPayload)
      }
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
    beat = setInterval(() => { for (const client of [...clients]) send(client, ': heartbeat\n\n') }, HEARTBEAT_MS)
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
}

module.exports = { registerMonitorRoutes, STREAM_MIN_MS, HEARTBEAT_MS, STREAM_MAX_MS, STREAMS_PER_SUBJECT }
