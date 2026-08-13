// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { registerEstateRoutes } = require('./estateRoutes.js')

// Minimal router double: records the handler so we can drive it directly.
const makeRouter = () => {
  const routes = []
  return {
    routes,
    get(path, ...rest) {
      routes.push({ path, middleware: rest.slice(0, -1), handler: rest[rest.length - 1] })
    }
  }
}

const makeRes = () => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}

const allowAdmin = (req, res, next) => next()

describe('estate map route', () => {
it('the route is admin-gated — the gate is the first middleware, not an afterthought', () => {
  const router = makeRouter()
  registerEstateRoutes(router, { requireAdminAlways: allowAdmin, estateMapPath: '/tmp/x.html' })
  expect(router.routes.length).toBe(1)
  expect(router.routes[0].path).toBe('/api/estate/map')
  expect(router.routes[0].middleware[0]).toBe(allowAdmin)
})

it('unset path answers 404 not-configured rather than pretending to serve', async () => {
  const router = makeRouter()
  registerEstateRoutes(router, { requireAdminAlways: allowAdmin, estateMapPath: null })
  const res = makeRes()
  await router.routes[0].handler({}, res, () => {})
  expect(res.statusCode).toBe(404)
  expect(res.body.error).toBe('not-configured')
})

it('a configured but absent file is "missing", distinct from "not configured"', async () => {
  const router = makeRouter()
  const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' })
  registerEstateRoutes(router, {
    requireAdminAlways: allowAdmin,
    estateMapPath: '/does/not/exist.html',
    stat: async () => { throw enoent },
    readFile: async () => { throw enoent }
  })
  const res = makeRes()
  await router.routes[0].handler({}, res, () => {})
  expect(res.statusCode).toBe(404)
  expect(res.body.error).toBe('missing')
})

it('an oversized map is refused before it is read into memory', async () => {
  const router = makeRouter()
  let readCalled = false
  registerEstateRoutes(router, {
    requireAdminAlways: allowAdmin,
    estateMapPath: '/big.html',
    stat: async () => ({ size: 5 * 1024 * 1024, mtimeMs: 0 }),
    readFile: async () => { readCalled = true; return 'x' }
  })
  const res = makeRes()
  await router.routes[0].handler({}, res, () => {})
  expect(res.statusCode).toBe(413)
  expect(readCalled).toBe(false)
})

it('a present map comes back with its html and mtime', async () => {
  const router = makeRouter()
  registerEstateRoutes(router, {
    requireAdminAlways: allowAdmin,
    estateMapPath: '/opt/atlas/estate-map.html',
    stat: async () => ({ size: 42, mtimeMs: 1_700_000_000_000 }),
    readFile: async () => '<h1>the estate</h1>'
  })
  const res = makeRes()
  await router.routes[0].handler({}, res, () => {})
  expect(res.statusCode).toBe(200)
  expect(res.body.html).toBe('<h1>the estate</h1>')
  expect(res.body.bytes).toBe(42)
  expect(res.body.name).toBe('estate-map.html')
  expect(res.body.updatedAt).toBe(new Date(1_700_000_000_000).toISOString())
})

it('an unexpected error is passed to next, not swallowed into a 404', async () => {
  const router = makeRouter()
  const boom = Object.assign(new Error('disk on fire'), { code: 'EIO' })
  registerEstateRoutes(router, {
    requireAdminAlways: allowAdmin,
    estateMapPath: '/x.html',
    stat: async () => { throw boom }
  })
  const res = makeRes()
  let passed = null
  await router.routes[0].handler({}, res, (err) => { passed = err })
  expect(passed).toBe(boom)
})
})
