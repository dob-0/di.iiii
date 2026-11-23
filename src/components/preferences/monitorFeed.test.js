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

    it('agent busy to idle, a new agent, one that left', () => {
        const next = clone(base())
        next.panels.agents.rows = [{ machine: 'aylmo', sessionId: 's1', title: 'PC performance', status: 'idle' }, { machine: 'r-di', sessionId: 's2', title: 'Lights', status: 'busy' }]
        const text = diffSnapshots(base(), next).map((e) => e.text)
        expect(text).toContain("agent 'PC performance' busy → idle")
        expect(text).toContain("agent 'Lights' started")
        const gone = clone(base()); gone.panels.agents.rows = []
        expect(diffSnapshots(base(), gone).map((e) => e.text)).toContain("agent 'PC performance' ended")
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

// The Agents box lists the agents of every machine, but another machine's agents are in the list only while that machine's report is
// fresh: when its report goes stale, comes back, is listed for the first time or is dropped, its agents leave or join the rows
// without having ended or started. The hub says how each machine's list stands in `panels.agents.machines`; the feed says an agent
// started or ended only when that list is the same in both snapshots and none is cut, whichever machine a row names.
describe('diffSnapshots: the agents of every machine', () => {
    const row = (machine, sessionId, title, status = 'idle') => ({ machine, sessionId, title, status })
    const snap = (rows, machines) => ({ panels: { agents: { rows, machines } } })
    const home = { host: 'studio', state: 'ok', self: true }
    const said = (prev, next) => diffSnapshots(prev, next).filter((e) => e.key.startsWith('agent:')).map((e) => e.text)

    it('an agent of another machine does not end when that machine\'s report goes stale, nor start when it comes back', () => {
        const fresh = snap([row('studio', 's1', 'mine', 'busy'), row('studio-mac', 'm1', 'credits')], [home, { host: 'studio-mac', state: 'ok' }])
        const quiet = snap([row('studio', 's1', 'mine', 'busy')], [home, { host: 'studio-mac', state: 'stale' }])
        expect(said(fresh, quiet)).toEqual([])
        expect(said(quiet, fresh)).toEqual([])
    })

    it('a change of what an agent does is said even in a poll where no start and no end is', () => {
        const fresh = snap([row('studio', 's1', 'mine', 'busy'), row('studio-mac', 'm1', 'credits')], [home, { host: 'studio-mac', state: 'ok' }])
        const quiet = snap([row('studio', 's1', 'mine', 'idle')], [home, { host: 'studio-mac', state: 'stale' }])
        expect(said(fresh, quiet)).toEqual(["agent 'mine' busy → idle"])
    })

    it('a start, an end and a change of what an agent does are still said when the machines stay as they were', () => {
        const machines = [home, { host: 'studio-mac', state: 'ok' }]
        const before = snap([row('studio', 's1', 'mine', 'busy'), row('studio-mac', 'm1', 'credits', 'busy'), row('studio-mac', 'm2', 'probe')], machines)
        const after = snap([row('studio', 's1', 'mine', 'idle'), row('studio-mac', 'm1', 'credits', 'idle'), row('studio-mac', 'm3', 'review')], machines)
        expect(said(before, after)).toEqual(["agent 'mine' busy → idle", "agent 'credits' busy → idle", "agent 'review' started", "agent 'probe' ended"])
    })

    it('a machine that is listed for the first time, or no longer listed, starts and ends nothing', () => {
        const alone = snap([row('studio', 's1', 'mine')], [home])
        const withLab = snap([row('studio', 's1', 'mine'), row('lab-pc', 'l1', 'render')], [home, { host: 'lab-pc', state: 'ok' }])
        expect(said(alone, withLab)).toEqual([])
        expect(said(withLab, alone)).toEqual([])
    })

    it('this machine\'s own agents do not end when its own list cannot be read for a moment, nor start when it can be read again', () => {
        const readable = snap([row('studio', 's1', 'mine', 'busy'), row('studio-mac', 'm1', 'credits')], [home, { host: 'studio-mac', state: 'ok' }])
        const unreadable = snap([row('studio-mac', 'm1', 'credits')], [{ host: 'studio', state: 'failed', error: 'timed out after 9000 ms', self: true }, { host: 'studio-mac', state: 'ok' }])
        expect(said(readable, unreadable)).toEqual([])
        expect(said(unreadable, readable)).toEqual([])
        // no other machine has a list either: the hub returns this machine's own panel as it was, with no machines list at all
        const alone = snap([row('studio', 's1', 'mine'), row('r-di', 'r1', 'remote chat')], [home])
        const nothing = { panels: { agents: { ok: false, error: 'timed out after 9000 ms' } } }
        expect(said(alone, nothing)).toEqual([])
        expect(said(nothing, alone)).toEqual([])
    })

    it('a row that names another machine than the one that supplied it goes and comes with its supplier, not with the name', () => {
        // studio lends aylmo's rows and one of them names di-jet (a machine aylmo reads by ssh): when aylmo goes stale that row goes too
        const fresh = snap([row('studio', 's1', 'mine'), row('aylmo', 'a1', 'one'), row('di-jet', 'j1', 'jet chat')], [home, { host: 'aylmo', state: 'ok' }])
        const quiet = snap([row('studio', 's1', 'mine')], [home, { host: 'aylmo', state: 'stale' }])
        expect(said(fresh, quiet)).toEqual([])
        expect(said(quiet, fresh)).toEqual([])
    })

    it('a real start in the same poll as a change of the machines list is not said (the price of not matching a row to its machine)', () => {
        const before = snap([row('aylmo', 'a1', 'one')], [home, { host: 'aylmo', state: 'ok' }, { host: 'di-jet', state: 'ok' }])
        const after = snap([row('aylmo', 'a1', 'one'), row('aylmo', 'a2', 'two')], [home, { host: 'aylmo', state: 'ok' }, { host: 'di-jet', state: 'stale' }])
        expect(said(before, after)).toEqual([])
    })

    it('a session that two machines list is one agent, whichever of them the row names', () => {
        const machines = [home, { host: 'aa-pc', state: 'ok' }, { host: 'zz-pc', state: 'ok' }]
        const first = snap([row('aa-pc', 'x1', 'shared', 'idle')], machines)
        const second = snap([row('zz-pc', 'x1', 'shared', 'busy')], machines)
        expect(said(first, second)).toEqual(["agent 'shared' idle → busy"])
    })

    it('a machine is known by the first word of its name in lower case, and the order of the list does not matter', () => {
        // the same machine is spelled 'Mac.local' and then 'mac': it is listed the same way, so a real end in that poll is said
        const before = snap([row('Mac', 'm1', 'one'), row('Mac', 'm2', 'two')], [home, { host: 'Mac.local', state: 'ok' }])
        const after = snap([row('mac', 'm1', 'one')], [home, { host: 'mac', state: 'ok' }])
        expect(said(before, after)).toEqual(["agent 'two' ended"])
        // the same machines listed in another order are the same list
        const first = snap([row('aa-pc', 'x1', 'one'), row('aa-pc', 'x2', 'two')], [home, { host: 'aa-pc', state: 'ok' }, { host: 'zz-pc', state: 'ok' }])
        const second = snap([row('aa-pc', 'x1', 'one')], [{ host: 'zz-pc', state: 'ok' }, home, { host: 'aa-pc', state: 'ok' }])
        expect(said(first, second)).toEqual(["agent 'two' ended"])
    })

    it('an IP address is one name: two machines known by address that swap places are a change of the list', () => {
        const before = snap([row('100.107.177.72', 'i1', 'one')], [home, { host: '100.107.177.72', state: 'ok' }, { host: '100.64.0.9', state: 'stale' }])
        const after = snap([row('100.64.0.9', 'i2', 'two')], [home, { host: '100.107.177.72', state: 'stale' }, { host: '100.64.0.9', state: 'ok' }])
        expect(said(before, after)).toEqual([])
    })

    it('a list cut at its limit says nothing about starts and ends: a real end shows a hidden agent', () => {
        const cutList = [home, { host: 'lab', state: 'ok', capped: true }]
        const openList = [home, { host: 'lab', state: 'ok' }]
        const before = (machines) => snap([row('lab', 'l1', 'one'), row('lab', 'l2', 'two')], machines)
        const after = (machines) => snap([row('lab', 'l2', 'two'), row('lab', 'l3', 'three')], machines)
        expect(said(before(openList), after(openList))).toEqual(["agent 'three' started", "agent 'one' ended"])
        expect(said(before(cutList), after(cutList))).toEqual([])
        expect(said(before(cutList), after(openList))).toEqual([])
        expect(said(before(openList), after(cutList))).toEqual([])
    })

    it('a machines list that is not a list, or has an empty entry, does not break the feed', () => {
        // not a list: the same as no list, every change counts
        expect(said(snap([row('aylmo', 's1', 'old one')], 'oops'), snap([row('aylmo', 's2', 'new one')], 'oops'))).toEqual(["agent 'new one' started", "agent 'old one' ended"])
        // an empty entry is one more machine with no name and no state, the same in both snapshots
        const machines = [null, home]
        expect(said(snap([row('studio', 's1', 'old one')], machines), snap([row('studio', 's2', 'new one')], machines))).toEqual(["agent 'new one' started", "agent 'old one' ended"])
    })

    it('a snapshot from a server that sends no machines list counts every start and end, as before', () => {
        const before = snap([row('aylmo', 's1', 'old one')], undefined)
        const after = snap([row('aylmo', 's2', 'new one')], undefined)
        expect(said(before, after)).toEqual(["agent 'new one' started", "agent 'old one' ended"])
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
