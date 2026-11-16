import { describe, expect, it } from 'vitest'
import { hostsOf, knowledgeAgents, knowledgeRules, knowledgeHooks, knowledgeSkills, knowledgeRows, monitorKnowledge } from './monitorKnowledge'

const rules = (n) => ({ ok: true, file: '~/.claude/CLAUDE.md', changed: '2026-11-16T01:00:00.000Z', count: n, rows: Array.from({ length: n }, (_, i) => ({ title: `Rule ${i}`, date: null, lines: 1, text: 't' })) })
const hooks = { ok: true, count: 1, events: { Stop: 1 }, rows: [{ scope: 'user', event: 'Stop', matcher: null, name: 'tool sub' }] }
const snapshot = {
    host: 'box.local',
    panels: { agents: { rows: [{ sessionId: 'abcdef123456', title: 'one', status: 'busy', lastActivity: '2026-11-16T02:00:00Z' }], helpers: [{ parent: 'abcdef12', label: 'h', since: '2026-11-16T02:01:00Z', busy: true }] }, rules: rules(3), hooks },
    reports: [
        { host: 'two', stale: false, panels: { rules: rules(3), hooks, agents: { rows: [{ sessionId: 'zzzzzzzz1', title: 'two', status: 'idle', lastActivity: '2026-11-16T03:00:00Z' }] } } },
        { host: 'three', stale: false, panels: { rules: rules(5), hooks: { ok: false, why: 'could not be read' } } },
        { host: 'gone', stale: true, panels: { agents: { rows: [{ sessionId: 'old', title: 'old' }] } } }
    ],
    asks: { ok: true, rows: [
        { id: 'N1', state: 'NEW', touched: '11-15 10:00', text: 'a', source: 'ledger' },
        { id: 'N2', state: 'WAITING', touched: '11-16 01:00', text: 'b', source: 'ledger' },
        { id: 'p1', state: 'open', touched: '2026-11-16', text: 'page', source: 'page' }
    ] }
}

describe('monitorKnowledge', () => {
    it('lists this server first, each host once', () => {
        expect(hostsOf(snapshot).map((h) => h.host)).toEqual(['box', 'two', 'three', 'gone'])
        expect(hostsOf(null)).toEqual([])
    })
    it('agents: chats newest first, helpers apart, a stale host left out', () => {
        const a = knowledgeAgents(hostsOf(snapshot))
        expect(a.chats.map((c) => c.title)).toEqual(['two', 'one'])
        expect(a.helpers).toHaveLength(1)
        expect(a.busy).toBe(2)
    })
    it('rules and hooks: equal ones once with "same on N machines", different or unreadable apart', () => {
        const r = knowledgeRules(hostsOf(snapshot))
        expect(r.sets.map((s) => [s.hosts, s.sameText])).toEqual([[['box', 'two'], 'same on 2 machines'], [['three'], null]])
        const h = knowledgeHooks(hostsOf(snapshot))
        expect(h.sets[0]).toMatchObject({ same: 2, events: { Stop: 1 } })
        expect(h.unreadable).toEqual([{ host: 'three', why: 'could not be read' }])
    })
    it('skills: equal ones once with "same on N machines", unreadable apart', () => {
        const skills = { ok: true, count: 1, counts: { user: 1, repo: 0, plugin: 0 }, rows: [{ scope: 'user', plugin: null, name: 'made-up', description: 'd' }] }
        const snap = { host: 'box.local', panels: { skills }, reports: [{ host: 'two', panels: { skills } }, { host: 'three', panels: { skills: { ok: false, why: 'nope' } } }] }
        const k = knowledgeSkills(hostsOf(snap))
        expect(k.sets).toHaveLength(1)
        expect(k.sets[0]).toMatchObject({ same: 2, sameText: 'same on 2 machines', count: 1, counts: { user: 1 } })
        expect(k.unreadable).toEqual([{ host: 'three', why: 'nope' }])
    })
    it('rows: ledger asks only, newest first, counts, and one line when none', () => {
        const rows = knowledgeRows(snapshot)
        expect(rows.rows.map((r) => r.id)).toEqual(['N2', 'N1'])
        expect(rows).toMatchObject({ count: 2, open: 2, byState: { NEW: 1, WAITING: 1 }, empty: null })
        expect(knowledgeRows({ asks: { rows: [] } }).empty).toMatch(/no request rows/)
        expect(knowledgeRows(null).count).toBe(0)
    })
    it('the whole is one object', () => {
        expect(Object.keys(monitorKnowledge(snapshot))).toEqual(['hosts', 'agents', 'rules', 'hooks', 'skills', 'rows'])
    })
})

describe('hostsOf: one machine that serves and reports', () => {
    it('lays a fresh report over the server entry of the same host, and a stale one only fills what is missing', () => {
        const snapshot = {
            host: 'box.local',
            panels: { agents: { rows: [{ id: 'a' }] } },
            reports: [{ host: 'box', stale: false, panels: { rules: { ok: true, rows: [{ title: 'R' }] }, agents: { rows: [{ id: 'a' }], helpers: [{ label: 'h' }] } } }],
        }
        const hosts = hostsOf(snapshot)
        expect(hosts).toHaveLength(1)
        expect(hosts[0].panels.rules.rows).toHaveLength(1)
        expect(hosts[0].panels.agents.helpers).toHaveLength(1)
        const stale = hostsOf({ ...snapshot, reports: [{ ...snapshot.reports[0], stale: true }] })
        expect(stale[0].panels.rules.rows).toHaveLength(1)
        expect(stale[0].panels.agents.helpers).toBeUndefined()
    })
})
