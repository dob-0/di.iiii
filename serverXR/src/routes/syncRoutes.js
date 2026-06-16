const path = require('node:path')
const fsp = require('node:fs/promises')

function registerSyncRoutes(router, {
  config,
  getSpacePaths,
  readJson,
  writeJson,
  upsertSpaceMeta,
} = {}) {
  const { liveSync, directories } = config
  const repoRoot = path.resolve(directories.root, '..')

  const liveFetch = async (urlPath, opts = {}) => {
    const url = `${liveSync.url}${urlPath}`
    const headers = { Accept: 'application/json', ...opts.headers }
    if (liveSync.token) headers['Authorization'] = `Bearer ${liveSync.token}`
    const response = await fetch(url, { ...opts, headers, signal: opts.signal ?? AbortSignal.timeout(8000) })
    return response
  }

  // GET /api/sync/spaces/:spaceId/status
  // Returns local and live scene info so the UI can show whether they're in sync.
  router.get('/api/sync/spaces/:spaceId/status', async (req, res, next) => {
    try {
      const spaceId = req.params.spaceId
      if (!spaceId) return res.status(400).json({ error: 'spaceId required' })

      const { scenePath } = getSpacePaths(spaceId)
      const localScene = await readJson(scenePath, null)
      const local = {
        exists: Boolean(localScene),
        objects: localScene?.objects?.length ?? 0,
        assets: localScene?.assets?.length ?? 0,
        version: localScene?.version ?? 0,
      }

      let live = null
      const configured = Boolean(liveSync.url)
      const canPush = Boolean(liveSync.token)

      if (configured) {
        try {
          const response = await liveFetch(`/api/spaces/${spaceId}/scene`)
          if (response.ok) {
            const { scene, version } = await response.json()
            live = {
              objects: scene?.objects?.length ?? 0,
              assets: scene?.assets?.length ?? 0,
              version: version ?? scene?.version ?? 0,
            }
          } else {
            live = { error: `live server returned ${response.status}` }
          }
        } catch {
          live = { error: 'live server unreachable' }
        }
      }

      res.json({ local, live, configured, canPush })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/sync/spaces/:spaceId/pull
  // Fetches the scene from the live server and saves it locally.
  // Also writes to spaces/{spaceId}/scene.json for git tracking.
  router.post('/api/sync/spaces/:spaceId/pull', async (req, res, next) => {
    try {
      const spaceId = req.params.spaceId
      if (!spaceId) return res.status(400).json({ error: 'spaceId required' })
      if (!liveSync.url) return res.status(503).json({ error: 'LIVE_API_URL not configured on the server.' })

      const response = await liveFetch(`/api/spaces/${spaceId}/scene`)
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return res.status(502).json({ error: `Live server returned ${response.status}: ${text.slice(0, 120)}` })
      }
      const { scene } = await response.json()
      if (!scene || typeof scene !== 'object') {
        return res.status(502).json({ error: 'Live server returned an unexpected scene format.' })
      }

      // Save to local server data dir
      const { spaceDir, scenePath, assetsDir } = getSpacePaths(spaceId)
      await fsp.mkdir(assetsDir, { recursive: true })
      await writeJson(scenePath, scene)
      await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: (scene.version ?? 0) + 1 })

      // Also save to repo-root spaces/ dir for git tracking
      const trackedPath = path.join(repoRoot, 'spaces', spaceId, 'scene.json')
      await fsp.mkdir(path.dirname(trackedPath), { recursive: true })
      await fsp.writeFile(trackedPath, JSON.stringify(scene, null, 2) + '\n', 'utf8')

      res.json({
        ok: true,
        objects: scene.objects?.length ?? 0,
        assets: scene.assets?.length ?? 0,
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/sync/spaces/:spaceId/push
  // Reads the local scene and sends it to the live server.
  router.post('/api/sync/spaces/:spaceId/push', async (req, res, next) => {
    try {
      const spaceId = req.params.spaceId
      if (!spaceId) return res.status(400).json({ error: 'spaceId required' })
      if (!liveSync.url) return res.status(503).json({ error: 'LIVE_API_URL not configured on the server.' })
      if (!liveSync.token) {
        return res.status(503).json({
          error: 'LIVE_API_TOKEN is not set. Add it to the server .env.local file so the server can authenticate with the live instance.'
        })
      }

      const { scenePath } = getSpacePaths(spaceId)
      const scene = await readJson(scenePath, null)
      if (!scene) return res.status(404).json({ error: `Space "${spaceId}" not found locally.` })

      const response = await liveFetch(`/api/spaces/${spaceId}/scene`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scene),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return res.status(502).json({ error: `Live server returned ${response.status}: ${text.slice(0, 120)}` })
      }

      res.json({
        ok: true,
        objects: scene.objects?.length ?? 0,
        assets: scene.assets?.length ?? 0,
      })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerSyncRoutes }
