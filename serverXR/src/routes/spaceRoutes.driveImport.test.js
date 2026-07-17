import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { registerSpaceRoutes } from './spaceRoutes.js'

// registerSpaceRoutes only needs the plain Express-style route handlers it
// wires up — a fake router captures them without a real HTTP server, same
// pattern as syncRoutes.test.js.
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

// Regression tests for the 2026-07-17 audit: direct uploads go through
// multer's fileFilter (isAllowedUpload), but the two Google Drive import
// routes wrote downloaded bytes straight to disk with whatever MIME type
// Drive reported, skipping that allowlist entirely.
describe('spaceRoutes Google Drive import respects the upload allowlist', () => {
  const setup = ({ isAllowedUpload, googleDrive, tmpRoot }) => {
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
      serveAsset: vi.fn(),
      spacesDir: tmpRoot,
      spaceExists: vi.fn().mockResolvedValue(true),
      upsertSpaceMeta: vi.fn().mockResolvedValue({}),
      upload: { single: () => (req, res, next) => next() },
      writeJson: vi.fn().mockResolvedValue(undefined),
      writeOpsHistory: vi.fn(),
      isAllowedUpload,
      googleDrive
    })
    return router
  }

  const makeReqRes = (body) => ({
    req: { params: { spaceId: 'open-space' }, body, authState: {}, baseUrl: '' },
    res: { json: vi.fn(), status: vi.fn(function status() { return this }) },
    next: vi.fn()
  })

  it('rejects a downloaded Drive file whose MIME/extension the allowlist disallows', async () => {
    const tmpRoot = path.join(os.tmpdir(), `spaceRoutes-drive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const isAllowedUpload = vi.fn().mockReturnValue(false)
    const googleDrive = {
      parseDriveUrl: () => ({ id: 'file-1' }),
      resolveItems: vi.fn().mockResolvedValue([{ id: 'file-1' }]),
      downloadFile: vi.fn().mockResolvedValue({
        buffer: Buffer.from('not actually an image'),
        name: 'malware.exe',
        mimeType: 'application/x-msdownload'
      })
    }
    const router = setup({ isAllowedUpload, googleDrive, tmpRoot })
    const [handler] = router.routes['post /api/spaces/:spaceId/assets/import-drive']
    const { req, res, next } = makeReqRes({ url: 'https://drive.google.com/file/d/abc/view' })

    await handler(req, res, next)

    expect(isAllowedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'application/x-msdownload', originalname: 'malware.exe' })
    )
    // Rejected asset lands in `failed`, not `imported` -- and since it's the
    // only item, the whole import fails with 400 rather than silently
    // writing the disallowed file to disk.
    expect(res.status).toHaveBeenCalledWith(400)
    // The assets dir gets created unconditionally, but no bytes should have
    // been written to it -- the disallowed file must never land on disk.
    const assetsDir = path.join(tmpRoot, 'open-space', 'assets')
    await expect(fsp.readdir(assetsDir)).resolves.toEqual([])

    await fsp.rm(tmpRoot, { recursive: true, force: true })
  })

  it('imports a downloaded Drive file the allowlist accepts', async () => {
    const tmpRoot = path.join(os.tmpdir(), `spaceRoutes-drive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const isAllowedUpload = vi.fn().mockReturnValue(true)
    const googleDrive = {
      parseDriveUrl: () => ({ id: 'file-1' }),
      resolveItems: vi.fn().mockResolvedValue([{ id: 'file-1' }]),
      downloadFile: vi.fn().mockResolvedValue({
        buffer: Buffer.from('fake png bytes'),
        name: 'photo.png',
        mimeType: 'image/png'
      })
    }
    const router = setup({ isAllowedUpload, googleDrive, tmpRoot })
    const [handler] = router.routes['post /api/spaces/:spaceId/assets/import-drive']
    const { req, res, next } = makeReqRes({ url: 'https://drive.google.com/file/d/abc/view' })

    await handler(req, res, next)

    expect(isAllowedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'image/png', originalname: 'photo.png' })
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))

    await fsp.rm(tmpRoot, { recursive: true, force: true })
  })
})
