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
