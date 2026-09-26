// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerStatusRoutes } = require('./statusRoutes')

// The routes register themselves on whatever router they are given; a stub that keeps the
// handlers is enough to call them with the requests a real deploy sees.
const routes = () => {
  const handlers = {}
  registerStatusRoutes({ get: (path, fn) => { handlers[path] = fn } }, { recentEvents: [], startedAt: 0, releaseInfo: {} })
  return handlers
}
const call = (handler, req) => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  handler({ headers: {}, ...req }, res)
  return res
}

describe('GET /api/follows — names other machines, so only the person at this one sees it', () => {
  it('answers a browser talking straight to the server on loopback', () => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '127.0.0.1' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('follows')
  })

  it('does not answer another address', () => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '192.168.1.20' } })
    expect(res.statusCode).toBe(404)
  })

  // nginx, cloudflared, Caddy, ssh -L — a proxy on the same machine re-originates every visitor
  // from loopback. Behind a tunnel on the host that is the whole internet. The proxy's own
  // headers are the one honest sign, as in localOwner.js.
  it.each([
    ['x-forwarded-for', '203.0.113.9'],
    ['forwarded', 'for=203.0.113.9'],
    ['x-real-ip', '203.0.113.9'],
    ['x-forwarded-host', 'diiii.xyz']
  ])('does not answer loopback that came through a proxy (%s)', (header, value) => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '127.0.0.1' }, headers: { [header]: value } })
    expect(res.statusCode).toBe(404)
  })
})
