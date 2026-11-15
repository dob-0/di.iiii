// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { registerMonitorRoutes } = require('./monitorRoutes.js')
const { createReportStore } = require('../monitorHub.js')

// The monitor lists machines and session titles: hiding its tab is not a gate.

const makeRouter = () => {
  const routes = {}
  return {
    routes,
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; routes[path] = handlers },
    post(path, ...handlers) { routes[`POST ${path}`] = handlers }
  }
}
const makeRes = () => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}
const hub = {
  getSnapshot: async () => ({ panels: {} }),
  reports: createReportStore(),
  asks: { add: ({ text }) => (text ? { id: 'page-1' } : { error: 'empty', status: 400 }) }
}

async function call(req, { requireAuth = true, deployEnv = null, route = 'GET /api/monitor' } = {}) {
  const router = makeRouter()
  registerMonitorRoutes(router, { hub, requireAuth: () => requireAuth, deployEnv: () => deployEnv })
  const [gate, handler] = router.routes[route]
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

const admin = { authenticated: true, role: 'admin' }
const remote = { remoteAddress: '203.0.113.9' }

describe('monitor gate by tier', () => {
  afterEach(() => { process.env.NODE_ENV = saved })

  it('dev tier: an admin session passes without loopback', async () => {
    process.env.NODE_ENV = 'production'
    const res = await call({ socket: remote, authState: admin }, { deployEnv: 'staging' })
    expect(res.statusCode).toBe(200)
  })

  it('dev tier: a visitor and a member get 403', async () => {
    process.env.NODE_ENV = 'production'
    expect((await call({ socket: remote, authState: { authenticated: false } }, { deployEnv: 'staging' })).statusCode).toBe(403)
    expect((await call({ socket: remote, authState: { authenticated: true, role: 'editor' } }, { deployEnv: 'staging' })).statusCode).toBe(403)
  })

  it('dev tier: a server that does not require sign-in is not open', async () => {
    const res = await call({ socket: remote, authState: admin }, { deployEnv: 'staging', requireAuth: false })
    expect(res.statusCode).toBe(403)
  })

  it('prod tier: 404 for everyone, even an admin on loopback with DI_LOCAL', async () => {
    process.env.DI_LOCAL = '1'
    try {
      expect((await call({ socket: loopback, authState: admin }, { deployEnv: 'production' })).statusCode).toBe(404)
      expect((await call({ socket: remote, authState: admin }, { deployEnv: 'production' })).statusCode).toBe(404)
    } finally { delete process.env.DI_LOCAL }
  })

  it('local tier is unchanged: loopback admin passes, off-machine 404', async () => {
    process.env.NODE_ENV = 'development'
    expect((await call({ socket: loopback, authState: admin }, { deployEnv: null })).statusCode).toBe(200)
    expect((await call({ socket: remote, authState: admin }, { deployEnv: null })).statusCode).toBe(404)
  })

  it('stream and ask use the same gate', async () => {
    process.env.NODE_ENV = 'production'
    for (const route of ['GET /api/monitor/stream', 'POST /api/monitor/ask', 'POST /api/monitor/report']) {
      expect((await call({ socket: remote, authState: { authenticated: false }, body: {} }, { deployEnv: 'staging', route })).statusCode).toBe(403)
      expect((await call({ socket: remote, authState: admin, body: {} }, { deployEnv: 'production', route })).statusCode).toBe(404)
    }
  })
})

describe('POST /api/monitor/report', () => {
  const body = { host: 'aylmo', panels: { agents: { ok: true, rows: [] } } }
  const cli = (dbRole) => ({ authenticated: true, role: 'editor', actor: 'di.cli', cliDbRole: dbRole })

  it('an admin session stores a report', async () => {
    const res = await call({ socket: remote, authState: admin, body, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, host: 'aylmo' })
    expect(hub.reports.list()[0].host).toBe('aylmo')
  })

  it('a terminal login of an admin account is accepted; of a member it is 403; on prod it is 404', async () => {
    const send = (state, deployEnv) => call({ socket: remote, authState: state, body, headers: {} }, { deployEnv, route: 'POST /api/monitor/report' })
    expect((await send(cli('admin'), 'staging')).statusCode).toBe(200)
    expect((await send(cli('editor'), 'staging')).statusCode).toBe(403)
    expect((await send(cli('admin'), 'production')).statusCode).toBe(404)
    expect((await send(cli('admin'), null)).statusCode).toBe(403) // local: off-machine
  })

  it('a bad body is 400 and an oversized declared length is 413', async () => {
    const bad = await call({ socket: remote, authState: admin, body: { host: 'x' }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(bad.statusCode).toBe(400)
    const big = await call({ socket: remote, authState: admin, body, headers: { 'content-length': String(10 * 1024 * 1024) } }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(big.statusCode).toBe(413)
  })
})

describe('POST /api/monitor/ask', () => {
  it('an admin session gets an id; a terminal login is refused; empty text is 400', async () => {
    const route = 'POST /api/monitor/ask'
    const ok = await call({ socket: remote, authState: admin, body: { text: 'do it' } }, { deployEnv: 'staging', route })
    expect(ok.body).toEqual({ id: 'page-1' })
    const viaCli = await call({ socket: remote, authState: { authenticated: true, role: 'editor', actor: 'di.cli', cliDbRole: 'admin' }, body: { text: 'x' } }, { deployEnv: 'staging', route })
    expect(viaCli.statusCode).toBe(403)
    const empty = await call({ socket: remote, authState: admin, body: {} }, { deployEnv: 'staging', route })
    expect(empty.statusCode).toBe(400)
  })
})
