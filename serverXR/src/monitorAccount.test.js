// @vitest-environment node

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createAccountFeed } = require('./monitorAccount.js')
const { createHub, createReportStore } = require('./monitorHub.js')

const homeWith = (entry) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-account-'))
  if (entry !== undefined) {
    fs.mkdirSync(path.join(home, '.config', 'di'), { recursive: true })
    fs.writeFileSync(path.join(home, '.config', 'di', 'credentials.json'), JSON.stringify({ dev: entry }))
  }
  return home
}
const login = { token: 'secret-token-1', user: { name: 'Ada' }, expiresAt: Date.now() + 86400000 }

describe('the local Monitor\'s account feed', () => {
  it('signed out: no request, state signed-out', async () => {
    let calls = 0
    const feed = createAccountFeed({ home: homeWith(), fetchImpl: async () => { calls++ } })
    expect(await feed.mine()).toEqual({ state: 'signed-out', reports: [] })
    expect(calls).toBe(0)
  })

  it('a stored expiry in the past is only a hint: dev decides (the server rolls a session forward)', async () => {
    let calls = 0
    const feed = createAccountFeed({ home: homeWith({ ...login, expiresAt: Date.now() - 1000 }), fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({ reports: [] }) } } })
    expect((await feed.mine()).state).toBe('ok')
    expect(calls).toBe(1)
  })

  it('signed in: sends the token to the dev tier only, returns the machines, never the token', async () => {
    const seen = []
    const feed = createAccountFeed({ home: homeWith(login), fetchImpl: async (url, opts) => {
      seen.push([url, opts.headers.Authorization])
      return { ok: true, status: 200, json: async () => ({ reports: [{ host: 'r-di', panels: {} }] }) }
    } })
    const out = await feed.mine()
    expect(out).toMatchObject({ state: 'ok', name: 'Ada' })
    expect(out.reports.map((r) => r.host)).toEqual(['r-di'])
    expect(JSON.stringify(out)).not.toContain('secret-token-1')
    expect(seen).toEqual([['https://dev.diiii.xyz/serverXR/api/monitor/mine', 'Bearer secret-token-1']])
  })

  it('a refused token is expired; a network failure is offline; answers are cached 15 s', async () => {
    let t = 1000
    let status = 401
    let calls = 0
    const feed = createAccountFeed({ home: homeWith(login), now: () => t, fetchImpl: async () => { calls++; if (status === 0) throw new Error('down'); return { ok: status < 400, status, json: async () => ({ reports: [] }) } } })
    expect((await feed.mine()).state).toBe('expired')
    await feed.mine()
    expect(calls).toBe(1)
    t += 16000; status = 0
    expect((await feed.mine()).state).toBe('offline')
  })
})

describe('where the feed asks', () => {
  it('uses the base di login stored for dev, but never sends the token to another host', async () => {
    const urls = []
    const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ reports: [] }) } }
    await createAccountFeed({ home: homeWith({ ...login, base: 'https://dev.diiii.xyz/serverXR/' }), fetchImpl }).mine()
    await createAccountFeed({ home: homeWith({ ...login, base: 'https://evil.example/x' }), fetchImpl }).mine()
    expect(urls).toEqual(['https://dev.diiii.xyz/serverXR/api/monitor/mine', 'https://dev.diiii.xyz/serverXR/api/monitor/mine'])
  })
  it('a terminal login may reach GET /api/monitor/mine (the catalogue describes it)', () => {
    const { reachRefusalFor } = require('./cliTokenGate.js')
    expect(reachRefusalFor('GET', '/api/monitor/mine')).toBeNull()
  })
})

describe('the account feed: login changes and bad rows', () => {
  it('a new sign-in is seen at once, not after the cache; bad rows from dev are dropped; 403 is not "expired"', async () => {
    const home = homeWith(login)
    let status = 200
    const feed = createAccountFeed({ home, fetchImpl: async () => ({ ok: status < 400, status, json: async () => ({ reports: [
      { host: 'good-pc', panels: {} }, { host: '../bad', panels: {} }, { host: 'no-panels' }, { host: 'arr', panels: [] }
    ] }) }) })
    expect((await feed.mine()).reports.map((r) => r.host)).toEqual(['good-pc'])
    fs.writeFileSync(path.join(home, '.config', 'di', 'credentials.json'), JSON.stringify({ dev: { ...login, token: 'other-token', user: { name: 'Bo' } } }))
    expect((await feed.mine()).name).toBe('Bo')
    fs.rmSync(path.join(home, '.config', 'di', 'credentials.json'))
    expect((await feed.mine()).state).toBe('signed-out')
    fs.writeFileSync(path.join(home, '.config', 'di', 'credentials.json'), JSON.stringify({ dev: { ...login, token: 'third-token' } }))
    status = 403
    expect((await feed.mine()).state).toBe('offline')
  })
})

describe('the hub snapshot with an account', () => {
  const hub = () => createHub({ store: { getMonitor: async () => ({ panels: {} }) }, reports: createReportStore() })
  it('adds the account\'s machines marked via dev, and never replaces a held machine', async () => {
    const h = hub()
    h.reports.put({ host: 'aylmo', panels: {} }, { subject: 'local' })
    const snap = await h.getSnapshot({ account: { state: 'ok', name: 'Ada', reports: [{ host: 'aylmo', panels: {} }, { host: 'r-di', panels: {} }] } })
    expect(snap.reports.map((r) => [r.host, r.via || null])).toEqual([['aylmo', null], ['r-di', 'dev']])
    expect(snap.account).toEqual({ state: 'ok', name: 'Ada', machines: 1 })
  })

  it('another machine\'s chats reach the local chats block, and leave the reports rows', async () => {
    const h = hub()
    const src = { v: 2, generatedAt: Date.now() / 1000, chats: [{ sessionId: 's1', title: 'Light desk', group: 'ask', status: 'idle', idleMinutes: 3, asks: ['!! Say done.'] }] }
    const snap = await h.getSnapshot({ account: { state: 'ok', name: 'Ada', reports: [{ host: 'r-di', panels: { chats: { ok: true, source: src } } }] } })
    expect(snap.chats.rows.map((r) => [r.host, r.title])).toEqual([['r-di', 'Light desk']])
    expect(snap.reports.find((r) => r.host === 'r-di').panels.chats).toBeUndefined()
  })

  it('the dev feed for /mine keeps chats; the public list does not', () => {
    const store = createReportStore()
    store.put({ host: 'r-di', panels: { chats: { ok: true, source: { v: 2, generatedAt: Date.now() / 1000, chats: [{ sessionId: 's', title: 't', group: 'ask', status: 'idle', idleMinutes: 1 }] } } } }, { subject: 'u1' })
    expect(store.list({ subjects: ['u1'] })[0].panels.chats).toBeUndefined()
    expect(store.list({ subjects: ['u1'], chats: true })[0].panels.chats.source.chats).toHaveLength(1)
  })

  it('this machine is never listed twice, and a stranger\'s machine stays out of the dev tiers, asks and chats', async () => {
    const h = createHub({ store: { getMonitor: async () => ({ panels: {}, host: 'aylmo.local' }) }, reports: createReportStore() })
    const snap = await h.getSnapshot({ account: { state: 'ok', reports: [{ host: 'aylmo', panels: {} }, { host: 'r-di', panels: {} }] } })
    expect(snap.reports.map((r) => r.host)).toEqual(['r-di'])
    const chat = { v: 2, generatedAt: Date.now() / 1000, chats: [{ sessionId: 's', title: 'Secret', group: 'ask', status: 'idle', idleMinutes: 1 }] }
    h.reports.put({ host: 'stranger-pc', panels: { chats: { ok: true, source: chat } } }, { subject: 'u9' })
    const dev = await h.getSnapshot({ subjects: ['owner-1'] })
    expect(dev.chats.rows).toEqual([])
    expect(JSON.stringify(dev.tiers)).not.toContain('stranger-pc')
  })

  it('senders without ledger rights cannot fill the table: the owner keeps room', () => {
    const store = createReportStore()
    for (let i = 0; i < 10; i += 1) for (let j = 0; j < 12; j += 1) store.put({ host: `h${j}`, panels: {} }, { subject: `x${i}` })
    expect(store.raw().length).toBe(80)
    expect(store.put({ host: 'mine', panels: {} }, { subject: 'owner-1', ledger: true }).ok).toBe(true)
  })

  it('signed out still shows this machine and says so', async () => {
    const snap = await hub().getSnapshot({ account: { state: 'signed-out', reports: [] } })
    expect(snap.account).toMatchObject({ state: 'signed-out', machines: 0 })
  })

  it('dev lists only the owners\' machines', async () => {
    const h = hub()
    h.reports.put({ host: 'mine', panels: {} }, { subject: 'owner-1' })
    h.reports.put({ host: 'stranger', panels: {} }, { subject: 'person-9' })
    const snap = await h.getSnapshot({ subjects: ['owner-1'] })
    expect(snap.reports.map((r) => r.host)).toEqual(['mine'])
  })
})

describe('the shared picture feed', () => {
  const shared = { generatedAt: 't', machines: [{ host: 'aylmo', reportedAt: 'x', stale: false }], tiers: [], shows: [], tasks: [], pullRequests: { ok: true, from: 'aylmo', rows: [{ number: 1, title: 'a' }] }, spaces: { ok: true, rows: [{ slug: 's' }] }, asks: { ok: true, rows: [] }, evil: 'dropped' }
  const okRes = { ok: true, status: 200, json: async () => ({ ok: true, shared }) }

  it('signed out: no request; signed in: token goes to dev /shared only, never returned, unknown keys dropped', async () => {
    let calls = 0
    const feed0 = createAccountFeed({ home: homeWith(), fetchImpl: async () => { calls++ } })
    expect(await feed0.shared()).toMatchObject({ state: 'signed-out', data: null })
    expect(calls).toBe(0)
    const seen = []
    const feed = createAccountFeed({ home: homeWith(login), fetchImpl: async (url, opts) => { seen.push([url, opts.headers.Authorization]); return okRes } })
    const out = await feed.shared()
    expect(out.state).toBe('ok')
    expect(out.data.machines[0].host).toBe('aylmo')
    expect(out.data.evil).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('secret-token-1')
    expect(seen).toEqual([['https://dev.diiii.xyz/serverXR/api/monitor/shared', 'Bearer secret-token-1']])
  })

  it('dev not answering keeps the last good picture with its time; 404 is refused; 401 is expired', async () => {
    let t = Date.parse('2026-11-21T10:00:00Z')
    let status = 200
    const feed = createAccountFeed({ home: homeWith(login), now: () => t, fetchImpl: async () => { if (status === 0) throw new Error('down'); return status === 200 ? okRes : { ok: false, status, json: async () => ({}) } } })
    expect((await feed.shared()).state).toBe('ok')
    t += 16000; status = 0
    const off = await feed.shared()
    expect(off).toMatchObject({ state: 'offline', lastGoodAt: '2026-11-21T10:00:00.000Z' })
    expect(off.data.machines).toHaveLength(1)
    t += 16000; status = 404
    expect((await feed.shared()).state).toBe('refused')
    t += 16000; status = 401
    expect((await feed.shared()).state).toBe('expired')
  })

  it('a bad body or an oversize one is offline, not shown', async () => {
    const feed = createAccountFeed({ home: homeWith(login), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, shared: { machines: 'x'.repeat(600000) } }) }) })
    expect((await feed.shared()).state).toBe('offline')
  })
})
