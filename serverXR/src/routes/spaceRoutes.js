const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const { hashFileSha256, isSha256AssetId } = require('../assetHash')
const { UNSCRUBBABLE_IMAGE_ERROR, scrubImageBuffer, scrubImageMetadata } = require('../assetScrub')
const defaultGoogleDrive = require('../googleDrive')
const { getOwnSandboxSpaceId, isGuestSubject } = require('../authAccess')
const driveAccount = require('../googleDriveAccount')
const commonsStore = require('../commonsStore')
const logger = require('../logger')
const { createKeyedLock } = require('../asyncLock')
const { SENSITIVE_SPACE_PATCH_FIELDS } = require('../approvalGate')

const defaultWithSpaceOpsLock = createKeyedLock()

function registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene,
  broadcastLiveEvent,
  broadcastProjectLiveEvent = null,
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
  findUserById = null,
  setUserSpaces = null,
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
  maxOpAgeMs = 0,
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
  restoreSpaceProjectDocuments = null,
  saveSpaceMeta,
  serveAsset,
  spacesDir,
  spaceExists,
  upsertSpaceMeta,
  upload,
  bundleUpload,
  writeJson,
  // writeOpsHistory is deliberately NOT injected here. It is delete-all-then-
  // insert, and a route that reaches for it destroys a space's history (see
  // replaceSceneAndBroadcast). Leaving it out means such a route fails loudly
  // at the call site instead of quietly succeeding.
  onDeleteSpace = null,
  approvalGate = null
}) {
  // SENSITIVE_SPACE_PATCH_FIELDS (imported above) is the same list the
  // fail-loud net matches against (approvalGate.js) — one source, so the net
  // and this route can never disagree on WHEN a PATCH gates. Ordinary
  // label/allowEdits/previewImageAssetId edits never touch it and always
  // apply immediately — gating is for what a visitor sees or who can reach a
  // space, not routine editing.

  if (approvalGate) {
    approvalGate.registerExecutor('spaces.patch', async ({ spaceId, patch, nextOwnerUserId }) => {
      const meta = await upsertSpaceMeta(spaceId, patch)
      if (nextOwnerUserId && findUserById && setUserSpaces) {
        try {
          const user = findUserById(nextOwnerUserId)
          if (user && Array.isArray(user.spaces) && !user.spaces.includes(spaceId)) {
            setUserSpaces(nextOwnerUserId, [...user.spaces, spaceId])
          }
        } catch { /* scope is a convenience grant here; ownership already landed */ }
      }
      return { space: meta }
    })
    approvalGate.registerExecutor('spaces.delete', async ({ spaceId }) => {
      if (typeof onDeleteSpace === 'function') await onDeleteSpace(spaceId)
      await deleteSpace(spaceId)
      return { ok: true }
    })
    approvalGate.registerExecutor('commons.asset.delete', ({ assetId }) => ({ ok: true, removed: commonsStore.unshareAsset(assetId) }))
  }

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
      // PATCH has rejected reserved words as slugs since the slug-hijack fix,
      // but creation never did — so the same words were still claimable as a
      // space *id*, which resolves on the same URL segment. The space is then
      // permanently unreachable (the app route wins) and the word is burned.
      if (isReservedSpaceSlug(spaceId)) {
        return res.status(400).json({ error: `"${spaceId}" is a reserved word and can't be used as a space id.` })
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
      const { label, permanent, allowEdits, isPublic, kind, publishedProjectId, previewImageAssetId, openInscriptions, slug, ownerUserId } = req.body || {}
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
            // Slug resolution wins over id (index.js resolves segment via
            // findSpaceBySlug first), so a slug equal to ANOTHER space's id
            // would hijack that space's public link.
            const shadowedSpace = await loadSpaceMeta(normalized)
            if (shadowedSpace) {
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
      // Ownership was write-once: set from the session that created the space
      // and reachable by no other path. Every space provisioned by an API token
      // (which is how the linked repos sync theirs) was therefore born ownerless
      // and stayed that way, so every owner-gated action fell through to global
      // admin. Admin-only, because handing someone a space is a grant, not a
      // preference.
      let nextOwnerUserId
      if (ownerUserId !== undefined) {
        if (!isAdminCaller) {
          return res.status(403).json({ error: 'Only an admin can change the owner of a space.' })
        }
        if (ownerUserId === null || ownerUserId === '') {
          nextOwnerUserId = null
        } else {
          const requested = String(ownerUserId).trim()
          // A guest subject is a cookie, not an account — it cannot hold a space.
          if (isGuestSubject(requested)) {
            return res.status(400).json({ error: 'A guest identity cannot own a space.' })
          }
          const user = findUserById ? findUserById(requested) : null
          if (!user) {
            return res.status(404).json({ error: 'Owner account not found.' })
          }
          nextOwnerUserId = requested
        }
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
      const patch = {
        ...(label !== undefined ? { label } : {}),
        ...(permanent !== undefined ? { permanent } : {}),
        ...(allowEdits !== undefined ? { allowEdits } : {}),
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(publishedProjectId !== undefined ? { publishedProjectId: nextPublishedProjectId } : {}),
        ...(previewImageAssetId !== undefined ? { previewImageAssetId: nextPreviewImageAssetId } : {}),
        ...(openInscriptions !== undefined ? { openInscriptions: Boolean(openInscriptions) } : {}),
        ...(slug !== undefined ? { slug: nextSlug } : {}),
        ...(ownerUserId !== undefined ? { ownerUserId: nextOwnerUserId } : {})
      }
      // An owner who cannot reach the space is not an owner. Scope and
      // ownership were separate grants, so assigning one without the other left
      // the new owner staring at a space they were not allowed to open. (The
      // grant itself runs inside the executor, so it happens exactly once —
      // immediately when the gate is off, or on approval when it's on.)
      const args = { spaceId, patch, nextOwnerUserId: nextOwnerUserId || null }
      const touchesSensitive = SENSITIVE_SPACE_PATCH_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(req.body || {}, f))
      if (!touchesSensitive || !approvalGate) {
        const meta = await upsertSpaceMeta(spaceId, patch)
        if (nextOwnerUserId && findUserById && setUserSpaces) {
          try {
            const user = findUserById(nextOwnerUserId)
            if (user && Array.isArray(user.spaces) && !user.spaces.includes(spaceId)) {
              setUserSpaces(nextOwnerUserId, [...user.spaces, spaceId])
            }
          } catch { /* scope is a convenience grant here; ownership already landed */ }
        }
        return res.json({ space: meta })
      }
      const changeDesc = Object.keys(patch).map((k) => `${k}→${JSON.stringify(patch[k])}`).join(', ')
      const outcome = await approvalGate.gateOrApply({
        kind: 'spaces.patch',
        args,
        actorState: req.authState,
        summary: `patch space "${spaceId}": ${changeDesc}`,
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

  // ── work as files ─────────────────────────────────────────────────────────
  //
  // The same document the CLI writes with `di save` and reads with `di open`:
  // one file holding everything a space is made of, portable to any install.
  // These two routes are the browser's half of that, so a file can be saved and
  // opened without a terminal.
  //
  // Both SPAWN scripts/space-bundle.mjs rather than reimplementing it. There is
  // exactly one implementation of the format, and a second one living in the
  // server would drift from it — quietly, and in a file format, which is the
  // worst place for a drift to hide. The cost is a second connection to the
  // same SQLite: fine for export, which only reads, and safe for import, which
  // does its inserts in one transaction (SQLite allows a single writer at a
  // time and the server holds no cache of space metadata — listSpaces hits the
  // database on every call, so an imported space is visible immediately).

  const bundleToolPath = () => {
    // Beside the server in an installed runtime, one level up in a checkout.
    const candidates = [
      path.join(__dirname, '..', '..', '..', 'scripts', 'space-bundle.mjs'),
      path.join(__dirname, '..', '..', 'scripts', 'space-bundle.mjs')
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || null
  }

  const runBundleTool = (args) => new Promise((resolve) => {
    const tool = bundleToolPath()
    if (!tool) { resolve({ code: 1, output: 'the bundle tool is not part of this build' }); return }
    const child = spawn(process.execPath, [tool, ...args], {
      env: { ...process.env, DATA_ROOT: path.resolve(spacesDir, '..') },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', (error) => resolve({ code: 1, output: String(error?.message || error) }))
    child.on('exit', (code) => resolve({ code: code ?? 1, output }))
  })

  // Saving is reading, so it needs no more permission than looking at the space
  // does — the router's own scope check has already run by the time we are here.
  router.get('/api/spaces/:spaceId/bundle', async (req, res, next) => {
    let workDir = null
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!(await spaceExists(spaceId))) return res.status(404).json({ error: 'Space not found.' })

      workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-bundle-'))
      const file = path.join(workDir, `${spaceId}.diiii`)
      const { code, output } = await runBundleTool(['export', spaceId, '--out', file])
      if (code !== 0 || !fs.existsSync(file)) {
        logger.warn(`[bundle] export of ${spaceId} failed: ${output}`)
        return res.status(500).json({ error: 'Could not save this space to a file.' })
      }
      res.download(file, `${spaceId}.diiii`, () => {
        fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
      })
      workDir = null
    } catch (error) {
      next(error)
    } finally {
      if (workDir) await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  // multer rejects a wrong file type by THROWING, which the generic error
  // handler turns into a 500 "Server error" — so the one sentence that tells
  // someone what to do instead never reaches them. Caught here and answered as
  // what it is: a bad request, with the reason.
  const acceptBundleFile = (req, res, next) => bundleUpload.single('bundle')(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.floor((config.maxUploadBytes || 0) / (1024 * 1024))
      return res.status(413).json({
        error: `That file is larger than this di.iiii accepts${mb ? ` (${mb} MB)` : ''}. Open it with \`di open\` instead — the command has no such limit.`
      })
    }
    return res.status(400).json({ error: String(error.message || 'That file could not be read.') })
  })

  // Opening a file CREATES a space, so it answers to the same rule as creating
  // one: an owning account, an admin, or a local install where auth is off.
  router.post('/api/spaces/bundle', acceptBundleFile, async (req, res, next) => {
    const uploaded = req.file?.path || null
    try {
      const state = req.authState || {}
      const exempt = state.isUnrestricted || state.role === 'admin'
      const sessionUserId = state.type === 'session' && !isGuestSubject(state.subject) ? state.subject : null
      if (config.requireAuth && !exempt && !sessionUserId) {
        return res.status(403).json({ error: 'Sign in with an account to open a file here.', code: 'auth_required' })
      }
      if (!uploaded) return res.status(400).json({ error: 'No file was sent.' })

      const args = ['import', uploaded]
      const as = normalizeSpaceId(String(req.body?.as || '').trim())
      if (as) args.push('--as', as)

      const { code, output } = await runBundleTool(args)
      if (code !== 0) {
        // The tool's own words: "this file was written by a newer di.iiii", and
        // the like. Better than a summary of them — but the tool talks to a
        // terminal, so two things have to be translated on the way out.
        const said = output
          // Node prints an ExperimentalWarning the first time node:sqlite
          // loads. In a terminal it is noise; in a browser dialog it is the
          // first thing someone reads.
          .split('\n')
          .filter((line) => !/^\(node:\d+\)|^\(Use `node/.test(line.trim()))
          .join('\n')
          .replace(/^\[space-bundle\] (ERROR: )?/gm, '')
          .trim()
        logger.warn(`[bundle] import failed: ${said}`)

        // "use --force or --as <newId>" is good advice in a terminal and
        // meaningless in a page with no flags in it. The browser gets the fact
        // and decides what to offer.
        const clash = /space "([a-z0-9-]+)" already exists/i.exec(said)
        if (clash) {
          return res.status(409).json({
            error: `A space called "${clash[1]}" is already here.`,
            code: 'space_exists',
            spaceId: clash[1]
          })
        }
        return res.status(400).json({ error: said || 'That file could not be opened.' })
      }

      const opened = as || /imported .*?as ([a-z0-9-]+)/i.exec(output)?.[1] || null
      const meta = opened ? await loadSpaceMeta(opened) : null
      if (opened && meta && sessionUserId && grantSpaceToSessionUser) {
        // Whoever opened it can reach it. A space nobody is scoped to is a
        // space that vanishes from its own owner's list — the exact trap
        // ownership does not solve, since scope is what grants access.
        await grantSpaceToSessionUser(req, opened)
      }
      res.status(201).json({ spaceId: opened, space: meta })
    } catch (error) {
      next(error)
    } finally {
      if (uploaded) await fsp.rm(uploaded, { force: true }).catch(() => {})
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
      if (!approvalGate) {
        if (typeof onDeleteSpace === 'function') await onDeleteSpace(spaceId)
        await deleteSpace(spaceId)
        return res.json({ ok: true })
      }
      const outcome = await approvalGate.gateOrApply({
        kind: 'spaces.delete',
        args: { spaceId },
        actorState: req.authState,
        summary: `delete space "${spaceId}"`,
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
      const sceneVersion = meta?.sceneVersion || 0

      // ?verbatim=1 — what is actually STORED, for callers that intend to
      // write it somewhere else.
      //
      // The normal response is a rendering, not the truth: hydrate rewrites
      // every asset.url to THIS host, and the filter drops manifest entries
      // whose file is missing here. Both are right for a viewer and wrong for
      // a copy — PUT that response to another instance and you have deleted
      // the entries this machine merely hadn't downloaded, and hardcoded this
      // origin into someone else's scene. `missingAssetIds` reports what the
      // filter WOULD have dropped, so a sync can refuse instead of guessing.
      if (req.query?.verbatim === '1' || req.query?.verbatim === 'true') {
        const filtered = await filterAvailableSceneAssets(spaceId, scene, sceneVersion)
        const keptIds = new Set((filtered?.assets || []).map((asset) => asset?.id).filter(Boolean))
        const missingAssetIds = (scene?.assets || [])
          .map((asset) => asset?.id)
          .filter((id) => id && !keptIds.has(id))
        return res.json({
          scene,
          version: sceneVersion,
          verbatim: true,
          // Informational only — deliberately NOT written into the scene.
          assetsBaseUrl: assetBaseUrl,
          missingAssetIds
        })
      }

      const hydratedScene = hydrateSceneAssetManifest(scene, assetBaseUrl)
      const filteredScene = await filterAvailableSceneAssets(spaceId, hydratedScene, sceneVersion)
      res.json({
        scene: filteredScene,
        version: sceneVersion
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
        await appendOpsHistory(spaceId, opsWithVersion, maxOpHistory, maxOpAgeMs)
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
  //
  // `expectedVersion` is optional and, when given, is the same optimistic
  // concurrency check POST /ops has always had: the caller states the version
  // it based this scene on, and a mismatch refuses rather than overwrites.
  // Without it this is still last-write-wins, which is why a `di` install
  // turns config.sceneReplace.requirePrecondition on (see PUT /scene).
  const replaceSceneAndBroadcast = async (spaceId, sceneData, { expectedVersion = null } = {}) => withSpaceOpsLock(spaceId, async () => {
    await ensureSpaceWritable(spaceId)
    const meta = await loadSpaceMeta(spaceId)
    const currentVersion = meta?.sceneVersion || 0

    if (expectedVersion !== null && expectedVersion !== currentVersion) {
      // Same shape as POST /ops's 409 on purpose: useLiveSync and
      // useServerPublishing already know how to apply pendingOps or reload,
      // so a conditional replace costs no new client code.
      const history = await readOpsHistory(spaceId)
      const pendingOps = history.filter(entry => (entry.version || 0) > expectedVersion)
      return { conflict: true, latestVersion: currentVersion, pendingOps }
    }

    const { spaceDir, scenePath, assetsDir } = getSpacePaths(spaceId)
    await fsp.mkdir(spaceDir, { recursive: true })
    await fsp.mkdir(assetsDir, { recursive: true })
    const previousScene = await readJson(scenePath, blankScene)
    await writeJson(scenePath, sceneData)
    const nextVersion = currentVersion + 1
    const resetOp = {
      opId: crypto.randomUUID?.() || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      clientId: 'server',
      type: 'replaceScene',
      payload: { scene: sceneData },
      version: nextVersion,
      timestamp: Date.now()
    }
    // APPEND, never write-over. This used to call writeOpsHistory, which is
    // delete-all-then-insert, so one full-scene replace threw away every op
    // the space had — and `POST /api/sync/spaces/:id/pull` does exactly that
    // on the artist's own machine. The history is what a catching-up client
    // replays and what gc-space-blobs.mjs reads to decide a blob is still
    // referenced, so wiping it strands both. applySceneOps already treats a
    // replaceScene op mid-log as a full reset, so replay from any earlier
    // version still converges on the same scene.
    await appendOpsHistory(spaceId, [resetOp], maxOpHistory, maxOpAgeMs)
    await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
    broadcastLiveEvent(spaceId, 'scene-op', {
      version: nextVersion,
      ops: [resetOp]
    })
    return {
      newVersion: nextVersion,
      previousVersion: currentVersion,
      // So a caller can SEE that it just replaced 40 objects with 3, rather
      // than finding out from a person looking at an empty space.
      objectsBefore: Array.isArray(previousScene?.objects) ? previousScene.objects.length : 0,
      objectsAfter: Array.isArray(sceneData?.objects) ? sceneData.objects.length : 0
    }
  })

  // ── space settings ───────────────────────────────────────────────────────
  //
  // One small JSON object per space, beside its scene. It exists for CODE
  // spaces: their piece is React in src/, so they have no project document,
  // and anything their author tunes had nowhere on the server to live. The
  // algovrithm Director is the first case — it could write its edit list only
  // through a Vite dev-server middleware, so the timeline was openable on the
  // live site and could not be saved from it.
  //
  // Deliberately opaque: the server stores and returns whatever object it is
  // given. What the keys mean belongs to the piece, not to the platform, and
  // a schema here would have to be edited every time a piece grew a knob.
  // Bounded instead by size, because "arbitrary JSON" without a ceiling is a
  // way to fill a disk. Gating is the space's own — reads follow the space's
  // visibility, writes need editor + scope, both applied upstream via
  // req.requiredSpaceId, exactly as the scene routes are.
  const MAX_SPACE_SETTINGS_BYTES = 64 * 1024

  router.get('/api/spaces/:spaceId/settings', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const { settingsPath } = getSpacePaths(spaceId)
      // Absent is a normal state, not an error: a space that has never been
      // tuned reads as {} so callers need no special case for "not yet".
      const settings = await readJson(settingsPath, {})
      res.json({ settings: settings && typeof settings === 'object' ? settings : {} })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/spaces/:spaceId/settings', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const settings = req.body?.settings
      // Arrays are objects to typeof and would round-trip as a shape no
      // reader expects; reject rather than coerce.
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return res.status(400).json({ error: 'settings must be an object.' })
      }
      const serialized = JSON.stringify(settings)
      if (Buffer.byteLength(serialized, 'utf8') > MAX_SPACE_SETTINGS_BYTES) {
        return res.status(413).json({
          error: `Settings are limited to ${MAX_SPACE_SETTINGS_BYTES} bytes.`
        })
      }
      await ensureSpaceWritable(spaceId)
      const { spaceDir, settingsPath } = getSpacePaths(spaceId)
      await fsp.mkdir(spaceDir, { recursive: true })
      await writeJson(settingsPath, settings)
      res.json({ ok: true, settings })
    } catch (error) {
      next(error)
    }
  })

  // The precondition a caller may state before replacing a whole scene:
  // `If-Match: "12"` or `?baseVersion=12`. Absent is allowed (see below);
  // PRESENT-BUT-UNPARSEABLE IS NOT. A malformed precondition that quietly
  // degrades to "no precondition" is the same silent-fallback class this repo
  // keeps paying for — the caller asked to be protected and would be told it
  // succeeded.
  const readScenePrecondition = (req) => {
    const raw = req.get?.('If-Match') ?? req.headers?.['if-match']
    const source = raw !== undefined && raw !== null && String(raw).trim() !== ''
      ? String(raw).trim().replace(/^W\//, '').replace(/^"|"$/g, '')
      : (req.query?.baseVersion !== undefined ? String(req.query.baseVersion).trim() : null)
    if (source === null) return { expectedVersion: null }
    if (source === '*') return { expectedVersion: null } // If-Match: * — "any version", i.e. unconditional
    const parsed = Number(source)
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: 'If-Match/baseVersion must be a non-negative integer scene version.' }
    }
    return { expectedVersion: parsed }
  }

  router.put('/api/spaces/:spaceId/scene', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const sceneData = req.body
      if (!sceneData || typeof sceneData !== 'object') {
        return res.status(400).json({ error: 'Scene payload required.' })
      }

      const { expectedVersion, error: preconditionError } = readScenePrecondition(req)
      if (preconditionError) return res.status(400).json({ error: preconditionError })

      // Unconditional replaces stay legal by default: this route has many
      // callers we cannot enumerate (scripts, vendored sync engines, whatever
      // is running online). A `di` install sets the flag, because a fresh
      // local install has no legacy callers by construction.
      if (expectedVersion === null && config.sceneReplace?.requirePrecondition) {
        return res.status(428).json({
          error: 'This server requires a scene precondition. Send If-Match: "<version>" (or ?baseVersion=<version>) with the version you based this scene on.'
        })
      }

      const result = await replaceSceneAndBroadcast(spaceId, sceneData, { expectedVersion })
      if (result.conflict) {
        return res.status(409).json({ latestVersion: result.latestVersion, pendingOps: result.pendingOps })
      }

      if (expectedVersion === null && result.objectsBefore > result.objectsAfter) {
        // Not an error — but an unconditional replace that shrank the scene is
        // the exact shape of a lost update, and when these lines stop appearing
        // in the online logs the flag above can be turned on there too.
        logger.warn(
          `[scene] unconditional replace on "${spaceId}" v${result.previousVersion}→v${result.newVersion} ` +
          `went from ${result.objectsBefore} to ${result.objectsAfter} objects`
        )
      }

      res.json({ ok: true, ...result })
    } catch (error) {
      next(error)
    }
  })

  // Vandalism insurance for the open space (works for any snapshotted space):
  // put the latest snapshot back — the scene AND the project documents it
  // carries, since the Open Jam's contributions live in a project document.
  // Owner-or-admin; the open space has no owner, so there it is effectively
  // admin-only.
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
      // Deliberately unconditional: restoring a snapshot IS the act of
      // discarding what is there now. It reports the deltas so an accidental
      // restore is visible rather than silent.
      const result = snapshot.scene ? await replaceSceneAndBroadcast(spaceId, snapshot.scene) : {}
      // The other half of the room. Each restored document is announced to
      // its own project channel the same way PUT .../document announces a
      // full replace, so an editor holding the wiped copy resyncs live.
      let projects = []
      if (snapshot.projects?.length && typeof restoreSpaceProjectDocuments === 'function') {
        const restored = await restoreSpaceProjectDocuments(spaceId, snapshot.projects, { maxOpHistory, maxOpAgeMs })
        for (const entry of restored) {
          if (typeof broadcastProjectLiveEvent === 'function') {
            await broadcastProjectLiveEvent(entry.projectId, 'project-op', { version: entry.version, ops: entry.ops })
          }
        }
        projects = restored.map(entry => ({ id: entry.projectId, version: entry.version }))
      }
      res.json({ ok: true, restoredFrom: snapshot.takenAt, projects, ...result })
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
      // An image we could not scrub must not be stored — the whole point of
      // the scrubber is that nothing reaches a public URL still carrying the
      // photographer's GPS position. Refusing loudly beats storing quietly.
      if (!scrub.safeToStore) {
        await fsp.rm(req.file.path, { force: true }).catch(() => {})
        return res.status(415).json({ error: UNSCRUBBABLE_IMAGE_ERROR, format: scrub.format || null })
      }
      let assetId = ''
      // A scrubbed file no longer hashes to the id the client computed from the
      // original, so its requested id is moot — the content address is
      // recomputed below and returned. Callers already remap ids from the
      // response (bundle import in StudioEditor/RawHub does exactly this).
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
          // Imported bytes reach the same public URLs as an upload, so they get
          // the same EXIF scrub — and the same refusal if it cannot be done.
          const scrub = await scrubImageBuffer(file.buffer)
          if (!scrub.safeToStore) throw new Error(UNSCRUBBABLE_IMAGE_ERROR)
          const bytes = scrub.buffer
          const assetId = crypto.createHash('sha256').update(bytes).digest('hex')
          const finalPath = path.join(assetsDir, assetId)
          const metaPath = path.join(assetsDir, `${assetId}.json`)
          await fsp.writeFile(finalPath, bytes)
          const meta = {
            id: assetId,
            name: file.name || assetId,
            mimeType: file.mimeType || 'application/octet-stream',
            size: bytes.length,
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
          const scrub = await scrubImageBuffer(file.buffer)
          if (!scrub.safeToStore) throw new Error(UNSCRUBBABLE_IMAGE_ERROR)
          const bytes = scrub.buffer
          const assetId = crypto.createHash('sha256').update(bytes).digest('hex')
          await fsp.writeFile(path.join(assetsDir, assetId), bytes)
          const meta = {
            id: assetId,
            name: file.name || assetId,
            mimeType: file.mimeType || 'application/octet-stream',
            size: bytes.length,
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

      // Publishing to the commons needs an accountable account. Guests carry
      // ordinary session cookies (internal type 'session', subject 'guest:…')
      // and anonymous visitors are { type: 'session', authenticated: false },
      // so type alone identifies nobody — the old type-only check let both
      // publish to the public index.
      const sharerState = req.authState || {}
      const isAccountSharer = sharerState.type === 'session'
        && sharerState.authenticated === true
        && sharerState.subject
        && !isGuestSubject(sharerState.subject)
      if (config.requireAuth && !isAccountSharer) {
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
      if (!approvalGate) {
        return res.json({ ok: true, removed: commonsStore.unshareAsset(assetId) })
      }
      const outcome = await approvalGate.gateOrApply({
        kind: 'commons.asset.delete',
        args: { assetId },
        actorState: req.authState,
        summary: `remove commons asset ${assetId}`,
        req
      })
      if (outcome.pending) {
        return res.status(202).json({ status: 'pending_approval', approvalId: outcome.id, expiresAt: outcome.expiresAt })
      }
      res.json(outcome.result)
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
    // nginx proxies this through the generic /serverXR/ block with
    // proxy_buffering on, which is free to hold small SSE writes — the
    // same class of miss as the mesh websocket upgrade. This header
    // disables buffering per-response, so collaborators' events arrive
    // immediately on the Docker/VPS deploy, not just under the Vite proxy.
    res.setHeader('X-Accel-Buffering', 'no')
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
