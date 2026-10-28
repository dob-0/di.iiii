import { afterEach, describe, expect, it } from 'vitest'
import { heldClockMs, holdClock, installClockSeek, releaseClock, subscribeClockHold } from './clockSeek.js'

// A frame queue the test advances by hand, so "two frames later" is exact.
const frames = () => {
    const queue = []
    return {
        requestFrame: (fn) => { queue.push(fn) },
        step: () => { const due = queue.splice(0); due.forEach((fn) => fn()) },
        get pending() { return queue.length },
    }
}

afterEach(() => releaseClock())

describe('clock hold', () => {
    it('holds seconds as document-clock ms and tells subscribers', () => {
        const seen = []
        const off = subscribeClockHold(() => seen.push(heldClockMs()))
        expect(heldClockMs()).toBeNull()
        expect(holdClock(4.5)).toBe(true)
        expect(heldClockMs()).toBe(4500)
        releaseClock()
        expect(heldClockMs()).toBeNull()
        off()
        holdClock(1)
        expect(seen).toEqual([4500, null])
    })

    it('refuses a time that is not a number ≥ 0', () => {
        expect(holdClock(-1)).toBe(false)
        expect(holdClock('soon')).toBe(false)
        expect(holdClock(Number.NaN)).toBe(false)
        expect(heldClockMs()).toBeNull()
    })
})

describe('installClockSeek', () => {
    it('__seek holds the clock and is ready only two frames later', async () => {
        const page = {}
        const clock = frames()
        const uninstall = installClockSeek(page, { requestFrame: clock.requestFrame })
        expect(page.__ready).toBe(true)
        const done = page.__seek(2)
        expect(heldClockMs()).toBe(2000)
        expect(page.__ready).toBe(false)
        clock.step()
        expect(page.__ready).toBe(false)
        clock.step()
        expect(page.__ready).toBe(true)
        await expect(done).resolves.toBe(2000)
        uninstall()
        expect(page.__seek).toBeUndefined()
        expect(heldClockMs()).toBeNull()
    })

    it('a later seek owns ready: the earlier one finishing does not mark it', () => {
        const page = {}
        const clock = frames()
        installClockSeek(page, { requestFrame: clock.requestFrame })
        page.__seek(1)
        clock.step()
        page.__seek(3)
        clock.step() // the first seek's second frame, the second seek's first
        expect(heldClockMs()).toBe(3000)
        expect(page.__ready).toBe(false)
        clock.step()
        expect(page.__ready).toBe(true)
    })

    it('__play lets the clock run again', () => {
        const page = {}
        installClockSeek(page, { requestFrame: () => {} })
        page.__seek(5)
        page.__play()
        expect(heldClockMs()).toBeNull()
        expect(page.__ready).toBe(true)
    })

    it('rejects a bad seek without holding anything', async () => {
        const page = {}
        installClockSeek(page, { requestFrame: () => {} })
        await expect(page.__seek(-2)).rejects.toThrow('seconds')
        expect(heldClockMs()).toBeNull()
    })
})
