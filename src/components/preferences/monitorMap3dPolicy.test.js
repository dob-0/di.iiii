import { describe, expect, it } from 'vitest'
import { fitKey, shouldRefit, layoutSignature, pulseEdgeIndexes, shouldAnimate, hasLiveEdge, nudgeLabels, packLabels } from './monitorMap3dPolicy.js'
import { layoutMap } from './monitorMapLayout.js'

const map = (state = 'ok') => ({
    nodes: [
        { id: 'tier:dev', kind: 'tier', label: 'dev', state },
        { id: 'machine:a', kind: 'machine', label: 'a', state: 'ok' },
        { id: 'space:p', kind: 'space', label: 'p', state: 'ok' }
    ],
    edges: [{ from: 'machine:a', to: 'tier:dev', kind: 'runs' }, { from: 'tier:dev', to: 'space:p', kind: 'serves' }, { from: 'space:p', to: 'machine:a', kind: 'holds' }]
})

describe('3D map policy', () => {
    it('same ids in a new object is not a refit; a new set of ids is', () => {
        const a = layoutMap(map())
        const b = layoutMap(map('warn'))
        expect(a).not.toBe(b)
        expect(shouldRefit(fitKey(a), fitKey(b))).toBe(false)
        const more = map(); more.nodes.push({ id: 'space:q', kind: 'space', label: 'q', state: 'ok' })
        expect(shouldRefit(fitKey(a), fitKey(layoutMap(more)))).toBe(true)
    })

    it('a snapshot with nothing visibly changed has the same signature; a state change does not', () => {
        expect(layoutSignature(layoutMap(map()))).toBe(layoutSignature(layoutMap(map())))
        expect(layoutSignature(layoutMap(map()))).not.toBe(layoutSignature(layoutMap(map('warn'))))
    })

    it('still = no animation: nothing pulses unless a change pulse or a hover on a live edge', () => {
        const { edges } = map()
        expect(shouldAnimate({ edges, pulsing: false, hoverId: null })).toBe(false)
        expect(shouldAnimate({ edges, pulsing: true, hoverId: null })).toBe(true)
        expect(shouldAnimate({ edges, pulsing: false, hoverId: 'tier:dev' })).toBe(true)
        expect(shouldAnimate({ edges, pulsing: false, hoverId: 'space:p' })).toBe(true) // serves edge
    })

    it('needs a runs/serves edge, a visible tab and no reduced motion', () => {
        const only = [{ from: 'a', to: 'b', kind: 'holds' }]
        expect(hasLiveEdge(only)).toBe(false)
        expect(shouldAnimate({ edges: only, pulsing: true, hoverId: 'a' })).toBe(false)
        const { edges } = map()
        expect(shouldAnimate({ edges, pulsing: true, visible: false })).toBe(false)
        expect(shouldAnimate({ edges, pulsing: true, reduced: true })).toBe(false)
    })

    it('hover pulses only the hovered node\'s own live edges', () => {
        const { edges } = map()
        expect(pulseEdgeIndexes({ edges, pulsing: false, hoverId: 'machine:a' })).toEqual([0])
        expect(pulseEdgeIndexes({ edges, pulsing: true, hoverId: null })).toEqual([0, 1])
    })
})

describe('nudgeLabels', () => {
    const hit = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
    const place = (items, out) => items.map((it) => ({ ...it, x: it.x + (out[it.id]?.dx || 0), y: it.y + (out[it.id]?.dy || 0) }))
    it('pushes two cards on the same spot apart, and keeps them off a fixed button', () => {
        const items = [{ id: 'a', x: 200, y: 100, w: 120, h: 44 }, { id: 'b', x: 205, y: 102, w: 120, h: 44 }, { id: 'tool', x: 300, y: 30, w: 130, h: 44, fixed: true }]
        const at = place(items, nudgeLabels(items, { bounds: { width: 390, height: 420 } }))
        expect(hit(at[0], at[1])).toBe(false)
        expect(at.slice(0, 2).some((c) => hit(c, at[2]))).toBe(false)
        expect(at[2]).toEqual(items[2]) // a fixed box never moves
    })
    it('with bounds, a card at the edge ends whole on the stage', () => {
        const items = [{ id: 'edge', x: 20, y: 410, w: 120, h: 44 }]
        const [c] = place(items, nudgeLabels(items, { bounds: { width: 390, height: 420 } }))
        expect(c.x - c.w / 2).toBeGreaterThanOrEqual(0)
        expect(c.y + c.h / 2).toBeLessThanOrEqual(420)
    })
})

describe('packLabels', () => {
    const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
    const apply = (items, off) => items.map((i) => ({ ...i, x: i.x + (off[i.id]?.dx || 0), y: i.y + (off[i.id]?.dy || 0) }))
    const pairs = (l) => l.flatMap((a, i) => l.slice(i + 1).filter((b) => overlap(a, b)))
    it('leaves a free card where it is and moves a crowded one to a free place', () => {
        const items = [{ id: 'a', x: 50, y: 50, w: 80, h: 30 }, { id: 'b', x: 55, y: 52, w: 80, h: 30 }, { id: 'c', x: 400, y: 50, w: 80, h: 30 }]
        const { ok, offsets } = packLabels(items)
        expect(ok).toBe(true)
        expect(offsets.c).toBeUndefined()
        expect(pairs(apply(items, offsets))).toHaveLength(0)
    })
    it('packs thirty crowded cards inside the stage with no overlap, the same way twice', () => {
        const items = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, x: 300 + (i % 6) * 12, y: 200 + Math.floor(i / 6) * 9, w: 110, h: 40 }))
        const bounds = { width: 640, height: 480 }
        const a = packLabels(items, { bounds })
        expect(a.ok).toBe(true)
        const out = apply(items, a.offsets)
        expect(pairs(out)).toHaveLength(0)
        expect(out.every((i) => i.x - i.w / 2 >= 0 && i.x + i.w / 2 <= 640 && i.y - i.h / 2 >= 0 && i.y + i.h / 2 <= 480)).toBe(true)
        expect(packLabels(items, { bounds })).toEqual(a)
    })
    it('says not ok when the stage is too small for them', () => {
        const items = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, x: 40, y: 40, w: 100, h: 40 }))
        expect(packLabels(items, { bounds: { width: 120, height: 60 } }).ok).toBe(false)
    })
})
