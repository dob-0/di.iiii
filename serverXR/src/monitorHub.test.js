// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createReportStore, createAskStore, createHub, tierOfDeployEnv, fingerprint, STALE_MS, MAX_HOSTS_PER_SUBJECT } = require('./monitorHub.js')

const panels = { agents: { ok: true, rows: [{ sessionId: 'abcdef123456', title: 'work', status: 'busy' }] }, shows: { ok: true, rows: [{ id: 's1', title: 'Show' }] } }

describe('tier from the release manifest', () => {
  it('maps staging and dev to dev; only a missing or empty name is local; everything else is prod', () => {
    expect(tierOfDeployEnv('staging')).toBe('dev')
    expect(tierOfDeployEnv('dev')).toBe('dev')
    expect(tierOfDeployEnv('production')).toBe('prod')
    expect(tierOfDeployEnv('prod')).toBe('prod')
    expect(tierOfDeployEnv(null)).toBe('local')
    expect(tierOfDeployEnv(undefined)).toBe('local')
    expect(tierOfDeployEnv('  ')).toBe('local')
  })

  it('fails closed: "standby" (what the Mac\'s prod tier writes) and any unknown name is prod', () => {
    expect(tierOfDeployEnv('standby')).toBe('prod')
    expect(tierOfDeployEnv('STANDBY')).toBe('prod')
    expect(tierOfDeployEnv('qa-2')).toBe('prod')
    expect(tierOfDeployEnv('local')).toBe('prod')
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
    for (let i = 0; i < 40; i += 1) store.put({ host: `h${i}`, panels }, { subject: `s${i}` })
    expect(store.put({ host: 'one-more', panels }, { subject: 'late' }).status).toBe(429)
  })

  it('a host belongs to its sender until it goes stale (409), and one subject holds at most 12 hosts', () => {
    let t = 1000
    const store = createReportStore({ now: () => t })
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u1' }).ok).toBe(true)
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u2' })).toMatchObject({ error: 'host_taken', status: 409 })
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u1' }).ok).toBe(true)
    t += STALE_MS + 1
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u2' }).ok).toBe(true)
    for (let i = 0; i < MAX_HOSTS_PER_SUBJECT - 1; i += 1) expect(store.put({ host: `m${i}`, panels }, { subject: 'u2' }).ok).toBe(true)
    expect(store.put({ host: 'one-too-many', panels }, { subject: 'u2' })).toMatchObject({ error: 'too_many_hosts', status: 429 })
    expect(store.put({ host: 'other', panels }, { subject: 'u3' }).ok).toBe(true)
  })

  it('ledger asks are kept only for a sender that may bring them', () => {
    const store = createReportStore()
    const asks = [{ id: 'N1', state: 'NEW', touched: 't', text: 'x' }]
    store.put({ host: 'a', panels, asks }, { subject: 'u1' })
    store.put({ host: 'b', panels, asks }, { subject: 'u1', ledger: true })
    expect(store.raw().find((r) => r.host === 'a').asks).toEqual([])
    expect(store.raw().find((r) => r.host === 'b').asks).toHaveLength(1)
  })

  it('a panel url keeps only http(s); other strings are capped and cleaned', () => {
    const store = createReportStore()
    store.put({ host: 'a', panels: { pullRequests: { ok: true, rows: [
      { title: 'ok', url: 'https://github.com/x/y/pull/1' },
      { title: 'js', url: 'javascript:alert(1)' },
      { title: 'data', url: 'data:text/html,x' },
      { title: 'long', note: 'y'.repeat(5000) }
    ] } } })
    const rows = store.list()[0].panels.pullRequests.rows
    expect(rows[0].url).toBe('https://github.com/x/y/pull/1')
    expect('url' in rows[1]).toBe(false)
    expect('url' in rows[2]).toBe(false)
    expect(rows[3].note).toHaveLength(400)
  })

  it('keeps only known panels and cleans ledger asks', () => {
    const store = createReportStore()
    store.put({ host: 'aylmo', panels: { ...panels, secret: { ok: true } }, asks: [{ id: 'N1', state: 'NEW', touched: '11-16 01:00', text: 'a‮b' }, { id: '', text: 'no id' }] }, { ledger: true })
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
    for (let i = 0; i < 30; i += 1) asks.add({ text: `n${i}`, by: 'u1' })
    expect(asks.add({ text: 'late', by: 'u1' })).toMatchObject({ error: 'rate_limited', status: 429 })
  })

  it('the 30 per hour limit is per subject', () => {
    const asks = make(() => 5000)
    for (let i = 0; i < 30; i += 1) asks.add({ text: `n${i}`, by: 'u1' })
    expect(asks.add({ text: 'u1 late', by: 'u1' }).status).toBe(429)
    expect(asks.add({ text: 'u2 first', by: 'u2' }).id).toMatch(/^page-/)
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
    reports.put({ host: 'aylmo', panels, asks: [{ id: 'N9', state: 'NEW', touched: '11-16 01:00', text: 'do it' }], commit: 'ccccccc3' }, { ledger: true })
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

  it('a 3xx answer is not up; labels are never "undefined"; the serves edge goes to the tier that took the report', async () => {
    const { hub, reports } = build({ fetchImpl: async (url) => (url.endsWith('/api/health') ? { ok: false, status: 302 } : { ok: false, status: 302 }), hostname: () => 'studio.local' })
    reports.put({ host: 'aylmo', panels: { shows: { ok: true, rows: [{ ok: true }] }, agents: { ok: true, rows: [{ status: 'busy' }, {}] } } })
    const snap = await hub.getSnapshot()
    expect(snap.tiers.rows.find((r) => r.id === 'prod').status).toBe(302)
    expect(snap.tiers.ok).toBe(false)
    expect(snap.map.nodes.find((n) => n.id === 'tier:prod').state).toBe('warn')
    expect(snap.map.nodes.some((n) => /undefined/.test(n.label) || !n.label)).toBe(false)
    expect(snap.map.nodes.some((n) => n.id === 'machine:studio')).toBe(true)
    expect(snap.map.edges.filter((e) => e.kind === 'serves').map((e) => e.from)).toEqual(['tier:dev'])
  })

  it('a machine seen from a local build is served by no tier', async () => {
    const { hub, reports } = build({ releaseInfo: () => ({}) })
    reports.put({ host: 'aylmo', panels })
    const snap = await hub.getSnapshot()
    expect(snap.map.edges.some((e) => e.kind === 'serves')).toBe(false)
  })

  it('spaces are read once per 10 s', async () => {
    let t = 0
    let calls = 0
    const { hub } = build({ now: () => t, listSpaces: async () => { calls += 1; return [] } })
    await hub.getSnapshot()
    await hub.getSnapshot()
    expect(calls).toBe(1)
    t += 10001
    await hub.getSnapshot()
    expect(calls).toBe(2)
  })

  it('a stale report greys its machine and its tier row', async () => {
    let t = 0
    const reports = createReportStore({ now: () => t })
    const { hub } = build({ reports })
    reports.put({ host: 'aylmo', panels })
    t += STALE_MS + 1
    const snap = await hub.getSnapshot()
    expect(snap.map.nodes.find((n) => n.id === 'machine:aylmo').state).toBe('off')
    expect(snap.tiers.rows.find((r) => r.id === 'local:aylmo')).toMatchObject({ source: 'report', status: null, ms: null, state: 'warn' })
    expect(snap.map.nodes.find((n) => n.id === 'tier:local:aylmo').state).toBe('warn')
    expect(snap.map.edges.some((e) => e.from === 'machine:aylmo' && e.to === 'tier:local:aylmo' && e.kind === 'runs')).toBe(false)
  })

  it('a fresh report-only machine is state ok with no invented probe; probed rows say so', async () => {
    const { hub, reports } = build()
    reports.put({ host: 'aylmo', panels })
    const snap = await hub.getSnapshot()
    expect(snap.tiers.rows.find((r) => r.id === 'local:aylmo')).toMatchObject({ source: 'report', status: null, state: 'ok' })
    expect(snap.tiers.rows.find((r) => r.id === 'prod').source).toBe('probe')
    expect(snap.map.nodes.find((n) => n.id === 'tier:local:aylmo').state).toBe('ok')
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
