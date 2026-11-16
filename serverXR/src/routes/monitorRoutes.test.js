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

async function call(req, { requireAuth = true, deployEnv = null, route = 'GET /api/monitor', owners = ['owner-1'] } = {}) {
  const router = makeRouter()
  registerMonitorRoutes(router, { hub, requireAuth: () => requireAuth, deployEnv: () => deployEnv, ownerIds: () => owners })
  const [gate, handler] = router.routes[route]
  const res = makeRes()
  let passed = false
  // a refusal calls next('route'): the app's own answer for an unknown path takes over
  gate(req, res, (arg) => { if (arg === 'route') { res.hidden = true; res.statusCode = 404 } else passed = true })
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

const admin = { authenticated: true, role: 'admin', type: 'session', subject: 'admin-2' }
const owner = { authenticated: true, role: 'admin', type: 'session', subject: 'owner-1' }
const remote = { remoteAddress: '203.0.113.9' }
const ROUTES = ['GET /api/monitor', 'GET /api/monitor/stream', 'POST /api/monitor/ask', 'POST /api/monitor/report']
const withBody = (authState) => ({ socket: remote, authState, body: { text: 'hi', host: 'aylmo', panels: {} }, headers: {} })

describe('monitor gate by tier', () => {
  afterEach(() => { process.env.NODE_ENV = saved })

  it('dev tier: the owner passes on every route, from anywhere', async () => {
    process.env.NODE_ENV = 'production'
    // the stream's 200 (headers + events) is in monitorStream.test.js; here the gate alone
    for (const route of ROUTES.filter((r) => !r.endsWith('/stream'))) {
      const res = await call(withBody(owner), { deployEnv: 'staging', route })
      expect(res.statusCode, route).toBe(200)
    }
  })

  it('dev tier: another admin, an API token, di.bo, a sync key, a member and a visitor all get the unknown-route 404', async () => {
    process.env.NODE_ENV = 'production'
    const others = {
      'another admin': admin,
      'admin API token': { authenticated: true, role: 'admin', type: 'token', subject: 'owner-1' },
      'act token (di.bo)': { ...owner, actor: 'di.bo' },
      'sync key': { authenticated: true, role: 'admin', type: 'sync-key', subject: 'sync-key:abc' },
      'a member': { ...owner, role: 'editor', subject: 'member-3' },
      'a session minted from an API token': { ...owner, session: { subject: 'owner-1', via: 'token' } },
      'a visitor': { authenticated: false },
      'the local owner': { authenticated: true, role: 'admin', type: 'session', subject: 'local-owner' }
    }
    for (const [who, state] of Object.entries(others)) {
      for (const route of ROUTES) {
        const res = await call(withBody(state), { deployEnv: 'staging', route })
        expect(res.statusCode, `${who} ${route}`).toBe(404)
        expect(res.hidden, `${who} ${route}`).toBe(true) // nothing of its own was written
      }
    }
  })

  it('dev tier: an unset or empty owner list is nobody', async () => {
    process.env.NODE_ENV = 'production'
    for (const owners of [[], null, [''], ['  ']]) {
      for (const route of ROUTES) expect((await call(withBody(owner), { deployEnv: 'staging', route, owners })).statusCode, route).toBe(404)
    }
  })

  it('dev tier: a server that does not require sign-in is not open', async () => {
    const res = await call(withBody(owner), { deployEnv: 'staging', requireAuth: false })
    expect(res.statusCode).toBe(404)
  })

  it('prod tier: 404 for everyone, even the owner on loopback with DI_LOCAL', async () => {
    process.env.DI_LOCAL = '1'
    try {
      for (const route of ROUTES) {
        expect((await call({ ...withBody(owner), socket: loopback }, { deployEnv: 'production', route })).statusCode).toBe(404)
        expect((await call(withBody(owner), { deployEnv: 'production', route })).statusCode).toBe(404)
      }
    } finally { delete process.env.DI_LOCAL }
  })

  it('"standby" (the Mac\'s prod tier) and an unknown deploy name are prod: 404 for the owner too', async () => {
    process.env.NODE_ENV = 'production'
    for (const deployEnv of ['standby', 'qa-2', 'prod']) {
      for (const route of ROUTES) expect((await call(withBody(owner), { deployEnv, route })).statusCode, `${deployEnv} ${route}`).toBe(404)
    }
    const cli = { ...owner, actor: 'di.cli', cliDbRole: 'admin' }
    expect((await call(withBody(cli), { deployEnv: 'standby', route: 'POST /api/monitor/report' })).statusCode).toBe(404)
  })

  it('local tier is unchanged: loopback admin passes, off-machine 404', async () => {
    process.env.NODE_ENV = 'development'
    expect((await call({ socket: loopback, authState: admin }, { deployEnv: null })).statusCode).toBe(200)
    expect((await call({ socket: remote, authState: admin }, { deployEnv: null })).statusCode).toBe(404)
  })
})

describe('POST /api/monitor/report', () => {
  const body = { host: 'aylmo', panels: { agents: { ok: true, rows: [] } } }
  const cli = (dbRole, extra = {}) => ({ ...owner, role: 'editor', actor: 'di.cli', cliDbRole: dbRole, ...extra })
  const send = (state, deployEnv, owners) => call({ socket: remote, authState: state, body, headers: {} }, { deployEnv, route: 'POST /api/monitor/report', owners })

  it('the owner\'s session stores a report; hub.reports.put gets their subject and the ledger flag', async () => {
    const res = await send(owner, 'staging')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, host: 'aylmo' })
    expect(hub.reports.list()[0].host).toBe('aylmo')
  })

  it('the owner\'s terminal login is accepted; another account\'s, a member\'s and prod are 404', async () => {
    expect((await send(cli('admin'), 'staging')).statusCode).toBe(200)
    expect((await send(cli('editor'), 'staging')).statusCode).toBe(404)
    expect((await send(cli('admin', { subject: 'admin-2' }), 'staging')).statusCode).toBe(404)
    expect((await send(cli('admin'), 'staging', [])).statusCode).toBe(404)
    expect((await send(cli('admin'), 'production')).statusCode).toBe(404)
    expect((await send(cli('admin'), null)).statusCode).toBe(404) // local: off-machine
  })

  it('a host held by another sender answers 409', async () => {
    const taken = await call({ socket: remote, authState: { ...owner, subject: 'owner-1' }, body: { host: 'taken-host', panels: {} }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report', owners: ['owner-1', 'owner-2'] })
    expect(taken.statusCode).toBe(200)
    const second = await call({ socket: remote, authState: { ...owner, subject: 'owner-2' }, body: { host: 'taken-host', panels: {} }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report', owners: ['owner-1', 'owner-2'] })
    expect(second.statusCode).toBe(409)
  })

  it('a bad body is 400 and an oversized declared length is 413', async () => {
    const bad = await call({ socket: remote, authState: owner, body: { host: 'x' }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(bad.statusCode).toBe(400)
    const big = await call({ socket: remote, authState: owner, body, headers: { 'content-length': String(10 * 1024 * 1024) } }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(big.statusCode).toBe(413)
  })
})

describe('inventory over the monitor routes', () => {
  const H = 'c'.repeat(64)
  const report = (state, deployEnv, panels) => call({ socket: remote, authState: state, body: { host: 'inv-host', panels }, headers: {} }, { deployEnv, route: 'POST /api/monitor/report' })
  const read = (state, deployEnv, host = 'inv-host') => call({ socket: remote, authState: state, params: { host }, headers: {} }, { deployEnv, route: 'GET /api/monitor/inventory/:host' })

  it('the report answers inventoryWanted for a hash it holds no body for; the owner reads the body back', async () => {
    const first = await report(owner, 'staging', { inventory: { hash: H, counts: { updates: 1 } } })
    expect(first.body).toEqual({ ok: true, host: 'inv-host', inventoryWanted: true })
    const second = await report(owner, 'staging', { inventory: { hash: H, counts: { updates: 1 }, body: { schema: 1, updates: { rows: [] } } } })
    expect(second.body).toEqual({ ok: true, host: 'inv-host' })
    const got = await read(owner, 'staging')
    expect(got.statusCode).toBe(200)
    expect(got.body).toMatchObject({ hash: H, body: { schema: 1 } })
    expect((await read(owner, 'staging', 'unknown-host')).statusCode).toBe(404)
  })

  it('same gate as every monitor route: another admin, prod and an off-machine local request are the hidden 404', async () => {
    expect((await read({ ...owner, subject: 'admin-2' }, 'staging')).statusCode).toBe(404)
    expect((await read(owner, 'production')).statusCode).toBe(404)
    expect((await read(owner, null)).statusCode).toBe(404)
  })
})

describe('POST /api/monitor/ask', () => {
  it('the owner gets an id; a terminal login is refused; empty text is 400', async () => {
    const route = 'POST /api/monitor/ask'
    const ok = await call({ socket: remote, authState: owner, body: { text: 'do it' } }, { deployEnv: 'staging', route })
    expect(ok.body).toEqual({ id: 'page-1' })
    const viaCli = await call({ socket: remote, authState: { ...owner, role: 'editor', actor: 'di.cli', cliDbRole: 'admin' }, body: { text: 'x' } }, { deployEnv: 'staging', route })
    expect(viaCli.statusCode).toBe(404)
    const empty = await call({ socket: remote, authState: owner, body: {} }, { deployEnv: 'staging', route })
    expect(empty.statusCode).toBe(400)
  })
})
