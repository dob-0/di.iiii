import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import {
    createNodeGraphContext,
    evaluateNodeInput,
    evaluateNodeInputs,
    evaluateNodeOutput
} from './nodeGraphRuntime.js'

describe('nodeGraphRuntime', () => {
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
})
