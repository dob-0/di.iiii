import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'
import { CARD_WIDTH, cardHeight } from '../utils/cardGeometry.js'

// The NOPA audit (2026-10-02, di-atlas-nopa/audits/2026-10-02-raw-nodes-nopa-bugs.md)
// measured three ways the Nodes view loses its cards:
//   F1 a window resized 2560 -> 1200 kept the 2560 view: 2 of 8 cards on screen;
//   F2 a view that never fitted (or fitted before the cards arrived) can show none;
//   F3 on a 390px phone, Fit stopped at its 34% floor with cards off the edge.
// Each test below lays out the NOPA shape — three Scene cards over five List
// cards, 480 graph units apart — and counts the cards inside the canvas.

const makeNode = (id, graphX, graphY) => ({
    ...createNode('value.number', { graphX, graphY }),
    id,
    graphX,
    graphY
})

const NOPA_LIKE = [
    makeNode('bar', 0, 0), makeNode('studio', 480, 0), makeNode('projector', 960, 0),
    makeNode('night', 0, 340), makeNode('gear', 480, 340), makeNode('people', 960, 340),
    makeNode('todo', 1440, 340), makeNode('budget', 1920, 340)
]

let rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
const setRect = (width, height) => {
    rect = { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }
}
let rectSpy = null
beforeEach(() => {
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => rect)
})
afterEach(() => {
    rectSpy?.mockRestore()
})

const viewOf = (container) => {
    const { transform } = container.querySelector('.raw-graph-stage').style
    const [, panX, panY] = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(transform)
    const [, zoom] = /scale\(([-\d.e]+)\)/.exec(transform)
    return { panX: Number(panX), panY: Number(panY), zoom: Number(zoom) }
}

// Cards whose box lies wholly inside the canvas, and cards that touch it.
const countCards = (container, nodes) => {
    const vp = viewOf(container)
    let inside = 0
    let touching = 0
    for (const node of nodes) {
        const x = node.graphX * vp.zoom + vp.panX
        const y = node.graphY * vp.zoom + vp.panY
        const w = CARD_WIDTH * vp.zoom
        const h = cardHeight(node) * vp.zoom
        if (x + w > 0 && x < rect.width && y + h > 0 && y < rect.height) touching += 1
        if (x >= 0 && y >= 0 && x + w <= rect.width && y + h <= rect.height) inside += 1
    }
    return { inside, touching }
}

const resizeTo = (width, height) => {
    setRect(width, height)
    act(() => { window.dispatchEvent(new Event('resize')) })
}

describe('the Nodes view keeps its cards on screen (NOPA audit F1–F3)', () => {
    it('F1: re-fits on a window resize when the person has not moved the view', () => {
        setRect(2400, 1200)
        const { container } = render(<RawGraphSurface nodes={NOPA_LIKE} edges={[]} />)
        expect(countCards(container, NOPA_LIKE).inside).toBe(8)
        resizeTo(1150, 620)
        expect(countCards(container, NOPA_LIKE).inside).toBe(8)
    })

    it('F1: after a zoom by hand, a resize keeps the same point in the middle', () => {
        setRect(2400, 1200)
        const { container, getByRole } = render(<RawGraphSurface nodes={NOPA_LIKE} edges={[]} />)
        fireEvent.click(getByRole('button', { name: 'Zoom in' }))
        const before = viewOf(container)
        const centreBefore = { x: (1200 - before.panX) / before.zoom, y: (600 - before.panY) / before.zoom }
        resizeTo(1150, 620)
        const after = viewOf(container)
        expect(after.zoom).toBeCloseTo(before.zoom, 5)
        const centreAfter = { x: (575 - after.panX) / after.zoom, y: (310 - after.panY) / after.zoom }
        expect(centreAfter.x).toBeCloseTo(centreBefore.x, 3)
        expect(centreAfter.y).toBeCloseTo(centreBefore.y, 3)
        expect(countCards(container, NOPA_LIKE).touching).toBeGreaterThan(0)
    })

    it('F2: a canvas that had no size when the cards arrived fits once it gets one', () => {
        setRect(0, 0)
        const { container } = render(<RawGraphSurface nodes={NOPA_LIKE} edges={[]} />)
        resizeTo(1150, 620)
        expect(countCards(container, NOPA_LIKE).inside).toBe(8)
    })

    it('F2: cards that arrive after the first fit, all off screen, are brought into view', () => {
        setRect(1150, 620)
        const first = [makeNode('seed', 0, 0)]
        const { container, rerender } = render(<RawGraphSurface nodes={first} edges={[]} />)
        const far = NOPA_LIKE.map((node) => ({ ...node, graphX: node.graphX + 6000, graphY: node.graphY + 4000 }))
        rerender(<RawGraphSurface nodes={far} edges={[]} />)
        expect(countCards(container, far).touching).toBeGreaterThan(0)
    })

    it('F3: on a 390px phone, Fit brings every card into view', () => {
        setRect(390, 700)
        const { container, getByRole } = render(<RawGraphSurface nodes={NOPA_LIKE} edges={[]} />)
        fireEvent.click(getByRole('button', { name: 'Fit graph' }))
        expect(countCards(container, NOPA_LIKE).inside).toBe(8)
    })
})
