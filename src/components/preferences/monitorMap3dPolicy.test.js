import { describe, expect, it } from 'vitest'
import { fitKey, shouldRefit, layoutSignature, pulseEdgeIndexes, shouldAnimate, hasLiveEdge } from './monitorMap3dPolicy.js'
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
