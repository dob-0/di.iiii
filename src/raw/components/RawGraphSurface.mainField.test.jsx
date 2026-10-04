import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

const makeNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})
const zoomOf = (container) => Number(/scale\(([-\d.]+)\)/.exec(container.querySelector('.raw-graph-stage').style.transform)[1])

describe('in-card editing of the main field', () => {
    // A click on the text of a card that is already selected opens the box;
    // Enter and double-click have one meaning, Open (audit 2026-10-05 B2).
    const clickText = (container, id) => {
        const card = container.querySelector(`[data-card-id="${id}"]`)
        card.setPointerCapture = () => {}
        fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
        fireEvent.pointerUp(card, { button: 0, pointerId: 1 })
        fireEvent.click(card.querySelector('.raw-graph-node-content'))
    }

    it('a click on the text of a selected Text card opens a box in the card; typing sends the same value the column reads', () => {
        const text = makeNode('view.text', { id: 't1', label: 'The night', values: { content: 'Hello' } })
        const onEditMainValue = vi.fn()
        const onSelectNode = vi.fn()
        const { container } = render(<RawGraphSurface nodes={[text]} edges={[]} selectedNodeId="t1" onSelectNode={onSelectNode} onEditMainValue={onEditMainValue} />)
        clickText(container, 't1')
        const box = container.querySelector('textarea.raw-graph-node-edit')
        expect(box).toBeTruthy()
        expect(box.value).toBe('Hello')
        fireEvent.change(box, { target: { value: 'Hello there' } })
        expect(onEditMainValue).toHaveBeenCalledWith('t1', 'content', 'Hello there')
        fireEvent.keyDown(box, { key: 'Escape' })
        expect(container.querySelector('textarea.raw-graph-node-edit')).toBeNull()
    })

    it('double-click and Enter on a Text card open it, like every other card', () => {
        const text = makeNode('view.text', { id: 't1', values: { content: 'Hi' } })
        const cube = makeNode('geom.cube', { id: 'c1', graphX: 400 })
        const onEnterNode = vi.fn()
        const { container } = render(<RawGraphSurface nodes={[text, cube]} edges={[]} onEnterNode={onEnterNode} onSelectNode={() => {}} onEditMainValue={() => {}} selectedNodeId="t1" />)
        fireEvent.doubleClick(container.querySelector('[data-card-id="t1"]'))
        expect(onEnterNode).toHaveBeenCalledWith('t1')
        fireEvent.keyDown(container.querySelector('[data-card-id="t1"]'), { key: 'Enter' })
        expect(onEnterNode).toHaveBeenCalledTimes(2)
        expect(container.querySelector('textarea.raw-graph-node-edit')).toBeNull()
        fireEvent.doubleClick(container.querySelector('[data-card-id="c1"]'))
        expect(onEnterNode).toHaveBeenCalledWith('c1')
    })

    it('without a handler the card behaves as before (read-only wrappers)', () => {
        const text = makeNode('view.text', { id: 't1', values: { content: 'Hi' } })
        const onEnterNode = vi.fn()
        const { container } = render(<RawGraphSurface nodes={[text]} edges={[]} onEnterNode={onEnterNode} />)
        fireEvent.doubleClick(container.querySelector('[data-card-id="t1"]'))
        expect(onEnterNode).toHaveBeenCalledWith('t1')
    })

    it('the editing card never grows into the card below it', () => {
        const long = 'word '.repeat(80)
        const a = makeNode('view.text', { id: 'a', graphX: 0, graphY: 0, values: { content: long } })
        const b = makeNode('view.text', { id: 'b', graphX: 0, graphY: 190, values: { content: 'x' } })
        const { container } = render(<RawGraphSurface nodes={[a, b]} edges={[]} selectedNodeId="a" onSelectNode={() => {}} onEditMainValue={() => {}} />)
        const heightOf = (id) => parseFloat(container.querySelector(`[data-card-id="${id}"]`).style.height)
        const before = heightOf('a')
        clickText(container, 'a')
        expect(heightOf('a')).toBeLessThanOrEqual(190 - 8)
        expect(heightOf('a')).toBeGreaterThanOrEqual(before - 0.5)
    })
})

// The column takes width from the canvas: an untouched view re-fits to what is left.
describe('re-fit when the settings column takes width', () => {
    it('re-fits an untouched view when the surface narrows, and again when it widens back', () => {
        let size = { width: 1440, height: 800 }
        const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
            x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, ...size, toJSON: () => ({})
        }))
        const observers = []
        const realObserver = globalThis.ResizeObserver
        const realFrame = globalThis.requestAnimationFrame
        globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; observers.push(this) } observe() {} disconnect() {} }
        globalThis.requestAnimationFrame = (fn) => { fn(); return 1 }
        try {
            const row = [0, 400, 800, 1200, 1600].map((x) => makeNode('value.number', { id: `n${x}`, graphX: x, graphY: 0 }))
            const { container } = render(<RawGraphSurface nodes={row} edges={[]} />)
            const wide = zoomOf(container)
            act(() => observers.forEach((o) => o.cb([])))
            size = { width: 1440 - 320, height: 800 }
            act(() => observers.forEach((o) => o.cb([])))
            const narrow = zoomOf(container)
            expect(narrow).toBeLessThan(wide)
            size = { width: 1440, height: 800 }
            act(() => observers.forEach((o) => o.cb([])))
            expect(zoomOf(container)).toBeGreaterThan(narrow)
        } finally {
            rect.mockRestore()
            globalThis.ResizeObserver = realObserver
            globalThis.requestAnimationFrame = realFrame
        }
    })
})
