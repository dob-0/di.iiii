import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createEdge, createNode, getNodeType } from '../../nodeRegistry.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeOutput } from '../../graph/nodeGraphRuntime.js'
import { hasClockNode } from '../../graph/useGraphClock.js'
import { seedOf } from '../../../shared/waves.js'

const require = createRequire(import.meta.url)
const deskLfo = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../serverXR/src/lighting/lfo.js'))

// Oscillator v2 (laser Phase 2). Every value is asserted at an exact
// millisecond, the way the light desk's lfo tests do.
const lfo = (id, values = {}) => createNode('signal.lfo', { id, values })
const beat = (id, values = {}) => createNode('signal.beat', { id, values })
const read = (doc, nodeId, port, now, extra = {}) => {
    const context = createNodeGraphContext(doc, { now, ...extra })
    return evaluateNodeOutput(context.nodesById.get(nodeId), port, context)
}

describe('Oscillator — the Out wave at exact milliseconds (1 Hz)', () => {
    const at = (values, now) => read({ nodes: [lfo('o', { frequency: 1, ...values })], edges: [] }, 'o', 'out', now)

    it('sine, triangle, ramp, square, pulse', () => {
        expect(at({ wave: 'sine' }, 0)).toBe(0)
        expect(at({ wave: 'sine' }, 250)).toBe(1)
        expect(at({ wave: 'sine' }, 750)).toBe(-1)
        expect(at({ wave: 'triangle' }, 0)).toBe(-1)
        expect(at({ wave: 'triangle' }, 250)).toBe(0)
        expect(at({ wave: 'triangle' }, 500)).toBe(1)
        expect(at({ wave: 'ramp' }, 250)).toBe(-0.5)
        expect(at({ wave: 'square' }, 250)).toBe(1)
        expect(at({ wave: 'square' }, 600)).toBe(-1)
        expect(at({ wave: 'pulse' }, 50)).toBe(1)
        expect(at({ wave: 'pulse' }, 150)).toBe(-1)
    })

    it('amplitude scales, offset moves, bias leans', () => {
        expect(at({ wave: 'sine', amplitude: 2, offset: 0.5 }, 250)).toBe(2.5)
        expect(at({ wave: 'sine', amplitude: 0.5, offset: 0.5 }, 750)).toBe(0)
        expect(at({ wave: 'sine', amplitude: 0.5, offset: 0.5 }, 250)).toBe(1)
        // bias 0.5: the triangle's peak moves from 500 ms to 750 ms, the square's edge likewise
        expect(at({ wave: 'triangle', bias: 0.5 }, 750)).toBe(1)
        expect(at({ wave: 'triangle', bias: 0.5 }, 375)).toBe(0)
        expect(at({ wave: 'square', bias: 0.5 }, 700)).toBe(1)
        expect(at({ wave: 'square', bias: 0.5 }, 800)).toBe(-1)
    })

    it('sample & hold is the light desk\'s random, one value per cycle', () => {
        const values = { wave: 'hold', frequency: 2 }
        const desk = (now) => deskLfo.lfoWave('random', now, 500, 0, seedOf('o')) * 2 - 1
        for (const now of [0, 100, 475, 500, 1225, 9000]) expect(at(values, now)).toBe(desk(now))
        expect(at(values, 25)).toBe(at(values, 475))
    })
})

describe('Oscillator — the cycle in beats of a clock', () => {
    it('1 beat per cycle at 120 bpm is 2 Hz (no Beat node: the master clock is 120 bpm)', () => {
        const doc = { nodes: [lfo('o', { beats: 1 }), lfo('hz', { frequency: 2 })], edges: [] }
        expect(read(doc, 'o', 'out', 125)).toBe(1)
        expect(read(doc, 'o', 'out', 375)).toBe(-1)
        for (let now = 0; now < 4000; now += 37) {
            expect(read(doc, 'o', 'sine', now)).toBeCloseTo(read(doc, 'hz', 'sine', now), 12)
        }
    })

    it('follows the master Beat\'s tempo and its beat 0 (the clock epoch)', () => {
        const doc = { nodes: [beat('m', { bpm: 60, epoch: 1000 }), lfo('o', { beats: 2 })], edges: [] }
        // 60 bpm, 2 beats a cycle: a 2000 ms cycle starting at 1000 ms
        expect(read(doc, 'o', 'out', 1000)).toBe(0)
        expect(read(doc, 'o', 'out', 1500)).toBe(1)
        expect(read(doc, 'o', 'out', 2500)).toBe(-1)
    })

    it('an Oscillator on an extra clock follows that clock; an unwired one stays on the master', () => {
        const doc = {
            nodes: [beat('m', { bpm: 120 }), beat('x', { bpm: 60, role: 'extra' }), lfo('onX', { beats: 1 }), lfo('onM', { beats: 1 })],
            edges: [createEdge('x', 'clock', 'onX', 'clock')]
        }
        expect(read(doc, 'onX', 'out', 250)).toBe(1)
        expect(read(doc, 'onX', 'out', 125)).toBeCloseTo(Math.SQRT1_2, 12)
        expect(read(doc, 'onM', 'out', 125)).toBe(1)
    })

    it('beats are held to ¼ … 64, like the desk', () => {
        const doc = { nodes: [lfo('o', { beats: 0.01 }), lfo('q', { beats: 0.25 })], edges: [] }
        for (const now of [10, 31, 77]) expect(read(doc, 'o', 'out', now)).toBe(read(doc, 'q', 'out', now))
    })

    it('Reset restarts the cycle at that moment (frameMemory, per window)', () => {
        const memory = createFrameMemory()
        const nodes = (reset) => [lfo('o', { frequency: 1, reset })]
        expect(read({ nodes: nodes(false), edges: [] }, 'o', 'sine', 300, { frameMemory: memory })).toBeCloseTo(Math.sin(0.6 * Math.PI), 12)
        expect(read({ nodes: nodes(true), edges: [] }, 'o', 'sine', 300, { frameMemory: memory })).toBe(0)
        expect(read({ nodes: nodes(true), edges: [] }, 'o', 'sine', 550, { frameMemory: memory })).toBe(1)
    })

    it('Reset fires on a rising count too, the Beat\'s rule: a Counter wired in restarts it on every count', () => {
        const memory = createFrameMemory()
        const at = (reset, now) => read({ nodes: [lfo('o', { frequency: 1, reset })], edges: [] }, 'o', 'saw', now, { frameMemory: memory })
        expect(at(0, 100)).toBeCloseTo(-0.8, 12)
        expect(at(1, 200)).toBe(-1)            // 0 → 1: restart at 200
        expect(at(1, 450)).toBeCloseTo(-0.5, 12) // held at 1: no restart
        expect(at(2, 700)).toBe(-1)            // 1 → 2 while truthy: restart at 700
        expect(at(2, 950)).toBeCloseTo(-0.5, 12)
    })
})

describe('Oscillator — an existing document does not move', () => {
    // The runtime as it was on dev before Phase 2, copied verbatim.
    const before = (node, portId, now) => {
        const frequency = node.values.frequency ?? 1
        const phase = node.values.phase ?? 0
        const t = (now / 1000) * frequency + phase
        const cycle = t - Math.floor(t)
        if (portId === 'sine') return Math.sin(t * Math.PI * 2)
        if (portId === 'square') return cycle < 0.5 ? 1 : -1
        if (portId === 'triangle') return 1 - 4 * Math.abs(cycle - 0.5)
        if (portId === 'saw') return cycle * 2 - 1
        return undefined
    }

    it('the four old outputs are bit-identical over 20 000 samples, with a Beat in the project too', () => {
        // An old node: only the two values the old Oscillator had, no new keys.
        const old = { id: 'old', typeId: 'signal.lfo', values: { frequency: 0.37, phase: 0.1 }, parentId: null }
        const bare = { id: 'bare', typeId: 'signal.lfo', values: {}, parentId: null }
        const doc = { nodes: [old, bare, beat('m', { bpm: 97, epoch: 333 })], edges: [] }
        const memory = createFrameMemory()
        let compared = 0
        for (let now = 0; now < 5e6; now += 1000.37) {
            for (const node of [old, bare]) {
                for (const port of ['sine', 'square', 'triangle', 'saw']) {
                    expect(Object.is(read(doc, node.id, port, now, { frameMemory: memory }), before(node, port, now))).toBe(true)
                    compared++
                }
            }
        }
        expect(compared).toBe(39992)
    })

    it('every new input is appended after the old two, and its default is the inert one', () => {
        const ids = getNodeType('signal.lfo').inputs.map((port) => port.id)
        expect(ids).toEqual(['frequency', 'phase', 'wave', 'amplitude', 'offset', 'bias', 'beats', 'clock', 'reset'])
        const defaults = Object.fromEntries(getNodeType('signal.lfo').inputs.map((port) => [port.id, port.default]))
        expect(defaults).toMatchObject({ amplitude: 1, offset: 0, bias: 0, beats: 0 })
        expect(getNodeType('signal.lfo').outputs.map((port) => port.id)).toEqual(['sine', 'square', 'triangle', 'saw', 'out'])
    })

    it('a Beat alone starts the per-frame clock (CLOCK_DRIVEN_TYPE_IDS)', () => {
        expect(hasClockNode([{ typeId: 'signal.beat' }])).toBe(true)
    })
})
