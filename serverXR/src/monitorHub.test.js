// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createProvenStore, createReportStore, createAskStore, createHub, tierOfDeployEnv, fingerprint, STALE_MS, MAX_HOSTS_PER_SUBJECT } = require('./monitorHub.js')

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

  it('refuses a bad host, bad panels, a body over the cap, and a 121st host', () => {
    const store = createReportStore()
    expect(store.put({ host: '../x', panels }).error).toBe('bad_host')
    expect(store.put({ host: 'ok', panels: [] }).error).toBe('bad_panels')
    expect(store.put(null).error).toBe('bad_report')
    const big = { host: 'big', panels: { tasks: { ok: true, rows: [{ lines: ['x'.repeat(300 * 1024)] }] } } }
    expect(store.put(big)).toMatchObject({ error: 'too_large', status: 413 })
    for (let i = 0; i < 120; i += 1) store.put({ host: `h${i}`, panels }, { subject: `s${i}`, ledger: true })
    expect(store.put({ host: 'one-more', panels }, { subject: 'late' }).status).toBe(429)
  })

  it('a machine is keyed by sender and name: two people may both have aylmo; one subject holds at most 12', () => {
    const store = createReportStore({ now: () => 1000 })
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u1' }).ok).toBe(true)
    expect(store.put({ host: 'aylmo', panels }, { subject: 'u2' }).ok).toBe(true)
    expect(store.list({ subjects: ['u1'] })).toHaveLength(1)
    expect(store.list({ subjects: [7] }).length).toBe(0)
    store.put({ host: 'num', panels }, { subject: 7 })
    expect(store.list({ subjects: ['7'] }).map((r) => r.host)).toEqual(['num'])
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

  it('chats: the machine report is the door; owner text is dropped, the list leaves the reports rows, stale is not well', async () => {
    let t = 1_800_000_000_000
    const { hub, reports } = build({ now: () => t })
    const src = { v: 2, generatedAt: t / 1000, chats: [{ sessionId: 's1', title: 'Light desk', group: 'ask', status: 'idle', idleMinutes: 3, you: { text: 'PRIVATE' }, says: { first: 'waiting' }, asks: ['!! Say done.'] }] }
    reports.put({ host: 'aylmo', panels: { ...panels, chats: { ok: true, source: src } } })
    const snap = await hub.getSnapshot()
    expect(snap.chats).toMatchObject({ state: 'live', counts: { ask: 1, total: 1 } })
    expect(snap.chats.rows[0]).toMatchObject({ title: 'Light desk', host: 'aylmo', asks: ['!! Say done.'] })
    expect(JSON.stringify(snap)).not.toContain('PRIVATE')
    expect(snap.reports[0].panels.chats).toBeUndefined()
    t += 200 * 1000
    reports.put({ host: 'aylmo', panels: { ...panels, chats: { ok: true, source: src } } })
    expect((await hub.getSnapshot()).chats.state).toBe('stale')
  })

  it('chats: nobody reporting them is "none"', async () => {
    const { hub } = build()
    expect((await hub.getSnapshot()).chats).toMatchObject({ state: 'none', ok: false, rows: [] })
  })

  // Credits belong to the account, not to one machine: a machine with no credits list of its own shows the list another
  // of the owner's machines reported (marked `from` and `reportedAt`). Nothing is probed: a probe is a real model call.
  describe('credits on every machine', () => {
    const T0 = 1_800_000_000_000
    const rows = [
      { route: 'plan:dob', available: true, meter: '7d 62%', have: 'login', why: '' },
      { route: 'api:lab', available: false, meter: 'n/a', have: 'key', why: 'no credit' }
    ]
    const list = (extra = {}) => ({ ok: true, configured: 1, rows, ...extra })
    const nothing = () => ({ ok: true, ms: 4, configured: 0, rows: [], ready: 0, total: 0, at: 111 })
    const make = (credits) => {
      let t = T0
      const reports = createReportStore({ now: () => t })
      const store = { getMonitor: async () => ({ generatedAt: 'now', host: 'studio', configured: true, panels: { ...panels, ...(credits ? { credits } : {}) } }) }
      const { hub } = build({ store, reports, now: () => t })
      return { hub, reports, tick: (ms) => { t += ms } }
    }

    it('a machine with no credits feed shows the list another machine reported, marked with whose and when', async () => {
      const local = nothing()
      const { hub, reports } = make(local)
      reports.put({ host: 'aylmo', panels: { credits: list() } })
      const snap = await hub.getSnapshot()
      expect(snap.panels.credits).toMatchObject({ ok: true, configured: 1, ready: 1, total: 2, from: 'aylmo', reportedAt: new Date(T0).toISOString(), ms: 4, at: 111 })
      expect(snap.panels.credits.rows.map((r) => [r.name, r.available])).toEqual([['plan:dob', true], ['api:lab', false]])
      // the machine's own panel is not touched: the next scan starts from the same local truth, and a report never carries a lent list
      expect(local).toEqual(nothing())
      expect(snap.reports.find((r) => r.host === 'aylmo').panels.credits.from).toBeUndefined()
    })

    it('a panel that is missing altogether is filled the same way', async () => {
      const { hub, reports } = make(null)
      reports.put({ host: 'aylmo', panels: { credits: list() } })
      expect((await hub.getSnapshot()).panels.credits).toMatchObject({ ok: true, configured: 1, total: 2, from: 'aylmo' })
    })

    it('its own list always wins; a failing, a still-checking and an empty configured panel are never covered up', async () => {
      const ownRow = { id: 'r1', name: 'plan:own', available: true, meter: '', have: '', why: '' }
      const own = { ok: true, configured: 1, rows: [ownRow], ready: 1, total: 1 }
      const unflagged = { ok: true, configured: 0, rows: [ownRow], ready: 1, total: 1 }
      const failing = { ok: false, error: 'the credits command has not answered', rows: [] }
      const checking = { ok: true, configured: 1, rows: [], ready: 0, total: 0, checking: true }
      const checkingFirst = { ok: true, configured: 0, rows: [], ready: 0, total: 0, checking: true }
      const empty = { ok: true, configured: 1, rows: [], ready: 0, total: 0 }
      for (const mine of [own, unflagged, failing, checking, checkingFirst, empty]) {
        const { hub, reports } = make(mine)
        reports.put({ host: 'aylmo', panels: { credits: list() } })
        const credits = (await hub.getSnapshot()).panels.credits
        expect(credits).toEqual(mine)
        expect(credits.from).toBeUndefined()
      }
    })

    it('only a fresh, healthy, non-empty list is lent: not a stale report, a stale or failing list, or an empty one', async () => {
      const { hub, reports, tick } = make(nothing())
      reports.put({ host: 'old-pc', panels: { credits: list() } })
      tick(STALE_MS + 1000)
      reports.put({ host: 'broken', panels: { credits: { ok: false, configured: 1, error: 'nope' } } })
      reports.put({ host: 'old-list', panels: { credits: list({ stale: true }) } })
      reports.put({ host: 'empty', panels: { credits: { ok: true, configured: 1, rows: [] } } })
      reports.put({ host: 'no-feed', panels: { credits: { ok: true, configured: 0, rows: [] } } })
      const snap = await hub.getSnapshot()
      expect(snap.reports.find((r) => r.host === 'old-pc').stale).toBe(true)
      expect(snap.panels.credits).toMatchObject({ ok: true, configured: 0, rows: [] })
      expect(snap.panels.credits.from).toBeUndefined()
    })

    it('the freshest report lends, then the longer list, then the name, whatever order they came in', async () => {
      const one = rows.slice(0, 1)
      // a newer short list beats an older long one
      const a = make(nothing())
      a.reports.put({ host: 'aylmo', panels: { credits: list() } })
      a.tick(5000)
      a.reports.put({ host: 'r-di', panels: { credits: list({ rows: one }) } })
      expect((await a.hub.getSnapshot()).panels.credits).toMatchObject({ from: 'r-di', total: 1, reportedAt: new Date(T0 + 5000).toISOString() })
      // the same moment: the longer list wins even when its name sorts later and it came in last
      const b = make(nothing())
      b.reports.put({ host: 'a-short', panels: { credits: list({ rows: one }) } })
      b.reports.put({ host: 'z-long', panels: { credits: list() } })
      expect((await b.hub.getSnapshot()).panels.credits).toMatchObject({ from: 'z-long', total: 2 })
      // the same moment and length: the name decides, not the order they came in (both orders)
      for (const order of [['b-pc', 'a-pc'], ['a-pc', 'b-pc']]) {
        const c = make(nothing())
        for (const host of order) c.reports.put({ host, panels: { credits: list() } })
        expect((await c.hub.getSnapshot()).panels.credits).toMatchObject({ from: 'a-pc' })
      }
    })

    it('the signed-in account\'s machines (the rows dev sends) lend too', async () => {
      const { hub } = make(nothing())
      const account = { state: 'ok', name: 'Ada', reports: [
        { host: 'lab-pc', reportedAt: new Date(T0 - 20_000).toISOString(), stale: false, panels: { credits: { ok: true, configured: 1, rows: [{ id: 'r1', name: 'plan:dob', available: true, meter: '', have: '', why: '' }], ready: 1, total: 1 } } },
        { host: 'old-pc', reportedAt: new Date(T0 - 600_000).toISOString(), stale: true, panels: { credits: list() } }
      ] }
      const snap = await hub.getSnapshot({ account })
      expect(snap.panels.credits).toMatchObject({ ok: true, configured: 1, ready: 1, total: 1, from: 'lab-pc', reportedAt: new Date(T0 - 20_000).toISOString() })
    })

    it('on the account path too, a list is lent only when it is whole and fresh (a bad row never fails the snapshot)', async () => {
      const row = { id: 'r1', name: 'plan:dob', available: true, meter: '', have: '', why: '' }
      const at = new Date(T0 - 20_000).toISOString()
      const credits = (extra) => ({ ok: true, configured: 1, rows: [row], ...extra })
      const unfit = {
        'a stale report': { reportedAt: at, stale: true, panels: { credits: credits() } },
        'a report with no time': { reportedAt: null, stale: false, panels: { credits: credits() } },
        'a report with an unreadable time': { reportedAt: 'soon', stale: false, panels: { credits: credits() } },
        'a list its machine calls old': { reportedAt: at, stale: false, panels: { credits: credits({ stale: true }) } },
        'a failing list': { reportedAt: at, stale: false, panels: { credits: credits({ ok: false, error: 'nope' }) } },
        'a list still being checked': { reportedAt: at, stale: false, panels: { credits: credits({ checking: true }) } },
        'an empty list': { reportedAt: at, stale: false, panels: { credits: credits({ rows: [] }) } },
        'rows that are text': { reportedAt: at, stale: false, panels: { credits: credits({ rows: 'abc' }) } },
        'a null row': { reportedAt: at, stale: false, panels: { credits: credits({ rows: [row, null] }) } },
        'rows that are not objects': { reportedAt: at, stale: false, panels: { credits: credits({ rows: ['x', 3] }) } }
      }
      for (const [what, r] of Object.entries(unfit)) {
        const { hub } = make(nothing())
        const snap = await hub.getSnapshot({ account: { state: 'ok', name: null, reports: [{ host: 'lab-pc', ...r }] } })
        expect([what, snap.panels.credits.from]).toEqual([what, undefined])
        expect(snap.panels.credits).toMatchObject({ ok: true, configured: 0, rows: [] })
      }
      // the same machine with a whole, fresh list is lent
      const { hub } = make(nothing())
      const fit = await hub.getSnapshot({ account: { state: 'ok', name: null, reports: [{ host: 'lab-pc', reportedAt: at, stale: false, panels: { credits: credits() } }] } })
      expect(fit.panels.credits).toMatchObject({ from: 'lab-pc', total: 1, reportedAt: at })
    })

    it('never from a machine of another account', async () => {
      const { hub, reports } = make(nothing())
      reports.put({ host: 'stranger-pc', panels: { credits: list() } }, { subject: 'u9' })
      expect((await hub.getSnapshot({ subjects: ['owner-1'] })).panels.credits.from).toBeUndefined()
      expect((await hub.getSnapshot({ subjects: ['u9'] })).panels.credits.from).toBe('stranger-pc')
    })
  })

  it('parts: state from the Connected rows, version from the pack stamps, honest when unprobed or unread', async () => {
    const H = 'd'.repeat(40)
    const rows = [
      { id: 'light', state: 'idle', detail: 'not started on this machine' },
      { id: 'laser', state: 'ok', detail: '1/1 cubes' },
      { id: 'laser-desk', state: 'off', detail: 'timeout' }
    ]
    const fakeStore = { getMonitor: async () => ({ panels: { connected: { ok: true, rows } } }) }
    const { hub } = build({ store: fakeStore, releaseInfo: () => ({ version: '1.2.3', packedAt: '2026-11-17T00:00:00Z', parts: [{ id: 'light', commit: H, date: '2026-11-12' }] }) })
    const { parts } = await hub.getSnapshot()
    const by = (id) => parts.rows.find((r) => r.id === id)
    expect(by('light')).toMatchObject({ state: 'idle', commit: H, date: '2026-11-12' })
    expect(by('laser')).toMatchObject({ state: 'off' }) // one of its two rows is off: the worst wins
    expect(by('studio')).toMatchObject({ state: 'unprobed', detail: 'no live probe', commit: null })
    expect(by('osc')).toMatchObject({ state: 'unknown', detail: 'not read' })
    expect(parts).toMatchObject({ version: '1.2.3', packedAt: '2026-11-17T00:00:00Z' })
  })

  it('parts: works says working / not working / idle / unknown from the probe, and carries the pack-time history', async () => {
    const H = 'd'.repeat(40)
    const history = [{ commit: H, date: '2026-11-12', title: 'fix (#9)', pr: 9 }]
    const rows = [{ id: 'light', state: 'idle', detail: 'x' }, { id: 'laser', state: 'ok', detail: 'y' }, { id: 'laser-desk', state: 'ok', detail: 'y' }, { id: 'show', state: 'off', detail: 'z' }]
    const fakeStore = { getMonitor: async () => ({ panels: { connected: { ok: true, rows } } }) }
    const { hub } = build({ store: fakeStore, releaseInfo: () => ({ parts: [{ id: 'laser', commit: H, date: '2026-11-12', history }] }) })
    const by = (id, snap) => snap.parts.rows.find((r) => r.id === id)
    const snap = await hub.getSnapshot()
    expect(by('laser', snap)).toMatchObject({ works: 'working', history, proven: { commit: H, date: '2026-11-12' } })
    expect(by('light', snap).works).toBe('idle')
    expect(by('show', snap)).toMatchObject({ works: 'not working', proven: null, history: [] })
    expect(by('studio', snap).works).toBe('unknown')
    expect(by('osc', snap).works).toBe('unknown')
  })

  it('proven store: keeps the last commit seen working, rewrites at most hourly, survives a restart, ignores junk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proven-'))
    const file = path.join(dir, 'p.json')
    let t = 1000
    const store = createProvenStore({ file, now: () => t })
    expect(store.get('light')).toBeNull()
    store.see('light', 'a'.repeat(40), '2026-11-01')
    store.see('light', 'not-a-hash', null)
    expect(store.get('light')).toEqual({ commit: 'a'.repeat(40), date: '2026-11-01', at: 1000 })
    t += 5000
    store.see('light', 'a'.repeat(40), '2026-11-01') // same commit, within the hour: no rewrite
    expect(store.get('light').at).toBe(1000)
    t += 3600 * 1000
    store.see('light', 'b'.repeat(40), '2026-11-20')
    expect(createProvenStore({ file }).get('light')).toMatchObject({ commit: 'b'.repeat(40), date: '2026-11-20' })
    fs.writeFileSync(file, '{"light":{"commit":"zzz","at":1},"../x":{"commit":"abcdef1","at":1}}')
    expect(createProvenStore({ file }).get('light')).toBeNull()
    expect(createProvenStore({ file: path.join(dir, 'no', 'such', 'dir', 'x.json') }).get('light')).toBeNull()
  })

  it('parts: a failed Connected panel reads as off, never as healthy', async () => {
    const { hub } = build({ store: { getMonitor: async () => ({ panels: { connected: { ok: false, rows: [] } } }) } })
    const { parts } = await hub.getSnapshot()
    expect(parts.rows.filter((r) => r.state === 'healthy' || r.state === 'ok')).toEqual([])
    expect(parts.rows.find((r) => r.id === 'light').state).toBe('unknown')
  })

  it('every tailnet device is a map node: online ok, offline off; a reporting host is not doubled', async () => {
    const machines = { ok: true, rows: [{ name: 'studio-mac', online: true }, { name: 'asuz.tail.ts.net', online: false }, { name: 'aylmo', online: true }, { name: '' }] }
    const { hub } = build({ store: { getMonitor: async () => ({ host: 'aylmo', panels: { machines } }) } })
    const snap = await hub.getSnapshot()
    const ms = snap.map.nodes.filter((n) => n.kind === 'machine')
    expect(ms.map((n) => [n.id, n.state]).sort()).toEqual([['machine:asuz', 'off'], ['machine:aylmo', 'ok'], ['machine:studio-mac', 'ok']])
  })

  it('a tailnet name that differs only by letter case is the same device', async () => {
    const machines = { ok: true, rows: [{ name: 'AYLMO.tail.ts.net', online: true }, { name: 'Pixel', online: true }] }
    const { hub } = build({ store: { getMonitor: async () => ({ host: 'aylmo', panels: { machines } }) } })
    const snap = await hub.getSnapshot()
    expect(snap.map.nodes.filter((n) => n.kind === 'machine').map((n) => n.id).sort()).toEqual(['machine:Pixel', 'machine:aylmo'])
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

describe('fingerprint: which at counts', () => {
  it('a section or panel scan stamp is noise; an at inside a report or an ask row is a real change', () => {
    expect(fingerprint({ tiers: { at: 1, rows: [] } })).toBe(fingerprint({ tiers: { at: 2, rows: [] } }))
    expect(fingerprint({ panels: { agents: { at: 1, rows: [] } } })).toBe(fingerprint({ panels: { agents: { at: 9, rows: [] } } }))
    expect(fingerprint({ reports: [{ host: 'a', at: 1 }] })).not.toBe(fingerprint({ reports: [{ host: 'a', at: 2 }] }))
    expect(fingerprint({ asks: [{ id: 'x', at: 1 }] })).not.toBe(fingerprint({ asks: [{ id: 'x', at: 2 }] }))
  })
})

describe('tier flap: one slow answer or one refusal is not an outage', () => {
  const store = { getMonitor: async () => ({ generatedAt: 'now', host: 'studio', configured: true, panels: {} }) }
  const ok = (commit = 'bbbbbbb2') => ({ ok: true, status: 200, json: async () => ({ release: { gitCommit: commit } }) })
  // a scripted sequence of answers for the prod tier: 'ok' | 'refuse' | 'throw' | 'slow'
  const run = (script, clock = { t: 0 }) => {
    const queue = [...script]
    const hub = createHub({
      store,
      asks: { list: () => [] },
      releaseInfo: () => ({ deployEnv: 'staging', gitCommit: 'aaaaaaa1' }),
      listSpaces: async () => [],
      fetchImpl: async (url) => {
        if (!url.endsWith('/api/health') || !url.startsWith('https://diiii.xyz')) return ok('aaaaaaa1')
        const step = queue.shift() || 'ok'
        if (step === 'throw') throw new Error('timeout')
        if (step === 'refuse') return { ok: false, status: 502 }
        if (step === 'slow') { clock.t += 2500; return ok() }
        return ok()
      },
      git: async () => '0\n',
      hostname: () => 'studio',
      now: () => { clock.t += 5; return clock.t },
      tierSites: { dev: 'https://dev.diiii.xyz', prod: 'https://diiii.xyz' }
    })
    return { hub, clock }
  }
  const prod = async (hub, clock) => { clock.t += 60000; return (await hub.getSnapshot()).tiers.rows.find((r) => r.id === 'prod') }

  it('a refusal that the quick re-try answers is still up', async () => {
    const { hub, clock } = run(['ok', 'refuse', 'ok'])
    await prod(hub, clock)
    expect(await prod(hub, clock)).toMatchObject({ probe: 'up', status: 200, misses: 0 })
  })

  it('one missed check (re-try missed too) keeps the last good answer; two in a row are down', async () => {
    const { hub, clock } = run(['ok', 'refuse', 'refuse', 'throw', 'throw'])
    const first = await prod(hub, clock)
    expect(first.probe).toBe('up')
    const one = await prod(hub, clock)
    expect(one).toMatchObject({ probe: 'doubt', status: 200, rawStatus: 502, misses: 1, commit: 'bbbbbbb2' })
    expect(one.lastGoodAt).toBe(first.lastGoodAt)
    const two = await prod(hub, clock)
    expect(two).toMatchObject({ probe: 'down', status: 0, misses: 2 })
    expect(two.lastGoodAt).toBe(first.lastGoodAt)
  })

  it('a good answer after a miss resets the count', async () => {
    const { hub, clock } = run(['ok', 'throw', 'throw', 'ok', 'throw', 'throw', 'ok'])
    await prod(hub, clock)
    await prod(hub, clock)
    expect((await prod(hub, clock)).misses).toBe(0)
    expect((await prod(hub, clock)).probe).toBe('doubt')
  })

  it('a slow answer is "slow (N ms)" and counts as up', async () => {
    const { hub, clock } = run(['slow'])
    const row = await prod(hub, clock)
    expect(row.probe).toBe('slow')
    expect(row.note).toMatch(/^slow \(\d+ ms\)$/)
    expect(row.status).toBe(200)
    expect((await hub.getSnapshot()).tiers.ok).toBe(true)
  })

  it('a tier never heard from has nothing to hold, yet its first miss is only doubt (status stays not-up); two are down', async () => {
    const { hub, clock } = run(['throw', 'throw', 'throw', 'throw'])
    expect(await prod(hub, clock)).toMatchObject({ probe: 'doubt', status: 0, misses: 1 })
    expect(await prod(hub, clock)).toMatchObject({ probe: 'down', status: 0, misses: 2 })
  })
})

describe('tier probe: cold start and shared rounds', () => {
  const store = { getMonitor: async () => ({ generatedAt: 'now', host: 'studio', configured: true, panels: {} }) }
  const make = (clock, onProd) => createHub({
    store,
    asks: { list: () => [] },
    releaseInfo: () => ({ deployEnv: 'staging', gitCommit: 'aaaaaaa1' }),
    listSpaces: async () => [],
    fetchImpl: async (url) => {
      if (url.startsWith('https://diiii.xyz')) { onProd(); throw new Error('timeout') }
      return { ok: true, status: 200, json: async () => ({ release: { gitCommit: 'aaaaaaa1' } }) }
    },
    git: async () => '0\n',
    hostname: () => 'studio',
    now: () => { clock.t += 5; return clock.t },
    tierSites: { dev: 'https://dev.diiii.xyz', prod: 'https://diiii.xyz' }
  })
  const prodRow = (snap) => snap.tiers.rows.find((r) => r.id === 'prod')

  it('a first-ever failure (nothing answered yet) is doubt after one miss, down only after two', async () => {
    const clock = { t: 0 }
    const hub = make(clock, () => {})
    const one = prodRow(await hub.getSnapshot())
    expect(one).toMatchObject({ probe: 'doubt', misses: 1, lastGoodAt: null })
    expect(one.status).toBe(0)
    clock.t += 60000
    expect(prodRow(await hub.getSnapshot())).toMatchObject({ probe: 'down', misses: 2 })
  })

  it('two callers at once share one probe round: one outage is one miss', async () => {
    const clock = { t: 0 }
    const hub = make(clock, () => {})
    const [a, b] = await Promise.all([hub.getSnapshot(), hub.getSnapshot()])
    expect(prodRow(a).misses).toBe(1)
    expect(prodRow(b).misses).toBe(1)
  })
})

describe('a reported credits panel', () => {
  it('keeps only the shown fields and shows an e-mail address as "login"', () => {
    const store = createReportStore()
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows: [
      { route: 'plan:dob', available: true, meter: '7d 62%', have: 'login me@corp.example', why: '', token: 'secret' },
      { route: 'api:lab', available: false, meter: 'n/a', have: 'key', why: 'denied for dob@studio' }
    ], extra: 'x' } } })
    const credits = store.list()[0].panels.credits
    expect(credits).toMatchObject({ ok: true, configured: 1, ready: 1, total: 2 })
    expect(JSON.stringify(credits)).not.toMatch(/corp\.example|dob@studio|secret|"extra"/)
    expect(credits.rows[0]).toEqual({ id: expect.stringMatching(/^r[0-9a-f]{8}$/), name: 'plan:dob', available: true, meter: '7d 62%', have: expect.stringMatching(/^login login-[0-9a-f]{4}$/), why: '' })
  })

  it('keeps "stale" on a list the machine itself marked old (so it is not lent on), and nothing else of its age', () => {
    const store = createReportStore()
    const rows = [{ route: 'plan:dob', available: true, meter: '', have: 'key', why: '' }]
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows, stale: true, checkedAt: '2026-11-20T10:00:00.000Z', refreshError: 'x' } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: true, stale: true, total: 1 })
    expect(store.list()[0].panels.credits.checkedAt).toBeUndefined()
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows, stale: 'yes' } } })
    expect(store.list()[0].panels.credits.stale).toBeUndefined()
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows } } })
    expect(store.list()[0].panels.credits.stale).toBeUndefined()
  })

  it('a broken report keeps no rows and is not counted as configured', () => {
    const store = createReportStore()
    store.put({ host: 'x', panels: { credits: { ok: false, configured: 'yes', rows: 'bad', error: 'no feed' } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: false, configured: 0, rows: [], ready: 0, total: 0, error: 'no feed' })
  })

  it('takes in the rows the machine\'s own store produced, keeps their ids, and greys a changed shape', () => {
    const { sanitizeCredits } = require('./monitorCredits.js')
    const rows = sanitizeCredits([{ route: 'plan:dob', available: true, meter: '7d', have: 'key', why: '' }, { route: 'ollama', available: false, meter: '', have: '', why: '' }])
    const store = createReportStore()
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: true, ready: 1, total: 2, rows })
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows: [{ label: 'x' }] } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: false, total: 0 })
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1, rows: { a: 1 } } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: false })
    store.put({ host: 'r-di', panels: { credits: { ok: true, configured: 1 } } })
    expect(store.list()[0].panels.credits).toMatchObject({ ok: false })
  })

  it('masks a lower-case hex key, keeps a plain name that starts like a key prefix', () => {
    const { sanitizeCredits } = require('./monitorCredits.js')
    const [row] = sanitizeCredits([{ route: 'hf-hub-credits', why: 'denied, key 3f9a1c0b7d2e4a5f8c6b1d0e9a7f3c2b4d5e6f70' }])
    expect(row.name).toBe('hf-hub-credits')
    expect(row.why).toBe('denied, key (masked)')
  })

  it('keeps a long word and a rule line, masks a key shape', () => {
    const { sanitizeCredits } = require('./monitorCredits.js')
    const [row] = sanitizeCredits([{ route: 'x', meter: '-'.repeat(40), have: 'hf_abcdefgh1jklmnop', why: 'internationalizationinternationalization' }])
    expect(row.meter).toBe('-'.repeat(40))
    expect(row.have).toBe('(masked)')
    expect(row.id).toMatch(/^r[0-9a-f]{8}$/)
    expect(row.why).toBe('internationalizationinternationalization')
  })
})
