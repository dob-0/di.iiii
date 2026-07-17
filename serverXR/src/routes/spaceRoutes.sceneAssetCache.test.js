import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { registerSpaceRoutes } from './spaceRoutes.js'

function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return {
    routes,
    get: record('get'),
    post: record('post'),
    put: record('put'),
    patch: record('patch'),
    delete: record('delete'),
    use: () => {}
  }
}

const normalizeSpaceId = (value) => {
  const slug = String(value || '').toLowerCase()
  return /^[a-z0-9-]{1,48}$/.test(slug) ? slug : null
}

// Regression tests for the 2026-07-17 perf audit: GET /scene (unauthenticated,
// hit on every public-space page view) did one fs.access syscall per asset,
// on every single request, with no caching -- worst-scaling item for a
// popular public space. filterAvailableSceneAssets now caches the resolved
// availability per (spaceId, sceneVersion), since the asset set only
// actually changes when the scene does.
describe('spaceRoutes GET /scene caches asset availability per sceneVersion', () => {
  const setup = async () => {
    const tmpRoot = path.join(os.tmpdir(), `spaceRoutes-scene-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const assetsDir = path.join(tmpRoot, 'open-space', 'assets')
    await fsp.mkdir(assetsDir, { recursive: true })
    const assetId = 'a'.repeat(64)
    await fsp.writeFile(path.join(assetsDir, assetId), 'bytes')

    let sceneVersion = 1
    const scene = { objects: [], assets: [{ id: assetId, name: 'photo.png' }] }

    const router = makeFakeRouter()
    registerSpaceRoutes(router, {
      appendOpsHistory: vi.fn(),
      applySceneOps: vi.fn(),
      blankScene: {},
      broadcastLiveEvent: vi.fn(),
      deleteSpace: vi.fn(),
      ensureSpaceScene: vi.fn(),
      ensureSpaceWritable: vi.fn().mockResolvedValue({ allowEdits: true }),
      findProjectById: vi.fn(),
      getLiveBucket: vi.fn(),
      getSpacePaths: vi.fn((spaceId) => ({
        spaceDir: path.join(tmpRoot, spaceId),
        scenePath: path.join(tmpRoot, spaceId, 'scene.json'),
        assetsDir: path.join(tmpRoot, spaceId, 'assets')
      })),
      hydrateSceneAssetManifest: (s) => s,
      isValidAssetId: () => true,
      loadSpaceMeta: vi.fn(async () => ({ sceneVersion })),
      listSpaces: vi.fn(),
      maxOpHistory: 500,
      normalizeIncomingOps: vi.fn(),
      normalizeProjectId: (id) => id,
      normalizeSpaceId,
      readJson: vi.fn(async () => scene),
      readOpsHistory: vi.fn(),
      removeAssetThumbnails: vi.fn(),
      saveSpaceMeta: vi.fn(),
      serveAsset: vi.fn(),
      spacesDir: tmpRoot,
      spaceExists: vi.fn().mockResolvedValue(true),
      upsertSpaceMeta: vi.fn().mockResolvedValue({}),
      upload: { single: () => (req, res, next) => next() },
      writeJson: vi.fn().mockResolvedValue(undefined),
      writeOpsHistory: vi.fn()
    })

    const [handler] = router.routes['get /api/spaces/:spaceId/scene']
    const call = async () => {
      const req = { params: { spaceId: 'open-space' }, baseUrl: '' }
      const json = vi.fn()
      const res = { json, status: vi.fn(() => ({ json })) }
      await handler(req, res, vi.fn())
      return json.mock.calls.at(-1)[0]
    }

    return { tmpRoot, assetsDir, assetId, call, setVersion: (v) => { sceneVersion = v } }
  }

  it('serves a cached (stale) availability result for the same sceneVersion after the asset is deleted', async () => {
    const { tmpRoot, assetsDir, assetId, call } = await setup()

    const first = await call()
    expect(first.scene.assets).toHaveLength(1)

    // Delete the asset file -- if the cache were NOT working, the next call
    // at the SAME sceneVersion would correctly (but expensively) exclude it.
    // The whole point of caching by (spaceId, sceneVersion) is that it
    // doesn't re-check, so the stale-but-cached result should persist.
    await fsp.rm(path.join(assetsDir, assetId))

    const second = await call()
    expect(second.scene.assets).toHaveLength(1)

    await fsp.rm(tmpRoot, { recursive: true, force: true })
  })

  it('re-checks availability when sceneVersion changes', async () => {
    const { tmpRoot, assetsDir, assetId, call, setVersion } = await setup()

    const first = await call()
    expect(first.scene.assets).toHaveLength(1)

    await fsp.rm(path.join(assetsDir, assetId))
    setVersion(2)

    const second = await call()
    expect(second.scene.assets).toHaveLength(0)

    await fsp.rm(tmpRoot, { recursive: true, force: true })
  })
})
