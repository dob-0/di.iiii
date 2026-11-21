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
const ROUTES = ['GET /api/monitor', 'GET /api/monitor/prs', 'GET /api/monitor/stream', 'POST /api/monitor/ask', 'POST /api/monitor/report']
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

  it('a terminal login is accepted on dev for any signed-in account; prod and an off-machine local are 404', async () => {
    expect((await send(cli('admin'), 'staging')).statusCode).toBe(200)
    expect((await send(cli('editor'), 'staging')).statusCode).toBe(200)
    const other = await call({ socket: remote, authState: cli('admin', { subject: 'admin-2' }), body: { host: 'second-person-pc', panels: {} }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(other.statusCode).toBe(200)
    expect((await send(cli('admin', { subject: 'admin-3' }), 'staging')).statusCode).toBe(200) // their own aylmo, not the owner's
    expect((await send(cli('admin'), 'production')).statusCode).toBe(404)
    expect((await send(cli('admin'), null)).statusCode).toBe(404) // local: off-machine
  })

  it('an API token, di.bo\'s act token and a token-minted session are still 404', async () => {
    expect((await send({ ...owner, type: 'api-token' }, 'staging')).statusCode).toBe(404)
    expect((await send({ ...owner, actor: 'di.bo' }, 'staging')).statusCode).toBe(404)
    expect((await send({ ...owner, session: { via: 'token' } }, 'staging')).statusCode).toBe(404)
  })

  it('a non-owner report is stored without the ledger flag; the owner\'s keeps it', async () => {
    const seen = []
    const spy = { ...hub, reports: { ...hub.reports, put: (b, o) => { seen.push(o); return { ok: true, host: b.host } } } }
    const run = async (state) => {
      const router = makeRouter()
      registerMonitorRoutes(router, { hub: spy, requireAuth: () => true, deployEnv: () => 'staging', ownerIds: () => ['owner-1'] })
      const [gate, handler] = router.routes['POST /api/monitor/report']
      const res = makeRes()
      let passed = false
      gate({ socket: remote, authState: state, body, headers: {} }, res, (arg) => { if (arg !== 'route') passed = true })
      if (passed) await handler({ socket: remote, authState: state, body, headers: {} }, res)
    }
    await run(owner)
    await run({ ...owner, subject: 'someone-else', actor: 'di.cli', cliDbRole: 'editor' })
    expect(seen.map((o) => [o.subject, o.ledger])).toEqual([['owner-1', true], ['someone-else', false]])
  })

  it('a bad body is 400 and an oversized declared length is 413', async () => {
    const bad = await call({ socket: remote, authState: owner, body: { host: 'x' }, headers: {} }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(bad.statusCode).toBe(400)
    const big = await call({ socket: remote, authState: owner, body, headers: { 'content-length': String(10 * 1024 * 1024) } }, { deployEnv: 'staging', route: 'POST /api/monitor/report' })
    expect(big.statusCode).toBe(413)
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

describe('GET /api/monitor/prs', () => {
  it('answers "no source" instead of failing when the server has no PR list', async () => {
    process.env.NODE_ENV = 'production'
    const res = await call(withBody(owner), { deployEnv: 'staging', route: 'GET /api/monitor/prs' })
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.reason).toBe('no-source')
  })
})

describe('POST /api/monitor/tasks: same-origin and a small rate limit', () => {
  const run = async (req, { clock = { t: 0 }, ledger, router = makeRouter() } = {}) => {
    if (!router.routes['POST /api/monitor/tasks']) registerMonitorRoutes(router, { hub, ledger, now: () => clock.t, requireAuth: () => true, deployEnv: () => 'staging', ownerIds: () => ['owner-1'] })
    const chain = router.routes['POST /api/monitor/tasks']
    const res = makeRes()
    let i = 0
    const next = async (arg) => { if (arg === 'route') { res.statusCode = 404; return } const h = chain[++i]; if (h) await h(req, res, next) }
    await chain[0](req, res, next)
    return res
  }
  const mk = (headers = {}) => ({ socket: remote, authState: owner, headers: { host: 'dev.diiii.xyz', ...headers }, body: { id: 'N7', action: 'note', text: 'hi' } })
  const okLedger = () => { const l = { n: 0, change: async () => { l.n += 1; return { ok: true } } }; return l }

  it('a cross-site or foreign-origin browser request is 403 and writes nothing', async () => {
    const ledger = okLedger()
    expect((await run(mk({ 'sec-fetch-site': 'cross-site' }), { ledger })).statusCode).toBe(403)
    expect((await run(mk({ origin: 'https://evil.example' }), { ledger })).statusCode).toBe(403)
    expect(ledger.n).toBe(0)
    expect((await run(mk({ 'sec-fetch-site': 'same-origin' }), { ledger })).statusCode).toBe(200)
    expect((await run(mk({ origin: 'https://dev.diiii.xyz' }), { ledger })).statusCode).toBe(200)
    expect(ledger.n).toBe(2)
  })

  it('the 31st write inside a minute is 429; a minute later it works again', async () => {
    const ledger = okLedger()
    const clock = { t: 1000 }
    const router = makeRouter()
    for (let i = 0; i < 30; i += 1) expect((await run(mk(), { ledger, clock, router })).statusCode).toBe(200)
    expect((await run(mk(), { ledger, clock, router })).statusCode).toBe(429)
    expect(ledger.n).toBe(30)
    clock.t += 61000
    expect((await run(mk(), { ledger, clock, router })).statusCode).toBe(200)
  })
})

describe('GET /api/monitor/mine', () => {
  const run = async (state, deployEnv, store) => {
    const router = makeRouter()
    const mine = { ...hub, reports: store }
    registerMonitorRoutes(router, { hub: mine, requireAuth: () => true, deployEnv: () => deployEnv, ownerIds: () => ['owner-1'] })
    const [handler] = router.routes['GET /api/monitor/mine']
    const res = makeRes()
    let hidden = false
    await handler({ socket: remote, authState: state }, res, (arg) => { if (arg === 'route') hidden = true })
    return hidden ? { hidden: true } : res
  }
  const store = createReportStore()
  store.put({ host: 'a-mine', panels: {} }, { subject: 'person-1' })
  store.put({ host: 'b-theirs', panels: {} }, { subject: 'person-2' })

  it('a signed-in person gets only their own machines', async () => {
    const res = await run({ authenticated: true, type: 'session', actor: 'di.cli', subject: 'person-1' }, 'staging', store)
    expect(res.body.reports.map((r) => r.host)).toEqual(['a-mine'])
    expect((await run({ authenticated: true, type: 'session', subject: 'person-1' }, 'staging', store)).hidden).toBe(true) // a browser session never reads it
  })

  it('anonymous, an API token, prod and the local tier are hidden', async () => {
    expect((await run({ authenticated: false }, 'staging', store)).hidden).toBe(true)
    expect((await run({ authenticated: false, type: 'cli-token', reason: 'cli-token' }, 'staging', store)).hidden).toBe(true) // a failed terminal login
    expect((await run({ authenticated: true, type: 'api-token', subject: 'person-1' }, 'staging', store)).hidden).toBe(true)
    expect((await run({ authenticated: true, type: 'session', subject: 'person-1' }, 'production', store)).hidden).toBe(true)
    expect((await run({ authenticated: true, type: 'session', subject: 'person-1' }, null, store)).hidden).toBe(true)
  })
})

describe('GET /api/monitor/shared', () => {
  const run = async (state, deployEnv, headers = {}) => {
    const router = makeRouter()
    const calls = []
    const shared = { ...hub, getShared: async (a) => { calls.push(a); return { machines: [] } } }
    registerMonitorRoutes(router, { hub: shared, requireAuth: () => true, deployEnv: () => deployEnv, ownerIds: () => ['owner-1'] })
    const [handler] = router.routes['GET /api/monitor/shared']
    const res = makeRes()
    let hidden = false
    await handler({ socket: remote, headers, authState: state }, res, (arg) => { if (arg === 'route') hidden = true })
    return hidden ? { hidden: true } : { res, calls }
  }
  const owner = { authenticated: true, type: 'cli-token', actor: 'di.cli', cliDbRole: 'admin', subject: 'owner-1' }

  it('the owner terminal login on dev gets the shared picture, scoped to the owners', async () => {
    const out = await run(owner, 'staging')
    expect(out.res.body).toEqual({ ok: true, shared: { machines: [] } })
    expect(out.calls).toEqual([{ subjects: ['owner-1'] }])
  })

  it('another signed-in person, a browser session, cross-site, an API token, prod and the local tier are hidden', async () => {
    expect((await run({ ...owner, subject: 'person-1' }, 'staging')).hidden).toBe(true)
    expect((await run({ authenticated: true, type: 'session', subject: 'owner-1' }, 'staging')).hidden).toBe(true)
    expect((await run(owner, 'staging', { 'sec-fetch-site': 'cross-site' })).hidden).toBe(true)
    expect((await run({ authenticated: true, type: 'api-token', subject: 'owner-1' }, 'staging')).hidden).toBe(true)
    expect((await run(owner, 'production')).hidden).toBe(true)
    expect((await run(owner, null)).hidden).toBe(true)
    expect((await run({ authenticated: false }, 'staging')).hidden).toBe(true)
  })
})
