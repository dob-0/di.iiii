const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const googleDrive = require('../googleDrive')
const driveAccount = require('../googleDriveAccount')
const commonsStore = require('../commonsStore')

function registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene,
  broadcastLiveEvent,
  buildMeta,
  config = {},
  countSpacesOwnedBy = null,
  spaceLimit = 3,
  grantSpaceToSessionUser = null,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  getLiveBucket,
  getPublicAuthState = () => ({ spaces: null }),
  getSpacePaths,
  hydrateSceneAssetManifest,
  canAccessSpace = () => true,
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
      if (!config.requireAuth) {
        return res.json({ spaces })
      }
      const state = req.authState || getPublicAuthState(req)
      const visible = spaces.filter((space) =>
        space.isPublic || (state.authenticated && canAccessSpace(state, space.id))
      )
      res.json({ spaces: visible })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces', async (req, res, next) => {
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

      const state = req.authState || {}
      const sessionUserId = state.type === 'session' ? state.subject : null
      // Admins / unrestricted accounts create freely; the free-tier quota only
      // applies when auth is on and the creator is a regular signed-in account.
      const exempt = state.isUnrestricted || state.role === 'admin'
      if (config.requireAuth && !exempt) {
        if (!sessionUserId) {
          return res.status(403).json({ error: 'Sign in with an account to create a space.', code: 'auth_required' })
        }
        const owned = countSpacesOwnedBy ? countSpacesOwnedBy(sessionUserId) : 0
        if (owned >= spaceLimit) {
          return res.status(403).json({
            error: `You've reached your free limit of ${spaceLimit} spaces. Delete one to make room.`,
            code: 'space_limit',
            limit: spaceLimit,
            owned
          })
        }
      }

      const meta = buildMeta(spaceId, { label, permanent, allowEdits, ownerUserId: sessionUserId })
      await saveSpaceMeta(spaceId, meta)
      await ensureSpaceScene(spaceId)

      if (sessionUserId && grantSpaceToSessionUser) {
        grantSpaceToSessionUser(req, res, sessionUserId, spaceId)
      }

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
      const { label, permanent, allowEdits, isPublic, kind, publishedProjectId } = req.body || {}
      if (kind !== undefined && !['normal', 'global', 'sandbox'].includes(kind)) {
        return res.status(400).json({ error: 'kind must be one of: normal, global, sandbox.' })
      }
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
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        ...(kind !== undefined ? { kind } : {}),
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
        const buf = await fsp.readFile(req.file.path)
        assetId = crypto.createHash('sha256').update(buf).digest('hex')
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

  // Import assets straight from a Google Drive share link into a space. A single
  // shared file needs no server secrets; a shared folder (or richer metadata)
  // needs GOOGLE_API_KEY. Imported bytes land in the same per-space asset store
  // as uploads, so the rest of the pipeline treats them identically.
  router.post('/api/spaces/:spaceId/assets/import-drive', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const url = String(req.body?.url || '').trim()
      if (!url) return res.status(400).json({ error: 'Missing Drive url.' })
      if (!googleDrive.parseDriveUrl(url)) {
        return res.status(400).json({ error: 'Not a recognizable Google Drive link.' })
      }
      await ensureSpaceWritable(spaceId)

      const apiKey = config.googleDrive?.apiKey || ''
      // A caller with a connected Drive can resolve folders and richer metadata
      // through their own OAuth token, so folder links work without a server
      // API key. Best-effort: an unconnected/expired account just falls back
      // to keyless behavior.
      let accessToken = ''
      const userId = req.authState?.subject
      if (userId) {
        try {
          const auth = await driveAccount.getValidAccessToken(userId)
          accessToken = auth?.accessToken || ''
        } catch { /* fall back to keyless */ }
      }
      const maxBytes = config.maxUploadBytes
      let items
      try {
        items = await googleDrive.resolveItems(url, { apiKey, accessToken })
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Could not resolve Drive link.' })
      }
      if (!items.length) return res.status(400).json({ error: 'Nothing importable at that link.' })
      if (items.length > 50) items = items.slice(0, 50)

      const { assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(assetsDir, { recursive: true })

      const imported = []
      const failed = []
      for (const item of items) {
        try {
          const file = await googleDrive.downloadFile(item, { apiKey, accessToken, maxBytes })
          const assetId = crypto.createHash('sha256').update(file.buffer).digest('hex')
          const finalPath = path.join(assetsDir, assetId)
          const metaPath = path.join(assetsDir, `${assetId}.json`)
          await fsp.writeFile(finalPath, file.buffer)
          const meta = {
            id: assetId,
            name: file.name || assetId,
            mimeType: file.mimeType || 'application/octet-stream',
            size: file.buffer.length,
            createdAt: Date.now(),
            source: 'google-drive'
          }
          await writeJson(metaPath, meta)
          imported.push({ ...meta, assetId, url: `${req.baseUrl || ''}/api/spaces/${spaceId}/assets/${assetId}` })
        } catch (err) {
          failed.push({ id: item.id, error: err.message || 'download failed' })
        }
      }

      if (!imported.length) {
        return res.status(400).json({ error: failed[0]?.error || 'Import failed.', failed })
      }
      await upsertSpaceMeta(spaceId, { touch: true })
      res.json({ ok: true, assets: imported, failed })
    } catch (error) {
      next(error)
    }
  })

  // Import from the caller's *own* connected Drive (private files). Accepts a
  // list of Drive file ids (from the picker) and/or a share url. Uses the user's
  // OAuth token, so it reaches files that aren't publicly shared.
  router.post('/api/spaces/:spaceId/assets/import-drive-account', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const userId = req.authState?.subject
      if (!userId) return res.status(401).json({ error: 'Sign in first.' })
      const auth = await driveAccount.getValidAccessToken(userId)
      if (!auth) return res.status(403).json({ error: 'Drive not connected.' })
      await ensureSpaceWritable(spaceId)

      const accessToken = auth.accessToken
      const maxBytes = config.maxUploadBytes
      let items = []
      const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.filter(Boolean).slice(0, 50) : []
      const url = String(req.body?.url || '').trim()
      try {
        if (url) {
          items = await googleDrive.resolveItems(url, { accessToken })
        } else if (fileIds.length) {
          items = await Promise.all(fileIds.map((id) => googleDrive.getFileMeta(String(id), { accessToken })))
        }
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Could not resolve Drive selection.' })
      }
      if (!items.length) return res.status(400).json({ error: 'Select at least one file to import.' })

      const { assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(assetsDir, { recursive: true })

      const imported = []
      const failed = []
      for (const item of items) {
        try {
          const file = await googleDrive.downloadFile(item, { accessToken, maxBytes })
          const assetId = crypto.createHash('sha256').update(file.buffer).digest('hex')
          await fsp.writeFile(path.join(assetsDir, assetId), file.buffer)
          const meta = {
            id: assetId,
            name: file.name || assetId,
            mimeType: file.mimeType || 'application/octet-stream',
            size: file.buffer.length,
            createdAt: Date.now(),
            source: 'google-drive'
          }
          await writeJson(path.join(assetsDir, `${assetId}.json`), meta)
          imported.push({ ...meta, assetId, url: `${req.baseUrl || ''}/api/spaces/${spaceId}/assets/${assetId}` })
        } catch (err) {
          failed.push({ id: item.id, error: err.message || 'download failed' })
        }
      }

      if (!imported.length) return res.status(400).json({ error: failed[0]?.error || 'Import failed.', failed })
      await upsertSpaceMeta(spaceId, { touch: true })
      res.json({ ok: true, assets: imported, failed })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/spaces/:spaceId/assets', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const { assetsDir } = getSpacePaths(spaceId)
      const assetBaseUrl = `${req.baseUrl || ''}/api/spaces/${spaceId}/assets`
      const files = await fsp.readdir(assetsDir).catch(() => [])
      const assets = (
        await Promise.all(
          files
            .filter(f => f.endsWith('.json'))
            .map(async f => {
              try {
                const meta = JSON.parse(await fsp.readFile(path.join(assetsDir, f), 'utf-8'))
                return { ...meta, url: `${assetBaseUrl}/${meta.id}` }
              } catch { return null }
            })
        )
      )
        .filter(Boolean)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      const sharedIds = commonsStore.getSharedIdSet(assets.map(a => a.id))
      res.json({ assets: assets.map(a => ({ ...a, shared: sharedIds.has(a.id) })) })
    } catch (error) { next(error) }
  })

  // Toggle an asset in/out of the public commons. Sharing requires write access
  // to the owning space; the commons row references this space as the origin,
  // so the bytes stay where they are and get served through the commons route.
  router.post('/api/spaces/:spaceId/assets/:assetId/share', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      const assetId = req.params.assetId
      if (!spaceId || !isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid request.' })
      }
      await ensureSpaceWritable(spaceId)

      const makePublic = req.body?.public !== false
      if (!makePublic) {
        const row = commonsStore.getAsset(assetId)
        if (row && row.spaceId !== spaceId) {
          return res.status(403).json({ error: 'Asset was shared from another space.' })
        }
        commonsStore.unshareAsset(assetId)
        return res.json({ ok: true, shared: false })
      }

      const { assetsDir } = getSpacePaths(spaceId)
      let meta
      try {
        meta = JSON.parse(await fsp.readFile(path.join(assetsDir, `${assetId}.json`), 'utf-8'))
      } catch {
        return res.status(404).json({ error: 'Asset not found in this space.' })
      }
      const license = String(req.body?.license || '').trim().slice(0, 120) || null
      const entry = commonsStore.shareAsset({
        assetId,
        spaceId,
        name: meta.name || assetId,
        mimeType: meta.mimeType || '',
        size: meta.size || 0,
        license,
        sharedBy: req.authState?.subject || null,
        sharedByLabel: req.authState?.label || null
      })
      res.json({ ok: true, shared: true, asset: entry })
    } catch (error) {
      next(error)
    }
  })

  // Browse the commons — public read, it is the point.
  router.get('/api/commons/assets', async (req, res, next) => {
    try {
      const q = String(req.query?.q || '').trim().slice(0, 120)
      const items = commonsStore.listAssets({ q, limit: req.query?.limit })
      const base = `${req.baseUrl || ''}/api/commons/assets`
      res.json({ assets: items.map(item => ({ ...item, id: item.assetId, url: `${base}/${item.assetId}` })) })
    } catch (error) { next(error) }
  })

  router.get('/api/commons/assets/:assetId', async (req, res, next) => {
    try {
      const assetId = req.params.assetId
      if (!isValidAssetId(assetId)) return res.status(400).json({ error: 'Invalid request.' })
      const row = commonsStore.getAsset(assetId)
      if (!row) return res.status(404).json({ error: 'Not a public asset.' })
      await serveAsset(row.spaceId, assetId, res)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      next(error)
    }
  })

  // Copy commons assets into a space. Assets are content-addressed, so an
  // import is a local file copy under the same hash id — no re-upload, and
  // importing the same asset twice is a no-op.
  router.post('/api/spaces/:spaceId/assets/import-commons', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const assetIds = (Array.isArray(req.body?.assetIds) ? req.body.assetIds : [])
        .filter((id) => isValidAssetId(id))
        .slice(0, 50)
      if (!assetIds.length) return res.status(400).json({ error: 'Select at least one asset.' })
      await ensureSpaceWritable(spaceId)

      const { assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(assetsDir, { recursive: true })
      const assetBaseUrl = `${req.baseUrl || ''}/api/spaces/${spaceId}/assets`

      const imported = []
      const failed = []
      for (const assetId of assetIds) {
        try {
          const row = commonsStore.getAsset(assetId)
          if (!row) throw new Error('Not a public asset.')
          const sourcePath = path.join(getSpacePaths(row.spaceId).assetsDir, assetId)
          const finalPath = path.join(assetsDir, assetId)
          const metaPath = path.join(assetsDir, `${assetId}.json`)
          await fsp.copyFile(sourcePath, finalPath)
          const meta = {
            id: assetId,
            name: row.name || assetId,
            mimeType: row.mimeType || 'application/octet-stream',
            size: row.size || 0,
            createdAt: Date.now(),
            source: 'commons',
            license: row.license || undefined,
            sharedByLabel: row.sharedByLabel || undefined
          }
          await writeJson(metaPath, meta)
          imported.push({ ...meta, assetId, url: `${assetBaseUrl}/${assetId}` })
        } catch (err) {
          failed.push({ id: assetId, error: err.code === 'ENOENT' ? 'Source asset is gone.' : (err.message || 'import failed') })
        }
      }

      if (!imported.length) {
        return res.status(400).json({ error: failed[0]?.error || 'Import failed.', failed })
      }
      await upsertSpaceMeta(spaceId, { touch: true })
      res.json({ ok: true, assets: imported, failed })
    } catch (error) {
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
