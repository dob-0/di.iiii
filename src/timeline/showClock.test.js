import { describe, expect, it } from 'vitest'
import {
    DEFAULT_BPM,
    MIN_TAP_INTERVAL_MS,
    addOffsetSample,
    beatAt,
    bestOffset,
    localTimeline,
    nextBoundaryAt,
    offsetSample,
    phaseAt,
    phaseErrorMs,
    pickLeader,
    sanitizeBpm,
    tapTempo
} from './showClock.js'

describe('the timeline (Link: beat, time, tempo)', () => {
    it('reads the same beat as the Light desk grid for the same bpm and epoch', () => {
        // serverXR/src/lighting/fx.js beatGrid: beats = (now - epoch) / (60000 / bpm)
        const timeline = { bpm: 120, epoch: 1000 }
        expect(beatAt(timeline, 1000)).toBe(0)
        expect(beatAt(timeline, 1500)).toBe(1)
        expect(beatAt(timeline, 3000)).toBe(4)
    })

    it('phase wraps inside the quantum, and before the epoch too', () => {
        const timeline = { bpm: 120, epoch: 0 }
        expect(phaseAt(timeline, 2500, 4)).toBeCloseTo(1)
        expect(phaseAt(timeline, -500, 4)).toBeCloseTo(3)
    })

    it('a quantized launch lands on the next bar, or now when already on it', () => {
        const timeline = { bpm: 120, epoch: 0 }
        expect(nextBoundaryAt(timeline, 2000, 4)).toBe(2000)
        expect(nextBoundaryAt(timeline, 2100, 4)).toBe(4000)
    })
})

describe('tap tempo', () => {
    it('never reads 300 from a double click: a tap faster than a beat can be is ignored', () => {
        let state = tapTempo([], 0)
        state = tapTempo(state.taps, 100)
        expect(state.ignored).toBe(true)
        expect(state.bpm).toBe(null)
        expect(MIN_TAP_INTERVAL_MS).toBe(200)
    })

    it('four taps half a second apart are 120, and the last tap is the beat', () => {
        let state = { taps: [] }
        for (const t of [10000, 10500, 11000, 11500]) state = tapTempo(state.taps, t)
        expect(state.bpm).toBe(120)
        expect(state.epoch).toBe(11500)
    })

    it('a bounce inside a steady count does not bend the tempo', () => {
        let state = { taps: [] }
        for (const t of [0, 500, 560, 1000, 1500]) state = tapTempo(state.taps, t)
        expect(state.bpm).toBe(120)
    })

    it('a long pause starts a new count', () => {
        let state = tapTempo([0], 500)
        state = tapTempo(state.taps, 5000)
        expect(state.taps).toEqual([5000])
        expect(state.bpm).toBe(null)
    })

    it('a stored nonsense tempo becomes the default, a real one is kept to a tenth', () => {
        expect(sanitizeBpm(undefined)).toBe(DEFAULT_BPM)
        expect(sanitizeBpm(-4)).toBe(DEFAULT_BPM)
        expect(sanitizeBpm(123.456)).toBe(123.5)
        expect(sanitizeBpm(900)).toBe(300)
    })
})

describe('who leads (the one seam)', () => {
    it('the Light desk leads when it is up and this device follows it', () => {
        expect(pickLeader({ light: { up: true, bpm: 128 } })).toBe('light')
    })
    it('the deck keeps its own tempo when no Light desk is up', () => {
        expect(pickLeader({ light: { up: false } })).toBe('deck')
        expect(pickLeader({ light: null })).toBe('deck')
    })
    it('the deck keeps its own tempo when this device leaves the session', () => {
        expect(pickLeader({ light: { up: true }, follow: false })).toBe('deck')
    })
    it('the other policy is one word away', () => {
        expect(pickLeader({ policy: 'deck-only', light: { up: true } })).toBe('deck')
    })
})

describe('clock offset (Cristian, minimum round trip)', () => {
    it('one exchange: the server time plus half the round trip, against arrival', () => {
        expect(offsetSample({ sentAt: 1000, serverNow: 5010, receivedAt: 1020 })).toEqual({ offset: 4000, rtt: 20, at: 1020 })
        expect(offsetSample({ sentAt: 1000, serverNow: 5000, receivedAt: 990 })).toBe(null)
    })

    it('keeps the sample with the shortest round trip', () => {
        let samples = []
        samples = addOffsetSample(samples, offsetSample({ sentAt: 0, serverNow: 4100, receivedAt: 200 }))
        samples = addOffsetSample(samples, offsetSample({ sentAt: 300, serverNow: 4305, receivedAt: 310 }))
        expect(bestOffset(samples).offset).toBe(4000)
    })

    it('a leader timeline moved into local time lands its beats at the same instants', () => {
        const leader = { bpm: 120, epoch: 100000 }
        const offset = 4000 // leader time = local time + 4000
        const local = localTimeline(leader, offset)
        expect(beatAt(local, 96000)).toBe(beatAt(leader, 100000))
    })

    it('phase error wraps to within half a beat', () => {
        const a = { bpm: 120, epoch: 0 }
        expect(phaseErrorMs(a, { bpm: 120, epoch: 10 }, 5000)).toBeCloseTo(10)
        expect(phaseErrorMs(a, { bpm: 120, epoch: 490 }, 5000)).toBeCloseTo(-10)
    })
})
