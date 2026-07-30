import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { hasClockNode, useGraphClock } from './useGraphClock.js'

function Probe({ active, onValue }) {
    onValue(useGraphClock(active))
    return null
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('hasClockNode', () => {
    it('detects a time node', () => {
        expect(hasClockNode([{ typeId: 'geom.cube' }, { typeId: 'time' }])).toBe(true)
    })

    it('is false for a document without one, and survives junk entries', () => {
        expect(hasClockNode([{ typeId: 'geom.cube' }])).toBe(false)
        expect(hasClockNode([])).toBe(false)
        expect(hasClockNode()).toBe(false)
        expect(hasClockNode([null, undefined, {}])).toBe(false)
    })
})

describe('useGraphClock', () => {
    it('schedules NOTHING when inactive — the whole point of the gate', () => {
        // A clock running for documents that never asked for one would rebuild
        // the graph context every frame and quietly undo the rAF-gating the rest
        // of this codebase is careful about.
        const raf = vi.spyOn(window, 'requestAnimationFrame')
        const values = []
        render(<Probe active={false} onValue={(v) => values.push(v)} />)

        expect(raf).not.toHaveBeenCalled()
        expect(values.at(-1)).toBe(0)
    })

    it('ticks while active and stops on unmount', () => {
        let tick = null
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            tick = cb
            return 1
        })
        const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        vi.spyOn(performance, 'now').mockReturnValue(1500)

        const values = []
        const view = render(<Probe active onValue={(v) => values.push(v)} />)
        expect(raf).toHaveBeenCalled()

        act(() => { tick() })
        expect(values.at(-1)).toBe(1500)

        view.unmount()
        expect(cancel).toHaveBeenCalled()
    })

    it('returns a stopped clock, not a stale one, when it goes inactive', () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        const values = []
        const view = render(<Probe active onValue={(v) => values.push(v)} />)
        view.rerender(<Probe active={false} onValue={(v) => values.push(v)} />)
        expect(values.at(-1)).toBe(0)
    })
})
