import { describe, expect, it } from 'vitest'
import { fitKey, shouldRefit, layoutSignature, pulseEdgeIndexes, shouldAnimate, hasLiveEdge, nudgeLabels } from './monitorMap3dPolicy.js'
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
