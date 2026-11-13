// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { registerMonitorRoutes } = require('./monitorRoutes.js')

// The monitor lists machines and session titles: hiding its tab is not a gate.

const makeRouter = () => {
  const routes = {}
  return { routes, get(path, ...handlers) { routes[path] = handlers } }
}
const makeRes = () => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}
const store = { getMonitor: async () => ({ panels: {} }) }

async function call(req, { requireAuth = true } = {}) {
  const router = makeRouter()
  registerMonitorRoutes(router, { store, requireAuth: () => requireAuth })
  const [gate, handler] = router.routes['/api/monitor']
  const res = makeRes()
  let passed = false
  gate(req, res, () => { passed = true })
  if (passed) await handler(req, res)
  return res
}

const loopback = { remoteAddress: '127.0.0.1' }
const saved = process.env.NODE_ENV

describe('monitor gate', () => {
  afterEach(() => { process.env.NODE_ENV = saved })

  it('a non-admin member on the same machine gets 403', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call({ socket: loopback, authState: { authenticated: true, role: 'editor' } })
    expect(res.statusCode).toBe(403)
  })

  it('a request from another machine gets 404', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call({ socket: { remoteAddress: '10.0.0.9' }, authState: { authenticated: true, role: 'admin' } })
    expect(res.statusCode).toBe(404)
  })

  it('a production server without DI_LOCAL gets 404 even on loopback', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const res = await call({ socket: loopback, authState: { authenticated: true, role: 'admin' } })
    expect(res.statusCode).toBe(404)
  })

  it('an admin on the same machine reads the snapshot', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call({ socket: loopback, authState: { authenticated: true, role: 'admin' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ panels: {} })
  })
})
