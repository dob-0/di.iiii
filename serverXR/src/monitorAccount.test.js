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

  it('expired login: no request, state expired', async () => {
    let calls = 0
    const feed = createAccountFeed({ home: homeWith({ ...login, expiresAt: Date.now() - 1000 }), fetchImpl: async () => { calls++ } })
    expect((await feed.mine()).state).toBe('expired')
    expect(calls).toBe(0)
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
    expect(seen).toEqual([['https://dev.diiii.xyz/api/monitor/mine', 'Bearer secret-token-1']])
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
