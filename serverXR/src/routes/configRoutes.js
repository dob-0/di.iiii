function registerConfigRoutes(router, { requireAdminAlways, configStore, onConfigChanged = null, approvalGate = null }) {
  const serializeConfig = (cfg) => ({
    defaultSpaceId: cfg.defaultSpaceId || null,
    // null = no global space → each guest gets a private sandbox.
    // A space id = guests share that one editable 'global' space.
    globalSpaceId: cfg.globalSpaceId === undefined ? null : (cfg.globalSpaceId || null)
  })

  if (approvalGate) {
    approvalGate.registerExecutor('config.patch', async (updates) => {
      const updated = await configStore.patch(updates)
      if (typeof onConfigChanged === 'function') {
        await onConfigChanged(updated)
      }
      return { config: serializeConfig(updated) }
    })
  }

  router.get('/api/config', async (req, res, next) => {
    try {
      res.json({ config: serializeConfig(await configStore.read()) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/api/config', requireAdminAlways, async (req, res, next) => {
    try {
      const { defaultSpaceId, globalSpaceId } = req.body || {}
      const updates = {}
      if (defaultSpaceId !== undefined) {
        updates.defaultSpaceId = defaultSpaceId || null
      }
      if (globalSpaceId !== undefined) {
        updates.globalSpaceId = globalSpaceId || null
      }
      const outcome = await approvalGate.gateOrApply({
        kind: 'config.patch',
        args: updates,
        actorState: req.authState,
        summary: `patch server config: ${Object.keys(updates).join(', ') || '(no changes)'}`,
        req
      })
      if (outcome.pending) {
        return res.status(202).json({ status: 'pending_approval', approvalId: outcome.id, expiresAt: outcome.expiresAt })
      }
      res.json(outcome.result)
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerConfigRoutes }
