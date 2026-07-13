function registerOpenCallRoutes(router, {
  requireAdminAlways,
  listApplications,
  updateApplication,
  deleteApplication,
  getApplication
}) {
  router.get('/api/open-calls/:callId/applications', requireAdminAlways, (req, res) => {
    const { callId } = req.params
    const { status, limit } = req.query || {}
    res.json({ applications: listApplications({ callId, status, limit }) })
  })

  router.patch('/api/open-calls/:callId/applications/:applicationId', requireAdminAlways, (req, res, next) => {
    try {
      const { applicationId, callId } = req.params
      const { status, notes } = req.body || {}
      const updated = updateApplication(applicationId, { status, notes })
      if (!updated || updated.callId !== String(callId)) {
        return res.status(404).json({ error: 'Application not found.' })
      }
      res.json({ application: updated })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/open-calls/:callId/applications/:applicationId', requireAdminAlways, (req, res, next) => {
    try {
      const { applicationId, callId } = req.params
      const existing = getApplication(applicationId)
      if (!existing || existing.callId !== String(callId)) {
        return res.status(404).json({ error: 'Application not found.' })
      }
      deleteApplication(applicationId)
      res.json({ ok: true, id: existing.id })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = {
  registerOpenCallRoutes
}
