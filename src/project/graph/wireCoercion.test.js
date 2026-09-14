import { describe, expect, it } from 'vitest'
import { arePortsCompatible, createEdge, createNode } from '../nodeRegistry.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeInput, evaluateNodeOutput } from './nodeGraphRuntime.js'
import { coerceWireValue, parseTypedValue, toBoolean } from './wireCoercion.js'

const pass = (document, { now = 0, liveOutputs = null, frameMemory = null } = {}) => (
    createNodeGraphContext(document, { now, liveOutputs, frameMemory })
)

describe('wire compatibility — a TouchDesigner hand', () => {
    it('lets a number or a signal switch a boolean, and nothing else new', () => {
        expect(arePortsCompatible('number', 'boolean')).toBe(true)
        expect(arePortsCompatible('signal', 'boolean')).toBe(true)
        expect(arePortsCompatible('boolean', 'geometry')).toBe(false)
        expect(arePortsCompatible('texture', 'boolean')).toBe(false)
        expect(arePortsCompatible('string', 'boolean')).toBe(false)
    })
})

describe('toBoolean / parseTypedValue', () => {
    it('reads typed words as people mean them', () => {
        for (const off of ['0', 'false', 'FALSE', ' off ', 'no', '', 0, 0.5, null, undefined, false]) {
            expect(toBoolean(off)).toBe(false)
        }
        for (const on of ['1', 'true', 'yes', 'go', 0.51, 1, true]) {
            expect(toBoolean(on)).toBe(true)
        }
    })

    it('turns numeric text into numbers and leaves words alone', () => {
        expect(parseTypedValue('0.25')).toBe(0.25)
        expect(parseTypedValue('-3')).toBe(-3)
        expect(parseTypedValue('false')).toBe(false)
        expect(parseTypedValue('#ff0000')).toBe('#ff0000')
        expect(parseTypedValue('hello')).toBe('hello')
        expect(coerceWireValue(0.7, 'number', 'boolean')).toBe(true)
        expect(coerceWireValue('4', 'any', 'number')).toBe(4)
    })
})

describe('number -> boolean wires', () => {
    it('an LFO above one half opens a Toggle-style switch; below it is off', () => {
        const number = createNode('value.number', { id: 'n', values: { value: 0.3 } })
        const toggle = createNode('logic.toggle', { id: 't' })
        const edge = createEdge('n', 'out', 't', 'flip')
        const low = pass({ nodes: [number, toggle], edges: [edge] })
        expect(evaluateNodeInput(toggle, 'flip', low)).toBe(false)

        const high = pass({ nodes: [{ ...number, values: { value: 0.9 } }, toggle], edges: [edge] })
        expect(evaluateNodeInput(toggle, 'flip', high)).toBe(true)
    })
})

describe('signal -> boolean wires (a signal is a rising count)', () => {
    it('Time beat drives a Counter: one count per beat, never per frame', () => {
        const time = createNode('time', { id: 'clock', values: { bpm: 60 } })
        const counter = createNode('signal.counter', { id: 'c' })
        const document = { nodes: [time, counter], edges: [createEdge('clock', 'beat', 'c', 'count')] }
        const frameMemory = createFrameMemory()
        const read = (now) => evaluateNodeOutput(counter, 'out', pass(document, { now, frameMemory }))

        expect(read(0)).toBe(0) // first sight of the count is not a beat
        expect(read(500)).toBe(0) // same beat
        expect(read(1000)).toBe(1) // beat 1
        expect(read(1016)).toBe(1) // still beat 1, a frame later
        expect(read(2000)).toBe(2)
        expect(read(3000)).toBe(3)
    })

    it('MIDI trigger counts every message, even in consecutive passes', () => {
        const midi = createNode('device.midi.in', { id: 'm' })
        const counter = createNode('signal.counter', { id: 'c' })
        const document = { nodes: [midi, counter], edges: [createEdge('m', 'trigger', 'c', 'count')] }
        const frameMemory = createFrameMemory()
        const read = (count) => evaluateNodeOutput(counter, 'out', pass(document, {
            frameMemory,
            liveOutputs: new Map([['m:trigger', count]])
        }))

        expect(read(0)).toBe(0)
        expect(read(1)).toBe(1)
        expect(read(2)).toBe(2) // no quiet pass in between: still counts
        expect(read(3)).toBe(3)
        expect(read(3)).toBe(3)
    })

    it('one pass gives one answer, however often the input is read', () => {
        const midi = createNode('device.midi.in', { id: 'm' })
        const toggle = createNode('logic.toggle', { id: 't' })
        const document = { nodes: [midi, toggle], edges: [createEdge('m', 'trigger', 't', 'flip')] }
        const frameMemory = createFrameMemory()
        pass(document, { frameMemory, liveOutputs: new Map([['m:trigger', 4]]) })
        evaluateNodeInput(toggle, 'flip', pass(document, { frameMemory, liveOutputs: new Map([['m:trigger', 4]]) }))
        const context = pass(document, { frameMemory, liveOutputs: new Map([['m:trigger', 5]]) })
        expect(evaluateNodeInput(toggle, 'flip', context)).toBe(true)
        expect(evaluateNodeInput(toggle, 'flip', context)).toBe(true)
        expect(evaluateNodeOutput(toggle, 'out', context)).toBe(true)
    })

    it('without memory a signal never fires (one-off reads stay pure)', () => {
        const midi = createNode('device.midi.in', { id: 'm' })
        const trigger = createNode('signal.trigger', { id: 'tr' })
        const document = { nodes: [midi, trigger], edges: [createEdge('m', 'trigger', 'tr', 'fire')] }
        expect(evaluateNodeInput(trigger, 'fire', pass(document, { liveOutputs: new Map([['m:trigger', 9]]) }))).toBe(false)
    })
})

describe('`any` inputs coerce by what is typed', () => {
    it('Mix lerps numbers typed as text instead of hard-switching', () => {
        const mix = createNode('math.mix', { id: 'mix', values: { a: '0', b: '10', t: 0.25 } })
        expect(evaluateNodeOutput(mix, 'out', pass({ nodes: [mix], edges: [] }))).toBe(2.5)
    })

    it('"0" and "false" typed into DMX Blackout read as off, not as a truthy string', () => {
        const dmx = createNode('device.dmx.out', { id: 'd', values: { blackout: 'false' } })
        const context = pass({ nodes: [dmx], edges: [] })
        expect(evaluateNodeInput(dmx, 'blackout', context)).toBe(false)
        const zero = { ...dmx, values: { blackout: '0' } }
        expect(evaluateNodeInput(zero, 'blackout', pass({ nodes: [zero], edges: [] }))).toBe(0)
        expect(toBoolean(evaluateNodeInput(zero, 'blackout', pass({ nodes: [zero], edges: [] })))).toBe(false)
    })

    it('a string port keeps its text — only `any` fields are parsed', () => {
        const text = createNode('value.string', { id: 's', values: { value: '42' } })
        const view = createNode('view.text', { id: 'v' })
        const context = pass({ nodes: [text, view], edges: [createEdge('s', 'out', 'v', 'content')] })
        expect(evaluateNodeInput(view, 'content', context)).toBe('42')
    })
})
