// Operator-only board of local Claude Code sessions for Ops Graph → Agents.
// This surface reads ~/.claude — transcripts can contain secrets — so it must
// never be reachable off the operator's own machine. Guarded the same way for
// the same reason as approval-style local tooling: the request must arrive
// over loopback AND the server must be a local one — NODE_ENV not production,
// or an explicit DI_LOCAL=1 (the di CLI runner sets NODE_ENV=production for a
// personal install, which is still one person on their own machine). Loopback
// stays absolute either way: a dev box with its port forwarded must still
// refuse. Refusals are 404 (the surface does not advertise itself).

const { createAgentBoardStore } = require('../agentBoardStore')

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function isLocalOperatorRequest(req) {
  const local = process.env.NODE_ENV !== 'production' || process.env.DI_LOCAL === '1'
  if (!local) return false
  const address = req.socket?.remoteAddress || ''
  return LOOPBACK_ADDRESSES.has(address)
}

function registerAgentBoardRoutes(router, { store = createAgentBoardStore() } = {}) {
  const requireLocalOperator = (req, res, next) => {
    if (!isLocalOperatorRequest(req)) {
      res.status(404).json({ error: 'not found' })
      return
    }
    next()
  }

  router.get('/api/agent-board', requireLocalOperator, async (req, res) => {
    try {
      res.json(await store.getBoard())
    } catch (error) {
      res.status(500).json({ error: error.message || 'agent board scan failed' })
    }
  })

  router.get('/api/agent-board/session/:sessionId', requireLocalOperator, async (req, res) => {
    const sessionId = String(req.params.sessionId || '')
    // session ids are uuid-shaped; reject anything path-like before it touches fs
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(sessionId)) {
      res.status(400).json({ error: 'invalid session id' })
      return
    }
    try {
      const detail = await store.getSessionDetail(sessionId)
      if (!detail) {
        res.status(404).json({ error: 'session not found' })
        return
      }
      res.json(detail)
    } catch (error) {
      res.status(500).json({ error: error.message || 'agent session read failed' })
    }
  })
}

module.exports = { registerAgentBoardRoutes, isLocalOperatorRequest }
