// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { registerAgentBoardRoutes } = require('./agentBoardRoutes.js')

// The board shows operator chat transcripts. Hiding its tab in the admin page
// is not a gate: the server must refuse anyone below admin itself.

const makeRouter = () => {
  const routes = {}
  return {
    routes,
    get(path, ...handlers) { routes[path] = handlers }
  }
}

const makeRes = () => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}

const store = { getBoard: async () => ({ sessions: [{ id: 'abc' }] }), getSessionDetail: async () => null }

async function call(path, req, { requireAuth = true } = {}) {
  const router = makeRouter()
  registerAgentBoardRoutes(router, { store, requireAuth: () => requireAuth })
  const [gate, handler] = router.routes[path]
  const res = makeRes()
  let passed = false
  gate(req, res, () => { passed = true })
  if (passed) await handler(req, res)
  return res
}

const loopback = { remoteAddress: '127.0.0.1' }
const savedEnv = process.env.NODE_ENV

describe('agent board gate', () => {
  afterEach(() => { process.env.NODE_ENV = savedEnv })

  it('a signed-in member on the same machine gets 403, not the transcripts', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board', { socket: loopback, authState: { authenticated: true, role: 'editor' } })
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'admins only' })
  })

  it('a visitor who is not signed in gets 403', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board', { socket: loopback, authState: { authenticated: false, role: 'viewer' } })
    expect(res.statusCode).toBe(403)
  })

  it('an admin on the same machine reads the board', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board', { socket: loopback, authState: { authenticated: true, role: 'admin' } })
    expect(res.statusCode).toBe(200)
    expect(res.body.sessions).toHaveLength(1)
  })

  it('an install without sign-in (one person, own machine) still reads it on loopback', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board', { socket: loopback }, { requireAuth: false })
    expect(res.statusCode).toBe(200)
  })

  it('off the machine it stays 404 even for an admin', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board', { socket: { remoteAddress: '10.0.0.5' }, authState: { authenticated: true, role: 'admin' } })
    expect(res.statusCode).toBe(404)
  })

  it('the session detail route has the same gate', async () => {
    process.env.NODE_ENV = 'development'
    const res = await call('/api/agent-board/session/:sessionId', { socket: loopback, params: { sessionId: 'abcdef12' }, authState: { authenticated: true, role: 'editor' } })
    expect(res.statusCode).toBe(403)
  })
})
