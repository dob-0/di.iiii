import { describe, expect, it } from 'vitest'
import { diffSnapshots, pushEvents } from './monitorFeed.js'

const base = () => ({
    panels: {
        machines: { rows: [{ id: 'm1', name: 'aylmo', online: true }] },
        network: { rows: [{ id: 'n1', name: 'dev tier', ok: true }] },
        agents: { rows: [{ machine: 'aylmo', sessionId: 's1', title: 'PC performance', status: 'busy' }] },
        services: { rows: [{ unit: 'di-server.service', active: 'active' }] },
        connected: { rows: [{ id: 'osc', title: 'OSC', state: 'ok' }] },
        presence: { rows: [{ id: 'space:a', target: 'a', people: [{ name: 'x' }] }] },
        pullRequests: { rows: [{ number: 1, draft: true }] }
    },
    tiers: { rows: [
        { id: 'prod', status: 'ok', commit: 'aaaaaaa1', behindDev: 0 },
        { id: 'local:studio-mac', status: 'ok', commit: 'bbbbbbb1', behindDev: 0 }
    ] },
    asks: { rows: [{ id: 'N1', text: 'first' }] },
    reports: [{ host: 'r-di', stale: false }]
})
const clone = (o) => JSON.parse(JSON.stringify(o))

describe('diffSnapshots', () => {
    it('no earlier snapshot, or an identical one, says nothing', () => {
        expect(diffSnapshots(null, base())).toEqual([])
        expect(diffSnapshots(base(), base())).toEqual([])
    })

    it('tier events: stopped answering, new commit, fell behind', () => {
        const next = clone(base())
        next.tiers.rows[0].status = 502
        next.tiers.rows[1].commit = 'ccccccc9999'
        next.tiers.rows[1].behindDev = 3
        const text = diffSnapshots(base(), next, 5).map((e) => e.text)
        expect(text).toContain('prod stopped answering')
        expect(text).toContain('local studio-mac moved to ccccccc')
        expect(text).toContain('local studio-mac fell 3 behind dev')
        expect(diffSnapshots(base(), next, 5)[0]).toMatchObject({ tone: 'danger', at: 5 })
    })

    it('a 429 is limited checks, not "stopped answering"', () => {
        const next = clone(base())
        next.tiers.rows[0].status = 429
        const text = diffSnapshots(base(), next, 5).map((e) => e.text)
        expect(text).not.toContain('prod stopped answering')
        const back = clone(next)
        back.tiers.rows[0].status = 502
        expect(diffSnapshots(next, back, 6).map((e) => e.text)).toContain('prod stopped answering')
    })

    it('agent busy to idle, a new agent, one that left', () => {
        const next = clone(base())
        next.panels.agents.rows = [{ machine: 'aylmo', sessionId: 's1', title: 'PC performance', status: 'idle' }, { machine: 'r-di', sessionId: 's2', title: 'Lights', status: 'busy' }]
        const text = diffSnapshots(base(), next).map((e) => e.text)
        expect(text).toContain("agent 'PC performance' busy → idle")
        expect(text).toContain("agent 'Lights' started")
        const gone = clone(base()); gone.panels.agents.rows = []
        expect(diffSnapshots(base(), gone).map((e) => e.text)).toContain("agent 'PC performance' ended")
    })

    it('a part that did not answer is a gap: no agent "ended" then "started" again', () => {
        const a = base()
        const failed = base()
        failed.panels.agents = { ok: false, error: 'timed out', rows: [] }
        expect(diffSnapshots(a, failed, 1)).toEqual([])
        expect(diffSnapshots(failed, base(), 2)).toEqual([])
        const tiersDown = { ...base(), tiers: { ok: false, rows: [] } }
        const withTiers = { ...base(), tiers: { ok: true, rows: [{ id: 'dev', ok: true }] } }
        expect(diffSnapshots(tiersDown, withTiers, 3)).toEqual([])
    })

    it('a report, a new ask, a machine going offline, a failed service', () => {
        const next = clone(base())
        next.reports.push({ host: 'studio-mac', stale: false })
        next.asks.rows.push({ id: 'N2', text: 'light the hall' })
        next.panels.machines.rows[0].online = false
        next.panels.services.rows[0].active = 'failed'
        const e = diffSnapshots(base(), next)
        const text = e.map((x) => x.text)
        expect(text).toContain('studio-mac reported')
        expect(text).toContain('new ask: light the hall')
        expect(text).toContain('machine aylmo went offline')
        expect(text).toContain('service di-server active → failed')
        expect(e.find((x) => x.text.startsWith('service')).tone).toBe('danger')
    })

    it('copes with missing panels on either side', () => {
        expect(diffSnapshots({ panels: {} }, base()).length).toBeGreaterThan(0)
        expect(() => diffSnapshots(base(), { panels: {} })).not.toThrow()
    })
})

describe('pushEvents', () => {
    it('keeps the newest on top and at most 50', () => {
        const feed = Array.from({ length: 49 }, (_, i) => ({ text: `old${i}` }))
        const out = pushEvents(feed, [{ text: 'a' }, { text: 'b' }, { text: 'c' }])
        expect(out.length).toBe(50)
        expect(out.slice(0, 3).map((e) => e.text)).toEqual(['c', 'b', 'a'])
    })
})
