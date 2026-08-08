// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerAiConnectionRoutes } = require('./aiConnectionRoutes.js')
const { initDb, closeDb } = require('../db.js')
const store = require('../aiConnectionStore.js')

// Same fake-router approach as authRoutes.test.js: capture the plain
// Express-style handlers without spinning up a server.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return { routes, get: record('get'), post: record('post') }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json: vi.fn(function (payload) { this.body = payload; return this })
  }
  res.json = res.json.bind(res)
  return res
}

function call(handlers, req) {
  const res = makeRes()
  for (const handler of handlers) handler(req, res)
  return res
}

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('aiConnectionRoutes', () => {
  const setup = () => {
    const router = makeFakeRouter()
    registerAiConnectionRoutes(router)
    return router.routes
  }

  it('connect rejects an anonymous request with 401', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/connect'], {
      authState: null,
      body: { provider: 'claude', apiKey: 'sk-x' }
    })
    expect(res.statusCode).toBe(401)
  })

  it('connect rejects a guest subject with 403 and stores nothing', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/connect'], {
      authState: { subject: 'guest:abc' },
      body: { provider: 'claude', apiKey: 'sk-guest-try' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/guest/i)
    expect(store.getConnection('guest:abc', 'claude')).toBeNull()
  })

  it('disconnect rejects a guest subject with 403', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/disconnect'], {
      authState: { subject: 'guest:abc' },
      body: { provider: 'claude' }
    })
    expect(res.statusCode).toBe(403)
  })

  it('connect rejects an unknown provider with 400', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/connect'], {
      authState: { subject: 'user-1' },
      body: { provider: 'openai', apiKey: 'sk-x' }
    })
    expect(res.statusCode).toBe(400)
  })

  it('connect rejects an oversized key with 400', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/connect'], {
      authState: { subject: 'user-1' },
      body: { provider: 'claude', apiKey: 'x'.repeat(513) }
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/too long/i)
  })

  it('connect saves a key for a signed-in user and reports last4', () => {
    const routes = setup()
    const res = call(routes['post /api/integrations/ai/connect'], {
      authState: { subject: 'user-1' },
      body: { provider: 'claude', apiKey: 'sk-ant-1234', label: 'main' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ connected: true, label: 'main', last4: '1234' })
    expect(store.getKey('user-1', 'claude')).toBe('sk-ant-1234')
  })

  it('status reports connected without ever returning the key', () => {
    const routes = setup()
    store.saveKey('user-2', 'claude', 'sk-ant-9999')
    const res = call(routes['get /api/integrations/ai/status'], {
      authState: { subject: 'user-2' },
      query: { provider: 'claude' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.connected).toBe(true)
    expect(res.body.last4).toBe('9999')
    expect(JSON.stringify(res.body)).not.toContain('sk-ant-9999')
  })
})
