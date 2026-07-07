const os = require('node:os')
const { config } = require('../config')
const { hasRequiredAuthRole } = require('../authAccess')

function registerStatusRoutes(router, {
  recentEvents,
  startedAt,
  releaseInfo
}) {
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
