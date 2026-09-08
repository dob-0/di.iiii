const os = require('node:os')
const { config } = require('../config')
const { hasRequiredAuthRole } = require('../authAccess')

function registerStatusRoutes(router, {
  recentEvents,
  startedAt,
  releaseInfo
}) {
  // What this install is following on other di.iiii, and whether the ops are
  // moving. Read-only and loopback-only: it names other machines and is nobody
  // else's business, least of all a visitor's.
  router.get('/api/follows', (req, res) => {
    const address = req.socket?.remoteAddress || ''
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
      res.status(404).json({ error: 'not found' })
      return
    }
    try {
      const { followStates } = require('../follow')
      res.json({ follows: followStates() })
    } catch {
      res.json({ follows: [] })
    }
  })

  router.get('/api/health', (req, res) => {
    const memory = process.memoryUsage()
    res.json({
      ok: true,
      nodeVersion: process.version,
      uptimeSeconds: process.uptime(),
      startedAt,
      timestamp: Date.now(),
      mode: process.env.NODE_ENV || 'production',
      port: process.env.PORT || 'unknown',
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed
      },
      host: {
        platform: process.platform,
        release: os.release(),
        cpus: os.cpus().length
      },
      release: {
        ...releaseInfo
      }
    })
  })

  // This route has no requiredSpaceId, so the global requireReadRole/
  // requireWriteRole middleware never applies to it — gate the sensitive
  // detail (raw request URLs, error text) here instead. Deploy/monitoring
  // tooling still gets a 200 + valid JSON shape without it.
  router.get('/api/events', (req, res) => {
    if (!config.requireAuth) {
      return res.json({ events: recentEvents })
    }
    const state = req.authState
    const isAdmin = Boolean(state?.authenticated) && hasRequiredAuthRole(state.role, 'admin')
    if (!isAdmin) {
      return res.json({ events: [] })
    }
    res.json({ events: recentEvents })
  })
}

module.exports = {
  registerStatusRoutes
}
