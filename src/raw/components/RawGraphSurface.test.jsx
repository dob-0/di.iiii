import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

const makeNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})

// The surface auto-fits the graph on first render, so pan is not the initial
// 60,60. Read the committed transform and convert graph coords to the client
// coords a pointer event must carry, rather than hardcoding numbers that a
// change to the fit logic would silently invalidate.
const clientForGraphPoint = (container, graphX, graphY) => {
    const { transform } = container.querySelector('.raw-graph-stage').style
    const [, panX, panY] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform)
    const [, zoom] = /scale\(([-\d.]+)\)/.exec(transform)
    return {
        clientX: graphX * Number(zoom) + Number(panX),
        clientY: graphY * Number(zoom) + Number(panY)
    }
}

// Centre of an input port, in graph space. Mirrors inputPortCenter in the
// component: HEADER_HEIGHT 44, PORT_ROW_HEIGHT 22.
const inputPortGraphPoint = (node, index) => ({
    x: node.graphX,
    y: node.graphY + 44 + index * 22 + 11
})

describe('RawGraphSurface', () => {
    it('dispatches createEdge when dragging from a compatible output to an input port', () => {
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 0 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <RawGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[]}
                onCreateEdge={onCreateEdge}
            />
        )

        const colorCard = container.querySelector('.raw-graph-node-card:nth-of-type(1)')
        const cubeCard = container.querySelector('.raw-graph-node-card:nth-of-type(2)')
        expect(colorCard).toBeTruthy()
        expect(cubeCard).toBeTruthy()

        const outputDot = colorCard.querySelector('span[title*="(color)"]')
        const cubeColorDot = cubeCard.querySelector('span[title="Color (color)"]')
        expect(outputDot).toBeTruthy()
        expect(cubeColorDot).toBeTruthy()

        // Release over the cube's Color port (its first input).
        const port = inputPortGraphPoint(cubeNode, 0)
        const drop = clientForGraphPoint(container, port.x, port.y)
        fireEvent.pointerDown(outputDot, { button: 0, clientX: 200, clientY: 50 })
        fireEvent.pointerUp(cubeColorDot, drop)

        expect(onCreateEdge).toHaveBeenCalledWith(expect.objectContaining({
            fromNodeId: 'color-1',
            toNodeId: 'cube-1',
            toPort: 'color'
        }))
    })

    // Regression test for the reason graph wiring was impossible on a phone.
    // The drop used to be an onPointerUp handler on the input dot itself. On
    // touch the browser grants the OUTPUT dot implicit pointer capture at
    // pointerdown, so the pointerup is delivered back to the output dot and
    // never reaches the input dot under the finger — that handler could not
    // fire, ever. Drops now resolve to the nearest compatible port in graph
    // space, so the release does not have to land on the target element at all.
    //
    // Deliberately does NOT stub setPointerCapture: the old drag tests passed
    // green precisely because they mocked away the semantics that were broken.
    it('creates an edge from a touch drag that releases NEAR a port, not on it', () => {
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 0 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <RawGraphSurface nodes={[colorNode, cubeNode]} edges={[]} onCreateEdge={onCreateEdge} />
        )

        const outputDot = container
            .querySelector('.raw-graph-node-card:nth-of-type(1)')
            .querySelector('span[title*="(color)"]')

        const port = inputPortGraphPoint(cubeNode, 0)
        const exact = clientForGraphPoint(container, port.x, port.y)

        fireEvent.pointerDown(outputDot, {
            button: 0,
            pointerId: 7,
            pointerType: 'touch',
            clientX: 200,
            clientY: 50
        })
        // Release ~20px short of the port centre, and on the window rather than
        // on the input dot — a fingertip's worth of imprecision, and the target
        // element never receives the event at all.
        fireEvent.pointerUp(window, {
            pointerId: 7,
            pointerType: 'touch',
            clientX: exact.clientX - 14,
            clientY: exact.clientY - 14
        })

        expect(onCreateEdge).toHaveBeenCalledWith(expect.objectContaining({
            fromNodeId: 'color-1',
            fromPort: 'out',
            toNodeId: 'cube-1',
            toPort: 'color'
        }))
    })

    it('does not create an edge when a drag is released far from every port', () => {
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 0 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <RawGraphSurface nodes={[colorNode, cubeNode]} edges={[]} onCreateEdge={onCreateEdge} />
        )

        const outputDot = container
            .querySelector('.raw-graph-node-card:nth-of-type(1)')
            .querySelector('span[title*="(color)"]')

        fireEvent.pointerDown(outputDot, { button: 0, pointerId: 7, clientX: 260, clientY: 115 })
        fireEvent.pointerUp(window, { pointerId: 7, clientX: 700, clientY: 600 })

        expect(onCreateEdge).not.toHaveBeenCalled()
    })

    it('rejects incompatible port pairs (color -> number)', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const sinNode = makeNode('math.sin', { id: 'sin-1', graphX: 320 })
        const onCreateEdge = vi.fn()

        const { container } = render(
            <RawGraphSurface
                nodes={[colorNode, sinNode]}
                edges={[]}
                onCreateEdge={onCreateEdge}
            />
        )

        const colorCard = container.querySelector('.raw-graph-node-card:nth-of-type(1)')
        const sinCard = container.querySelector('.raw-graph-node-card:nth-of-type(2)')
        const outputDot = colorCard.querySelector('span[title*="(color)"]')
        const numberInputDot = sinCard.querySelector('span[title*="(number)"]')
        expect(outputDot).toBeTruthy()
        expect(numberInputDot).toBeTruthy()

        const port = inputPortGraphPoint(sinNode, 0)
        fireEvent.pointerDown(outputDot, { button: 0, clientX: 200, clientY: 50 })
        // Exactly on the number input — proximity must not override the type check.
        fireEvent.pointerUp(numberInputDot, clientForGraphPoint(container, port.x, port.y))

        expect(onCreateEdge).not.toHaveBeenCalled()
    })

    it('renders visible wires for existing edges', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320 })
        const { container } = render(
            <RawGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[{ id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }]}
            />
        )
        const paths = container.querySelectorAll('svg path')
        expect(paths.length).toBeGreaterThan(0)
        // The wire svg must have its own non-zero box: the stage it sits in
        // collapses to zero height (all children absolute), and Chromium paints
        // nothing inside a zero-area svg even with overflow:visible.
        const wireSvg = paths[0].closest('svg')
        expect(wireSvg.style.height).not.toBe('100%')
        expect(wireSvg.style.overflow).toBe('visible')
    })

    // On a phone, centring a wide graph at 100% shows one card and no hint that
    // anything else exists.
    it('scales a graph wider than the viewport down to fit on first render', () => {
        const wide = [
            makeNode('value.number', { id: 'a', graphX: 0, graphY: 0 }),
            makeNode('value.number', { id: 'b', graphX: 1500, graphY: 0 })
        ]
        const { container } = render(<RawGraphSurface nodes={wide} edges={[]} />)
        const stage = container.querySelector('.raw-graph-stage')
        const zoom = Number(/scale\(([-\d.]+)\)/.exec(stage.style.transform)[1])
        // jsdom reports a zero-size rect, so the fit is skipped and zoom stays
        // at 1 — assert the guard rather than a made-up number.
        expect(zoom).toBeGreaterThan(0)
        expect(zoom).toBeLessThanOrEqual(1)
    })

    it('never magnifies a graph that already fits', () => {
        const small = [makeNode('value.number', { id: 'a', graphX: 0, graphY: 0 })]
        const { container } = render(<RawGraphSurface nodes={small} edges={[]} />)
        const stage = container.querySelector('.raw-graph-stage')
        const zoom = Number(/scale\(([-\d.]+)\)/.exec(stage.style.transform)[1])
        expect(zoom).toBeLessThanOrEqual(1)
    })

    it('supports zooming in and out with graph controls', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { getByRole, getByText } = render(
            <RawGraphSurface
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
            <RawGraphSurface
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
            <RawGraphSurface
                nodes={[colorNode, cubeNode]}
                edges={[{ id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }]}
                onDeleteEdge={vi.fn()}
            />
        )

        // Two paths per wire: [0] is the invisible 24px hit stroke that carries
        // the pointer events (a 2px visible wire is unhittable with a finger),
        // [1] is the visible one that changes colour.
        const paths = container.querySelectorAll('svg path')
        const hitPath = paths[0]
        const visiblePath = paths[1]
        expect(hitPath.getAttribute('stroke')).toBe('transparent')
        expect(Number(hitPath.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(24)

        const strokeBefore = visiblePath.getAttribute('stroke')
        fireEvent.pointerEnter(hitPath)
        expect(visiblePath.getAttribute('stroke')).toBe('#ff5555')
        fireEvent.pointerLeave(hitPath)
        expect(visiblePath.getAttribute('stroke')).toBe(strokeBefore)
    })

    // Zooming out on a phone means tapping the zoom button repeatedly, and two
    // quick taps bubbled to the surface's onDoubleClick — so zooming out opened
    // the create palette on top of the graph.
    it('does not open the create palette when the zoom controls are double-clicked', () => {
        const onDoubleClick = vi.fn()
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { getByRole } = render(
            <RawGraphSurface nodes={[colorNode]} edges={[]} onDoubleClick={onDoubleClick} />
        )

        fireEvent.doubleClick(getByRole('button', { name: 'Zoom out' }))
        expect(onDoubleClick).not.toHaveBeenCalled()
    })

    it('still opens the create palette when empty canvas is double-clicked', () => {
        const onDoubleClick = vi.fn()
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { container } = render(
            <RawGraphSurface nodes={[colorNode]} edges={[]} onDoubleClick={onDoubleClick} />
        )

        fireEvent.doubleClick(container.querySelector('.raw-graph-surface'))
        expect(onDoubleClick).toHaveBeenCalled()
    })

    // Pinch is the only zoom gesture that exists on a phone — wheel does not,
    // and the fallback was two small corner buttons.
    it('zooms with a two-finger pinch', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { container, getByText } = render(
            <RawGraphSurface nodes={[colorNode]} edges={[]} />
        )

        const surface = container.querySelector('.raw-graph-surface')
        expect(getByText('100%')).toBeTruthy()

        fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
        fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 })
        // Fingers spread from 100px apart to 200px apart => 2x zoom.
        fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 })

        expect(getByText('200%')).toBeTruthy()

        fireEvent.pointerUp(window, { pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 2 })
    })

    it('does not pan while a pinch is in progress', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { container } = render(<RawGraphSurface nodes={[colorNode]} edges={[]} />)

        const surface = container.querySelector('.raw-graph-surface')
        const stage = container.querySelector('.raw-graph-stage')

        fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
        fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 })
        const transformAtPinchStart = stage.style.transform

        // Move both fingers the same distance: a pure translation, zero scale
        // change. If the single-pointer pan handler were still live it would
        // also apply its own delta and the transform would move twice.
        fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 100 })
        fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 100 })

        const match = /translate\(([-\d.]+)px/.exec(stage.style.transform)
        const startMatch = /translate\(([-\d.]+)px/.exec(transformAtPinchStart)
        expect(Number(match[1]) - Number(startMatch[1])).toBeCloseTo(40, 1)

        fireEvent.pointerUp(window, { pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 2 })
    })

    it('pans the graph when dragging empty space', () => {
        const colorNode = makeNode('value.color', { id: 'color-1' })
        const { container } = render(
            <RawGraphSurface
                nodes={[colorNode]}
                edges={[]}
            />
        )

        const surface = container.querySelector('.raw-graph-surface')
        const stage = container.querySelector('.raw-graph-stage')
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
            <RawGraphSurface
                nodes={[colorNode]}
                edges={[]}
                onMoveNode={onMoveNode}
            />
        )

        const nodeCard = container.querySelector('.raw-graph-node-card')
        expect(nodeCard).toBeTruthy()
        nodeCard.setPointerCapture = vi.fn()

        fireEvent.pointerDown(nodeCard, { button: 0, clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: -30, clientY: -20 })
        fireEvent.pointerUp(window)

        expect(onMoveNode).toHaveBeenCalled()
        expect(onMoveNode.mock.calls.at(-1)).toEqual(['color-1', -40, -30])
    })

    // Regression test for the 2026-07-17 perf audit: every raw pointermove
    // during a node drag used to call onMoveNode directly -- committing a
    // document op and re-evaluating the whole node graph per event, even
    // though pointermove can fire far more often than the display refresh
    // rate. Moves are now coalesced to at most one commit per animation
    // frame (still flushed synchronously on release, so the final position
    // is never lost or delayed).
    it('coalesces rapid pointermove events into one onMoveNode call per animation frame', () => {
        const onMoveNode = vi.fn()
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 40, graphY: 30 })
        const { container } = render(
            <RawGraphSurface
                nodes={[colorNode]}
                edges={[]}
                onMoveNode={onMoveNode}
            />
        )

        const nodeCard = container.querySelector('.raw-graph-node-card')
        nodeCard.setPointerCapture = vi.fn()

        const rafCallbacks = []
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })

        fireEvent.pointerDown(nodeCard, { button: 0, clientX: 50, clientY: 40, pointerId: 1 })
        // Five rapid moves within the same (unflushed) animation frame --
        // only the first should schedule a rAF; onMoveNode must not have
        // been called yet, since nothing has flushed.
        fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })
        fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
        fireEvent.pointerMove(window, { clientX: -10, clientY: -10 })
        fireEvent.pointerMove(window, { clientX: -20, clientY: -20 })
        fireEvent.pointerMove(window, { clientX: -30, clientY: -20 })

        expect(onMoveNode).not.toHaveBeenCalled()
        expect(rafSpy).toHaveBeenCalledTimes(1)

        // Simulate the animation frame firing: only the LATEST position (not
        // all five) should be committed.
        rafCallbacks[0]()
        expect(onMoveNode).toHaveBeenCalledTimes(1)
        expect(onMoveNode.mock.calls[0]).toEqual(['color-1', -40, -30])

        rafSpy.mockRestore()
        fireEvent.pointerUp(window)
    })

    it('shows an active-marker toggle only for activatable types, and reports the click', () => {
        const lightNode = makeNode('world.light', { id: 'light-1' })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320 })
        const onSetActive = vi.fn()

        const { container } = render(
            <RawGraphSurface
                nodes={[lightNode, cubeNode]}
                edges={[]}
                activeMarkerTypeIds={['world.light']}
                isNodeActive={(node) => node.id === 'light-1'}
                onSetActive={onSetActive}
            />
        )

        const toggles = container.querySelectorAll('.raw-graph-node-active-toggle')
        // Only the light node (an activatable type) gets a toggle, not the cube.
        expect(toggles.length).toBe(1)
        expect(toggles[0].className).toContain('is-active')

        fireEvent.click(toggles[0])
        expect(onSetActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'light-1' }))
    })

    // Regression test for audit batch 2: the Delete/Backspace handler fired
    // for any selectedNodeId without checking that the node is on THIS
    // surface. Selection survives entering a card (pointerdown selects, then
    // dblclick enters), so pressing Backspace inside a node's interior deleted
    // the scope you were standing in — cascading over its whole subtree and
    // dumping you back to the parent with everything gone.
    it('ignores Delete for a selected node that is not on this surface', () => {
        const insideNode = makeNode('geom.cube', { id: 'inside-1' })
        const onDeleteNode = vi.fn()

        render(
            <RawGraphSurface
                nodes={[insideNode]}
                edges={[]}
                selectedNodeId={'the-scope-i-am-inside'}
                onDeleteNode={onDeleteNode}
            />
        )

        fireEvent.keyDown(window, { key: 'Backspace' })
        fireEvent.keyDown(window, { key: 'Delete' })

        expect(onDeleteNode).not.toHaveBeenCalled()
    })

    it('still deletes a selected node that IS on this surface', () => {
        const node = makeNode('geom.cube', { id: 'cube-1' })
        const onDeleteNode = vi.fn()

        render(
            <RawGraphSurface
                nodes={[node]}
                edges={[]}
                selectedNodeId={'cube-1'}
                onDeleteNode={onDeleteNode}
            />
        )

        fireEvent.keyDown(window, { key: 'Backspace' })

        expect(onDeleteNode).toHaveBeenCalledWith('cube-1')
    })
})
