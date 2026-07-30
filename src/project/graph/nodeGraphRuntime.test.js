import { describe, expect, it, vi } from 'vitest'
import { createEdge, createNode } from '../nodeRegistry.js'
import {
    createNodeGraphContext,
    evaluateNodeInput,
    evaluateNodeInputs,
    evaluateNodeOutput
} from './nodeGraphRuntime.js'

describe('nodeGraphRuntime', () => {
    // Regression test for the 2026-07-17 perf audit: evaluateNodeInput did a
    // linear edges.find() scan per input port, O(E) per lookup. createNode
    // GraphContext now builds an edgesByTarget index once per pass so the
    // lookup is an O(1) Map get instead.
    it('createNodeGraphContext builds an edgesByTarget index, and evaluateNodeInput uses it', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const edge = createEdge('color-1', 'out', 'cube-1', 'color')
        const context = createNodeGraphContext({ nodes: [color, cube], edges: [edge] })

        expect(context.edgesByTarget).toBeInstanceOf(Map)
        expect(context.edgesByTarget.get('cube-1:color')).toBe(edge)

        const findSpy = vi.spyOn(context.edges, 'find')
        expect(evaluateNodeInput(cube, 'color', context)).toBe('#00ff00')
        expect(findSpy).not.toHaveBeenCalled()
    })

    it('falls back to a linear edge scan for a hand-built context with no edgesByTarget', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const edge = createEdge('color-1', 'out', 'cube-1', 'color')
        const handBuiltContext = {
            nodesById: new Map([['color-1', color], ['cube-1', cube]]),
            edges: [edge]
        }

        expect(evaluateNodeInput(cube, 'color', handBuiltContext)).toBe('#00ff00')
    })

    it('resolves source outputs into render-node inputs', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const context = createNodeGraphContext({
            nodes: [color, cube],
            edges: [createEdge('color-1', 'out', 'cube-1', 'color')]
        })

        expect(evaluateNodeInput(cube, 'color', context)).toBe('#00ff00')
    })

    it('evaluates math nodes through chained edges', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 2 } })
        const b = createNode('value.number', { id: 'b', values: { value: 3 } })
        const add = createNode('math.add', { id: 'add' })
        const context = createNodeGraphContext({
            nodes: [a, b, add],
            edges: [
                createEdge('a', 'out', 'add', 'a'),
                createEdge('b', 'out', 'add', 'b')
            ]
        })

        expect(evaluateNodeOutput(add, 'out', context)).toBe(5)
    })

    it('evaluates subtract/divide/mod/power operators', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 9 } })
        const b = createNode('value.number', { id: 'b', values: { value: 4 } })
        const subtract = createNode('math.subtract', { id: 'subtract' })
        const divide = createNode('math.divide', { id: 'divide' })
        const mod = createNode('math.mod', { id: 'mod' })
        const pow = createNode('math.pow', { id: 'pow' })
        const context = createNodeGraphContext({
            nodes: [a, b, subtract, divide, mod, pow],
            edges: [
                createEdge('a', 'out', 'subtract', 'a'),
                createEdge('b', 'out', 'subtract', 'b'),
                createEdge('a', 'out', 'divide', 'a'),
                createEdge('b', 'out', 'divide', 'b'),
                createEdge('a', 'out', 'mod', 'a'),
                createEdge('b', 'out', 'mod', 'b'),
                createEdge('a', 'out', 'pow', 'a'),
                createEdge('b', 'out', 'pow', 'b')
            ]
        })

        expect(evaluateNodeOutput(subtract, 'out', context)).toBe(5)
        expect(evaluateNodeOutput(divide, 'out', context)).toBe(2.25)
        expect(evaluateNodeOutput(mod, 'out', context)).toBe(1)
        expect(evaluateNodeOutput(pow, 'out', context)).toBe(6561)
    })

    it('returns zero for divide/mod by zero', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 10 } })
        const zero = createNode('value.number', { id: 'zero', values: { value: 0 } })
        const divide = createNode('math.divide', { id: 'divide' })
        const mod = createNode('math.mod', { id: 'mod' })
        const context = createNodeGraphContext({
            nodes: [a, zero, divide, mod],
            edges: [
                createEdge('a', 'out', 'divide', 'a'),
                createEdge('zero', 'out', 'divide', 'b'),
                createEdge('a', 'out', 'mod', 'a'),
                createEdge('zero', 'out', 'mod', 'b')
            ]
        })

        expect(evaluateNodeOutput(divide, 'out', context)).toBe(0)
        expect(evaluateNodeOutput(mod, 'out', context)).toBe(0)
    })

    it('resolves full input sets for view nodes, including string content', () => {
        const text = createNode('value.string', { id: 'text-1', values: { value: 'Hello graph' } })
        const panel = createNode('view.text', { id: 'panel-1' })
        const context = createNodeGraphContext({
            nodes: [text, panel],
            edges: [createEdge('text-1', 'out', 'panel-1', 'content')]
        })

        expect(evaluateNodeInputs(panel, context).content).toBe('Hello graph')
    })

    // Regression test for audit finding #23: a shared upstream node (here,
    // `sin` feeding both `left` and `right`) was recomputed once per
    // consumer within a single evaluation pass instead of once per pass.
    // Spying on Math.sin (the only thing `math.sin` calls) makes the
    // recomputation directly observable without inspecting internals.
    it('memoizes a shared upstream node within one evaluation pass', () => {
        const sinSpy = vi.spyOn(Math, 'sin')
        const angle = createNode('value.number', { id: 'angle', values: { value: 1 } })
        const sin = createNode('math.sin', { id: 'sin' })
        const left = createNode('math.add', { id: 'left' })
        const right = createNode('math.add', { id: 'right' })
        const context = createNodeGraphContext({
            nodes: [angle, sin, left, right],
            edges: [
                createEdge('angle', 'out', 'sin', 'in'),
                createEdge('sin', 'out', 'left', 'a'),
                createEdge('sin', 'out', 'right', 'a')
            ]
        })

        const leftOut = evaluateNodeOutput(left, 'out', context)
        const rightOut = evaluateNodeOutput(right, 'out', context)

        expect(leftOut).toBe(rightOut)
        expect(sinSpy).toHaveBeenCalledTimes(1)

        sinSpy.mockRestore()
    })
})

describe('time node', () => {
    const timeNode = { id: 't1', typeId: 'time', values: {} }

    it('outputs elapsed seconds from the injected clock', () => {
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] }, { now: 2500 })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx)).toBe(2.5)
    })

    it('is a stopped clock, not undefined, when no clock is injected', () => {
        // Regression: `time` used to have no case at all and fell through to
        // `default`, returning undefined and poisoning every downstream math node.
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx)).toBe(0)
        expect(evaluateNodeOutput(timeNode, 'sin', ctx)).toBe(0)
        expect(evaluateNodeOutput(timeNode, 'beat', ctx)).toBe(0)
    })

    it('sin/cos trace a full cycle per beat at the given bpm', () => {
        // 60 bpm = 1 beat/sec, so t=0.25s is a quarter turn.
        const node = { ...timeNode, values: { bpm: 60 } }
        const at = (ms) => createNodeGraphContext({ nodes: [node], edges: [] }, { now: ms })
        expect(evaluateNodeOutput(node, 'sin', at(0))).toBeCloseTo(0, 6)
        expect(evaluateNodeOutput(node, 'cos', at(0))).toBeCloseTo(1, 6)
        expect(evaluateNodeOutput(node, 'sin', at(250))).toBeCloseTo(1, 6)
        expect(evaluateNodeOutput(node, 'sin', at(1000))).toBeCloseTo(0, 6)
    })

    it('beat counts up once per beat and never goes backwards', () => {
        const node = { ...timeNode, values: { bpm: 120 } }  // 2 beats/sec
        const beatAt = (ms) => evaluateNodeOutput(
            node, 'beat', createNodeGraphContext({ nodes: [node], edges: [] }, { now: ms })
        )
        expect(beatAt(0)).toBe(0)
        expect(beatAt(499)).toBe(0)
        expect(beatAt(500)).toBe(1)
        expect(beatAt(2000)).toBe(4)
    })

    it('clamps a zero or negative bpm instead of freezing or running backwards', () => {
        for (const bpm of [0, -120]) {
            const node = { ...timeNode, values: { bpm } }
            const ctx = createNodeGraphContext({ nodes: [node], edges: [] }, { now: 60000 })
            const beat = evaluateNodeOutput(node, 'beat', ctx)
            expect(Number.isFinite(beat)).toBe(true)
            expect(beat).toBeGreaterThanOrEqual(0)
        }
    })

    it('holds one value for the whole pass so two readers cannot disagree', () => {
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] }, { now: 1234 })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx))
            .toBe(evaluateNodeOutput(timeNode, 'elapsed', ctx))
    })

    it('drives a downstream math node — the point of having a clock', () => {
        const time = { id: 't', typeId: 'time', values: { bpm: 60 } }
        const add = { id: 'a', typeId: 'math.add', values: { b: 10 } }
        const edge = { fromNodeId: 't', fromPort: 'elapsed', toNodeId: 'a', toPort: 'a' }
        const ctx = createNodeGraphContext({ nodes: [time, add], edges: [edge] }, { now: 3000 })
        expect(evaluateNodeOutput(add, 'out', ctx)).toBe(13)
    })
})
