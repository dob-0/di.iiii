// Operator-only overview for Preferences → Monitor. It lists machines, session
// titles, spaces and the owner's open asks, so it is guarded like the agent board
// (routes/agentBoardRoutes.js), with one addition for the dev tier:
//
//   local  loopback + non-production (or DI_LOCAL=1), then admin   (404 / 403)
//   dev    an admin session, from anywhere (a proxy hides loopback there)   (403 below admin)
//   prod   404, always
//
// The tier comes from the release manifest (releaseInfo.deployEnv), never from a
// header. POST /api/monitor/report also takes a terminal login (`di login`) whose
// ACCOUNT is an admin: that login is capped below admin everywhere else, and this
// one write of the machine's own telemetry is the only thing the cap is lifted for.

const { createMonitorStore } = require('../monitorStore')
const { createHub, createAskStore, fingerprint, tierOfDeployEnv, REPORT_MAX_BYTES } = require('../monitorHub')
const { config } = require('../config')
const { isLocalOperatorRequest, isAdminCaller } = require('./agentBoardRoutes')

const STREAM_MIN_MS = 2000
const HEARTBEAT_MS = 15000

function registerMonitorRoutes(router, {
  store = createMonitorStore(),
  hub = null,
  requireAuth = () => config.requireAuth,
  deployEnv = () => null
} = {}) {
  const overview = hub || createHub({ store })
  const selfBase = () => `http://127.0.0.1:${config.port}${config.basePath || ''}`

  const refuse = (req, res) => {
    const tier = tierOfDeployEnv(deployEnv())
    if (tier === 'prod') {
      res.status(404).json({ error: 'not found' })
      return true
    }
    if (tier === 'dev') {
      if (!requireAuth() || !isAdminCaller(req, true)) {
        res.status(403).json({ error: 'admins only' })
        return true
      }
      return false
    }
    if (!isLocalOperatorRequest(req)) {
      res.status(404).json({ error: 'not found' })
      return true
    }
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
      if (tier === 'prod') { res.status(404).json({ error: 'not found' }); return }
      if (state.cliDbRole === 'admin' && (tier === 'dev' || isLocalOperatorRequest(req))) { next(); return }
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
    const result = overview.reports.put(req.body)
    if (result.error) { res.status(result.status).json({ error: result.error, ...(result.max ? { max: result.max } : {}) }); return }
    res.json({ ok: true, host: result.host })
  })

  router.post('/api/monitor/ask', gate, (req, res) => {
    // an admin SESSION, never a terminal login: the cap above is kept for everything but the report
    try {
      const result = overview.asks.add({ text: req.body?.text, by: req.authState?.subject || null })
      if (result.error) { res.status(result.status).json({ error: result.error, ...(result.max ? { max: result.max } : {}) }); return }
      res.json({ id: result.id })
    } catch (error) {
      res.status(500).json({ error: error.message || 'ask failed' })
    }
  })

  // Server-sent events: `snapshot` whenever the overview changes (at most every
  // 2 s), a comment line every 15 s so a proxy keeps the connection.
  router.get('/api/monitor/stream', gate, (req, res) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders?.()
    res.write('retry: 3000\n\n')
    let closed = false
    let last = null
    let busy = false
    const tick = async () => {
      if (closed || busy) return
      busy = true
      try {
        const snapshot = await overview.getSnapshot({ selfBase: selfBase() })
        const print = fingerprint(snapshot)
        if (!closed && print !== last) {
          last = print
          res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)
        }
      } catch {
        // a failed scan is skipped; the next tick tries again
      } finally {
        busy = false
      }
    }
    const poll = setInterval(tick, STREAM_MIN_MS)
    const beat = setInterval(() => { if (!closed) res.write(': heartbeat\n\n') }, HEARTBEAT_MS)
    const close = () => {
      if (closed) return
      closed = true
      clearInterval(poll)
      clearInterval(beat)
      res.end()
    }
    req.on('close', close)
    tick()
  })
}

module.exports = { registerMonitorRoutes, STREAM_MIN_MS, HEARTBEAT_MS }
