const os = require('node:os')

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

  router.get('/api/events', (req, res) => {
    res.json({ events: recentEvents })
  })
}

module.exports = {
  registerStatusRoutes
}
