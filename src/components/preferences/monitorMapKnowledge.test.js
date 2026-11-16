import { describe, expect, it } from 'vitest'
import { monitorKnowledge } from './monitorKnowledge.js'
import { knowledgeNodes, mergeKnowledge, HELPER_FOLD } from './monitorMapKnowledge.js'
import { groupMap } from './monitorMapGroups.js'
import { layoutMap, sizeOf } from './monitorMapLayout.js'

const panel = (n) => ({ ok: true, count: n, rows: Array.from({ length: n }, (_, i) => ({ name: `r${i}` })) })
const snap = (helpers = 2) => ({
    host: 'demo-one.local',
    panels: {
        agents: { rows: [{ sessionId: 'aaaaaaaa1111', title: 'Demo chat', status: 'busy' }], helpers: Array.from({ length: helpers }, (_, i) => ({ parent: i ? 'zzzzzzzz' : 'aaaaaaaa', label: `helper ${i}`, busy: i % 2 === 0, since: `2026-11-16T10:0${i % 10}:00Z` })) },
        rules: panel(28), hooks: { ...panel(25), events: { Stop: 5, PreToolUse: 20 } }, skills: { ...panel(9), counts: { user: 4, repo: 5 } }
    },
    reports: [{ host: 'demo-two', stale: false, panels: { rules: { ok: false, why: 'no file' }, skills: panel(3) } }],
    asks: { rows: [{ id: 'N1', state: 'OPEN', source: 'ledger' }, { id: 'N2', state: 'DONE', source: 'ledger' }] }
})
const map = () => ({
    nodes: [
        { id: 'tier:dev', kind: 'tier', label: 'dev', state: 'ok' },
        { id: 'machine:demo-one', kind: 'machine', label: 'demo-one', state: 'ok' },
        { id: 'machine:demo-two', kind: 'machine', label: 'demo-two', state: 'warn' },
        { id: 'agent:demo-one:aaaaaaaa', kind: 'agent', label: 'Demo chat', state: 'ok' }
    ],
    edges: [{ from: 'machine:demo-one', to: 'tier:dev', kind: 'runs' }, { from: 'machine:demo-one', to: 'agent:demo-one:aaaaaaaa', kind: 'runs' }]
})

describe('knowledgeNodes', () => {
    it('gives each machine its rules, skills and hooks, and the to do once', () => {
        const s = snap()
        const { nodes, edges } = knowledgeNodes(map(), monitorKnowledge(s), s)
        const ids = nodes.filter((n) => n.kind === 'knowledge').map((n) => n.id).sort()
        expect(ids).toEqual(['know:demo-one:hooks', 'know:demo-one:rules', 'know:demo-one:skills', 'know:demo-one:todo', 'know:demo-two:rules', 'know:demo-two:skills'])
        expect(nodes.find((n) => n.id === 'know:demo-one:skills').sub).toBe('4 user · 5 repo')
        expect(nodes.find((n) => n.id === 'know:demo-one:todo').label).toBe('To do 1')
        expect(edges.filter((e) => e.kind === 'has').every((e) => e.from.startsWith('machine:'))).toBe(true)
    })
    it('marks an unreadable panel warn', () => {
        const s = snap()
        const n = knowledgeNodes(map(), monitorKnowledge(s), s).nodes.find((x) => x.id === 'know:demo-two:rules')
        expect(n.state).toBe('warn')
    })
    it('hangs a helper on its chat, else on the machine; busy is ok, done is off', () => {
        const s = snap()
        const { nodes, edges } = knowledgeNodes(map(), monitorKnowledge(s), s)
        const helpers = nodes.filter((n) => n.kind === 'helper')
        expect(helpers.map((h) => h.state).sort()).toEqual(['off', 'ok'])
        const froms = edges.filter((e) => e.kind === 'helps').map((e) => e.from).sort()
        expect(froms).toEqual(['agent:demo-one:aaaaaaaa', 'machine:demo-one'])
    })
    it('folds many helpers into one node', () => {
        const s = snap(HELPER_FOLD + 3)
        const helpers = knowledgeNodes(map(), monitorKnowledge(s), s).nodes.filter((n) => n.kind === 'helper')
        expect(helpers).toHaveLength(1)
        expect(helpers[0].label).toBe(`${HELPER_FOLD + 3} helpers`)
    })
    it('adds nothing for a machine the map does not have, and nothing without knowledge', () => {
        const s = snap()
        expect(knowledgeNodes({ nodes: [], edges: [] }, monitorKnowledge(s), s).nodes).toEqual([])
        expect(mergeKnowledge(map(), null, s)).toEqual(map())
    })
})

describe('on the map', () => {
    it('survive grouping and layout with no two cards overlapping', () => {
        const s = snap(5)
        const merged = mergeKnowledge(map(), monitorKnowledge(s), s)
        const grouped = groupMap(merged)
        for (const aspect of [1.8, 1]) {
            const layout = layoutMap(grouped, aspect)
            const boxes = layout.nodes.map((n) => { const p = layout.pos.get(n.id); const { w, h } = sizeOf(n.kind); return { id: n.id, x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h / 2, y1: p.y + h / 2 } })
            let overlaps = 0
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i]; const b = boxes[j]; if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlaps++ }
            expect(overlaps).toBe(0)
            expect(layout.nodes.filter((n) => n.kind === 'knowledge' || n.kind === 'helper').length).toBeGreaterThan(8)
        }
    })
})
