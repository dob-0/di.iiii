import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { answerTabPings, countOtherTabs, isCrowded, CROWDED_OTHER_TABS } from './siblingTabs.js'

// A same-origin bus: every channel of one name hears the others, not itself.
const buses = new Map()
class FakeChannel {
    constructor(name) {
        this.name = name
        this.onmessage = null
        if (!buses.has(name)) buses.set(name, new Set())
        buses.get(name).add(this)
    }
    postMessage(data) {
        for (const peer of buses.get(this.name)) {
            if (peer !== this) queueMicrotask(() => peer.onmessage?.({ data }))
        }
    }
    close() { buses.get(this.name).delete(this) }
}

describe('siblingTabs', () => {
    beforeEach(() => { buses.clear(); vi.useFakeTimers() })
    afterEach(() => vi.useRealTimers())

    it('counts the other tabs that answer, not itself', async () => {
        const stops = [1, 2, 3, 4, 5, 6].map(() => answerTabPings({ Channel: FakeChannel }))
        const pending = countOtherTabs({ Channel: FakeChannel, windowMs: 100 })
        await vi.advanceTimersByTimeAsync(100)
        expect(await pending).toBe(6)
        stops.forEach((stop) => stop())
    })

    it('counts 0 alone and when BroadcastChannel is missing', async () => {
        const alone = countOtherTabs({ Channel: FakeChannel, windowMs: 50 })
        await vi.advanceTimersByTimeAsync(50)
        expect(await alone).toBe(0)
        expect(await countOtherTabs({ Channel: null })).toBe(0)
    })

    it('names crowding only past the ceiling and never on h2', () => {
        expect(isCrowded({ otherTabs: CROWDED_OTHER_TABS, protocol: 'http/1.1' })).toBe(true)
        expect(isCrowded({ otherTabs: CROWDED_OTHER_TABS - 1, protocol: 'http/1.1' })).toBe(false)
        expect(isCrowded({ otherTabs: 20, protocol: 'h2' })).toBe(false)
    })
})
