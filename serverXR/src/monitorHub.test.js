// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createReportStore, createAskStore, createHub, tierOfDeployEnv, fingerprint, STALE_MS } = require('./monitorHub.js')

const panels = { agents: { ok: true, rows: [{ sessionId: 'abcdef123456', title: 'work', status: 'busy' }] }, shows: { ok: true, rows: [{ id: 's1', title: 'Show' }] } }

describe('tier from the release manifest', () => {
  it('maps staging and dev to dev, production to prod, anything else to local', () => {
    expect(tierOfDeployEnv('staging')).toBe('dev')
    expect(tierOfDeployEnv('dev')).toBe('dev')
    expect(tierOfDeployEnv('production')).toBe('prod')
    expect(tierOfDeployEnv(null)).toBe('local')
  })
})

describe('report store', () => {
  it('stores per host and flags a report stale after 120 s', () => {
    let t = 1000
    const store = createReportStore({ now: () => t })
    expect(store.put({ host: 'aylmo', panels })).toEqual({ ok: true, host: 'aylmo' })
    expect(store.list()[0]).toMatchObject({ host: 'aylmo', stale: false })
    t += STALE_MS + 1
    expect(store.list()[0].stale).toBe(true)
    t += 3600 * 1000
    expect(store.list()).toEqual([])
  })

  it('a second report from a host replaces the first', () => {
    const store = createReportStore()
    store.put({ host: 'a', panels: { agents: { ok: true, rows: [] } } })
    store.put({ host: 'a', panels })
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].panels.agents.rows).toHaveLength(1)
  })

  it('refuses a bad host, bad panels, a body over the cap, and a 41st host', () => {
    const store = createReportStore()
    expect(store.put({ host: '../x', panels }).error).toBe('bad_host')
    expect(store.put({ host: 'ok', panels: [] }).error).toBe('bad_panels')
    expect(store.put(null).error).toBe('bad_report')
    const big = { host: 'big', panels: { tasks: { ok: true, rows: [{ lines: ['x'.repeat(300 * 1024)] }] } } }
    expect(store.put(big)).toMatchObject({ error: 'too_large', status: 413 })
    for (let i = 0; i < 40; i += 1) store.put({ host: `h${i}`, panels })
    expect(store.put({ host: 'one-more', panels }).status).toBe(429)
  })

  it('keeps only known panels and cleans ledger asks', () => {
    const store = createReportStore()
    store.put({ host: 'aylmo', panels: { ...panels, secret: { ok: true } }, asks: [{ id: 'N1', state: 'NEW', touched: '11-16 01:00', text: 'a‮b' }, { id: '', text: 'no id' }] })
    expect(Object.keys(store.list()[0].panels)).not.toContain('secret')
    expect(store.raw()[0].asks).toEqual([{ id: 'N1', state: 'NEW', touched: '11-16 01:00', text: 'ab', source: 'ledger' }])
  })
})

describe('ask store', () => {
  const make = (now) => createAskStore({ getDb: (() => { const db = new DatabaseSync(':memory:'); return () => db })(), now })

  it('stores an ask and lists it newest first with source page', () => {
    let t = 1000
    const asks = make(() => t)
    const a = asks.add({ text: 'first' })
    t += 10
    const b = asks.add({ text: 'second' })
    expect(a.id).toMatch(/^page-/)
    const rows = asks.list()
    expect(rows.map((r) => r.text)).toEqual(['second', 'first'])
    expect(rows[0]).toMatchObject({ id: b.id, state: 'open', source: 'page' })
  })

  it('refuses empty, over-long and more than 30 per hour', () => {
    const asks = make(() => 5000)
    expect(asks.add({ text: '   ' }).error).toBe('empty')
    expect(asks.add({ text: 'x'.repeat(2001) }).error).toBe('too_long')
    for (let i = 0; i < 30; i += 1) asks.add({ text: `n${i}` })
    expect(asks.add({ text: 'late' })).toMatchObject({ error: 'rate_limited', status: 429 })
  })
})

describe('hub snapshot', () => {
  const store = { getMonitor: async () => ({ generatedAt: 'now', host: 'studio', configured: true, panels }) }
  const health = (commit) => ({ ok: true, status: 200, json: async () => ({ release: { gitCommit: commit, generatedAt: '2026-11-16T00:00:00Z' } }) })
  const build = (extra = {}) => {
    const reports = createReportStore()
    const hub = createHub({
      store,
      reports,
      asks: { list: () => [{ id: 'page-1', state: 'open', touched: 't', text: 'hi', source: 'page' }] },
      releaseInfo: () => ({ deployEnv: 'staging', gitCommit: 'aaaaaaa1' }),
      listSpaces: async () => [{ id: 'a', slug: 'alpha', isPublic: true }, { id: 'b', isPublic: false }, { id: 'sb', kind: 'sandbox' }],
      fetchImpl: async (url) => (url.endsWith('/api/health') ? health('bbbbbbb2') : { ok: true, status: 200, json: async () => [{ id: 'p', isPublic: true }, { id: 'q', isPublic: false }] }),
      git: async () => '3\n',
      hostname: () => 'studio',
      ...extra
    })
    return { hub, reports }
  }

  it('adds reports, tiers, spaces, asks and map in the contract shapes', async () => {
    const { hub, reports } = build()
    reports.put({ host: 'aylmo', panels, asks: [{ id: 'N9', state: 'NEW', touched: '11-16 01:00', text: 'do it' }], commit: 'ccccccc3' })
    const snap = await hub.getSnapshot()
    expect(snap.reports[0]).toMatchObject({ host: 'aylmo', stale: false })
    expect(snap.tiers.rows.map((r) => r.id).sort()).toEqual(['dev', 'local:aylmo', 'prod'])
    expect(snap.tiers.rows.find((r) => r.id === 'dev')).toMatchObject({ status: 200, commit: 'aaaaaaa1', behindDev: 0 })
    expect(snap.tiers.rows.find((r) => r.id === 'prod')).toMatchObject({ commit: 'bbbbbbb2', behindDev: 3 })
    expect(snap.spaces.rows).toEqual([
      { tier: 'dev', slug: 'alpha', visibility: 'public' },
      { tier: 'dev', slug: 'b', visibility: 'private' },
      { tier: 'prod', slug: 'p', visibility: 'public' }
    ])
    expect(snap.asks.rows.map((r) => [r.id, r.source])).toEqual([['page-1', 'page'], ['N9', 'ledger']])
    const ids = new Set(snap.map.nodes.map((n) => n.id))
    expect(ids).toContain('machine:aylmo')
    expect(ids).toContain('tier:dev')
    expect(ids).toContain('space:dev:alpha')
    expect(ids).toContain('show:aylmo:s1')
    for (const e of snap.map.edges) { expect(ids.has(e.from) && ids.has(e.to)).toBe(true) }
    expect(snap.map.edges.some((e) => e.kind === 'serves' && e.to === 'machine:aylmo')).toBe(true)
    expect(snap.map.edges.some((e) => e.kind === 'works-on')).toBe(true)
    expect(snap.map.edges.some((e) => e.kind === 'shows-on')).toBe(true)
  })

  it('a stale report greys its machine and its tier row', async () => {
    let t = 0
    const reports = createReportStore({ now: () => t })
    const { hub } = build({ reports })
    reports.put({ host: 'aylmo', panels })
    t += STALE_MS + 1
    const snap = await hub.getSnapshot()
    expect(snap.map.nodes.find((n) => n.id === 'machine:aylmo').state).toBe('off')
    expect(snap.tiers.rows.find((r) => r.id === 'local:aylmo').status).toBe(0)
  })

  it('an unreachable tier is status 0 and ok false; behindDev is null without a git answer', async () => {
    const { hub } = build({ fetchImpl: async () => { throw new Error('down') }, git: async () => { throw new Error('no git') } })
    const snap = await hub.getSnapshot()
    expect(snap.tiers.ok).toBe(false)
    expect(snap.tiers.rows.find((r) => r.id === 'prod')).toMatchObject({ status: 0, behindDev: null })
    expect(snap.spaces.ok).toBe(false)
  })
})

describe('fingerprint', () => {
  it('ignores generatedAt and ms, sees real changes', () => {
    expect(fingerprint({ generatedAt: 1, a: { ms: 5, x: 1 } })).toBe(fingerprint({ generatedAt: 2, a: { ms: 9, x: 1 } }))
    expect(fingerprint({ a: { x: 1 } })).not.toBe(fingerprint({ a: { x: 2 } }))
  })
})
