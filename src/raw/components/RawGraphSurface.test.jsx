import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
// The floor the auto-fit will not go below; the door must survive it.
const FIT_MIN_USEFUL_ZOOM_FOR_TEST = 0.34
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

    // Entering a node was double-click only, cued by a hover-revealed chevron —
    // so on a phone there was no affordance and no gesture that worked. That is
    // fatal for container nodes like `studio`, whose whole purpose is to be
    // entered: an unenterable container is an empty box.
    it('enters a node from a single click on its enter control', () => {
        const onEnterNode = vi.fn()
        const node = makeNode('geom.cube', { id: 'cube-1' })
        const { getByRole } = render(
            <RawGraphSurface nodes={[node]} edges={[]} onEnterNode={onEnterNode} />
        )

        fireEvent.click(getByRole('button', { name: /^Enter / }))
        expect(onEnterNode).toHaveBeenCalledWith('cube-1')
    })

    // This used to assert the opposite: the enter control was HIDDEN when
    // zoomed out, because at fit-zoom a whole card is a few pixels across and a
    // tap aimed at a port landed on the control and changed scope instead of
    // starting a wire. That collision was real, but hiding the only way into a
    // container at exactly the zoom the auto-fit lands on is the wrong cure —
    // and the intermediate fix, rendering it anyway, made it 7x7 real pixels.
    //
    // The door now hangs off the card's LEFT edge, counter-scaled, so it is
    // nowhere near nearestOutputPort's 28-SCREEN-pixel grab radius on the right.
    // The collision is structural now, not a threshold, so this asserts the
    // thing the threshold was protecting instead.
    it('keeps the way in at the zoom the fit lands on, without eating a wire grab', () => {
        const node = makeNode('geom.cube', { id: 'cube-1' })
        const onEnterNode = vi.fn()
        const onCreateEdge = vi.fn()
        const { queryByRole, container } = render(
            <RawGraphSurface
                nodes={[node]}
                edges={[]}
                onEnterNode={onEnterNode}
                onCreateEdge={onCreateEdge}
                // Pinned to the exact zoom the auto-fit refuses to go below,
                // rather than counting zoom-out clicks — the fit's starting
                // point depends on how many nodes there are, which made the
                // old version of this test measure something else.
                initialZoom={FIT_MIN_USEFUL_ZOOM_FOR_TEST}
            />
        )

        // Still there — this is the regression that shipped in the first pass.
        expect(queryByRole('button', { name: /^Enter / })).toBeTruthy()

        // And it is nowhere near the output end of the card, which is what the
        // old zoom threshold was really protecting: the anchor is positioned
        // OUTSIDE the card's left edge (right: 100%), so nearestOutputPort's
        // grab radius on the right cannot reach it at any zoom.
        const anchor = container.querySelector('.raw-graph-node-door-anchor')
        expect(anchor).toBeTruthy()
        expect(anchor.parentElement.classList.contains('raw-graph-node-card')).toBe(true)
        expect(onEnterNode).not.toHaveBeenCalled()
        expect(onCreateEdge).not.toHaveBeenCalled()
    })

    it('does not start a node drag when the enter control is pressed', () => {
        const onMoveNode = vi.fn()
        const node = makeNode('geom.cube', { id: 'cube-1', graphX: 40, graphY: 30 })
        const { getByRole } = render(
            <RawGraphSurface nodes={[node]} edges={[]} onMoveNode={onMoveNode} onEnterNode={vi.fn()} />
        )

        fireEvent.pointerDown(getByRole('button', { name: /^Enter / }), { button: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: -80, clientY: -80 })
        fireEvent.pointerUp(window)
        expect(onMoveNode).not.toHaveBeenCalled()
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

    // A press near a port now starts a wire, so the opening touch of a pinch
    // landed on a card would begin dragging one and the pinch would do nothing.
    it('cancels a wire the first finger started when a second finger lands', () => {
        const onCreateEdge = vi.fn()
        const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
        const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 0 })
        const { container } = render(
            <RawGraphSurface nodes={[colorNode, cubeNode]} edges={[]} onCreateEdge={onCreateEdge} initialZoom={1} />
        )

        const surface = container.querySelector('.raw-graph-surface')
        const outputDot = container
            .querySelector('.raw-graph-node-card:nth-of-type(1)')
            .querySelector('span[title*="(color)"]')

        fireEvent.pointerDown(outputDot, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
        // Second finger: this is a pinch, not a wire.
        fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 100 })
        fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 360, clientY: 100 })
        fireEvent.pointerUp(window, { pointerId: 1, clientX: 320, clientY: 55 })
        fireEvent.pointerUp(window, { pointerId: 2 })

        expect(onCreateEdge).not.toHaveBeenCalled()
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

    // A card that holds something is a place you can go; one that does not is
    // not. Before this every card wore the same chevron, so the chevron said
    // nothing — and it disappeared entirely below CARD_CONTROL_MIN_ZOOM, which
    // is exactly where the auto-fit lands an oversized graph.
    describe('containers are legible as containers', () => {
        it('shows how many nodes a card holds', () => {
            const { container } = render(
                <RawGraphSurface
                    nodes={[makeNode('studio', { id: 'studio-1' })]}
                    edges={[]}
                    onEnterNode={() => {}}
                    childCounts={new Map([['studio-1', 4]])}
                />
            )
            const badge = container.querySelector('.raw-graph-node-child-count')
            expect(badge?.textContent).toBe('4')
            expect(container.querySelector('.raw-graph-node-door.has-contents')).toBeTruthy()
        })

        it('marks nothing on a card that holds nothing', () => {
            const { container } = render(
                <RawGraphSurface
                    nodes={[makeNode('geom.cube', { id: 'cube-1' })]}
                    edges={[]}
                    onEnterNode={() => {}}
                />
            )
            expect(container.querySelector('.raw-graph-node-door')).toBeTruthy()
            expect(container.querySelector('.raw-graph-node-child-count')).toBeNull()
            expect(container.querySelector('.raw-graph-node-door.has-contents')).toBeNull()
        })

        // Studio wraps this component read-only: no childCounts, and no
        // onEnterNode either — so it must get a card and no door at all,
        // rather than a door that goes nowhere.
        it('renders a card with no door when nothing can be entered', () => {
            const { container } = render(
                <RawGraphSurface nodes={[makeNode('studio', { id: 'studio-1' })]} edges={[]} />
            )
            expect(container.querySelector('.raw-graph-node-card')).toBeTruthy()
            expect(container.querySelector('.raw-graph-node-door')).toBeNull()
            expect(container.querySelector('.raw-graph-node-child-count')).toBeNull()
        })

        // The defect this whole rework exists for: in the card header the door
        // rode the graph's transform and measured 7x7 REAL pixels at the zoom
        // the fit lands on, while a DOM-presence test passed the entire time.
        // The anchor is counter-scaled, so the door's own box stays constant.
        it('counter-scales the door so it does not shrink with the graph', () => {
            const { container } = render(
                <RawGraphSurface
                    nodes={[makeNode('studio', { id: 'studio-1' })]}
                    edges={[]}
                    onEnterNode={() => {}}
                    initialZoom={0.34}
                />
            )
            const anchor = container.querySelector('.raw-graph-node-door-anchor')
            expect(anchor).toBeTruthy()
            // 1 / 0.34 — the exact inverse of the surface's own scale.
            const scale = Number(/scale\(([^)]+)\)/.exec(anchor.getAttribute('style'))?.[1])
            expect(scale).toBeCloseTo(1 / 0.34, 4)
        })

        it('still offers the door at the zoom the fit actually lands on', () => {
            const { container } = render(
                <RawGraphSurface
                    nodes={[makeNode('studio', { id: 'studio-1' })]}
                    edges={[]}
                    onEnterNode={() => {}}
                    initialZoom={0.34}
                />
            )
            expect(container.querySelector('.raw-graph-node-door')).toBeTruthy()
        })
    })
})

// Long-press or right-click a port dot and offer to put it on the container's
// face. Honest about itself: a long press advertises to nobody, so this is a
// shortcut for people who know it, not the way anyone discovers doorways.
describe('exposing a port on the container', () => {
    const openMenu = (container) => {
        const dot = container.querySelector('.raw-graph-port-dot--out')
        fireEvent.contextMenu(dot, { clientX: 100, clientY: 100 })
        return container.querySelector('.raw-graph-port-menu')
    }

    it('offers nothing at all when the surface cannot promote', () => {
        // Studio wraps this read-only and passes no handler.
        const { container } = render(
            <RawGraphSurface nodes={[makeNode('value.color', { id: 'c' })]} edges={[]} />
        )
        expect(openMenu(container)).toBeNull()
    })

    it('hands back the port that was held', () => {
        const onPromotePort = vi.fn()
        const node = makeNode('value.color', { id: 'c' })
        const { container } = render(
            <RawGraphSurface nodes={[node]} edges={[]} onPromotePort={onPromotePort} />
        )
        expect(openMenu(container)).toBeTruthy()
        fireEvent.click([...container.querySelectorAll('.raw-graph-port-menu button')]
            .find((button) => /Expose/.test(button.textContent)))
        expect(onPromotePort).toHaveBeenCalledWith(expect.objectContaining({
            dir: 'out',
            port: expect.objectContaining({ id: 'out' })
        }))
        expect(container.querySelector('.raw-graph-port-menu')).toBeNull()
    })

    // A press on an output dot arms a wire. If the menu leaves it armed, the
    // next release anywhere on the canvas snaps it to a port within 36px and
    // creates a plausible-looking edge nobody asked for.
    it('disarms any half-started wire when the menu opens', () => {
        const onCreateEdge = vi.fn()
        const colour = makeNode('value.color', { id: 'c', graphX: 0 })
        const cube = makeNode('geom.cube', { id: 'cube', graphX: 320 })
        const { container } = render(
            <RawGraphSurface
                nodes={[colour, cube]}
                edges={[]}
                onCreateEdge={onCreateEdge}
                onPromotePort={vi.fn()}
            />
        )
        const dot = container.querySelector('.raw-graph-port-dot--out')
        fireEvent.pointerDown(dot, { button: 0, clientX: 100, clientY: 100 })
        fireEvent.contextMenu(dot, { clientX: 100, clientY: 100 })
        // Release right on the cube's Color input — which WOULD have connected.
        const port = inputPortGraphPoint(cube, 0)
        fireEvent.pointerUp(window, clientForGraphPoint(container, port.x, port.y))
        expect(onCreateEdge).not.toHaveBeenCalled()
    })

    it('closes on cancel without promoting anything', () => {
        const onPromotePort = vi.fn()
        const { container } = render(
            <RawGraphSurface
                nodes={[makeNode('value.color', { id: 'c' })]}
                edges={[]}
                onPromotePort={onPromotePort}
            />
        )
        openMenu(container)
        fireEvent.click([...container.querySelectorAll('.raw-graph-port-menu button')]
            .find((button) => /Cancel/.test(button.textContent)))
        expect(onPromotePort).not.toHaveBeenCalled()
        expect(container.querySelector('.raw-graph-port-menu')).toBeNull()
    })
})

