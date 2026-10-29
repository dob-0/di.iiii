import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WalkGraphLayer from '../components/WalkGraphLayer.jsx'
import { claimWalkGraph, releaseWalkGraph } from './useWalkGraph.js'
import { createEdge, createNode } from '../nodeRegistry.js'

// A Timer started at once, its Elapsed wired into a Text: the walk shows it counting.
const timerDoc = () => {
    const timer = { ...createNode('signal.timer', { id: 'timer' }), values: { start: true, length: 60 } }
    const text = createNode('view.text', { id: 'text' })
    const edge = createEdge('timer', 'elapsed', 'text', 'content', { id: 'e1' })
    return { projectMeta: { id: 'p1' }, entities: [], nodes: [timer, text], edges: [edge] }
}

describe('the node graph runs while walking', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }) })
    afterEach(() => { cleanup(); vi.useRealTimers() })

    it('signal.timer ticks (Elapsed grows frame after frame)', () => {
        const { container } = render(<WalkGraphLayer document={timerDoc()} />)
        const read = () => Number(container.querySelector('[data-walk-graph-texts] div')?.textContent)
        act(() => { vi.advanceTimersByTime(500) })
        const first = read()
        act(() => { vi.advanceTimersByTime(1000) })
        const second = read()
        expect(Number.isFinite(first)).toBe(true)
        expect(second).toBeGreaterThan(first + 0.5)
    })

    it('leaving the walk cancels the frame loop', () => {
        const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
        const { unmount } = render(<WalkGraphLayer document={timerDoc()} />)
        act(() => { vi.advanceTimersByTime(100) })
        unmount()
        expect(cancel).toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('a second surface does not run the graph twice', () => {
        const a = render(<WalkGraphLayer document={timerDoc()} />)
        const b = render(<WalkGraphLayer document={timerDoc()} />)
        act(() => { vi.advanceTimersByTime(300) })
        expect(a.container.querySelector('[data-walk-graph-texts]')).not.toBeNull()
        expect(b.container.querySelector('[data-walk-graph-texts]')).toBeNull()
        expect(vi.getTimerCount()).toBe(1)
        const mine = Symbol('x')
        expect(claimWalkGraph(mine)).toBe(false)
        releaseWalkGraph(mine)
    })
})
