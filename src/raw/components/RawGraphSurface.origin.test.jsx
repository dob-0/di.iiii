import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RawGraphSurface from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

// A new Laser Out's card window opened over its own node (2026-10-20): the
// surface published its on-screen origin only on pan, zoom and window resize,
// but the empty-canvas hint leaves and the top bar settles when the first node
// lands, moving the surface ~57 px with no pan. World windows are placed
// through the published origin, so they sat 57 px above where the card was
// drawn. The origin must follow the surface.

let top
let observers
let spy
beforeEach(() => {
    top = 168
    observers = []
    spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => (
        { left: 0, top, width: 1200, height: 800, right: 1200, bottom: top + 800, x: 0, y: top }))
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback) { this.callback = callback; observers.push(this) }
        observe() {}
        disconnect() {}
    })
})
afterEach(() => { spy?.mockRestore(); vi.unstubAllGlobals() })

describe('the published canvas origin', () => {
    it('republishes when the surface moves on screen without any pan', () => {
        const onViewportChange = vi.fn()
        const node = createNode('device.laser.out', { graphX: 540, graphY: 259 })
        render(<RawGraphSurface nodes={[node]} edges={[]} onViewportChange={onViewportChange} />)
        expect(onViewportChange.mock.calls.at(-1)[0].originTop).toBe(168)
        top = 57
        act(() => { observers.forEach((observer) => observer.callback([])) })
        expect(onViewportChange.mock.calls.at(-1)[0].originTop).toBe(57)
    })
})
