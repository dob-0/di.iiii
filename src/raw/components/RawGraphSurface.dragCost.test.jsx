import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P6: while one card is held, the other cards must not be rebuilt on every
// pointer move. getNodeInputs runs once per card built, so its call
// count per drag frame says how many cards were rebuilt.
const counter = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../../project/nodeRegistry.js', async (importOriginal) => {
    const real = await importOriginal()
    return { ...real, getNodeInputs: (...args) => { counter.calls += 1; return real.getNodeInputs(...args) } }
})
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

const N = 40
const initial = Array.from({ length: N }, (_, i) => ({
    ...createNode('value.number', { graphX: (i % 8) * 260, graphY: Math.floor(i / 8) * 200 }),
    id: `n${i}`
}))
let frames = new Map()
let frameId = 0
const runFrames = (count) => {
    for (let i = 0; i < count; i += 1) {
        const batch = [...frames.values()]
        frames = new Map()
        act(() => batch.forEach((cb) => cb(16)))
    }
}
const Harness = ({ onMove }) => {
    const [nodes, setNodes] = useState(initial)
    return <RawGraphSurface nodes={nodes} edges={[]} onMoveNode={(id, x, y) => { onMove(id, x, y); setNodes((all) => all.map((n) => (n.id === id ? { ...n, graphX: x, graphY: y } : n))) }} />
}

describe('dragging one card (P6)', () => {
    beforeEach(() => {
        frames = new Map()
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frameId += 1; frames.set(frameId, cb); return frameId })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            const own = this.classList?.contains('raw-graph-surface') || this.classList?.contains('raw-graph-canvas')
            return own ? { x: 0, y: 95, left: 0, top: 95, right: 1600, bottom: 1095, width: 1600, height: 1000, toJSON: () => ({}) }
                : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('rebuilds only the held card per pointer move, not all of them', () => {
        const onMove = vi.fn()
        const { container } = render(<Harness onMove={onMove} />)
        runFrames(2)
        const card = container.querySelector('[data-card-id="n9"]')
        card.setPointerCapture = vi.fn()
        const stage = container.querySelector('.raw-graph-stage').style.transform
        const [, px, py] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(stage)
        const [, z] = /scale\(([-\d.]+)\)/.exec(stage)
        const sx = parseFloat(card.style.left) * Number(z) + Number(px) + 10
        const sy = parseFloat(card.style.top) * Number(z) + Number(py) + 95 + 10
        fireEvent.pointerDown(card, { button: 0, clientX: sx, clientY: sy, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: sx + 4, clientY: sy + 2 })
        runFrames(1)
        counter.calls = 0
        const FRAMES = 8
        for (let i = 1; i <= FRAMES; i += 1) {
            fireEvent.pointerMove(window, { clientX: sx + 4 + i * 10, clientY: sy + 2 + i * 5 })
            runFrames(1)
        }
        const perFrame = counter.calls / FRAMES
        fireEvent.pointerUp(window)
        runFrames(1)
        expect(onMove).toHaveBeenCalledTimes(1)
        expect(perFrame).toBeGreaterThan(0)
        // 3 per node per frame before (card built twice, once elsewhere); the card builds are gone, the O(N) bookkeeping elsewhere is not
        expect(perFrame).toBeLessThan(N * 1.5)
    })
})
