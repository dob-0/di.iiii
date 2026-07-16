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
  const setup = () => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: '', token: '' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(),
      readJson: vi.fn(),
      writeJson: vi.fn(),
      upsertSpaceMeta: vi.fn(),
      normalizeSpaceId
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
