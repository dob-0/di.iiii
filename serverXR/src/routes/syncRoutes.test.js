import { describe, expect, it, vi } from 'vitest'
import { registerSyncRoutes } from './syncRoutes.js'

// registerSyncRoutes only needs the plain Express-style route handlers it
// wires up — a fake router captures them without a real HTTP server.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return { routes, get: record('get'), post: record('post'), use: () => {} }
}

// Real normalizeSpaceId shape (serverXR/src/spaceStore.js): lowercase
// slug, 3-48 chars of [a-z0-9-], anything else (including a traversal
// payload with slashes/dots) returns null.
const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const normalizeSpaceId = (value) => {
  const slug = String(value || '').toLowerCase()
  return SLUG_REGEX.test(slug) ? slug : null
}

describe('registerSyncRoutes space id validation', () => {
  const setup = ({ ensureSpaceWritable = vi.fn().mockResolvedValue({}), ...overrides } = {}) => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: '', token: '' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(),
      readJson: vi.fn(),
      writeJson: vi.fn(),
      upsertSpaceMeta: vi.fn(),
      normalizeSpaceId,
      ensureSpaceWritable,
      ...overrides
    })
    return router
  }

  const traversalIds = ['..', '../../etc/passwd', 'foo/../../bar', '']

  for (const routeKey of [
    'get /api/sync/spaces/:spaceId/status',
    'post /api/sync/spaces/:spaceId/pull',
    'post /api/sync/spaces/:spaceId/push'
  ]) {
    it(`${routeKey} rejects a traversal/invalid space id with 400 before touching the filesystem`, async () => {
      const router = setup()
      const [handler] = router.routes[routeKey]
      for (const badId of traversalIds) {
        const req = { params: { spaceId: badId } }
        const json = vi.fn()
        const res = { status: vi.fn(() => ({ json })) }
        const next = vi.fn()
        // eslint-disable-next-line no-await-in-loop
        await handler(req, res, next)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(json).toHaveBeenCalledWith({ error: 'Invalid space id.' })
        expect(next).not.toHaveBeenCalled()
      }
    })
  }
})

// Regression test for audit finding #12: pull overwrote the local scene.json
// unconditionally — every other space-mutating route (POST /ops, PUT /scene)
// checks ensureSpaceWritable first, sync's pull route never did, so a
// space explicitly marked read-only (allowEdits: false) could still be
// overwritten via sync.
describe('registerSyncRoutes read-only enforcement', () => {
  const setup = (ensureSpaceWritable) => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: 'https://live.example', token: '' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(() => ({ spaceDir: '/tmp/space', scenePath: '/tmp/space/scene.json', assetsDir: '/tmp/space/assets' })),
      readJson: vi.fn(),
      writeJson: vi.fn(),
      upsertSpaceMeta: vi.fn(),
      normalizeSpaceId,
      ensureSpaceWritable
    })
    return router
  }

  it('pull refuses to overwrite a read-only space', async () => {
    const readOnlyError = Object.assign(new Error('Space is read-only.'), { status: 403 })
    const ensureSpaceWritable = vi.fn().mockRejectedValue(readOnlyError)
    const router = setup(ensureSpaceWritable)
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const req = { params: { spaceId: 'locked-space' } }
    const res = { status: vi.fn(() => ({ json: vi.fn() })) }
    const next = vi.fn()
    await handler(req, res, next)

    expect(ensureSpaceWritable).toHaveBeenCalledWith('locked-space')
    // Rejected via next(error), same as every other route's read-only guard
    // — the global error handler turns error.status into the response code.
    expect(next).toHaveBeenCalledWith(readOnlyError)
  })

  it('pull proceeds to fetch the live scene when the space is writable', async () => {
    const ensureSpaceWritable = vi.fn().mockResolvedValue({ allowEdits: true })
    const router = setup(ensureSpaceWritable)
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const req = { params: { spaceId: 'open-space' } }
    const res = { status: vi.fn(() => ({ json: vi.fn() })) }
    const next = vi.fn()
    await handler(req, res, next)

    expect(ensureSpaceWritable).toHaveBeenCalledWith('open-space')
    // With no real live server reachable, this fails downstream (next
    // called with the network error) rather than being blocked up front —
    // proving ensureSpaceWritable isn't what stopped it.
    expect(next).toHaveBeenCalled()
    expect(next.mock.calls[0][0]).not.toBe(undefined)
  })
})
