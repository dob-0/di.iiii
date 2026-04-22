const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')

function registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene,
  broadcastLiveEvent,
  buildMeta,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  getLiveBucket,
  getSpacePaths,
  hydrateSceneAssetManifest,
  isValidAssetId,
  loadSpaceMeta,
  listSpaces,
  maxOpHistory,
  normalizeIncomingOps,
  normalizeProjectId,
  normalizeSpaceId,
  requireAdminWrite = (req, res, next) => next(),
  readJson,
  readOpsHistory,
  saveSpaceMeta,
  serveAsset,
  spacesDir,
  spaceExists,
  upsertSpaceMeta,
  upload,
  writeJson,
  writeOpsHistory,
  onDeleteSpace = null
}) {
  const filterAvailableSceneAssets = async (spaceId, scene) => {
    if (!scene || typeof scene !== 'object' || !Array.isArray(scene.assets) || !scene.assets.length) {
      return scene
    }
    const { assetsDir } = getSpacePaths(spaceId)
    const availableAssets = []
    for (const asset of scene.assets) {
      if (!asset?.id) continue
      try {
        await fsp.access(path.join(assetsDir, asset.id))
        availableAssets.push(asset)
      } catch {
        // Skip manifest entries whose asset file is missing on disk.
      }
    }
    if (availableAssets.length === scene.assets.length) {
      return scene
    }
    return {
      ...scene,
      assets: availableAssets
    }
  }

  router.get('/api/spaces', async (req, res, next) => {
    try {
      const spaces = await listSpaces()
      res.json({ spaces })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces', requireAdminWrite, async (req, res, next) => {
    try {
      const { label = '', slug, permanent = false, allowEdits } = req.body || {}
      const desired = slug || label || ''
      const spaceId = normalizeSpaceId(desired)
      if (!spaceId) {
        return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, or dashes (min 3 characters).' })
      }
      if (await spaceExists(spaceId)) {
        return res.status(409).json({ error: 'Space already exists.' })
      }
      const meta = buildMeta(spaceId, { label, permanent, allowEdits })
      await saveSpaceMeta(spaceId, meta)
      await ensureSpaceScene(spaceId)
      res.status(201).json({ space: meta })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const meta = await loadSpaceMeta(spaceId)
      if (!meta) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      res.json({ space: meta })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/api/spaces/:spaceId', requireAdminWrite, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const { label, permanent, allowEdits, publishedProjectId } = req.body || {}
      let nextPublishedProjectId
      if (publishedProjectId !== undefined) {
        if (publishedProjectId === null || publishedProjectId === '') {
          nextPublishedProjectId = null
        } else {
          nextPublishedProjectId = normalizeProjectId(publishedProjectId)
          if (!nextPublishedProjectId) {
            return res.status(400).json({ error: 'Invalid published project id.' })
          }
          const project = await findProjectById(spacesDir, nextPublishedProjectId)
          if (!project || project.spaceId !== spaceId) {
            return res.status(404).json({ error: 'Published project not found in this space.' })
          }
        }
      }
      const meta = await upsertSpaceMeta(spaceId, {
        ...(label !== undefined ? { label } : {}),
        ...(permanent !== undefined ? { permanent } : {}),
        ...(allowEdits !== undefined ? { allowEdits } : {}),
        ...(publishedProjectId !== undefined ? { publishedProjectId: nextPublishedProjectId } : {})
      })
      res.json({ space: meta })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/spaces/:spaceId', requireAdminWrite, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      if (typeof onDeleteSpace === 'function') {
        await onDeleteSpace(spaceId)
      }
      await deleteSpace(spaceId)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/touch', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const meta = await upsertSpaceMeta(spaceId, { touch: true })
      res.json({ space: meta })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId/scene', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const { scenePath } = getSpacePaths(spaceId)
      await ensureSpaceScene(spaceId)
      const scene = await readJson(scenePath, blankScene)
      const assetBaseUrl = `${req.baseUrl || ''}/api/spaces/${spaceId}/assets`
      const meta = await loadSpaceMeta(spaceId)
      const hydratedScene = hydrateSceneAssetManifest(scene, assetBaseUrl)
      const filteredScene = await filterAvailableSceneAssets(spaceId, hydratedScene)
      res.json({
        scene: filteredScene,
        version: meta?.sceneVersion || 0
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId/ops', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const since = Number(req.query.since)
      const history = await readOpsHistory(spaceId)
      const meta = await loadSpaceMeta(spaceId)
      const latestVersion = meta?.sceneVersion || 0
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

  router.post('/api/spaces/:spaceId/ops', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const { baseVersion, ops } = req.body || {}
      const parsedBaseVersion = Number(baseVersion)
      if (!Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) {
        return res.status(400).json({ error: 'baseVersion must be an integer' })
      }
      const normalizedOps = normalizeIncomingOps(ops)
      if (!normalizedOps.length) {
        return res.status(400).json({ error: 'No operations provided.' })
      }

      await ensureSpaceScene(spaceId)
      const meta = await ensureSpaceWritable(spaceId)
      const currentVersion = meta?.sceneVersion || 0
      if (parsedBaseVersion !== currentVersion) {
        const history = await readOpsHistory(spaceId)
        const pendingOps = history.filter(entry => (entry.version || 0) > parsedBaseVersion)
        return res.status(409).json({
          latestVersion: currentVersion,
          pendingOps
        })
      }

      const { scenePath } = getSpacePaths(spaceId)
      const scene = await readJson(scenePath, blankScene)
      let nextVersion = currentVersion
      const timestamp = Date.now()
      const opsWithVersion = normalizedOps.map((op) => ({
        ...op,
        version: ++nextVersion,
        timestamp
      }))
      const updatedScene = applySceneOps(scene, opsWithVersion)
      await writeJson(scenePath, updatedScene)
      await appendOpsHistory(spaceId, opsWithVersion, maxOpHistory)
      await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
      broadcastLiveEvent(spaceId, 'scene-op', {
        version: nextVersion,
        ops: opsWithVersion
      })
      res.json({
        newVersion: nextVersion,
        ops: opsWithVersion
      })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/spaces/:spaceId/scene', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const sceneData = req.body
      if (!sceneData || typeof sceneData !== 'object') {
        return res.status(400).json({ error: 'Scene payload required.' })
      }
      await ensureSpaceWritable(spaceId)
      const { spaceDir, scenePath, assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(spaceDir, { recursive: true })
      await fsp.mkdir(assetsDir, { recursive: true })
      await writeJson(scenePath, sceneData)
      const meta = await loadSpaceMeta(spaceId)
      const currentVersion = meta?.sceneVersion || 0
      const nextVersion = currentVersion + 1
      const resetOp = {
        opId: crypto.randomUUID?.() || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: 'server',
        type: 'replaceScene',
        payload: { scene: sceneData },
        version: nextVersion,
        timestamp: Date.now()
      }
      await writeOpsHistory(spaceId, [resetOp])
      await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
      broadcastLiveEvent(spaceId, 'scene-op', {
        version: nextVersion,
        ops: [resetOp]
      })
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/assets', upload.single('asset'), async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!req.file) {
        return res.status(400).json({ error: 'Missing asset file.' })
      }
      await ensureSpaceWritable(spaceId)
      const { assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(assetsDir, { recursive: true })
      let assetId = ''
      if (req.body?.assetId) {
        const requested = String(req.body.assetId).trim()
        if (!isValidAssetId(requested)) {
          await fsp.rm(req.file.path, { force: true }).catch(() => {})
          return res.status(400).json({ error: 'Invalid asset id.' })
        }
        assetId = requested
      } else {
        assetId = crypto.randomUUID()
      }
      const finalPath = path.join(assetsDir, assetId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      await fsp.rm(finalPath, { force: true })
      await fsp.rm(metaPath, { force: true })
      await fsp.rename(req.file.path, finalPath)
      const meta = {
        id: assetId,
        name: req.file.originalname || assetId,
        mimeType: req.file.mimetype || 'application/octet-stream',
        size: req.file.size || 0,
        createdAt: Date.now()
      }
      await writeJson(metaPath, meta)
      await upsertSpaceMeta(spaceId, { touch: true })
      const url = `${req.baseUrl || ''}/api/spaces/${spaceId}/assets/${assetId}`
      res.json({
        assetId,
        mimeType: meta.mimeType,
        size: meta.size,
        url
      })
    } catch (error) {
      if (req.file?.path) {
        await fsp.rm(req.file.path, { force: true }).catch(() => {})
      }
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId/assets/:assetId', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      const assetId = req.params.assetId
      if (!spaceId || !isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid request.' })
      }
      await serveAsset(spaceId, assetId, res)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId/events', (req, res) => {
    const entry = getLiveBucket(req.params.spaceId)
    if (!entry) {
      res.status(400).end('Invalid space id')
      return
    }
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    const clientId = crypto.randomUUID()
    entry.bucket.set(clientId, { res })
    res.write(`event: ready\ndata: ${JSON.stringify({ clientId })}\n\n`)
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
  })

  router.post('/api/spaces/:spaceId/live', async (req, res, next) => {
    try {
      const entry = getLiveBucket(req.params.spaceId)
      if (!entry) {
        return res.status(400).json({ error: 'Invalid space id.' })
      }
      await ensureSpaceWritable(entry.normalized)
      const body = req.body || {}
      if (!body.payload && !body.cursor) {
        return res.status(400).json({ error: 'payload or cursor required' })
      }
      if (body.payload) {
        broadcastLiveEvent(entry.normalized, 'scene-patch', { payload: body.payload }, body.clientId)
      }
      if (body.cursor) {
        broadcastLiveEvent(entry.normalized, 'cursor-update', { cursor: body.cursor, clientId: body.clientId }, body.clientId)
      }
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = {
  registerSpaceRoutes
}
