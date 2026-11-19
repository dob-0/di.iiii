import { describe, expect, it } from 'vitest'
import { KIND_STYLE, layoutMonitorMap, sizeOf } from './monitorMapLayout.js'
import { shapePoints } from './WorldLegend.jsx'

const KINDS = ['tier', 'machine', 'repo', 'space', 'show', 'agent']
const map = () => {
    const nodes = []
    const edges = []
    const add = (kind, n) => { for (let i = 0; i < n; i += 1) nodes.push({ id: `${kind}:${i}`, kind, label: `${kind} ${i}`, state: 'ok' }) }
    add('tier', 3); add('machine', 5); add('repo', 1); add('space', 12); add('show', 4); add('agent', 40)
    nodes.forEach((n) => { if (n.id !== 'repo:0') edges.push({ from: 'machine:0', to: n.id, kind: 'runs' }) })
    return { nodes, edges }
}

describe('Monitor map kinds as lanes', () => {
    it('no two cards overlap, 45+ nodes', () => {
        const l = layoutMonitorMap(map())
        const box = (n) => { const p = l.pos.get(n.id); const s = sizeOf(n.kind); return { x: p.x, y: p.y, w: s.w, h: s.h } }
        const b = l.nodes.map(box)
        let hits = 0
        for (let i = 0; i < b.length; i += 1) for (let j = i + 1; j < b.length; j += 1) {
            if (Math.abs(b[i].x - b[j].x) < (b[i].w + b[j].w) / 2 && Math.abs(b[i].y - b[j].y) < (b[i].h + b[j].h) / 2) hits += 1
        }
        expect(hits).toBe(0)
    })
    it('each kind keeps to its own lane, inner kinds nearer the hub than outer ones', () => {
        const l = layoutMonitorMap(map())
        const mean = (k) => { const r = l.nodes.filter((n) => n.kind === k).map((n) => Math.hypot(l.pos.get(n.id).x / l.aspect, l.pos.get(n.id).y)); return r.reduce((a, c) => a + c, 0) / r.length }
        expect(mean('tier')).toBeLessThan(mean('machine'))
        expect(mean('machine')).toBeLessThan(mean('space'))
        expect(mean('space')).toBeLessThan(mean('agent'))
    })
    it('every kind has a token colour and a shape; the shapes differ per kind', () => {
        KINDS.forEach((k) => { expect(KIND_STYLE[k].token).toMatch(/^--di-/) })
        const shapes = KINDS.map((k) => KIND_STYLE[k].shape)
        expect(new Set(shapes).size).toBeGreaterThanOrEqual(5)
        expect(shapePoints('diamond', 6, 6, 11).split(' ')).toHaveLength(4)
    })
})
