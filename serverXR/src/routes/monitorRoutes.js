// Operator-only snapshot for Preferences → Monitor. It lists machines, session
// titles and operator-defined feeds, so it is guarded exactly like the agent
// board (routes/agentBoardRoutes.js): loopback on a local server, then admin.
// Refusals off-machine are 404 — the surface does not advertise itself.

const { createMonitorStore } = require('../monitorStore')
const { config } = require('../config')
const { isLocalOperatorRequest, isAdminCaller } = require('./agentBoardRoutes')

function registerMonitorRoutes(router, {
  store = createMonitorStore(),
  requireAuth = () => config.requireAuth
} = {}) {
  const gate = (req, res, next) => {
    if (!isLocalOperatorRequest(req)) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (!isAdminCaller(req, requireAuth())) {
      res.status(403).json({ error: 'admins only' })
      return
    }
    next()
  }

  router.get('/api/monitor', gate, async (req, res) => {
    try {
      // same machine, same server: the status routes it already serves
      const selfBase = `http://127.0.0.1:${config.port}${config.basePath || ''}`
      res.json(await store.getMonitor({ selfBase }))
    } catch (error) {
      res.status(500).json({ error: error.message || 'monitor scan failed' })
    }
  })
}

module.exports = { registerMonitorRoutes }
