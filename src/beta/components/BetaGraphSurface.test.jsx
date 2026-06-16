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

    it('supports zooming in and out with graph controls', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { getByRole, getByText } = render(
            <BetaGraphSurface
                nodes={[colorNode]}
                edges={[]}
            />
        )

        expect(getByText('100%')).toBeTruthy()
        fireEvent.click(getByRole('button', { name: 'Zoom in' }))
        expect(getByText('110%')).toBeTruthy()
        fireEvent.click(getByRole('button', { name: 'Zoom out' }))
        expect(getByText('100%')).toBeTruthy()
    })

    it('calls onDeleteEdge when a wire path is clicked', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320 })
        const onDeleteEdge = vi.fn()

        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[{ id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }]}
                onDeleteEdge={onDeleteEdge}
            />
        )

        const wire = container.querySelector('svg path')
        expect(wire).toBeTruthy()
        fireEvent.click(wire)
        expect(onDeleteEdge).toHaveBeenCalledWith('edge-1')
    })

    it('highlights a wire in red on hover and restores on leave', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320 })

        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[{ id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }]}
                onDeleteEdge={vi.fn()}
            />
        )

        const wire = container.querySelector('svg path')
        const strokeBefore = wire.getAttribute('stroke')
        fireEvent.pointerEnter(wire)
        expect(wire.getAttribute('stroke')).toBe('#ff5555')
        fireEvent.pointerLeave(wire)
        expect(wire.getAttribute('stroke')).toBe(strokeBefore)
    })

    it('pans the graph when dragging empty space', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode]}
                edges={[]}
            />
        )

        const surface = container.querySelector('.beta-graph-surface')
        const stage = container.querySelector('.beta-graph-stage')
        expect(surface).toBeTruthy()
        expect(stage).toBeTruthy()

        const transformBefore = stage.style.transform

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 180 })
        fireEvent.pointerMove(window, { clientX: 250, clientY: 220 })
        fireEvent.pointerUp(window)

        const transformAfter = stage.style.transform
        // pan should have moved — transforms must differ
        expect(transformAfter).not.toBe(transformBefore)
    })

    it('allows dragging nodes into negative graph coordinates', () => {
        const onMoveNode = vi.fn()
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 40, graphY: 30 })
        const { container } = render(
            <BetaGraphSurface
                nodes={[colorNode]}
                edges={[]}
                onMoveNode={onMoveNode}
            />
        )

        const nodeCard = container.querySelector('.beta-graph-node-card')
        expect(nodeCard).toBeTruthy()
        nodeCard.setPointerCapture = vi.fn()

        fireEvent.pointerDown(nodeCard, { button: 0, clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: -30, clientY: -20 })
        fireEvent.pointerUp(window)

        expect(onMoveNode).toHaveBeenCalled()
        expect(onMoveNode.mock.calls.at(-1)).toEqual(['color-1', -40, -30])
    })
})
