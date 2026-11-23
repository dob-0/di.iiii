import { describe, expect, it } from 'vitest'
import { buildDetail, fieldsOf, humanize, relatedOf, rowMatches, searchCounts } from './monitorDetail.js'
import { liveState } from './MonitorLive.jsx'
import { buildHash, parseHash } from './MonitorSection.jsx'

const idOf = (r) => r.id ?? r.sessionId ?? r.unit ?? r.number ?? r.host ?? r.name
const snap = {
    panels: {
        machines: { rows: [{ id: '100.1.1.1', name: 'aylmo', os: 'linux', ip: '100.1.1.1', online: true, lastSeen: null, tx: 2048, rx: 1 }] },
        agents: { rows: [{ machine: 'aylmo', account: '.claude', sessionId: 's-1', title: 'Build it', status: 'busy', branch: 'feat/x', cwd: '/w', lastActivity: '2026-11-19T00:00:00Z' }] },
        pullRequests: { rows: [{ number: 9, title: 'A change', branch: 'feat/x', draft: false, updatedAt: '2026-11-19T00:00:00Z', url: 'https://github.com/x/y/pull/9' }] }
    },
    chats: { rows: [{ id: 's-1', title: 'Build it', group: 'working', status: 'busy', says: 'ok', asks: ['one', 'two'], idleMinutes: 0, failed: false, host: 'aylmo' }] },
    tiers: { rows: [{ id: 'dev', status: 200 }, { id: 'local:aylmo', status: 200 }] },
    spaces: { rows: [{ tier: 'dev', slug: 'docs', visibility: 'public' }] },
    reports: [{ host: 'aylmo', reportedAt: '2026-11-19T00:00:00Z', stale: false, panels: { agents: { live: 1 } } }]
}

describe('detail fields: every field, nothing summarised', () => {
    it('lists every key of a chat, including lists and empty values', () => {
        const f = fieldsOf(snap.chats.rows[0])
        const byLabel = Object.fromEntries(f.map((x) => [x.label, x.text]))
        expect(Object.keys(byLabel)).toEqual(['Id', 'Title', 'Group', 'Status', 'Says', 'Asks', 'Idle minutes', 'Failed', 'Host'])
        expect(byLabel.Asks).toBe('one, two')
        expect(byLabel.Failed).toBe('no')
    })
    it('nested records and lists of records are walked leaf by leaf', () => {
        const f = fieldsOf({ people: [{ name: 'Emilya', since: '2026-11-19T00:00:00Z' }, { name: 'Kiara', since: null }], panels: { agents: { live: 2 } } })
        expect(f.map((x) => x.label)).toEqual(['People · 1 · Name', 'People · 1 · Since', 'People · 2 · Name', 'People · 2 · Since', 'Panels · Agents · Live'])
        expect(f[1].time).toBe('2026-11-19T00:00:00Z')
        expect(f[1].age).toBeTruthy()
        expect(f[3]).toMatchObject({ text: 'none', empty: true })
    })
    it('an empty list and an empty record are said, not hidden', () => {
        expect(fieldsOf({ asks: [], panels: {} }).map((x) => x.text)).toEqual(['none', 'none'])
    })
    it('humanize makes plain words', () => {
        expect(humanize('lastSeen')).toBe('Last seen')
        expect(humanize('behindDev')).toBe('Behind dev')
    })
    it('a tier also lists the spaces it holds', () => {
        const d = buildDetail('tier', snap.tiers.rows[0], snap, idOf)
        expect(d.fields.find((x) => x.label === 'Spaces held').text).toBe('docs (public)')
        expect(JSON.parse(d.raw).id).toBe('dev')
    })
})

describe('detail links', () => {
    it('a chat points to its machine, its agent session and its report', () => {
        const r = relatedOf('chat', snap.chats.rows[0], snap, idOf)
        expect(r.map((x) => `${x.kind}:${x.id}`)).toEqual(['machine:100.1.1.1', 'agent:s-1', 'report:aylmo'])
    })
    it('a pull request points to the agent on its branch, and the agent back to it', () => {
        expect(relatedOf('pr', snap.panels.pullRequests.rows[0], snap, idOf)[0]).toMatchObject({ kind: 'agent', id: 's-1' })
        expect(relatedOf('agent', snap.panels.agents.rows[0], snap, idOf).map((x) => x.kind)).toEqual(['machine', 'pr', 'chat'])
    })
    it('a machine points to its agents, chats and local tier; nothing invented for an unknown host', () => {
        expect(relatedOf('machine', snap.panels.machines.rows[0], snap, idOf).map((x) => x.kind)).toEqual(['agent', 'chat', 'tier'])
        expect(relatedOf('chat', { id: 'z', host: 'nowhere' }, snap, idOf)).toEqual([])
    })
})

describe('filter covers every field of every kind', () => {
    it('matches a value that no card shows (a chat host, an ask line, a cwd)', () => {
        expect(rowMatches('aylmo', snap.chats.rows[0])).toBe(true)
        expect(rowMatches('two', snap.chats.rows[0])).toBe(true)
        expect(rowMatches('/w', snap.panels.agents.rows[0])).toBe(true)
        expect(rowMatches('nope', snap.chats.rows[0])).toBe(false)
    })
    it('counts matches across all kinds', () => {
        expect(searchCounts(snap, 'feat/x')).toEqual({ matched: 2, total: 7 })
        expect(searchCounts(snap, 'aylmo').matched).toBe(5)
    })
})

describe('panel liveness words', () => {
    it('live, late at 2x the interval, old far past it, waiting with no read', () => {
        expect(liveState(3000, 5000)).toMatchObject({ state: 'live', label: 'live · heard 3 s ago' })
        expect(liveState(10000, 5000).state).toBe('late')
        expect(liveState(9999, 5000).state).toBe('live')
        expect(liveState(40000, 5000)).toMatchObject({ state: 'old', label: 'old · heard 40 s ago' })
        expect(liveState(undefined, 5000).state).toBe('waiting')
    })
})

describe('the open item lives in the link', () => {
    it('builds and reads #monitor/kind/id, with and without full screen', () => {
        expect(buildHash(false, null)).toBe('#monitor')
        expect(buildHash(true, { kind: 'chat', id: 'a b/c' })).toBe('#monitor-full/chat/a%20b%2Fc')
        expect(parseHash('#monitor-full/chat/a%20b%2Fc')).toEqual({ kind: 'chat', id: 'a b/c' })
        expect(parseHash('#monitor')).toBeNull()
    })
})
