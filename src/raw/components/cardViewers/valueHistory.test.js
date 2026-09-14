import { describe, expect, it } from 'vitest'
import { createValueHistory, SPARKLINE_WINDOW_MS } from './valueHistory.js'

describe('createValueHistory', () => {
    it('keeps pushed numbers in order', () => {
        const history = createValueHistory()
        history.push(1, 0)
        history.push(2, 10)
        history.push(3, 20)
        expect(history.values()).toEqual([1, 2, 3])
    })

    it('ignores non-numeric and non-finite pushes', () => {
        const history = createValueHistory()
        history.push(1, 0)
        history.push('nope', 10)
        history.push(NaN, 20)
        history.push(undefined, 30)
        history.push(Infinity, 40)
        history.push(2, 50)
        expect(history.values()).toEqual([1, 2])
    })

    it('drops samples older than the window, keeping the ~10s tail', () => {
        const history = createValueHistory(SPARKLINE_WINDOW_MS)
        history.push(1, 0)
        history.push(2, 4000)
        history.push(3, 9000)
        // Past the 10s window measured from this push's own clock.
        history.push(4, 11_000)
        expect(history.values()).toEqual([2, 3, 4])
    })

    it('respects a custom window', () => {
        const history = createValueHistory(1000)
        history.push(1, 0)
        history.push(2, 500)
        history.push(3, 1500)
        expect(history.values()).toEqual([2, 3])
    })

    it('clear empties the buffer', () => {
        const history = createValueHistory()
        history.push(1, 0)
        history.clear()
        expect(history.values()).toEqual([])
    })

    it('caps growth even when the clock never advances', () => {
        const history = createValueHistory()
        for (let i = 0; i < 500; i += 1) history.push(i, 0)
        expect(history.values().length).toBeLessThanOrEqual(256)
    })
})
