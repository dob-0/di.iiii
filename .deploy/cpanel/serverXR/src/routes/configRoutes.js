function registerConfigRoutes(router, { requireAdminAlways, configStore }) {
  const serializeConfig = (cfg) => ({
    defaultSpaceId: cfg.defaultSpaceId || null,
    // null = no global space → each guest gets a private sandbox.
    // A space id = guests share that one editable 'global' space.
    globalSpaceId: cfg.globalSpaceId === undefined ? null : (cfg.globalSpaceId || null)
  })

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
      const updated = await configStore.patch(updates)
      res.json({ config: serializeConfig(updated) })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerConfigRoutes }
