import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSpaceRoutes } from './spaceRoutes.js'

const require = createRequire(import.meta.url)
const commonsStore = require('../commonsStore.js')
const { initDb, closeDb } = require('../db.js')

// registerSpaceRoutes only needs the plain Express-style route handlers it
// wires up -- a fake router captures them without a real HTTP server, same
// pattern as spaceRoutes.driveImport.test.js / spaceRoutes.sceneAssetCache.test.js.
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

// Range support (spaceStore.serveFile) needs the real request object to read
// the `Range` header and the HTTP method -- these are regression guards for
// the wiring, not the Range logic itself (covered in spaceStore.range.test.js):
// both GET asset routes must forward `req` through to `serveAsset`, or a
// <video> served through them can never seek even though serveFile supports it.
describe('spaceRoutes asset GET routes forward req to serveAsset for Range support', () => {
  const setup = ({ serveAsset, tmpRoot }) => {
    const router = makeFakeRouter()
    registerSpaceRoutes(router, {
      appendOpsHistory: vi.fn(),
      applySceneOps: vi.fn(),
      blankScene: {},
      broadcastLiveEvent: vi.fn(),
      buildMeta: vi.fn(),
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
      hydrateSceneAssetManifest: vi.fn(),
      isValidAssetId: () => true,
      loadSpaceMeta: vi.fn().mockResolvedValue({}),
      listSpaces: vi.fn(),
      maxOpHistory: 500,
      normalizeIncomingOps: vi.fn(),
      normalizeProjectId: (id) => id,
      normalizeSpaceId,
      readJson: vi.fn(),
      readOpsHistory: vi.fn(),
      removeAssetThumbnails: vi.fn(),
      saveSpaceMeta: vi.fn(),
      serveAsset,
      spacesDir: tmpRoot,
      spaceExists: vi.fn().mockResolvedValue(true),
      upsertSpaceMeta: vi.fn().mockResolvedValue({}),
      upload: { single: () => (req, res, next) => next() },
      writeJson: vi.fn().mockResolvedValue(undefined),
      writeOpsHistory: vi.fn()
    })
    return router
  }

  const tmpRoot = path.join(os.tmpdir(), `spaceRoutes-asset-range-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('GET /api/spaces/:spaceId/assets/:assetId passes req (with headers/method) and width through', async () => {
    const serveAsset = vi.fn().mockResolvedValue(undefined)
    const router = setup({ serveAsset, tmpRoot })
    const [handler] = router.routes['get /api/spaces/:spaceId/assets/:assetId']
    const req = {
      params: { spaceId: 'open-space', assetId: 'a'.repeat(64) },
      query: { w: '200' },
      method: 'GET',
      headers: { range: 'bytes=0-10' }
    }
    const res = {}
    const next = vi.fn()

    await handler(req, res, next)

    expect(serveAsset).toHaveBeenCalledTimes(1)
    const [, , , options] = serveAsset.mock.calls[0]
    expect(options.width).toBe('200')
    expect(options.req).toBe(req)
    expect(next).not.toHaveBeenCalled()
  })

  it('GET /api/commons/assets/:assetId passes req through', async () => {
    const serveAsset = vi.fn().mockResolvedValue(undefined)
    const router = setup({ serveAsset, tmpRoot })
    const [handler] = router.routes['get /api/commons/assets/:assetId']
    const assetId = 'b'.repeat(64)
    commonsStore.shareAsset({ assetId, spaceId: 'open-space', name: 'clip.mp4', mimeType: 'video/mp4', size: 10 })
    const req = {
      params: { assetId },
      method: 'HEAD',
      headers: {}
    }
    const res = {}
    const next = vi.fn()

    await handler(req, res, next)

    expect(serveAsset).toHaveBeenCalledTimes(1)
    const [, , , options] = serveAsset.mock.calls[0]
    expect(options.req).toBe(req)
    expect(next).not.toHaveBeenCalled()
  })
})
