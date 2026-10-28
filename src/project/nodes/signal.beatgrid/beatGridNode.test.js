import { describe, expect, it } from 'vitest'
import { createNode } from '../../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from '../../graph/nodeGraphRuntime.js'

// Beat Grid as a node: a baked analysis read at the document clock, or at a
// wired Time. Same second, same numbers — the reason it exists (seekable).
const ANALYSIS = JSON.stringify({
    beats: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5],
    bands: { rate: 2, low: [0, 1, 0, 1], mid: [0.5], high: [0.25] }
})
const grid = (id, values = {}) => createNode('signal.beatgrid', { id, values: { analysis: ANALYSIS, ...values } })
const read = (nodes, edges, nodeId, port, now) => {
    const context = createNodeGraphContext({ nodes, edges }, { now })
    return evaluateNodeOutput(context.nodesById.get(nodeId), port, context)
}
const edge = (id, fromNodeId, fromPort, toNodeId, toPort) => ({ id, fromNodeId, fromPort, toNodeId, toPort })

describe('Beat Grid — bare and with an analysis', () => {
    it('bare: every number 0, Pulse and Strong false, no clock, and Status says why', () => {
        const nodes = [createNode('signal.beatgrid', { id: 'g' })]
        for (const port of ['beat', 'phase', 'age', 'bar', 'count', 'low', 'mid', 'high', 'bpm']) {
            expect(read(nodes, [], 'g', port, 1250), port).toBe(0)
        }
        expect(read(nodes, [], 'g', 'pulse', 1000)).toBe(false)
        expect(read(nodes, [], 'g', 'strong', 1000)).toBe(false)
        expect(read(nodes, [], 'g', 'clock', 1000)).toBeNull()
        expect(read(nodes, [], 'g', 'status', 0)).toBe('no analysis: paste or wire a baked beat analysis')
    })

    it('unwired Time reads the document clock in seconds', () => {
        const nodes = [grid('g')]
        expect(read(nodes, [], 'g', 'phase', 1250)).toBe(0.5)
        expect(read(nodes, [], 'g', 'count', 3000)).toBe(5)
        expect(read(nodes, [], 'g', 'bar', 3000)).toBe(1)
        expect(read(nodes, [], 'g', 'beat', 3500)).toBe(2)
        expect(read(nodes, [], 'g', 'bpm', 1250)).toBe(120)
        expect(read(nodes, [], 'g', 'low', 750)).toBeCloseTo(0.5, 12)
        expect(read(nodes, [], 'g', 'status', 0)).toBe('8 beats · 4 a bar · bands')
    })

    it('Pulse is the first tenth of every beat, Strong only on a downbeat', () => {
        const nodes = [grid('g')]
        expect(read(nodes, [], 'g', 'pulse', 1040)).toBe(true)
        expect(read(nodes, [], 'g', 'pulse', 1050)).toBe(false)
        expect(read(nodes, [], 'g', 'strong', 1040)).toBe(true)
        expect(read(nodes, [], 'g', 'pulse', 1540)).toBe(true)
        expect(read(nodes, [], 'g', 'strong', 1540)).toBe(false)
        expect(read(nodes, [], 'g', 'strong', 3020)).toBe(true)
    })

    it('a wired Time wins over the clock, and the same second gives the same numbers (seekable)', () => {
        const at = (seconds, now) => {
            const nodes = [createNode('value.number', { id: 't', values: { value: seconds } }), grid('g')]
            const edges = [edge('e', 't', 'out', 'g', 'time')]
            return ['beat', 'phase', 'age', 'bar', 'low'].map((port) => read(nodes, edges, 'g', port, now))
        }
        expect(at(3.25, 0)).toEqual(at(3.25, 987654))
        expect(at(3.25, 0)).toEqual([1, 0.5, 0.25, 1, 1])
    })

    it('the analysis can come down a wire as text', () => {
        const nodes = [createNode('view.text', { id: 'txt', values: { content: ANALYSIS } }), createNode('signal.beatgrid', { id: 'g' })]
        const edges = [edge('e', 'txt', 'text', 'g', 'analysis')]
        expect(read(nodes, edges, 'g', 'count', 2000)).toBe(3)
    })
})

describe('Beat Grid — its Clock drives an Oscillator in time with the music', () => {
    it('a 1-beat Ramp Oscillator on the grid\'s clock rides the grid\'s Phase', () => {
        const nodes = [grid('g'), createNode('signal.lfo', { id: 'o', values: { beats: 1, wave: 'ramp' } })]
        const edges = [edge('e', 'g', 'clock', 'o', 'clock')]
        for (const now of [1100, 1250, 2400, 3900]) {
            const phase = read(nodes, edges, 'g', 'phase', now)
            expect(read(nodes, edges, 'o', 'saw', now)).toBeCloseTo(phase * 2 - 1, 9)
        }
    })
})
