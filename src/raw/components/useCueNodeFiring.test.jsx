import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createFrameMemory, createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { cueToFire, useCueNodeFiring } from './useCueNodeFiring.js'

const CUES = [
    { id: 'c1', name: 'Open', fade: 2, hold: 8, surfaces: { s1: { opacity: 1 } } },
    { id: 'c2', name: 'Middle', fade: 4, hold: 10, surfaces: { s1: { opacity: 0.5 } } }
]

describe('cueToFire — when a Cue node fires a cue', () => {
    const state = { index: 1, id: 'c2', firedAt: 500, pressed: true }
    it('fires the document cue a pressed node moved to, once', () => {
        expect(cueToFire(state, null, CUES)).toEqual({ cue: CUES[1], mark: 'c2@500' })
        expect(cueToFire(state, 'c2@500', CUES)).toBeNull()
        expect(cueToFire({ ...state, firedAt: 900 }, 'c2@500', CUES)).toEqual({ cue: CUES[1], mark: 'c2@900' })
    })
    it('never for a node nobody pressed, nothing on, or a cue the list no longer has', () => {
        expect(cueToFire({ ...state, pressed: false }, null, CUES)).toBeNull()
        expect(cueToFire({ ...state, index: -1 }, null, CUES)).toBeNull()
        expect(cueToFire({ ...state, id: 'gone' }, null, CUES)).toBeNull()
        expect(cueToFire(null, null, CUES)).toBeNull()
    })
})

describe('useCueNodeFiring — Go on the node, the cue on the room', () => {
    it('a Button press count fires the next cue through fireCue\'s ops, and only once per cue', () => {
        const memory = createFrameMemory()
        const presses = createNode('value.number', { id: 'p', values: { value: 0 } })
        const cue = createNode('signal.cue', { id: 'q' })
        const doc = () => ({ nodes: [presses, cue], edges: [createEdge('p', 'out', 'q', 'go')], mappingState: { cues: CUES } })
        const applyOps = vi.fn()
        const props = (now) => {
            const document = doc()
            return { document, context: createNodeGraphContext(document, { now, frameMemory: memory }), applyOps }
        }
        const { rerender } = renderHook((p) => useCueNodeFiring(p), { initialProps: props(0) })
        expect(applyOps).not.toHaveBeenCalled()
        presses.values = { value: 1 }
        rerender(props(100))
        expect(applyOps).toHaveBeenCalledTimes(1)
        expect(applyOps.mock.calls[0][0]).toEqual([
            { type: 'setMappingState', payload: { patch: { fade: 2 } } },
            { type: 'setMappingSurface', payload: { surfaceId: 's1', patch: { opacity: 1 } } }
        ])
        rerender(props(200))
        expect(applyOps).toHaveBeenCalledTimes(1)
        presses.values = { value: 2 }
        rerender(props(300))
        expect(applyOps).toHaveBeenCalledTimes(2)
        expect(applyOps.mock.calls[1][0][0]).toEqual({ type: 'setMappingState', payload: { patch: { fade: 4 } } })
    })
    it('fires nothing when switched off (a preview card)', () => {
        const memory = createFrameMemory()
        const presses = createNode('value.number', { id: 'p', values: { value: 0 } })
        const document = { nodes: [presses, createNode('signal.cue', { id: 'q' })], edges: [createEdge('p', 'out', 'q', 'go')], mappingState: { cues: CUES } }
        const applyOps = vi.fn()
        const { rerender } = renderHook((p) => useCueNodeFiring(p), { initialProps: { document, context: createNodeGraphContext(document, { now: 0, frameMemory: memory }), applyOps, enabled: false } })
        presses.values = { value: 1 }
        rerender({ document, context: createNodeGraphContext(document, { now: 100, frameMemory: memory }), applyOps, enabled: false })
        expect(applyOps).not.toHaveBeenCalled()
    })
})
