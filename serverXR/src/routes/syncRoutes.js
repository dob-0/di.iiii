/**
 * Local ↔ live scene sync.
 *
 * Every route here writes a WHOLE scene across an instance boundary, which is
 * the most destructive shape a write can have. Three rules follow from that,
 * and they are why this file reads more defensively than its size suggests:
 *
 *  1. Read verbatim or not at all. `GET /scene` returns a rendering — asset
 *     URLs rewritten to the serving host, manifest entries whose files are
 *     missing silently dropped. Copying that to another instance deletes the
 *     entries the reader merely hadn't downloaded. `?verbatim=1` exists for
 *     this, and a peer that cannot serve it is refused rather than guessed at.
 *  2. State the version you are replacing. Both directions send a precondition
 *     and surface a 409 AS a 409, so a lost update can never read as a network
 *     hiccup.
 *  3. Snapshot before overwriting, and say where the snapshot went.
 *
 * The house style in the rest of this file — `catch { live = { error: … } }` on
 * the STATUS read — is fine for a read. It is never acceptable on a write path.
 */
const { httpRequest: defaultHttpRequest } = require('../httpClient')

function registerSyncRoutes(router, {
  config,
  getSpacePaths,
  readJson,
  normalizeSpaceId,
  ensureSpaceWritable,
  replaceSceneAndBroadcast,
  loadSpaceMeta = null,
  snapshotSpaceScene = null,
  httpRequest = defaultHttpRequest,
} = {}) {
  const { liveSync } = config

  // httpRequest (node:https), never global fetch — undici's WASM HTTP parser
  // OOMs under cPanel/LVE limits (same fix as the GitHub-sync path).
  const liveFetch = async (urlPath, opts = {}) => {
    const url = `${liveSync.url}${urlPath}`
    const headers = { Accept: 'application/json', ...opts.headers }
    if (liveSync.token) headers['Authorization'] = `Bearer ${liveSync.token}`
    return httpRequest(url, { method: opts.method || 'GET', headers, body: opts.body ?? null, timeoutMs: 8000 })
  }

  const localSceneVersion = async (spaceId) => {
    if (typeof loadSpaceMeta !== 'function') return null
    const meta = await loadSpaceMeta(spaceId)
    return meta?.sceneVersion ?? 0
  }

  /**
   * Read the peer's scene as stored, or refuse.
   *
   * `missingAssetIds` is the proof that the peer honoured ?verbatim=1 — an
   * older server ignores the query and returns its filtered, URL-rewritten
   * rendering, which looks identical apart from that key. Writing that back is
   * exactly the manifest-erasure bug, so its absence is a hard stop.
   */
  const fetchLiveSceneVerbatim = async (spaceId) => {
    const response = await liveFetch(`/api/spaces/${spaceId}/scene?verbatim=1`)
    if (!response.ok) {
      const text = response.text || ''
      return { error: { status: 502, body: { error: `Live server returned ${response.status}: ${text.slice(0, 120)}` } } }
    }
    const body = response.json()
    if (!body?.scene || typeof body.scene !== 'object') {
      return { error: { status: 502, body: { error: 'Live server returned an unexpected scene format.' } } }
    }
    if (!Array.isArray(body.missingAssetIds)) {
      return {
        error: {
          status: 502,
          body: {
            error: 'The live server does not support verbatim scene reads, so its scene cannot be copied safely. ' +
              'Upgrade it, or move the space with scripts/space-bundle.mjs.'
          }
        }
      }
    }
    return { scene: body.scene, version: body.version ?? 0, missingAssetIds: body.missingAssetIds }
  }

  // GET /api/sync/spaces/:spaceId/status
  //
  // Reports what each side IS, and refuses to say whether they agree. It used
  // to compare object and asset COUNTS, so two entirely unrelated scenes with
  // three objects each read as "in sync". Versions are per-install counters
  // and are not comparable across instances either, so the honest answer to
  // "are these the same?" is `unknown` until something tracks a shared
  // ancestor (that is what `di sync`'s ledger is for).
  router.get('/api/sync/spaces/:spaceId/status', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })

      const { scenePath } = getSpacePaths(spaceId)
      const localScene = await readJson(scenePath, null)
      const local = {
        exists: Boolean(localScene),
        objects: localScene?.objects?.length ?? 0,
        assets: localScene?.assets?.length ?? 0,
        // The authoritative counter, not the scene's own embedded `version`
        // field — that one is written by whoever last PUT the scene and can
        // be anything at all.
        version: (await localSceneVersion(spaceId)) ?? localScene?.version ?? 0,
      }

      let live = null
      let verbatimSupported = null
      const configured = Boolean(liveSync.url)
      const canPush = Boolean(liveSync.token)

      if (configured) {
        try {
          const response = await liveFetch(`/api/spaces/${spaceId}/scene?verbatim=1`)
          if (response.ok) {
            const body = response.json()
            verbatimSupported = Array.isArray(body?.missingAssetIds)
            live = {
              objects: body?.scene?.objects?.length ?? 0,
              assets: body?.scene?.assets?.length ?? 0,
              version: body?.version ?? body?.scene?.version ?? 0,
              missingAssetIds: verbatimSupported ? body.missingAssetIds : undefined,
            }
          } else {
            live = { error: `live server returned ${response.status}` }
          }
        } catch {
          live = { error: 'live server unreachable' }
        }
      }

      res.json({
        local,
        live,
        configured,
        canPush,
        verbatimSupported,
        // Deliberately not a boolean. See the comment above this route.
        relation: 'unknown',
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/sync/spaces/:spaceId/pull
  //
  // Live → local. Requires `expectedVersion` in the body: a pull replaces
  // everything on this machine, and the caller has to say which local version
  // it believes it is replacing. Snapshots first.
  router.post('/api/sync/spaces/:spaceId/pull', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!liveSync.url) return res.status(503).json({ error: 'LIVE_API_URL not configured on the server.' })
      // Checked upfront (before the live round trip) so a doomed request
      // against a locked space fails fast instead of waiting on the network
      // first; replaceSceneAndBroadcast below enforces it again regardless.
      await ensureSpaceWritable(spaceId)

      const currentVersion = await localSceneVersion(spaceId)
      const raw = req.body?.expectedVersion
      if (raw === undefined || raw === null) {
        return res.status(428).json({
          error: 'A pull replaces the whole local scene. Send expectedVersion with the local version you mean to replace.',
          localVersion: currentVersion,
        })
      }
      const expectedVersion = Number(raw)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return res.status(400).json({ error: 'expectedVersion must be a non-negative integer.' })
      }

      const remote = await fetchLiveSceneVerbatim(spaceId)
      if (remote.error) return res.status(remote.error.status).json(remote.error.body)

      // Before, not after: if anything below is wrong, the artist still has
      // the scene they had, and this response says where it is.
      let snapshot = null
      if (typeof snapshotSpaceScene === 'function') {
        try {
          // Returns the path of the file it wrote, or null if there was no
          // local scene to snapshot yet.
          snapshot = await snapshotSpaceScene(spaceId, { keep: 7 })
        } catch {
          return res.status(500).json({ error: 'Could not snapshot the local scene before pulling; nothing was written.' })
        }
      }

      // Go through the same locked, version-bumped, broadcast write path as
      // every other whole-scene replace (PUT /scene, restore-snapshot).
      // Previously this route wrote the file directly and bumped
      // sceneVersion from the REMOTE scene's own embedded version instead of
      // the local counter, with no op-log entry and no SSE broadcast --
      // connected clients silently stopped seeing pulled scenes live and
      // could hit spurious version mismatches afterward (audit 2026-07-17).
      const result = await replaceSceneAndBroadcast(spaceId, remote.scene, { expectedVersion })
      if (result.conflict) {
        return res.status(409).json({
          error: 'The local scene moved since you looked. Nothing was written.',
          latestVersion: result.latestVersion,
          pendingOps: result.pendingOps,
        })
      }

      res.json({
        ok: true,
        objects: remote.scene.objects?.length ?? 0,
        assets: remote.scene.assets?.length ?? 0,
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
        objectsBefore: result.objectsBefore,
        objectsAfter: result.objectsAfter,
        remoteVersion: remote.version,
        // Assets the live server has manifest entries for but no file — they
        // arrived in this scene and will not resolve here either.
        missingOnLive: remote.missingAssetIds,
        // snapshotSpaceScene returns the file it wrote, or null for a space
        // that had no scene yet.
        snapshot,
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/sync/spaces/:spaceId/push
  //
  // Local → live, conditional on the live version this push is based on. A
  // 409 from the live server is passed through AS a 409: it means someone
  // else's work would have been overwritten, and flattening that into a 502
  // "live server returned 409" is how a lost update reads as a bad network.
  router.post('/api/sync/spaces/:spaceId/push', async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!liveSync.url) return res.status(503).json({ error: 'LIVE_API_URL not configured on the server.' })
      if (!liveSync.token) {
        return res.status(503).json({
          error: 'LIVE_API_TOKEN is not set. Add it to the server .env.local file so the server can authenticate with the live instance.'
        })
      }

      const { scenePath } = getSpacePaths(spaceId)
      // Read from disk, which is already verbatim — this is the local side, so
      // no hydrate/filter is in the way.
      const scene = await readJson(scenePath, null)
      if (!scene) return res.status(404).json({ error: `Space "${spaceId}" not found locally.` })

      // What are we about to replace, and does that server speak verbatim?
      const remote = await fetchLiveSceneVerbatim(spaceId)
      if (remote.error) return res.status(remote.error.status).json(remote.error.body)

      const response = await liveFetch(`/api/spaces/${spaceId}/scene`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': `"${remote.version}"` },
        body: JSON.stringify(scene),
      })

      if (response.status === 409) {
        let body = null
        try { body = response.json() } catch { /* the status is the message */ }
        return res.status(409).json({
          error: 'The live scene moved since this push was prepared. Nothing was written there.',
          latestVersion: body?.latestVersion ?? null,
          pendingOps: body?.pendingOps ?? null,
        })
      }
      if (response.status === 428) {
        return res.status(502).json({
          error: 'The live server required a scene precondition and rejected this push. Its version moved between the read and the write; try again.'
        })
      }
      if (!response.ok) {
        const text = response.text || ''
        return res.status(502).json({ error: `Live server returned ${response.status}: ${text.slice(0, 120)}` })
      }

      let body = null
      try { body = response.json() } catch { /* older servers answer {ok:true} only */ }

      res.json({
        ok: true,
        objects: scene.objects?.length ?? 0,
        assets: scene.assets?.length ?? 0,
        remoteVersionBefore: remote.version,
        remoteVersionAfter: body?.newVersion ?? null,
        objectsReplacedOnLive: body?.objectsBefore ?? null,
      })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerSyncRoutes }
