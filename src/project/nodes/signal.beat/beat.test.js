import { describe, expect, it } from 'vitest'
import { createNode, getNodeType } from '../../nodeRegistry.js'
import { deriveNodeInspectorSections } from '../../graph/nodeInspectorSections.js'
import { createNodeGraphContext, evaluateNodeOutput } from '../../graph/nodeGraphRuntime.js'
import { DEFAULT_MASTER_CLOCK, findMasterBeatNode, resolveClock, wallToDocumentMs } from '../../graph/beatClock.js'

// Beat (laser Phase 2): a clock. Values at exact milliseconds of the document clock.
const beat = (id, values = {}) => createNode('signal.beat', { id, values })
const read = (nodes, nodeId, port, now, liveOutputs = null) => {
    const context = createNodeGraphContext({ nodes, edges: [] }, { now, liveOutputs })
    return evaluateNodeOutput(context.nodesById.get(nodeId), port, context)
}

describe('Beat — the beat phase against the clock epoch', () => {
    // 120 bpm, beat 0 at 1000 ms: a beat every 500 ms from there.
    const nodes = [beat('b', { bpm: 120, epoch: 1000 })]
    const at = (port, now) => read(nodes, 'b', port, now)

    it('ramp, count and the beat in the bar', () => {
        expect(at('ramp', 1000)).toBe(0)
        expect(at('ramp', 1250)).toBe(0.5)
        expect(at('count', 1499)).toBe(0)
        expect(at('count', 1500)).toBe(1)
        expect(at('beat', 1000)).toBe(1)
        expect(at('beat', 1500)).toBe(2)
        expect(at('beat', 2500)).toBe(4)
        // before the epoch the loop still runs: the beat before beat 0 is the 4th of bar -1
        expect(at('count', 750)).toBe(-1)
        expect(at('beat', 750)).toBe(4)
        expect(at('bar', 750)).toBe(-1)
    })

    it('bars, ramp over the bar, pulse for the first tenth of a period', () => {
        expect(at('bar', 2999)).toBe(0)
        expect(at('bar', 3000)).toBe(1)
        expect(at('rampBar', 2000)).toBe(0.5)
        expect(at('pulse', 1040)).toBe(true)
        expect(at('pulse', 1050)).toBe(false)
    })

    it('Period counts in beats: 2 beats a period at 120 bpm is one ramp a second', () => {
        const two = [beat('b', { bpm: 120, epoch: 0, period: 2 })]
        expect(read(two, 'b', 'ramp', 250)).toBe(0.25)
        expect(read(two, 'b', 'count', 999)).toBe(0)
        expect(read(two, 'b', 'count', 1000)).toBe(1)
        expect(read(two, 'b', 'count', 2000)).toBe(2)
    })
})

describe('Beat — one master clock, extra clocks beside it', () => {
    it('the first Beat set to Master is the master; a later one runs as an extra clock and says so', () => {
        const nodes = [beat('x', { role: 'extra', bpm: 90 }), beat('m1', { bpm: 100 }), beat('m2', { bpm: 110 })]
        const context = createNodeGraphContext({ nodes, edges: [] })
        expect(findMasterBeatNode(context)?.id).toBe('m1')
        expect(read(nodes, 'm1', 'clock', 0)).toMatchObject({ kind: 'clock', master: true, bpm: 100 })
        expect(read(nodes, 'm2', 'clock', 0)).toMatchObject({ master: false, bpm: 110 })
        expect(read(nodes, 'x', 'clock', 0)).toMatchObject({ master: false, bpm: 90 })
        expect(read(nodes, 'm2', 'status', 0)).toBe('extra clock (another Beat is the master) · 110 bpm')
        expect(read(nodes, 'm1', 'status', 0)).toBe('master clock · 100 bpm')
    })

    it('no Beat: the master clock still runs, 120 bpm from the document clock\'s origin', () => {
        const context = createNodeGraphContext({ nodes: [], edges: [] })
        expect(resolveClock(undefined, context, () => undefined)).toBe(DEFAULT_MASTER_CLOCK)
        expect(DEFAULT_MASTER_CLOCK).toMatchObject({ bpm: 120, epoch: 0 })
    })
})

describe('Beat — the /light desk only when chosen', () => {
    // The desk's clock as BeatFeed reports it, in document-clock ms (a mocked desk).
    const desk = new Map([['b:light', { bpm: 90, epoch: 200 }]])

    it('Tempo from "This node" ignores a desk that answers', () => {
        const nodes = [beat('b', { bpm: 120, source: 'own' })]
        expect(read(nodes, 'b', 'clock', 0, desk)).toMatchObject({ bpm: 120, epoch: 0, source: 'own' })
        expect(read(nodes, 'b', 'ramp', 250, desk)).toBe(0.5)
    })

    it('Tempo from "Light desk" takes the desk\'s tempo and its beat 0', () => {
        const nodes = [beat('b', { bpm: 120, source: 'light' })]
        expect(read(nodes, 'b', 'clock', 0, desk)).toMatchObject({ bpm: 90, epoch: 200, source: 'light' })
        // 90 bpm: a beat every 666.67 ms from 200 ms
        expect(read(nodes, 'b', 'ramp', 200 + 1000 / 3, desk)).toBeCloseTo(0.5, 12)
        expect(read(nodes, 'b', 'status', 0, desk)).toBe('master clock · 90 bpm from the Light desk')
    })

    it('Light desk chosen but none answers: the Beat keeps its own tempo and says why', () => {
        const nodes = [beat('b', { bpm: 120, source: 'light' })]
        expect(read(nodes, 'b', 'clock', 0, new Map())).toMatchObject({ bpm: 120, source: 'own' })
        expect(read(nodes, 'b', 'status', 0)).toBe('master clock · 120 bpm (no Light desk answers)')
    })

    it('wall time to document time: minus the stamped clock epoch, or the page origin before the stamp', () => {
        expect(wallToDocumentMs(1_700_000_005_000, 1_700_000_000_000)).toBe(5000)
        expect(wallToDocumentMs(1_700_000_005_000, 0, 1_700_000_004_000)).toBe(1000)
    })
})

describe('Beat — Clock and Tempo from are settings, not ports', () => {
    // findMasterBeatNode and RawEditor's desk poll read node.values; a port
    // there would take a wire that silently does nothing.
    it('no wire can reach role or source; the inspector still offers both as choices', () => {
        const type = getNodeType('signal.beat')
        expect(type.inputs.map((port) => port.id)).toEqual(['bpm', 'period', 'tap', 'reset'])
        expect(type.configInputs.map((port) => port.id)).toEqual(['role', 'source'])
        const fields = deriveNodeInspectorSections(beat('b')).flatMap((section) => section.fields || [])
        const byPath = Object.fromEntries(fields.map((field) => [field.path.join('.'), field]))
        expect(byPath.role).toMatchObject({ type: 'select', options: [{ value: 'master' }, { value: 'extra' }] })
        expect(byPath.source).toMatchObject({ type: 'select', options: [{ value: 'own' }, { value: 'light' }] })
        expect(beat('b').values).toMatchObject({ role: 'master', source: 'own' })
    })
})
