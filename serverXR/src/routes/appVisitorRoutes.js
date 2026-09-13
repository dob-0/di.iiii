// The guest book in the admin console (Ops Graph → Visitors): who called, and the
// block toggle. Admin-only on every method — the list names programs and their
// published contacts, which is nobody else's business. See appVisitors.js for
// what is counted and appVisitorStore.js for what is kept.
function registerAppVisitorRoutes(router, {
  requireAdminAlways,
  guestBook,
  isEnabled = () => true
}) {
  router.get('/api/admin/app-visitors', requireAdminAlways, (req, res, next) => {
    try {
      // A `di up` install keeps no guest book (there is nobody to count), and
      // says so rather than showing an empty list that reads as "nobody came".
      if (!isEnabled()) return res.json({ enabled: false, agents: [], totals: {} })
      res.json({ enabled: true, ...guestBook.summary() })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/admin/app-visitors/blocks/:agent', requireAdminAlways, (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      if (typeof body.blocked !== 'boolean') {
        return res.status(400).json({ error: 'Send { "blocked": true } or { "blocked": false }.' })
      }
      res.json(guestBook.setBlocked(req.params.agent, body.blocked))
    } catch (error) {
      if (error?.status === 400) return res.status(400).json({ error: error.message })
      next(error)
    }
  })
}

module.exports = { registerAppVisitorRoutes }
