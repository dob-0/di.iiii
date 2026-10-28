import { describe, expect, it } from 'vitest'
import { bandAt, beatIndexAt, isStrongBeat, readAnalysis, readGridAt } from './beatGrid.js'

// A made-up grid: a beat every 0.5 s from 1 s (120 bpm), then one long gap.
const BEATS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 6]

describe('beat grid — reading the baked format', () => {
    it('takes JSON text or an object; refuses anything without rising beats', () => {
        expect(readAnalysis(JSON.stringify({ beats: BEATS }))?.beats).toEqual(BEATS)
        expect(readAnalysis({ beats: BEATS })?.beatsPerBar).toBe(4)
        expect(readAnalysis('')).toBeNull()
        expect(readAnalysis('{not json')).toBeNull()
        expect(readAnalysis({ beats: [] })).toBeNull()
        expect(readAnalysis({ beats: [1, 1, 2] })).toBeNull()
        expect(readAnalysis({ beats: [2, 1] })).toBeNull()
        expect(readAnalysis({ beats: [1], beatsPerBar: 0 })?.beatsPerBar).toBe(4)
        expect(readAnalysis({ beats: [1], beatsPerBar: 3 })?.beatsPerBar).toBe(3)
    })

    it('finds the last beat at or before t', () => {
        expect(beatIndexAt(BEATS, 0.99)).toBe(-1)
        expect(beatIndexAt(BEATS, 1)).toBe(0)
        expect(beatIndexAt(BEATS, 1.49)).toBe(0)
        expect(beatIndexAt(BEATS, 4.5)).toBe(7)
        expect(beatIndexAt(BEATS, 99)).toBe(8)
    })
})

describe('beat grid — phase, age, bar and the strong beats', () => {
    const a = readAnalysis({ beats: BEATS })

    it('phase climbs 0..1 to the next beat, age is seconds since the last', () => {
        expect(readGridAt(a, 1.25)).toMatchObject({ index: 0, count: 1, phase: 0.5, age: 0.25, beat: 1, bar: 0, bpm: 120 })
        expect(readGridAt(a, 3)).toMatchObject({ count: 5, phase: 0, beat: 1, bar: 1 })
        expect(readGridAt(a, 3.5)).toMatchObject({ beat: 2, bar: 1 })
        // the long gap 4.5 → 6: a slower local tempo, 40 bpm
        expect(readGridAt(a, 5.25)).toMatchObject({ phase: 0.5, bpm: 40 })
    })

    it('before the first beat everything counts 0 and Phase climbs to it; after the last, Phase holds 0 and Age keeps counting', () => {
        expect(readGridAt(a, 0.5)).toMatchObject({ count: 0, beat: 0, bar: 0, age: 0, strong: false, phase: 0.5 })
        expect(readGridAt(a, 8)).toMatchObject({ count: 9, phase: 0, age: 2, bpm: 40 })
    })

    it('strong: bar downbeats by default, from Downbeat on; the analysis\'s own list when it carries one', () => {
        expect([0, 1, 4, 8].map((i) => isStrongBeat(a, i))).toEqual([true, false, true, true])
        const late = readAnalysis({ beats: BEATS, downbeat: 1 })
        expect([0, 1, 5].map((i) => isStrongBeat(late, i))).toEqual([false, true, true])
        expect(readGridAt(late, 1.2)).toMatchObject({ beat: 4, bar: -1 })
        const listed = readAnalysis({ beats: BEATS, strong: [2, 6] })
        expect([0, 2, 4, 6].map((i) => isStrongBeat(listed, i))).toEqual([false, true, false, true])
    })
})

describe('beat grid — bands', () => {
    const a = readAnalysis({ beats: [0], bands: { rate: 10, low: [0, 1, 0.5], mid: [0.2], high: [] } })

    it('linear between frames, held at the end; 0 when a band or all bands are missing', () => {
        expect(bandAt(a, 'low', 0)).toBe(0)
        expect(bandAt(a, 'low', 0.05)).toBeCloseTo(0.5, 12)
        expect(bandAt(a, 'low', 0.15)).toBeCloseTo(0.75, 12)
        expect(bandAt(a, 'low', 9)).toBe(0.5)
        expect(bandAt(a, 'mid', 3)).toBe(0.2)
        expect(bandAt(a, 'high', 1)).toBe(0)
        expect(bandAt(readAnalysis({ beats: [0] }), 'low', 1)).toBe(0)
        expect(bandAt(null, 'low', 1)).toBe(0)
    })
})
