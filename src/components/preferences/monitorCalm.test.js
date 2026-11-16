import { describe, expect, it } from 'vitest'
import { groupMap, visibleEdges, FOLD_OVER } from './monitorMapGroups.js'
import { layoutMap } from './monitorMapLayout.js'
import { machineLabels, needsYou, seedActivity, vitalChips, vitalDetail } from './monitorCalm.js'
import { nudgeLabels } from './monitorMap3dPolicy.js'

// synthetic: the real map has tailnet names and is never committed
const spaceMap = (perTier = { dev: 15, prod: 12, 'local:box': 2 }, shared = 10) => {
    const nodes = [{ id: 'repo:r', kind: 'repo', label: 'repo', state: 'ok' }]
    const edges = []
    for (const [tier, n] of Object.entries(perTier)) {
        nodes.push({ id: `tier:${tier}`, kind: 'tier', label: tier, state: 'ok' })
        for (let i = 0; i < n; i += 1) {
            const slug = i < shared ? `s${i}` : `${tier}-only-${i}`
            nodes.push({ id: `space:${tier}:${slug}`, kind: 'space', label: slug, state: 'ok' })
            edges.push({ from: `tier:${tier}`, to: `space:${tier}:${slug}`, kind: 'holds' })
        }
    }
    nodes.push({ id: 'machine:m', kind: 'machine', label: 'm', state: 'ok' })
    edges.push({ from: 'machine:m', to: 'tier:dev', kind: 'runs' })
    return { nodes, edges }
}

describe('groupMap', () => {
    it('one node per space name, with the tiers it lives on, no repeated names', () => {
        const g = groupMap(spaceMap(), { open: true })
        const spaces = g.nodes.filter((n) => n.kind === 'space')
        const labels = spaces.map((n) => n.label)
        expect(new Set(labels).size).toBe(labels.length)
        const s0 = spaces.find((n) => n.label === 's0')
        expect(s0.tiers.length).toBe(3)
        expect(s0.rawIds.length).toBe(3)
    })

    it('more than 8 spaces under one parent fold into one group node that opens on click or with the filter', () => {
        expect(FOLD_OVER).toBe(8)
        const m = spaceMap()
        const folded = groupMap(m)
        const group = folded.nodes.find((n) => n.kind === 'group')
        expect(group.label).toMatch(/^\d+ spaces$/)
        expect(group.members.length).toBeGreaterThan(8)
        expect(folded.nodes.filter((n) => n.kind === 'space').length).toBeLessThan(group.members.length)
        const opened = groupMap(m, { expanded: [group.id] })
        expect(opened.nodes.some((n) => n.id === group.id)).toBe(false)
        expect(groupMap(m, { open: true }).nodes.some((n) => n.kind === 'group')).toBe(false) // a filter opens it
    })

    it('at fit there are at most 15 nodes', () => {
        const g = groupMap(spaceMap())
        expect(g.nodes.length).toBeLessThanOrEqual(15)
    })

    it('is stable: a shuffled snapshot gives the same nodes, edges and positions', () => {
        const m = spaceMap()
        const shuffled = { nodes: [...m.nodes].reverse(), edges: [...m.edges].reverse() }
        const a = groupMap(m)
        const b = groupMap(shuffled)
        expect(b.nodes.map((n) => n.id)).toEqual(a.nodes.map((n) => n.id))
        expect(b.edges).toEqual(a.edges)
        const la = layoutMap(a)
        const lb = layoutMap(b)
        for (const n of a.nodes) expect(lb.pos.get(n.id)).toEqual(la.pos.get(n.id))
    })

    it('holds lines show only next to the focused node; runs and works-on always', () => {
        const edges = [{ from: 'a', to: 'b', kind: 'holds' }, { from: 'b', to: 'c', kind: 'runs' }, { from: 'c', to: 'd', kind: 'works-on' }]
        expect(visibleEdges(edges, null).map((e) => e.kind)).toEqual(['runs', 'works-on'])
        expect(visibleEdges(edges, 'a').map((e) => e.kind)).toEqual(['holds', 'runs', 'works-on'])
        expect(visibleEdges(edges, 'd').map((e) => e.kind)).toEqual(['runs', 'works-on'])
    })

    it('holdsMax: a small map draws every holds line (each node shows its tier link); a big one keeps focus-only', () => {
        const edges = [{ from: 'a', to: 'b', kind: 'holds' }, { from: 'a', to: 'c', kind: 'holds' }]
        expect(visibleEdges(edges, null, 12)).toHaveLength(2)
        expect(visibleEdges(edges, null, 1)).toHaveLength(0)
        expect(visibleEdges(edges, 'b', 1)).toHaveLength(1)
    })
})

describe('nudgeLabels', () => {
    const boxes = [{ id: 'a', x: 100, y: 100, w: 90, h: 30 }, { id: 'b', x: 110, y: 104, w: 90, h: 30 }, { id: 'c', x: 105, y: 98, w: 90, h: 30 }]
    const apply = (items, off) => items.map((i) => ({ ...i, x: i.x + (off[i.id]?.dx || 0), y: i.y + (off[i.id]?.dy || 0) }))
    const overlaps = (list) => { let n = 0; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i]; const b = list[j]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) n += 1 } return n }
    it('leaves no two names overlapping', () => {
        expect(overlaps(boxes)).toBeGreaterThan(0)
        expect(overlaps(apply(boxes, nudgeLabels(boxes)))).toBe(0)
    })
    it('does not move a fixed one, and answers the same twice', () => {
        const withHub = boxes.map((b, i) => (i === 0 ? { ...b, fixed: true } : b))
        const off = nudgeLabels(withHub)
        expect(off.a).toBeUndefined()
        expect(nudgeLabels(withHub)).toEqual(off)
    })
    it('apart names are untouched', () => {
        expect(nudgeLabels([{ id: 'a', x: 0, y: 0, w: 50, h: 20 }, { id: 'b', x: 200, y: 0, w: 50, h: 20 }])).toEqual({})
    })
})

const tiers = [
    { id: 'dev', status: 'ok', commit: 'bbbbbbb1', builtAt: '2026-11-12T00:00:00Z', behindDev: 0, url: 'https://d' },
    { id: 'prod', status: 'ok', commit: 'aaaaaaa1', builtAt: '2026-10-07T00:00:00Z', behindDev: 1274, url: 'https://p' },
    { id: 'local:box', status: 200, commit: null, behindDev: null, source: 'self' }
]
const snap = () => ({
    host: 'box',
    tiers: { ok: true, rows: tiers },
    panels: {
        machines: { ok: true, online: 1, total: 2, rows: [{ id: '1', name: 'x', os: 'linux', online: true }, { id: '2', name: 'x', os: 'windows', online: false }] },
        services: { ok: true, running: 1, failed: 1, rows: [{ unit: 'a.service', active: 'failed', sub: 'failed' }, { unit: 'b.service', active: 'active', sub: 'running' }] },
        agents: { ok: true, live: 1, busy: 1, rows: [{ sessionId: 's', title: 'T', status: 'busy', lastActivity: new Date(Date.now() - 60000).toISOString() }] },
        pullRequests: { ok: true, open: 1, drafts: 0, rows: [{ number: 5, title: 'p', draft: false, updatedAt: new Date(Date.now() - 3600000).toISOString() }] },
        connected: { ok: true, live: 1, total: 3, rows: [] }, presence: { ok: true, people: 2, places: 1, rows: [] }, network: { ok: true, rows: [] }
    }
})

describe('needsYou', () => {
    it('one row per item with what, why and one action; danger first; the quiet local tree is not one', () => {
        const rows = needsYou(snap())
        expect(rows.map((r) => r.id)).toEqual(['service:a.service', 'tier:prod'])
        expect(rows[1]).toMatchObject({ what: 'prod is behind dev', action: 'Compare with dev', target: { kind: 'tier', id: 'prod' } })
        expect(rows[1].why).toMatch(/^1274 commits behind/)
    })
    it('is empty when all is well', () => {
        const s = snap(); s.tiers.rows = [tiers[0]]; s.panels.services.rows = [s.panels.services.rows[1]]
        expect(needsYou(s)).toEqual([])
    })
})

describe('vitalChips and vitalDetail', () => {
    it('chips use plain words, the tier chip carries no number the Needs row already says', () => {
        const chips = vitalChips(snap())
        const by = Object.fromEntries(chips.map((c) => [c.id, c]))
        expect(by['tier:local:box']).toMatchObject({ label: 'this machine', value: 'not a release build' })
        expect(by['tier:prod'].value).toBe('behind')
        expect(by.machines.value).toBe('1 of 2')
        expect(by.agents.value).toBe('1 · 1 busy')
        expect(by.services.value).toBe('1 of 2 running')
        expect(by.gear).toMatchObject({ label: 'Show gear', value: '1 of 3 ready' })
        expect(chips.every((c) => c.target)).toBe(true)
    })

    it('the Agents chip counts the helpers a machine reports', () => {
        const s = snap()
        s.reports = [{ host: 'box', panels: { agents: { ok: true, rows: [], helpers: [{ parent: 'aaaa1111', label: 'audit', busy: true, since: '2026-11-16T08:00:00Z' }] } } }]
        expect(Object.fromEntries(vitalChips(s).map((c) => [c.id, c])).agents.value).toBe('1 · 1 busy · 1 helper')
    })
    it('a chip names its list: rows open their own detail', () => {
        const d = vitalDetail(snap(), 'machines')
        expect(d.title).toBe('Machines')
        expect(d.rows.length).toBe(2)
        expect(d.rows.every((r) => r.kind === 'machine')).toBe(true)
        expect(d.dots.length).toBe(2)
    })
})

describe('machineLabels', () => {
    it('same name on two devices shows the system, never two identical rows', () => {
        const labels = machineLabels(snap().panels.machines.rows)
        expect(labels.get('1')).toBe('x · linux')
        expect(labels.get('2')).toBe('x · windows')
    })
})

describe('seedActivity', () => {
    it('is built from the snapshot timestamps, newest first, never empty for a live snapshot', () => {
        const items = seedActivity(snap(), Date.now())
        expect(items.length).toBeGreaterThan(0)
        for (let i = 1; i < items.length; i += 1) expect(items[i - 1].at).toBeGreaterThanOrEqual(items[i].at)
        expect(items.some((e) => /agent/.test(e.text))).toBe(true)
        expect(seedActivity(snap(), Date.now(), 2).length).toBeLessThanOrEqual(2)
    })
})

describe('tierState: a 429 is a limited probe, not an outage', () => {
    it('reads 429 as a quiet warning and keeps 5xx and no answer as danger', async () => {
        const { tierState } = await import('./monitorTier.js')
        expect(tierState({ id: 'dev', status: 429 }, null)).toMatchObject({ tone: 'warning', quiet: true })
        expect(tierState({ id: 'dev', status: 502 }, null).tone).toBe('danger')
        expect(tierState({ id: 'prod', status: 0 }, null).tone).toBe('danger')
    })
    it('puts no "not answering" row in Needs you for a 429, and does for a 502', () => {
        const limited = needsYou({ tiers: { rows: [{ id: 'dev', status: 429, url: 'https://dev.example' }] } })
        expect(JSON.stringify(limited)).not.toMatch(/not answering/)
        const down = needsYou({ tiers: { rows: [{ id: 'dev', status: 502, url: 'https://dev.example' }] } })
        expect(JSON.stringify(down)).toMatch(/not answering/)
    })
})
