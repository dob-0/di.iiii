const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')

function registerProjectRoutes(router, {
  appendProjectOps,
  applyProjectOps,
  broadcastProjectLiveEvent,
  buildProjectAssetMeta,
  deleteProjectWithIndex,
  ensureProject,
  ensureSpaceWritable,
  getProjectLiveBucket,
  getProjectPaths,
  isValidAssetId,
  listProjectsInSpace,
  maxOpHistory,
  normalizeIncomingOps,
  normalizeProjectDocument,
  normalizeProjectId,
  normalizeSpaceId,
  readProjectDocument,
  readProjectOps,
  readJson,
  resolveProjectContext,
  spacesDir,
  spaceExists,
  upload,
  upsertProjectMeta,
  writeJson,
  writeProjectDocument,
  blankProjectDocument
}) {
  router.get('/api/spaces/:spaceId/projects', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const projects = await listProjectsInSpace(spacesDir, spaceId)
      res.json({ projects })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/projects', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      await ensureSpaceWritable(spaceId)
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      const source = typeof req.body?.source === 'string' ? req.body.source.trim() : ''
      const slugSource = req.body?.slug || title || `project-${Date.now()}`
      const projectId = normalizeProjectId(slugSource)
      if (!projectId) {
        return res.status(400).json({ error: 'Invalid project id.' })
      }
      const existing = await resolveProjectContext(projectId)
      if (existing) {
        return res.status(409).json({ error: 'Project already exists.' })
      }
      const meta = await ensureProject(spacesDir, spaceId, projectId, {
        title: title || 'Untitled Project',
        ...(source ? { source } : {})
      })
      res.status(201).json({
        project: meta,
        document: await readProjectDocument(spacesDir, spaceId, projectId)
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/projects/:projectId', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      res.json({ project: project.meta })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/api/projects/:projectId', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      await ensureSpaceWritable(project.spaceId)
      const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
        ...(req.body?.title !== undefined ? { title: req.body.title } : {})
      })
      const document = await readProjectDocument(spacesDir, project.spaceId, project.projectId)
      document.projectMeta = {
        ...document.projectMeta,
        id: nextMeta.id,
        spaceId: nextMeta.spaceId,
        title: nextMeta.title,
        createdAt: nextMeta.createdAt,
        updatedAt: nextMeta.updatedAt,
        source: nextMeta.source
      }
      await writeProjectDocument(spacesDir, project.spaceId, project.projectId, document)
      res.json({ project: nextMeta })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/projects/:projectId', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      await ensureSpaceWritable(project.spaceId)
      await deleteProjectWithIndex(project.spaceId, project.projectId)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/projects/:projectId/document', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      const document = await readProjectDocument(spacesDir, project.spaceId, project.projectId)
      res.json({
        document,
        version: Number(project.meta?.documentVersion) || 0,
        project: project.meta
      })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/projects/:projectId/document', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      await ensureSpaceWritable(project.spaceId)
      const document = normalizeProjectDocument(req.body || blankProjectDocument)
      const currentVersion = Number(project.meta?.documentVersion) || 0
      const nextVersion = currentVersion + 1
      document.projectMeta = {
        ...document.projectMeta,
        id: project.projectId,
        spaceId: project.spaceId,
        createdAt: project.meta?.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await writeProjectDocument(spacesDir, project.spaceId, project.projectId, document)
      const resetOp = {
        opId: crypto.randomUUID?.() || `project-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: 'server',
        type: 'replaceDocument',
        payload: { document },
        version: nextVersion,
        timestamp: Date.now()
      }
      await appendProjectOps(spacesDir, project.spaceId, project.projectId, [resetOp], maxOpHistory)
      const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
        title: document.projectMeta.title,
        documentVersion: nextVersion
      })
      await broadcastProjectLiveEvent(project.projectId, 'project-op', {
        version: nextVersion,
        ops: [resetOp]
      })
      res.json({
        ok: true,
        version: nextVersion,
        project: nextMeta,
        document
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/projects/:projectId/ops', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      const since = Number(req.query.since)
      const history = await readProjectOps(spacesDir, project.spaceId, project.projectId)
      const latestVersion = Number(project.meta?.documentVersion) || 0
      const filtered = Number.isFinite(since)
        ? history.filter(entry => (entry.version || 0) > since)
        : history
      res.json({
        ops: filtered,
        latestVersion
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/projects/:projectId/ops', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      await ensureSpaceWritable(project.spaceId)
      const baseVersion = Number(req.body?.baseVersion)
      if (!Number.isInteger(baseVersion) || baseVersion < 0) {
        return res.status(400).json({ error: 'baseVersion must be an integer' })
      }
      const normalizedOps = normalizeIncomingOps(req.body?.ops)
      if (!normalizedOps.length) {
        return res.status(400).json({ error: 'No operations provided.' })
      }
      const currentVersion = Number(project.meta?.documentVersion) || 0
      if (baseVersion !== currentVersion) {
        const pendingOps = await readProjectOps(spacesDir, project.spaceId, project.projectId)
        return res.status(409).json({
          latestVersion: currentVersion,
          pendingOps: pendingOps.filter(entry => (entry.version || 0) > baseVersion)
        })
      }

      const document = await readProjectDocument(spacesDir, project.spaceId, project.projectId)
      let nextVersion = currentVersion
      const timestamp = Date.now()
      const versionedOps = normalizedOps.map((op) => ({
        ...op,
        version: ++nextVersion,
        timestamp
      }))
      const nextDocument = applyProjectOps(document, versionedOps)
      nextDocument.projectMeta = {
        ...nextDocument.projectMeta,
        id: project.projectId,
        spaceId: project.spaceId,
        createdAt: project.meta?.createdAt || nextDocument.projectMeta.createdAt,
        updatedAt: Date.now()
      }
      await writeProjectDocument(spacesDir, project.spaceId, project.projectId, nextDocument)
      await appendProjectOps(spacesDir, project.spaceId, project.projectId, versionedOps, maxOpHistory)
      const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
        title: nextDocument.projectMeta.title,
        documentVersion: nextVersion
      })
      await broadcastProjectLiveEvent(project.projectId, 'project-op', {
        version: nextVersion,
        ops: versionedOps
      })
      res.json({
        ok: true,
        newVersion: nextVersion,
        ops: versionedOps,
        project: nextMeta,
        document: nextDocument
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/projects/:projectId/assets', upload.single('asset'), async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Missing asset file.' })
      }
      await ensureSpaceWritable(project.spaceId)
      const { assetsDir } = getProjectPaths(spacesDir, project.spaceId, project.projectId)
      await fsp.mkdir(assetsDir, { recursive: true })
      let assetId = req.body?.assetId ? String(req.body.assetId).trim() : ''
      if (assetId) {
        if (!isValidAssetId(assetId)) {
          await fsp.rm(req.file.path, { force: true }).catch(() => {})
          return res.status(400).json({ error: 'Invalid asset id.' })
        }
      } else {
        assetId = crypto.randomUUID()
      }
      const finalPath = path.join(assetsDir, assetId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      await fsp.rm(finalPath, { force: true })
      await fsp.rm(metaPath, { force: true })
      await fsp.rename(req.file.path, finalPath)
      const assetMeta = buildProjectAssetMeta({ assetId, file: req.file, source: 'server' })
      await writeJson(metaPath, assetMeta)
      const url = `${req.baseUrl || ''}/api/projects/${project.projectId}/assets/${assetId}`
      await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, { touch: true })
      res.json({
        ok: true,
        asset: {
          ...assetMeta,
          url
        }
      })
    } catch (error) {
      if (req.file?.path) {
        await fsp.rm(req.file.path, { force: true }).catch(() => {})
      }
      next(error)
    }
  })

  router.get('/api/projects/:projectId/assets/:assetId', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      const assetId = req.params.assetId
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (!isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid asset id.' })
      }
      const { assetsDir } = getProjectPaths(spacesDir, project.spaceId, project.projectId)
      const filePath = path.join(assetsDir, assetId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      const meta = await readJson(metaPath, null)
      await fsp.access(filePath)
      res.setHeader('Content-Type', meta?.mimeType || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.sendFile(filePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      next(error)
    }
  })

  router.get('/api/projects/:projectId/events', async (req, res, next) => {
    try {
      const entry = await getProjectLiveBucket(req.params.projectId)
      if (!entry) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders?.()
      const clientId = crypto.randomUUID()
      entry.bucket.set(clientId, { res })
      res.write(`event: ready\ndata: ${JSON.stringify({ clientId, projectId: entry.normalized })}\n\n`)
      const keepAlive = setInterval(() => {
        try {
          res.write(':keep-alive\n\n')
        } catch {
          clearInterval(keepAlive)
        }
      }, 25000)
      req.on('close', () => {
        clearInterval(keepAlive)
        entry.bucket.delete(clientId)
      })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = {
  registerProjectRoutes
}
