const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const { hashFileSha256, isSha256AssetId } = require('../assetHash')
const { scrubImageMetadata } = require('../assetScrub')
const defaultGoogleDrive = require('../googleDrive')
const { getOwnSandboxSpaceId, isGuestSubject } = require('../authAccess')
const driveAccount = require('../googleDriveAccount')
const commonsStore = require('../commonsStore')
const { createKeyedLock } = require('../asyncLock')

const defaultWithSpaceOpsLock = createKeyedLock()

function registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene,
  broadcastLiveEvent,
  buildMeta,
  collectSceneAssetRefs = null,
  config = {},
  countSpacesOwnedBy = null,
  spaceLimit = 3,
  grantSpaceToSessionUser = null,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  findSpaceBySlug,
  getLiveBucket,
  getPublicAuthState = () => ({ spaces: null }),
  isAllowedUpload = () => true,
  googleDrive = defaultGoogleDrive,
  withSpaceOpsLock = defaultWithSpaceOpsLock,
  getSandboxStats = null,
  getSpacePaths,
  hydrateSceneAssetManifest,
  canAccessSpace = () => true,
  isReservedSpaceSlug = () => false,
  isValidAssetId,
  loadSpaceMeta,
  listSpaces,
  listProjectsInSpace = null,
  maxOpHistory,
  normalizeIncomingOps,
  normalizeProjectId,
  normalizeSpaceId,
  normalizeSpaceSlug = () => null,
  readProjectDocument = null,
  requireAdminWrite = (req, res, next) => next(),
  requireSpaceOwnerOrAdminWrite = (req, res, next) => next(),
  readJson,
  readLatestSpaceSnapshot = null,
  readOpsHistory,
  readOpsHistorySince,
  removeAssetThumbnails,
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
  // GET /scene is unauthenticated (PUBLIC_CORS_ROUTES) and hit on every
  // public-space page view -- filterAvailableSceneAssets used to do one
  // fs.access syscall per asset on EVERY such request, uncached. The asset
  // set only actually changes when the scene does, so cache the resolved
  // "available asset ids" per (spaceId, sceneVersion) -- a cheap, correct
  // cache key since sceneVersion already bumps on every scene write
  // (2026-07-17 perf audit). Bounded FIFO so long-running processes with
  // many spaces/versions don't grow this unboundedly.
  const AVAILABLE_ASSETS_CACHE_MAX = 500
  const availableAssetsCache = new Map()
  const filterAvailableSceneAssets = async (spaceId, scene, sceneVersion = 0) => {
    if (!scene || typeof scene !== 'object' || !Array.isArray(scene.assets) || !scene.assets.length) {
      return scene
    }
    const cacheKey = `${spaceId}:${sceneVersion}`
    let availableIds = availableAssetsCache.get(cacheKey)
    if (!availableIds) {
      const { assetsDir } = getSpacePaths(spaceId)
      const checked = await Promise.all(scene.assets.map(async (asset) => {
        if (!asset?.id) return null
        try {
          await fsp.access(path.join(assetsDir, asset.id))
          return asset.id
        } catch {
          // Skip manifest entries whose asset file is missing on disk.
          return null
        }
      }))
      availableIds = new Set(checked.filter(Boolean))
      if (availableAssetsCache.size >= AVAILABLE_ASSETS_CACHE_MAX) {
        availableAssetsCache.delete(availableAssetsCache.keys().next().value)
      }
      availableAssetsCache.set(cacheKey, availableIds)
    }
    const availableAssets = scene.assets.filter((asset) => asset?.id && availableIds.has(asset.id))
    if (availableAssets.length === scene.assets.length) {
      return scene
    }
    return {
      ...scene,
      assets: availableAssets
    }
  }

  // isOwner is computed per requester so clients can gate management UI
  // without comparing raw ownerUserId themselves. With auth disabled the
  // whole surface is open, so everything reports owned.
  const withIsOwner = (state, space) => ({
    ...space,
    isOwner: !config.requireAuth ||
      (state?.type === 'session' && Boolean(space?.ownerUserId) && space.ownerUserId === state.subject)
  })

  router.get('/api/spaces', async (req, res, next) => {
    try {
      const spaces = await listSpaces()
      const state = req.authState || getPublicAuthState(req)
      const ownSpaces = Array.isArray(state.spaces) ? state.spaces : []
      const isGuest = state.type === 'guest' || isGuestSubject(state.subject)
      // One sandbox per identity: guests carry theirs in the cookie scope,
      // accounts derive it from the subject.
      const ownSandboxId = isGuest
        ? (ownSpaces.find((id) => id.startsWith('sandbox-')) || null)
        : (state.type === 'session' ? normalizeSpaceId(getOwnSandboxSpaceId(state.subject) || '') : null)
      // Sandboxes are private per-identity scratch space — they never belong
      // in anyone else's directory, including the admin's (admins get the
      // collapsed sandboxSummary below instead).
      let visible = spaces.filter((space) =>
        space.kind !== 'sandbox' || space.id === ownSandboxId
      )
      if (config.requireAuth) {
        visible = visible.filter((space) =>
          space.isPublic || (state.authenticated && canAccessSpace(state, space.id))
        )
      }
      // A sandbox is provisioned lazily on first access; until then,
      // synthesize its card so the hub still shows the session's own space.
      if (ownSandboxId && !visible.some((space) => space.id === ownSandboxId)) {
        visible.push(buildMeta(ownSandboxId, {
          label: isGuest ? 'Guest Sandbox' : 'Sandbox',
          kind: 'sandbox',
          allowEdits: true,
          permanent: !isGuest
        }))
      }
      const sandboxSummary = state.isUnrestricted && typeof getSandboxStats === 'function'
        ? getSandboxStats()
        : null
      const mapped = visible.map((space) => withIsOwner(state, space))

      // Pagination is opt-in via ?limit= (and optional ?offset=): omitting it
      // preserves the original full-list response so existing callers (the
      // Space Hub currently renders the whole set in-memory) are unaffected.
      // Bounds server-side cost as the space/sandbox population grows without
      // forcing a frontend change until one actually needs "load more" UI.
      const limit = Number.parseInt(req.query.limit, 10)
      const hasPaging = Number.isInteger(limit) && limit > 0
      const offsetParam = Number.parseInt(req.query.offset, 10)
      const offset = hasPaging && Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0
      const spacesOut = hasPaging ? mapped.slice(offset, offset + limit) : mapped

      res.json({
        spaces: spacesOut,
        ...(hasPaging ? { total: mapped.length, offset, limit, hasMore: offset + limit < mapped.length } : {}),
        ...(sandboxSummary ? { sandboxSummary } : {})
      })
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
      // Returning guests carry session cookies with a guest: subject — they
      // are not owning accounts and cannot create named spaces.
      const sessionUserId = state.type === 'session' && !isGuestSubject(state.subject) ? state.subject : null
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
      res.json({ space: withIsOwner(req.authState || getPublicAuthState(req), meta) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/api/spaces/:spaceId', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const { label, permanent, allowEdits, isPublic, kind, publishedProjectId, previewImageAssetId, openInscriptions, slug } = req.body || {}
      if (kind !== undefined && !['normal', 'global', 'sandbox'].includes(kind)) {
        return res.status(400).json({ error: 'kind must be one of: normal, global, sandbox.' })
      }
      // Public handle, independently renameable from id — see
      // docs/architecture/SPEC_space_urls_and_portability.md. null/'' clears
      // it back to id-only addressing; a reserved word or format mismatch is
      // rejected outright (never silently coerced/dropped); a taken slug 409s
      // rather than something else's link quietly resolving to this space.
      let nextSlug
      if (slug !== undefined) {
        const normalized = normalizeSpaceSlug(slug)
        if (normalized === undefined) {
          return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, or dashes (min 3 characters).' })
        }
        if (normalized !== null) {
          if (isReservedSpaceSlug(normalized)) {
            return res.status(400).json({ error: `"${normalized}" is a reserved word and can't be used as a slug.` })
          }
          if (normalized !== spaceId) {
            const existing = await findSpaceBySlug(normalized)
            if (existing && existing.id !== spaceId) {
              return res.status(409).json({ error: 'That slug is already taken.' })
            }
          }
        }
        nextSlug = normalized
      }
      // Owners self-serve label/visibility/publish target; kind and permanent
      // change platform behavior (guest entry, retention) and stay admin-only.
      const isAdminCaller = !config.requireAuth || (req.authState?.role === 'admin')
      if (!isAdminCaller && (kind !== undefined || permanent !== undefined)) {
        return res.status(403).json({ error: 'Only an admin can change kind or permanent.' })
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
      // Card-preview image override: must be an asset that exists in this
      // space so cards never point at a broken image. null/'' clears it back
      // to the default live embed.
      let nextPreviewImageAssetId
      if (previewImageAssetId !== undefined) {
        if (previewImageAssetId === null || previewImageAssetId === '') {
          nextPreviewImageAssetId = null
        } else {
          const requested = String(previewImageAssetId).trim()
          if (!isValidAssetId(requested)) {
            return res.status(400).json({ error: 'Invalid preview image asset id.' })
          }
          const { assetsDir } = getSpacePaths(spaceId)
          try {
            await fsp.access(path.join(assetsDir, requested))
          } catch {
            return res.status(404).json({ error: 'Preview image asset not found in this space.' })
          }
          nextPreviewImageAssetId = requested
        }
      }
      const meta = await upsertSpaceMeta(spaceId, {
        ...(label !== undefined ? { label } : {}),
        ...(permanent !== undefined ? { permanent } : {}),
        ...(allowEdits !== undefined ? { allowEdits } : {}),
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(publishedProjectId !== undefined ? { publishedProjectId: nextPublishedProjectId } : {}),
        ...(previewImageAssetId !== undefined ? { previewImageAssetId: nextPreviewImageAssetId } : {}),
        ...(openInscriptions !== undefined ? { openInscriptions: Boolean(openInscriptions) } : {}),
        ...(slug !== undefined ? { slug: nextSlug } : {})
      })
      res.json({ space: meta })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/spaces/:spaceId', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      // The shared guest-entry space must survive its owner; admins only.
      if (config.requireAuth && req.authState?.role !== 'admin') {
        const meta = req.spaceMeta || await loadSpaceMeta(spaceId)
        if (meta?.kind === 'global') {
          return res.status(403).json({ error: 'Only an admin can delete the shared global space.' })
        }
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
      const filteredScene = await filterAvailableSceneAssets(spaceId, hydratedScene, meta?.sceneVersion || 0)
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
      // Pushed into SQL via the existing (space_id, version) index instead
      // of reading+parsing the whole retained history and filtering in JS
      // (2026-07-17 perf audit) -- this is the most frequent read of this
      // table (every catch-up/reconnect hits it).
      const filtered = Number.isFinite(since)
        ? await readOpsHistorySince(spaceId, since)
        : await readOpsHistory(spaceId)
      const meta = await loadSpaceMeta(spaceId)
      const latestVersion = meta?.sceneVersion || 0
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

      // Serialized per space: the version check and the read-modify-write it
      // guards must be one atomic step, or two concurrent requests at the
      // same baseVersion both pass the check and both write, one silently
      // clobbering the other.
      const result = await withSpaceOpsLock(spaceId, async () => {
        const meta = await ensureSpaceWritable(spaceId)
        const currentVersion = meta?.sceneVersion || 0
        if (parsedBaseVersion !== currentVersion) {
          const history = await readOpsHistory(spaceId)
          const pendingOps = history.filter(entry => (entry.version || 0) > parsedBaseVersion)
          return { conflict: true, latestVersion: currentVersion, pendingOps }
        }

        // Idempotency guard: a client retry (request timed out but the
        // server actually committed) resends the same batch by opId. Without
        // this, the retry's ops get treated as brand new — reapplied and
        // given a fresh version number, inflating the op-log with duplicate
        // history entries for the same edit every time a retry happens.
        const existingHistory = await readOpsHistory(spaceId)
        const existingOpIds = new Set(existingHistory.map((op) => op.opId).filter(Boolean))
        const newOps = normalizedOps.filter((op) => !op.opId || !existingOpIds.has(op.opId))
        if (!newOps.length) {
          // Every op in this batch was already applied — nothing to do, but
          // this isn't a conflict either; respond with the current state so
          // the client's retry completes cleanly instead of erroring.
          return { nextVersion: currentVersion, opsWithVersion: [] }
        }

        const { scenePath } = getSpacePaths(spaceId)
        const scene = await readJson(scenePath, blankScene)
        let nextVersion = currentVersion
        const timestamp = Date.now()
        const opsWithVersion = newOps.map((op) => ({
          ...op,
          version: ++nextVersion,
          timestamp
        }))
        const updatedScene = applySceneOps(scene, opsWithVersion)
        await writeJson(scenePath, updatedScene)
        await appendOpsHistory(spaceId, opsWithVersion, maxOpHistory)
        await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
        return { nextVersion, opsWithVersion }
      })

      if (result.conflict) {
        return res.status(409).json({ latestVersion: result.latestVersion, pendingOps: result.pendingOps })
      }
      const { nextVersion, opsWithVersion } = result
      if (opsWithVersion.length) {
        broadcastLiveEvent(spaceId, 'scene-op', {
          version: nextVersion,
          ops: opsWithVersion
        })
      }
      res.json({
        newVersion: nextVersion,
        ops: opsWithVersion
      })
    } catch (error) {
      next(error)
    }
  })

  // Full scene replacement as a single replaceScene op — used by PUT scene
  // and by snapshot restore, so connected clients pick either up live.
  // Serialized per space (same lock as POST /ops) so this can't interleave
  // its read-modify-write with a concurrent ops write and silently clobber it.
  const replaceSceneAndBroadcast = async (spaceId, sceneData) => withSpaceOpsLock(spaceId, async () => {
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
    return { newVersion: nextVersion }
  })

  router.put('/api/spaces/:spaceId/scene', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const sceneData = req.body
      if (!sceneData || typeof sceneData !== 'object') {
        return res.status(400).json({ error: 'Scene payload required.' })
      }
      await replaceSceneAndBroadcast(spaceId, sceneData)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  // Vandalism insurance for the open space (works for any snapshotted space):
  // put the latest scene snapshot back. Owner-or-admin; the open space has no
  // owner, so there it is effectively admin-only.
  router.post('/api/spaces/:spaceId/restore-snapshot', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (typeof readLatestSpaceSnapshot !== 'function') {
        return res.status(501).json({ error: 'Snapshots are not available.' })
      }
      const snapshot = await readLatestSpaceSnapshot(spaceId)
      if (!snapshot) {
        return res.status(404).json({ error: 'No snapshot available for this space.' })
      }
      const { newVersion } = await replaceSceneAndBroadcast(spaceId, snapshot.scene)
      res.json({ ok: true, restoredFrom: snapshot.takenAt, newVersion })
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
      // Strip EXIF/GPS before anything hashes the file — the id must address
      // the bytes we actually store and serve.
      const scrub = await scrubImageMetadata(req.file.path)
      let assetId = ''
      // A scrubbed file no longer hashes to the id the client computed from the
      // original, so its requested id is moot — the content address is
      // recomputed below and returned. Callers already remap ids from the
      // response (bundle import in StudioEditor/BetaHub does exactly this).
      // Anything we did NOT rewrite keeps the strict check unchanged.
      if (req.body?.assetId && !scrub.scrubbed) {
        const requested = String(req.body.assetId).trim()
        if (!isValidAssetId(requested)) {
          await fsp.rm(req.file.path, { force: true }).catch(() => {})
          return res.status(400).json({ error: 'Invalid asset id.' })
        }
        // sha256-shaped ids are content addresses — served immutable, so the
        // bytes must actually hash to the id or a cached asset can be replaced
        if (isSha256AssetId(requested)) {
          if (requested.toLowerCase() !== await hashFileSha256(req.file.path)) {
            await fsp.rm(req.file.path, { force: true }).catch(() => {})
            return res.status(400).json({ error: 'Asset id does not match file content.' })
          }
          assetId = requested.toLowerCase()
        } else {
          // Non-sha256 (legacy uuid-style) ids have no content address to
          // verify against, so a first-time id is accepted as-is — but if
          // one already exists at this id, only an identical re-upload may
          // pass; anything else would silently overwrite content anyone
          // else could already be referencing/caching under that same id.
          const existingPath = path.join(assetsDir, requested)
          const existingHash = await hashFileSha256(existingPath).catch(() => null)
          if (existingHash !== null && existingHash !== await hashFileSha256(req.file.path)) {
            await fsp.rm(req.file.path, { force: true }).catch(() => {})
            return res.status(409).json({ error: 'An asset already exists at this id with different content.' })
          }
          assetId = requested
        }
      } else {
        assetId = await hashFileSha256(req.file.path)
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
        // re-stat rather than trusting req.file.size — scrubbing rewrites the
        // file, so multer's recorded size is stale for every scrubbed image
        size: (await fsp.stat(finalPath).then((s) => s.size).catch(() => req.file.size)) || 0,
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
          // Direct uploads go through multer's fileFilter (isAllowedUpload) —
          // this path writes external bytes straight to disk and previously
          // skipped that check entirely, trusting whatever MIME type Drive
          // reported (audit 2026-07-17).
          if (!isAllowedUpload({ mimetype: file.mimeType, originalname: file.name })) {
            throw new Error('Unsupported asset type.')
          }
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
          if (!isAllowedUpload({ mimetype: file.mimeType, originalname: file.name })) {
            throw new Error('Unsupported asset type.')
          }
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

      // Publishing to the commons needs an accountable identity — anonymous
      // guest sessions can edit their sandbox but not the public index.
      if (config.requireAuth && req.authState?.type !== 'session') {
        return res.status(403).json({ error: 'Sign in with an account to share assets publicly.', code: 'auth_required' })
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

  // Moderation: admins can pull any entry out of the commons regardless of
  // which space it was shared from (the owner path stays the share toggle).
  router.delete('/api/commons/assets/:assetId', requireAdminWrite, async (req, res, next) => {
    try {
      const assetId = req.params.assetId
      if (!isValidAssetId(assetId)) return res.status(400).json({ error: 'Invalid request.' })
      res.json({ ok: true, removed: commonsStore.unshareAsset(assetId) })
    } catch (error) { next(error) }
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
      await serveAsset(spaceId, assetId, res, { width: req.query.w })
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      next(error)
    }
  })

  // Delete a space file. Refuses with 409 + usedBy while any project document
  // in the space still references the asset (override with ?force=1). Commons
  // entries serve bytes from the origin space, so drop the entry first.
  router.delete('/api/spaces/:spaceId/assets/:assetId', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      const assetId = req.params.assetId
      if (!spaceId || !isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid request.' })
      }
      await ensureSpaceWritable(spaceId)
      const { assetsDir } = getSpacePaths(spaceId)
      const filePath = path.join(assetsDir, assetId)
      try {
        await fsp.access(filePath)
      } catch {
        return res.status(404).json({ error: 'Asset not found.' })
      }

      const force = req.query?.force === '1' || req.query?.force === 'true'
      if (!force) {
        const usedBy = []
        if (listProjectsInSpace && readProjectDocument) {
          const projects = await listProjectsInSpace(spacesDir, spaceId)
          const usages = await Promise.all(projects.map(async (project) => {
            const doc = await readProjectDocument(spacesDir, spaceId, project.id).catch(() => null)
            const entities = (doc?.entities || []).filter((e) => e?.components?.media?.assetId === assetId)
            if (!entities.length) return null
            return {
              projectId: project.id,
              title: project.title || project.id,
              entities: entities.map((e) => e.name || e.id)
            }
          }))
          usedBy.push(...usages.filter(Boolean))
        }
        // Legacy V1 scenes reference assets directly on their objects, not via
        // project documents — without this pass, deleting an asset used only by
        // scene.json succeeded silently and broke the scene's rendering.
        if (collectSceneAssetRefs) {
          const { scenePath } = getSpacePaths(spaceId)
          const scene = await readJson(scenePath, null)
          const objects = Array.isArray(scene?.objects) ? scene.objects : []
          const referencing = objects.filter((obj) =>
            collectSceneAssetRefs([obj]).some((asset) => asset.id === assetId))
          if (referencing.length) {
            usedBy.push({
              projectId: null,
              title: 'Space scene (V1)',
              entities: referencing.map((obj) => obj.name || obj.id || obj.type || 'object')
            })
          }
        }
        if (usedBy.length) {
          return res.status(409).json({ error: 'Asset is used by entities in this space.', code: 'asset_in_use', usedBy })
        }
      }

      const commonsRow = commonsStore.getAsset(assetId)
      if (commonsRow && commonsRow.spaceId === spaceId) {
        commonsStore.unshareAsset(assetId)
      }
      await fsp.rm(filePath, { force: true })
      await fsp.rm(path.join(assetsDir, `${assetId}.json`), { force: true })
      await removeAssetThumbnails(assetsDir, assetId)
      res.json({ ok: true })
    } catch (error) {
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

  // Exposed so other route modules (syncRoutes' pull, which also replaces a
  // whole scene) go through the same locked, versioned, broadcast write path
  // instead of hand-rolling their own version bump that can desync from the
  // real op-log (see docs/ai/known-fixes.md, audit #2026-07-17).
  return { replaceSceneAndBroadcast }
}

module.exports = {
  registerSpaceRoutes
}
