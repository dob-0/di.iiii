const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const { hashFileSha256, isSha256AssetId } = require('../assetHash')
const { UNSCRUBBABLE_IMAGE_ERROR, scrubImageMetadata } = require('../assetScrub')
const { getSpaceBlobPaths, hasBlob, storeBlobFromFile } = require('../blobStore')
const { receiveBodyToTempFile } = require('../verbatimAsset')
const { createKeyedLock } = require('../asyncLock')
const { applyAssetSafetyHeaders } = require('../spaceStore')
const { findIdlessCreateOp } = require('../opValidation')
const { placeOps } = require('../../../shared/placement.cjs')
const { actorFromAuthState } = require('../opActor')
const { countProjectLayers } = require('../../../shared/layers.cjs')
const { canAccessSpace, formatAuthScopeLabel } = require('../authAccess')

const withProjectLock = createKeyedLock()

function registerProjectRoutes(router, {
  config = {},
  appendProjectOps,
  applyProjectOps,
  broadcastProjectLiveEvent,
  buildProjectAssetMeta,
  deleteProjectWithIndex,
  ensureProject,
  ensureSpaceWritable,
  findProjectBySlug,
  getProjectLiveBucket,
  getProjectPaths,
  isReservedProjectSlug = () => false,
  isValidAssetId,
  listProjectsInSpace,
  maxOpHistory,
  maxOpAgeMs = 0,
  normalizeIncomingOps,
  normalizeProjectDocument,
  normalizeProjectId,
  normalizeProjectSlug = () => null,
  normalizeSpaceId,
  readProjectDocument,
  readProjectOps,
  readProjectOpsSince,
  readJson,
  resolveProjectContext,
  spacesDir,
  spaceExists,
  listTrashedProjects,
  restoreProject,
  reorderProjects,
  setProjectShelf,
  setProjectState,
  TRASH_TTL_MS,
  listCollections,
  getCollection,
  createCollection,
  renameCollection,
  reorderCollections,
  deleteCollection,
  countProjectsIn,
  upload,
  // The hash-pinned asset PUT (a follow carrying files). All three are absent
  // on a router built without them, and the route then refuses everyone.
  uploadsDir = null,
  maxUploadBytes = 0,
  isAllowedUpload = () => true,
  mayStoreVerbatim = () => false,
  upsertProjectMeta,
  writeJson,
  writeProjectDocument,
  blankProjectDocument,
  // spaceHistory.js — restore points before changes. Absent means none.
  spaceHistory = null
}) {
  router.get('/api/spaces/:spaceId/projects', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const rows = await listProjectsInSpace(spacesDir, spaceId)
      const projects = []
      for (const meta of rows) {
        const layers = await readLayerCounts(spaceId, meta)
        projects.push(layers ? { ...meta, layers } : meta)
      }
      res.json({ projects })
    } catch (error) {
      next(error)
    }
  })

  // ── what each project holds, for the card's one line ─────────────────────
  //
  // "3 things · 2 wires · 1 surface · 1 lamp", or "empty" (the layers
  // decision, 2026-09-23, unit 1). Read from the document by the same rule the
  // editor runs (shared/layers.cjs, the twin of src/project/layers.js), never
  // stored: the counts are a view of what the project holds, and a stored count
  // is a claim the data cannot keep — the same reason no "kind" is stored
  // below.
  //
  // Cached on (project, document version, updatedAt) like the scene-or-page
  // mode: a list of sixty projects parses their documents once and then
  // answers from memory; any write moves one of those two numbers. The
  // document is read and normalized in memory only — the list never writes a
  // document back, as opening one does.
  const layerCountsCache = new Map()
  const LAYER_COUNTS_CACHE_MAX = 4000
  const readLayerCounts = async (spaceId, meta) => {
    const key = `${spaceId}:${meta.id}:${meta.documentVersion ?? 0}:${meta.updatedAt ?? 0}`
    if (layerCountsCache.has(key)) return layerCountsCache.get(key)
    let counts = null
    try {
      const { documentPath } = getProjectPaths(spacesDir, spaceId, meta.id)
      const raw = await readJson(documentPath, null)
      // Only what the project holds goes on the wire: a zero is the absence of
      // the field, so an empty project answers {} and the list stays small.
      counts = Object.fromEntries(
        Object.entries(countProjectLayers(normalizeProjectDocument(raw || {})))
          .filter(([, value]) => value)
      )
    } catch {
      // A document that cannot be read says nothing on its card rather than
      // failing the whole list.
      counts = null
    }
    if (layerCountsCache.size >= LAYER_COUNTS_CACHE_MAX) layerCountsCache.clear()
    layerCountsCache.set(key, counts)
    return counts
  }

  // ── what a space holds, for whoever is allowed to look ───────────────────
  //
  // The projects index above is the AUTHOR's list: every row, whatever state
  // it is in, because filing and unfiling is what an author does with it. This
  // is the sibling a visitor needs — the same space, only the work that is
  // actually finished and on show, with one extra fact per row that the meta
  // table cannot carry: whether the thing is a scene or a page.
  //
  // Access is NOT decided here. `/api/spaces/:spaceId` sets req.requiredSpaceId
  // and `requireReadRole('viewer')` (serverXR/src/index.js) has already let this
  // request through — public space, or a session scoped to it. Adding a filter
  // here on top of that gate is the whole point: the gate says who may look at
  // the space, this says what is on show inside it. Widening either one was
  // never on the table; the projects that could not be found were never the
  // projects somebody should not see.
  //
  // Two rows are dropped that the author's list keeps:
  //   - state 'draft' and 'archived' — the two words the product already has
  //     for "not on show" (projectStore.js PROJECT_STATES).
  //   - a title still wearing the pre-2026-09-10 "[archived]" prefix, which is
  //     what archiving WAS before the column existed. StudioHub reads the same
  //     rule client-side; a visitor's copy has to be enforced server-side or it
  //     is a suggestion.
  // Trashed rows never appear at all — listProjectsInSpace excludes them.
  const isLegacyArchivedTitle = (title = '') => String(title).trimStart().startsWith('[archived]')

  // A scene or a page, read from the document rather than guessed from a
  // column. There is no stored "kind" and there must not be one: a document
  // carries entities[] and nodes[] at the same time and nothing enforces
  // either, so a kind written down at creation is a claim the data cannot
  // keep. presentationState.mode is the setting the author actually sets, and
  // it is what the published surface already obeys.
  //
  // Cached on (project, document version, updatedAt) so a space of sixty
  // projects parses its documents once and then answers out of memory; any
  // write moves one of those two numbers, so a stale label is not reachable.
  const presentationModeCache = new Map()
  const PRESENTATION_MODE_CACHE_MAX = 4000
  const readPresentationMode = async (spaceId, meta) => {
    const key = `${meta.id}:${meta.documentVersion ?? 0}:${meta.updatedAt ?? 0}`
    if (presentationModeCache.has(key)) return presentationModeCache.get(key)
    let mode = 'scene'
    try {
      const document = await readProjectDocument(spacesDir, spaceId, meta.id)
      const raw = document?.presentationState?.mode
      if (raw === 'scene' || raw === 'fixed-camera' || raw === 'code') mode = raw
    } catch {
      // A document that cannot be read is still a project that exists; call it
      // a scene (the schema default) rather than dropping the row and hiding
      // the very thing this route was built to make findable.
      mode = 'scene'
    }
    if (presentationModeCache.size >= PRESENTATION_MODE_CACHE_MAX) presentationModeCache.clear()
    presentationModeCache.set(key, mode)
    return mode
  }

  router.get('/api/spaces/:spaceId/contents', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) {
        return res.status(404).json({ error: 'Space not found.' })
      }
      const onShow = (await listProjectsInSpace(spacesDir, spaceId))
        .filter((meta) => (meta.state || 'live') === 'live' && !isLegacyArchivedTitle(meta.title))
      const projects = []
      for (const meta of onShow) {
        projects.push({
          id: meta.id,
          slug: meta.slug || null,
          title: meta.title,
          mode: await readPresentationMode(spaceId, meta),
          updatedAt: meta.updatedAt
        })
      }
      res.json({ spaceId, projects })
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
        // Project ids are global across every space (deliberate — see
        // resolveProjectContext / GET /api/projects/:projectId, which takes
        // no spaceId), so this collision can be with a project in a space
        // the caller cannot see, and would name it. "Project already
        // exists." named nothing and gave nobody anything to act on — a
        // newcomer who picks an ordinary name twice, weeks apart, in two
        // different spaces, hit this with no way to tell what happened.
        return res.status(409).json({ error: 'that name is taken on this di.iiii — try another' })
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
      // Public handle, independently renameable from id, unique within the
      // owning space only — docs/architecture/SPEC_space_urls_and_portability.md.
      let nextSlug
      if (req.body?.slug !== undefined) {
        const normalized = normalizeProjectSlug(req.body.slug)
        if (normalized === undefined) {
          return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, or dashes (min 3 characters).' })
        }
        if (normalized !== null) {
          if (isReservedProjectSlug(normalized)) {
            return res.status(400).json({ error: `"${normalized}" is a reserved word and can't be used as a slug.` })
          }
          if (normalized !== project.projectId) {
            const existing = await findProjectBySlug(project.spaceId, normalized)
            if (existing && existing.id !== project.projectId) {
              return res.status(409).json({ error: 'That slug is already taken in this space.' })
            }
          }
        }
        nextSlug = normalized
      }
      const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
        ...(req.body?.title !== undefined ? { title: req.body.title } : {}),
        ...(req.body?.slug !== undefined ? { slug: nextSlug } : {})
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
      // Soft: the row is marked and the bytes are left alone until the trash
      // sweep passes TRASH_TTL_MS. The response says when it stops being
      // recoverable, so a client can offer the undo rather than inventing one.
      const receipt = await deleteProjectWithIndex(project.spaceId, project.projectId)
      res.json({ ok: true, trashed: true, ...(receipt || {}) })
    } catch (error) {
      next(error)
    }
  })

  // ── The trash ────────────────────────────────────────────────────────────
  // Delete used to remove the row and rm -rf the directory in one call, with no
  // undo anywhere in the product.
  router.get('/api/trash', async (req, res, next) => {
    try {
      const spaceId = req.query.space ? normalizeSpaceId(req.query.space) : null
      // A `?space=` scope is already enforced upstream: index.js sets
      // req.requiredSpaceId for this route from the same query param and runs
      // it through the same requireReadRole/requireWriteRole gate as GET
      // /api/spaces/:spaceId/projects, so an inaccessible or nonexistent
      // space never reaches here.
      //
      // With no `?space=`, nothing upstream narrows the list — narrow it
      // here instead, to trashed projects in spaces this caller can access.
      // canAccessSpace alone is not a safe filter for an anonymous caller: an
      // identity with no `spaces` restriction reads as "every space" by
      // design (authAccess.js normalizeAuthScopeSpaces), which is what an
      // unauthenticated request's default state looks like too — so
      // `state.authenticated` is checked first, or an anonymous caller would
      // see every space's trash again.
      let projects = await listTrashedProjects(spaceId)
      if (!spaceId && config.requireAuth) {
        const state = req.authState || {}
        projects = projects.filter((project) => state.authenticated && canAccessSpace(state, project.spaceId))
      }
      res.json({ projects, ttlMs: TRASH_TTL_MS })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/projects/:projectId/restore', async (req, res, next) => {
    try {
      const projectId = normalizeProjectId(req.params.projectId)
      const trashed = (await listTrashedProjects()).find(p => p.id === projectId)
      if (!trashed) return res.status(404).json({ error: 'Nothing by that name is in the trash.' })
      // A trashed project no longer resolves through the /api/projects/:projectId
      // middleware in index.js (it looks up live projects only), so
      // req.requiredSpaceId stayed null here and requireWriteRole's per-space
      // scope check never ran — an editor token scoped to one space could
      // restore a project trashed in another. Checked explicitly instead,
      // same rule (and same response shape) as everywhere else a write is
      // scoped to a space.
      if (config.requireAuth) {
        const state = req.authState || {}
        if (!(state.authenticated && canAccessSpace(state, trashed.spaceId))) {
          return res.status(403).json({
            error: 'Space access denied.',
            requiredSpaceId: trashed.spaceId,
            allowedSpaces: state.spaces,
            allowedSpaceLabel: formatAuthScopeLabel(state.spaces)
          })
        }
      }
      await ensureSpaceWritable(trashed.spaceId)
      const project = await restoreProject(projectId)
      res.json({ project })
    } catch (error) {
      next(error)
    }
  })

  // ── Shelves ──────────────────────────────────────────────────────────────
  router.get('/api/spaces/:spaceId/collections', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) return res.status(404).json({ error: 'Space not found.' })
      res.json({ collections: listCollections(spaceId) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/collections', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) return res.status(404).json({ error: 'Space not found.' })
      await ensureSpaceWritable(spaceId)
      res.status(201).json({ collection: createCollection(spaceId, req.body?.label) })
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message })
      next(error)
    }
  })

  router.patch('/api/collections/:collectionId', async (req, res, next) => {
    try {
      const existing = getCollection(req.params.collectionId)
      if (!existing) return res.status(404).json({ error: 'Shelf not found.' })
      await ensureSpaceWritable(existing.spaceId)
      res.json({ collection: renameCollection(existing.id, req.body?.label) })
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message })
      next(error)
    }
  })

  // Deleting a shelf never deletes work: its projects come loose in the space.
  router.delete('/api/collections/:collectionId', async (req, res, next) => {
    try {
      const existing = getCollection(req.params.collectionId)
      if (!existing) return res.status(404).json({ error: 'Shelf not found.' })
      await ensureSpaceWritable(existing.spaceId)
      const loosened = countProjectsIn(existing.id)
      deleteCollection(existing.id)
      res.json({ ok: true, loosened })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/spaces/:spaceId/collections/order', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      await ensureSpaceWritable(spaceId)
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
      res.json({ collections: reorderCollections(spaceId, ids) })
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/spaces/:spaceId/projects/order', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      await ensureSpaceWritable(spaceId)
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
      res.json({ projects: await reorderProjects(spaceId, ids) })
    } catch (error) {
      next(error)
    }
  })

  // Which shelf a work sits on, and what it is — draft, live or archived.
  router.patch('/api/projects/:projectId/shelf', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) return res.status(404).json({ error: 'Project not found.' })
      await ensureSpaceWritable(project.spaceId)
      const body = req.body || {}
      let meta = null
      if ('collectionId' in body) {
        const target = body.collectionId ? getCollection(body.collectionId) : null
        if (body.collectionId && !target) return res.status(404).json({ error: 'Shelf not found.' })
        // A shelf belongs to one space; a project cannot be filed on a shelf in
        // another one, or the shelf becomes a second, weaker kind of space.
        if (target && target.spaceId !== project.spaceId) {
          return res.status(400).json({ error: 'That shelf belongs to another space.' })
        }
        meta = await setProjectShelf(project.projectId, body.collectionId || null)
      }
      if ('state' in body) meta = await setProjectState(project.projectId, body.state)
      if (!meta) return res.status(400).json({ error: 'Nothing to change.' })
      res.json({ project: meta })
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message })
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
      // Imported assets store an empty manifest `url`; fill it with the asset
      // endpoint so the bytes are reachable everywhere (thumbnails, copy-URL,
      // export, viewer) instead of resolving to a broken "/serverXR" path.
      if (Array.isArray(document?.assets)) {
        for (const asset of document.assets) {
          if (asset && asset.id && !asset.url) {
            asset.url = `/api/projects/${project.projectId}/assets/${asset.id}`
          }
        }
      }
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
      const actor = actorFromAuthState(req.authState)
      // Serialized per project: without this, a full-document PUT racing a
      // concurrent POST /ops (or another PUT) can interleave its read-modify-
      // write with theirs and silently clobber the other's change — the lock
      // makes this endpoint's replace atomic relative to every other writer
      // for the same project, even though it's still last-write-wins by
      // design (a full replace has no baseVersion to conflict-check against).
      const result = await withProjectLock(project.projectId, async () => {
        // Re-fetch inside the lock: `project.meta` was read before we
        // acquired it and may already be stale.
        const fresh = await resolveProjectContext(project.projectId)
        if (!fresh) return null
        // A whole replace always keeps a way back to what it replaces.
        if (spaceHistory) await spaceHistory.beforeChange(project.spaceId, actor, { reason: 'before-document-replace' })
        const document = normalizeProjectDocument(req.body || blankProjectDocument)
        const currentVersion = Number(fresh.meta?.documentVersion) || 0
        const nextVersion = currentVersion + 1
        document.projectMeta = {
          ...document.projectMeta,
          id: project.projectId,
          spaceId: project.spaceId,
          createdAt: fresh.meta?.createdAt || Date.now(),
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
        await appendProjectOps(spacesDir, project.spaceId, project.projectId, [resetOp], maxOpHistory, maxOpAgeMs, actor)
        const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
          title: document.projectMeta.title,
          documentVersion: nextVersion
        })
        return { nextVersion, nextMeta, document, resetOp }
      })
      if (!result) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      const { nextVersion, nextMeta, document, resetOp } = result
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
      // Pushed into SQL via the existing (project_id, version) index instead
      // of reading+parsing the whole retained history and filtering in JS
      // (2026-07-17 perf audit) -- this is the most frequent read of this
      // table (every catch-up/reconnect hits it).
      let filtered = Number.isFinite(since)
        ? await readProjectOpsSince(spacesDir, project.spaceId, project.projectId, since)
        : await readProjectOps(spacesDir, project.spaceId, project.projectId)
      let latestProject = project

      // `?wait=<seconds>` — the same parameter, for the same reason, as on the
      // scene ops route: a di.iiii following this one parks here rather than
      // polling, so an edit inside a project crosses in the time one request
      // takes. Only entered when there is nothing to send.
      const wait = Math.min(Number(req.query.wait) || 0, 30)
      if (wait > 0 && !filtered.length) {
        const { waitForChange } = require('../follow/waiters')
        const closed = new AbortController()
        req.on('close', () => closed.abort())
        const changed = await waitForChange(`project:${project.projectId}`, wait * 1000, { signal: closed.signal })
        if (changed) {
          filtered = Number.isFinite(since)
            ? await readProjectOpsSince(spacesDir, project.spaceId, project.projectId, since)
            : await readProjectOps(spacesDir, project.spaceId, project.projectId)
          latestProject = (await resolveProjectContext(req.params.projectId)) || project
        }
      }

      const latestVersion = Number(latestProject.meta?.documentVersion) || 0
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
      // An id-less create is applied with a server-minted id but broadcast
      // verbatim, so every peer mints a different one and the documents fork
      // silently. Reject rather than persist a batch that can't converge.
      const idless = findIdlessCreateOp(normalizedOps)
      if (idless) {
        return res.status(400).json({
          error: `Op "${idless.type}" is missing a stable id — create ops must carry one.`,
          code: 'op_missing_id'
        })
      }

      // The author, from the session — never from the ops — and, at the first
      // change of a new burst in this space, a restore point before it lands.
      const actor = actorFromAuthState(req.authState)
      if (spaceHistory) await spaceHistory.beforeChange(project.spaceId, actor)

      // Serialized per project: the version check and the read-modify-write
      // it guards must be one atomic step, or two concurrent requests at the
      // same baseVersion both pass the check and both write, one silently
      // clobbering the other (the race this lock exists to close).
      const result = await withProjectLock(project.projectId, async () => {
        const fresh = await resolveProjectContext(project.projectId)
        if (!fresh) return { notFound: true }
        const currentVersion = Number(fresh.meta?.documentVersion) || 0
        if (baseVersion !== currentVersion) {
          // Read only the ops the client is actually behind by. The response
          // was always filtered to `> baseVersion`, but reading via
          // readProjectOps pulled the whole retained window (up to 500 ops)
          // out of storage on every conflict just to throw most of it away —
          // and conflicts are exactly when the editor is busiest.
          const pendingOps = await readProjectOpsSince(spacesDir, project.spaceId, project.projectId, baseVersion)
          return {
            conflict: true,
            latestVersion: currentVersion,
            pendingOps: pendingOps.filter(entry => (entry.version || 0) > baseVersion)
          }
        }

        // Idempotency guard: a client retry (request timed out but the
        // server actually committed) resends the same batch by opId. Without
        // this, the retry's ops get treated as brand new — reapplied and
        // given a fresh version number, inflating the op-log with duplicate
        // history entries for the same edit every time a retry happens.
        const existingOps = await readProjectOps(spacesDir, project.spaceId, project.projectId)
        const existingOpIds = new Set(existingOps.map((op) => op.opId).filter(Boolean))
        const newOps = normalizedOps.filter((op) => !op.opId || !existingOpIds.has(op.opId))
        if (!newOps.length) {
          // Every op in this batch was already applied — nothing to do, but
          // this isn't a conflict either; respond with the current state so
          // the client's retry completes cleanly instead of erroring.
          const currentDocument = await readProjectDocument(spacesDir, project.spaceId, project.projectId)
          return { nextVersion: currentVersion, nextMeta: fresh.meta, nextDocument: currentDocument, versionedOps: [] }
        }

        const document = await readProjectDocument(spacesDir, project.spaceId, project.projectId)
        // Build zones. A room that turns placement on is not free space: every
        // hangable thing that arrives is put in a numbered slot, whatever the
        // client asked for. Rewriting HERE rather than in the editor is what
        // makes it a rule — a phone, a script and a signed-in author all land
        // on the same hanging line, and the rewritten ops are what goes into
        // the log and out to every peer, so nobody sees a different room.
        const placedOps = placeOps(document, newOps)
        let nextVersion = currentVersion
        const timestamp = Date.now()
        const versionedOps = placedOps.map((op) => ({
          ...op,
          version: ++nextVersion,
          timestamp
        }))
        const nextDocument = applyProjectOps(document, versionedOps)
        nextDocument.projectMeta = {
          ...nextDocument.projectMeta,
          id: project.projectId,
          spaceId: project.spaceId,
          createdAt: fresh.meta?.createdAt || nextDocument.projectMeta.createdAt,
          updatedAt: Date.now()
        }
        await writeProjectDocument(spacesDir, project.spaceId, project.projectId, nextDocument)
        await appendProjectOps(spacesDir, project.spaceId, project.projectId, versionedOps, maxOpHistory, maxOpAgeMs, actor)
        const nextMeta = await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, {
          title: nextDocument.projectMeta.title,
          documentVersion: nextVersion
        })
        return { nextVersion, nextMeta, nextDocument, versionedOps }
      })

      if (result.notFound) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (result.conflict) {
        return res.status(409).json({ latestVersion: result.latestVersion, pendingOps: result.pendingOps })
      }
      const { nextVersion, nextMeta, nextDocument, versionedOps } = result
      if (versionedOps.length) {
        // A followed space carries its projects too: wake this install's
        // follower, and release any di.iiii holding a read open on this
        // project. Neither is ever fatal — an install that follows nothing has
        // no follower to wake and nobody parked.
        try { require('../follow').nudgeFollow(project.spaceId) } catch { /* no follows here */ }
        try {
          const { noteChange } = require('../follow/waiters')
          noteChange(`project:${project.projectId}`)
          // …and the SPACE, because a follower parks on the room's log while
          // it waits. Without this a project edit sat until that park expired —
          // measured at five seconds, which is five seconds of the other artist
          // watching nothing happen.
          noteChange(project.spaceId)
        } catch { /* nobody waiting */ }
        await broadcastProjectLiveEvent(project.projectId, 'project-op', {
          version: nextVersion,
          ops: versionedOps
        })
      }
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
      // multer's recorded size is stale once scrubbing rewrites the file, and
      // the upload is moved into the blob store below — stat it while it's here
      const scrubbedSize = await fsp.stat(req.file.path).then((s) => s.size).catch(() => req.file.size)
      // A scrubbed file no longer hashes to the id the client computed from the
      // original, so its requested id is dropped and the content address is
      // recomputed below. Callers already remap ids from the response (bundle
      // import in StudioEditor/StudioHub). Un-rewritten files keep the strict check.
      let assetId = (req.body?.assetId && !scrub.scrubbed) ? String(req.body.assetId).trim() : ''
      if (assetId) {
        if (!isValidAssetId(assetId)) {
          await fsp.rm(req.file.path, { force: true }).catch(() => {})
          return res.status(400).json({ error: 'Invalid asset id.' })
        }
        // sha256-shaped ids are content addresses — served immutable, so the
        // bytes must actually hash to the id or a cached asset can be replaced
        if (isSha256AssetId(assetId)) {
          if (assetId.toLowerCase() !== await hashFileSha256(req.file.path)) {
            await fsp.rm(req.file.path, { force: true }).catch(() => {})
            return res.status(400).json({ error: 'Asset id does not match file content.' })
          }
          assetId = assetId.toLowerCase()
        } else {
          // Non-sha256 (legacy uuid-style) ids have no content address to
          // verify against, so a first-time id is accepted as-is — but if
          // one already exists at this id, only an identical re-upload may
          // pass; anything else would silently overwrite content anyone
          // else could already be referencing/caching under that same id.
          const existingPath = path.join(assetsDir, assetId)
          const existingHash = await hashFileSha256(existingPath).catch(() => null)
          if (existingHash !== null && existingHash !== await hashFileSha256(req.file.path)) {
            await fsp.rm(req.file.path, { force: true }).catch(() => {})
            return res.status(409).json({ error: 'An asset already exists at this id with different content.' })
          }
        }
      } else {
        assetId = await hashFileSha256(req.file.path)
      }
      const finalPath = path.join(assetsDir, assetId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      if (isSha256AssetId(assetId)) {
        // content-addressed: bytes go to the space blob store (once per
        // space); the project keeps only the <hash>.json reference
        await storeBlobFromFile(spacesDir, project.spaceId, assetId, req.file.path)
        await fsp.rm(finalPath, { force: true })
      } else {
        // legacy uuid-style ids stay project-local
        await fsp.rm(finalPath, { force: true })
        await fsp.rename(req.file.path, finalPath)
      }
      const assetMeta = buildProjectAssetMeta({
        assetId,
        file: { ...req.file, size: scrubbedSize },
        source: 'server',
        width: scrub.width,
        height: scrub.height
      })
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

  // The same file, on another di.iiii: store these exact bytes under this exact
  // content address, or store nothing.
  //
  // A followed space (serverXR/src/follow) carries its projects' op logs, and
  // an `upsertAsset` op names a file by the sha256 of its bytes. The op crosses;
  // until this route existed the bytes never did, and a video placed on one
  // machine was a dead frame on the other. The follower cannot use the upload
  // route above to bring them over: that route re-encodes images to strip
  // EXIF/GPS, so the bytes it stores hash to a DIFFERENT id than the one
  // already written into the ops on both machines.
  //
  // So this route skips the scrubber — and that is only safe because of the
  // two rules below, which are the whole security argument:
  //
  //   1. PROOF. The id must be a 64-hex sha256 and the server hashes what it
  //      actually received. Anything else is refused (422) and the temp file
  //      deleted. What is stored is therefore byte-for-byte a file some
  //      di.iiii already holds under that address — and a file only gets a
  //      sha256 address on a di.iiii by passing through the upload route, which
  //      scrubbed it. The content address is the proof of scrubbing.
  //
  //   2. CALLER. Proof alone is not enough: anyone can hash an un-scrubbed
  //      photo and PUT it under its true sha256. So an ordinary signed-in
  //      editor — a person with a browser — is refused (403) even though the
  //      upload route would take their file. Only replication may call this:
  //      a per-space sync key (the credential `di follow` holds; editor on that
  //      one space, scope already enforced by requireWriteRole), this server's
  //      own internal token (the follower writing to its own install), or an
  //      install with auth off entirely (a local machine, where every caller is
  //      the owner already). A sync key holder could still push a file their
  //      own install never scrubbed; that is the trust a space owner extends by
  //      minting the key, the same trust that already lets that key write ops.
  //
  // It writes the blob and the project's <hash>.json reference exactly as the
  // upload would have, and it emits NO op: the upsertAsset that names this file
  // has already travelled through the op log, which is why we are here.
  router.put('/api/projects/:projectId/assets/:assetId', async (req, res, next) => {
    let tempPath = null
    try {
      const project = await resolveProjectContext(req.params.projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (!mayStoreVerbatim(req)) {
        res.setHeader('Connection', 'close')
        return res.status(403).json({ error: 'Only a sync key or this server itself may store a file verbatim. Upload it instead.' })
      }
      const assetId = String(req.params.assetId || '').trim().toLowerCase()
      if (!isSha256AssetId(assetId)) {
        res.setHeader('Connection', 'close')
        return res.status(400).json({ error: 'A verbatim file is addressed by the sha256 of its bytes.' })
      }
      const name = String(req.query.name || '').slice(0, 255) || 'Untitled Asset'
      const mimeType = String(req.query.mimeType || '').slice(0, 127) || 'application/octet-stream'
      if (!isAllowedUpload({ mimetype: mimeType, originalname: name })) {
        res.setHeader('Connection', 'close')
        return res.status(415).json({ error: 'Unsupported asset type.' })
      }
      if (!uploadsDir || !(maxUploadBytes > 0)) {
        res.setHeader('Connection', 'close')
        return res.status(501).json({ error: 'This server cannot receive files.' })
      }
      // A body some parser already read (sent as JSON, say) is gone: there is
      // nothing left to hash, and waiting for its end would wait forever.
      if (req.readableEnded) {
        return res.status(400).json({ error: 'Send the file as raw bytes (application/octet-stream).' })
      }
      const declared = Number(req.get('content-length'))
      if (Number.isFinite(declared) && declared > maxUploadBytes) {
        res.setHeader('Connection', 'close')
        return res.status(413).json({ error: 'File too large.', maxBytes: maxUploadBytes })
      }
      await ensureSpaceWritable(project.spaceId)
      const { assetsDir } = getProjectPaths(spacesDir, project.spaceId, project.projectId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      const url = `${req.baseUrl || ''}/api/projects/${project.projectId}/assets/${assetId}`

      // Already here: say so and touch nothing. The body is still read to the
      // end (and thrown away) so the sender's write finishes cleanly.
      const existingMeta = await readJson(metaPath, null)
      if (existingMeta && await hasBlob(spacesDir, project.spaceId, assetId)) {
        await new Promise((resolve) => { req.on('end', resolve); req.on('close', resolve); req.resume() })
        return res.json({ ok: true, already: true, asset: { ...existingMeta, url } })
      }

      let received
      try {
        received = await receiveBodyToTempFile(req, { dir: uploadsDir, maxBytes: maxUploadBytes })
      } catch (error) {
        if (error.code === 'BODY_TOO_LARGE') {
          res.setHeader('Connection', 'close')
          return res.status(413).json({ error: 'File too large.', maxBytes: maxUploadBytes })
        }
        throw error
      }
      tempPath = received.tempPath
      if (received.sha256 !== assetId) {
        await fsp.rm(tempPath, { force: true }).catch(() => {})
        tempPath = null
        return res.status(422).json({ error: 'These bytes are not the file that id names.', expected: assetId, received: received.sha256 })
      }
      await fsp.mkdir(assetsDir, { recursive: true })
      await storeBlobFromFile(spacesDir, project.spaceId, assetId, tempPath)
      tempPath = null
      const assetMeta = buildProjectAssetMeta({
        assetId,
        file: { originalname: name, mimetype: mimeType, size: received.size },
        source: 'server',
        width: Number(req.query.width) || 0,
        height: Number(req.query.height) || 0
      })
      await writeJson(metaPath, assetMeta)
      await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, { touch: true })
      res.json({ ok: true, already: false, asset: { ...assetMeta, url } })
    } catch (error) {
      if (tempPath) await fsp.rm(tempPath, { force: true }).catch(() => {})
      next(error)
    }
  })

  // Existence + meta check so clients can pre-hash and skip uploading bytes
  // the server already has (content-addressed dedupe).
  router.get('/api/projects/:projectId/assets/:assetId/meta', async (req, res, next) => {
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
      const meta = await readJson(path.join(assetsDir, `${assetId}.json`), null)
      try {
        await fsp.access(path.join(assetsDir, assetId))
      } catch {
        // no legacy binary: the asset exists only if this project holds the
        // reference AND the space blob store holds the bytes
        if (!meta) {
          return res.status(404).json({ error: 'Asset not found.' })
        }
        await fsp.access(getSpaceBlobPaths(spacesDir, project.spaceId).blobPath(assetId))
      }
      const url = `${req.baseUrl || ''}/api/projects/${project.projectId}/assets/${assetId}`
      res.json({ ok: true, asset: { ...(meta || { id: assetId }), url } })
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
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
      let servePath = filePath
      try {
        await fsp.access(filePath)
      } catch {
        // fall back to the space blob store, but only while this project
        // still holds the <hash>.json reference — a deleted asset must 404
        // even though other projects may keep the blob alive
        if (!meta) {
          return res.status(404).json({ error: 'Asset not found.' })
        }
        servePath = getSpaceBlobPaths(spacesDir, project.spaceId).blobPath(assetId)
        await fsp.access(servePath)
      }
      res.setHeader('Content-Type', meta?.mimeType || 'application/octet-stream')
      applyAssetSafetyHeaders(res, meta?.mimeType)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      // `root` + a name, never sendFile(absolutePath). `send` applies
      // dotfiles: 'ignore' to EVERY segment of an absolute path, and the
      // default install lives in ~/.di — so on any `di` install this 404'd
      // every asset anyone uploaded, while the API and the app itself kept
      // working, which reads as a routing bug and is not one. The same trap
      // was fixed for index.html (index.js) and left here.
      res.sendFile(path.basename(servePath), { root: path.dirname(servePath) })
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      next(error)
    }
  })

  router.delete('/api/projects/:projectId/assets/:assetId', async (req, res, next) => {
    try {
      const project = await resolveProjectContext(req.params.projectId)
      const assetId = req.params.assetId
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (!isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid asset id.' })
      }
      await ensureSpaceWritable(project.spaceId)
      const { assetsDir } = getProjectPaths(spacesDir, project.spaceId, project.projectId)
      const filePath = path.join(assetsDir, assetId)
      const metaPath = path.join(assetsDir, `${assetId}.json`)
      // reference = legacy binary OR meta json; the space blob itself is
      // shared and only ever removed by the GC script
      const hasBinary = await fsp.access(filePath).then(() => true, () => false)
      const hasMeta = await fsp.access(metaPath).then(() => true, () => false)
      if (!hasBinary && !hasMeta) {
        return res.status(404).json({ error: 'Asset not found.' })
      }
      await fsp.rm(filePath, { force: true })
      await fsp.rm(metaPath, { force: true })
      await upsertProjectMeta(spacesDir, project.spaceId, project.projectId, { touch: true })
      res.json({ ok: true })
    } catch (error) {
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
