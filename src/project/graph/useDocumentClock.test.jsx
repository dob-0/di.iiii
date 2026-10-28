import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useDocumentClock } from './useDocumentClock.js'
import { holdClock, releaseClock } from './clockSeek.js'

function Probe({ document, onValue }) {
    onValue(useDocumentClock(document))
    return null
}

afterEach(() => {
    vi.restoreAllMocks()
    releaseClock()
})

const timeDoc = (showState) => ({ nodes: [{ typeId: 'time' }], showState })

describe('useDocumentClock', () => {
    it('is a constant 0 (and schedules nothing) without a Time node', () => {
        const raf = vi.spyOn(window, 'requestAnimationFrame')
        const values = []
        render(<Probe document={{ nodes: [{ typeId: 'geom.cube' }], showState: { clockEpoch: 5000 } }} onValue={(v) => values.push(v)} />)
        expect(raf).not.toHaveBeenCalled()
        expect(values.at(-1)).toBe(0)
    })

    it('derives the same elapsed value from the document epoch in every window', () => {
        let tick = null
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { tick = cb; return 1 })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        vi.spyOn(performance, 'now').mockReturnValue(987654)

        const values = []
        render(<Probe document={timeDoc({ clockEpoch: 15000 })} onValue={(v) => values.push(v)} />)
        act(() => { tick() })
        // timeOrigin + now() is the frame's wall clock; minus the epoch.
        expect(values.at(-1)).toBe(performance.timeOrigin + 987654 - 15000)
    })

    it('falls back to the window-local clock when no epoch is stamped', () => {
        let tick = null
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { tick = cb; return 1 })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        vi.spyOn(performance, 'now').mockReturnValue(1500)

        const values = []
        render(<Probe document={timeDoc({ clockEpoch: 0 })} onValue={(v) => values.push(v)} />)
        act(() => { tick() })
        expect(values.at(-1)).toBe(1500)

        const missing = []
        render(<Probe document={{ nodes: [{ typeId: 'time' }] }} onValue={(v) => missing.push(v)} />)
        act(() => { tick() })
        expect(missing.at(-1)).toBe(1500)
    })

    it('reads exactly the held moment while a test browser holds the clock, epoch or not', () => {
        let tick = null
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { tick = cb; return 1 })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        vi.spyOn(performance, 'now').mockReturnValue(987654)

        const values = []
        render(<Probe document={timeDoc({ clockEpoch: 15000 })} onValue={(v) => values.push(v)} />)
        act(() => { holdClock(4.5) })
        expect(values.at(-1)).toBe(4500)
        act(() => { tick() })
        expect(values.at(-1)).toBe(4500)
        act(() => { releaseClock() })
        expect(values.at(-1)).toBe(performance.timeOrigin + 987654 - 15000)
    })
})
