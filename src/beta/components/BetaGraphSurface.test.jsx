import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BetaGraphSurface from './BetaGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

const makeNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})

describe('BetaGraphSurface', () => {
    it('dispatches createEdge when dragging from a compatible output to an input port', () => {
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 0 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[]}
                onCreateEdge={onCreateEdge}
            />
        )

        const colorCard = container.querySelector('.beta-graph-node-card:nth-of-type(1)')
        const cubeCard = container.querySelector('.beta-graph-node-card:nth-of-type(2)')
        expect(colorCard).toBeTruthy()
        expect(cubeCard).toBeTruthy()

        const outputDot = colorCard.querySelector('span[title*="(color)"]')
        const cubeColorDot = cubeCard.querySelector('span[title="Color (color)"]')
        expect(outputDot).toBeTruthy()
        expect(cubeColorDot).toBeTruthy()

        fireEvent.pointerDown(outputDot, { button: 0, clientX: 200, clientY: 50 })
        fireEvent.pointerUp(cubeColorDot, { clientX: 320, clientY: 50 })

        expect(onCreateEdge).toHaveBeenCalledWith(expect.objectContaining({
            fromNodeId: 'color-1',
            toNodeId: 'cube-1',
            toPort: 'color'
        }))
    })

    it('rejects incompatible port pairs (color -> number)', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const sinNode = makeNode('math.sin', { id: 'sin-1', graphX: 320 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode, sinNode]}
                edges={[]}
                onCreateEdge={onCreateEdge}
            />
        )

        const colorCard = container.querySelector('.beta-graph-node-card:nth-of-type(1)')
        const sinCard = container.querySelector('.beta-graph-node-card:nth-of-type(2)')
        const outputDot = colorCard.querySelector('span[title*="(color)"]')
        const numberInputDot = sinCard.querySelector('span[title*="(number)"]')
        expect(outputDot).toBeTruthy()
        expect(numberInputDot).toBeTruthy()

        fireEvent.pointerDown(outputDot, { button: 0, clientX: 200, clientY: 50 })
        fireEvent.pointerUp(numberInputDot, { clientX: 320, clientY: 50 })

        expect(onCreateEdge).not.toHaveBeenCalled()
    })

    it('renders visible wires for existing edges', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320 })
        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[{ id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }]}
            />
        )
        const paths = container.querySelectorAll('svg path')
        expect(paths.length).toBeGreaterThan(0)
    })
})
