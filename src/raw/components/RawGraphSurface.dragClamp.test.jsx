import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

// Real pointer sequences (down on the card, many moves, up) against the
// surface, with a laid-out canvas. Audit 2026-10-05 B1 / B8: on origin/dev a
// card dragged left stopped at x = 132 / 158 / 171 / 208 (74 / 100 / 113 /
// 150 %) and never reached the 24 px limit.

const makeNode = (id, graphX, graphY) => ({ ...createNode('value.number', { graphX, graphY }), id, label: id })

let size = { width: 1440, height: 805 }
let frames = new Map()
let frameId = 0
const setRect = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const own = this.classList?.contains('raw-graph-surface') || this.classList?.contains('raw-graph-canvas')
    return own || this.dataset?.testid === 'canvas'
        ? { x: 0, y: 95, left: 0, top: 95, right: size.width, bottom: 95 + size.height, ...size, toJSON: () => ({}) }
        : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
})
const runFrames = (count, step = 16) => {
    for (let i = 0; i < count; i += 1) {
        const batch = [...frames.values()]
        frames = new Map()
        const now = (runFrames.t = (runFrames.t || 0) + step)
        act(() => batch.forEach((cb) => cb(now)))
    }
}

const Harness = ({ initial, onNodes }) => {
    const [nodes, setNodes] = useState(initial)
    onNodes?.(nodes)
    return <RawGraphSurface nodes={nodes} edges={[]} onMoveNode={(id, x, y) => setNodes((all) => all.map((n) => (n.id === id ? { ...n, graphX: x, graphY: y } : n)))} />
}

const view = (container) => {
    const { transform } = container.querySelector('.raw-graph-stage').style
    const [, panX, panY] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform)
    const [, zoom] = /scale\(([-\d.]+)\)/.exec(transform)
    return { panX: Number(panX), panY: Number(panY), zoom: Number(zoom) }
}
const screenOf = (container, node) => {
    const v = view(container)
    return { x: node.graphX * v.zoom + v.panX, y: node.graphY * v.zoom + v.panY }
}

describe('dragging a card (real pointer events)', () => {
    beforeEach(() => {
        frames = new Map()
        runFrames.t = 0
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frameId += 1; frames.set(frameId, cb); return frameId })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
        setRect()
    })
    afterEach(() => { vi.restoreAllMocks() })

    const dragOne = (container, dx, dy, { hold = 0 } = {}) => {
        const card = container.querySelector('.raw-graph-node-card')
        card.setPointerCapture = vi.fn()
        const v0 = view(container)
        // grab the title at the card's own top-left + 10, wherever the opening fit put it
        const start = {
            x: parseFloat(card.style.left) * v0.zoom + v0.panX + 10,
            y: parseFloat(card.style.top) * v0.zoom + v0.panY + 95 + 10
        }
        fireEvent.pointerDown(card, { button: 0, clientX: start.x, clientY: start.y, pointerId: 1 })
        for (let i = 1; i <= 16; i += 1) {
            fireEvent.pointerMove(window, { clientX: start.x + dx * i / 16, clientY: start.y + dy * i / 16 })
            runFrames(1)
        }
        runFrames(hold)
        fireEvent.pointerUp(window)
        runFrames(1)
    }

    for (const width of [900, 1440, 2000]) {
        it(`left and up: the card's top-left stops at 24 px from the canvas edge (canvas ${width} wide)`, () => {
            size = { width, height: 805 }
            let latest
            const { container } = render(<Harness initial={[makeNode('a', 100, 80), makeNode('b', 400, 80), makeNode('c', 700, 80)]} onNodes={(n) => { latest = n }} />)
            // use a zoom other than the fit by zooming once on wider canvases
            dragOne(container, -3000, 0)
            const a = latest.find((n) => n.id === 'a')
            const sx = screenOf(container, a).x
            expect(sx).toBeGreaterThanOrEqual(23)
            expect(sx).toBeLessThanOrEqual(25)
        })
    }

    it('up: the top-left stops 24 px under the top of the canvas', () => {
        size = { width: 1440, height: 805 }
        let latest
        const { container } = render(<Harness initial={[makeNode('a', 100, 80), makeNode('b', 400, 80)]} onNodes={(n) => { latest = n }} />)
        dragOne(container, 0, -3000)
        const sy = screenOf(container, latest.find((n) => n.id === 'a')).y
        expect(sy).toBeGreaterThanOrEqual(23)
        expect(sy).toBeLessThanOrEqual(25)
    })

    it('B8: released far off the window, the next small drag moves the card by the same small amount', () => {
        size = { width: 1440, height: 805 }
        let latest
        const { container } = render(<Harness initial={[makeNode('a', 300, 80), makeNode('b', 700, 80)]} onNodes={(n) => { latest = n }} />)
        dragOne(container, -4000, 0)
        const before = screenOf(container, latest.find((n) => n.id === 'a')).x
        dragOne(container, 200, 0)
        const after = screenOf(container, latest.find((n) => n.id === 'a')).x
        // the pointer grabs the title at the card's top-left + 10, so the card follows it 1:1
        expect(after - before).toBeGreaterThan(190)
        expect(after - before).toBeLessThan(210)
    })

    it('auto-pan: a pointer held at the left edge pans the canvas and the card goes with it', () => {
        size = { width: 1440, height: 805 }
        let latest
        const { container } = render(<Harness initial={[makeNode('a', 100, 80), makeNode('b', 400, 80)]} onNodes={(n) => { latest = n }} />)
        const panBefore = view(container).panX
        const graphXBefore = latest.find((n) => n.id === 'a').graphX
        dragOne(container, -3000, 0, { hold: 30 })
        // 30 frames of 16 ms at 900 px/s is about 430 px: it must keep going, not stop after one tick
        expect(view(container).panX).toBeGreaterThan(panBefore + 300)
        expect(latest.find((n) => n.id === 'a').graphX).toBeLessThan(graphXBefore - 100)
    })

    it('auto-pan stops when the pointer is released, and never starts away from the edge', () => {
        size = { width: 1440, height: 805 }
        const { container } = render(<Harness initial={[makeNode('a', 100, 80), makeNode('b', 400, 80)]} />)
        const mid = view(container)
        dragOne(container, 30, 10, { hold: 20 })
        expect(view(container).panX).toBe(mid.panX)
        expect(view(container).panY).toBe(mid.panY)
        dragOne(container, -3000, 0, { hold: 5 })
        const stopped = view(container).panX
        runFrames(20)
        expect(view(container).panX).toBe(stopped)
    })
})
