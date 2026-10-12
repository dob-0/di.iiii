import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

// P6 (Raw "feels laggy"): a pan used to set React state on every pointer move,
// which re-rendered every card and, through onViewportChange, the whole editor
// (profiled 2026-10-07, 150 cards: React element creation + diff were >70 % of
// the busy time). Now the move goes to the stage's transform, and the state
// catches up once on release — unless a window follows the canvas.

const nodes = Array.from({ length: 12 }, (_, i) => ({
    ...createNode('value.number', { graphX: (i % 4) * 260, graphY: Math.floor(i / 4) * 200 }),
    id: `n${i}`
}))
let spy
beforeEach(() => {
    spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => (
        { left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0 }))
})
afterEach(() => spy?.mockRestore())

const stage = (c) => c.querySelector('.raw-graph-stage')
const pan = (container, moves) => {
    fireEvent.pointerDown(container.firstChild, { button: 0, pointerId: 1, clientX: 900, clientY: 700 })
    moves.forEach(([x, y]) => act(() => { fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y }) }))
}

describe('panning the canvas (P6)', () => {
    it('moves the stage on every pointer move but publishes the viewport once, on release', () => {
        const onViewportChange = vi.fn()
        const { container } = render(<RawGraphSurface nodes={nodes} edges={[]} onViewportChange={onViewportChange} followViewportLive={false} />)
        const before = stage(container).style.transform
        onViewportChange.mockClear()
        pan(container, [[910, 710], [940, 730], [1000, 760], [1050, 790]])
        expect(stage(container).style.transform).not.toBe(before)
        expect(onViewportChange).not.toHaveBeenCalled()
        act(() => { fireEvent.pointerUp(window, { pointerId: 1 }) })
        expect(onViewportChange).toHaveBeenCalled()
        const last = onViewportChange.mock.calls.at(-1)[0]
        const [, px, py] = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(stage(container).style.transform)
        expect(last.panX).toBeCloseTo(Number(px), 3)
        expect(last.panY).toBeCloseTo(Number(py), 3)
    })

    it('keeps publishing every move when a window follows the canvas', () => {
        const onViewportChange = vi.fn()
        const { container } = render(<RawGraphSurface nodes={nodes} edges={[]} onViewportChange={onViewportChange} followViewportLive />)
        onViewportChange.mockClear()
        pan(container, [[910, 710], [940, 730], [1000, 760]])
        expect(onViewportChange.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
})
