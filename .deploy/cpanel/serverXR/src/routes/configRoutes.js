function registerConfigRoutes(router, { requireAdminAlways, configStore }) {
  router.get('/api/config', async (req, res, next) => {
    try {
      const cfg = await configStore.read()
      res.json({ config: { defaultSpaceId: cfg.defaultSpaceId || null } })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/api/config', requireAdminAlways, async (req, res, next) => {
    try {
      const { defaultSpaceId } = req.body || {}
      const updates = {}
      if (defaultSpaceId !== undefined) {
        updates.defaultSpaceId = defaultSpaceId || null
      }
      const updated = await configStore.patch(updates)
      res.json({ config: { defaultSpaceId: updated.defaultSpaceId || null } })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerConfigRoutes }
