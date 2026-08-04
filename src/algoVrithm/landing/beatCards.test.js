import { describe, expect, it } from 'vitest'
import { SEQUENCES } from '../sequences/index.js'
import { BEAT_CARDS, RUN_TIME_SEC, beatsAtSec, formatSec, leadBeatAtSec } from './beatCards.js'

// The whole point of this file: beatCards.js is a hand-kept copy of the edit
// list, made so the landing page can stay free of three.js. If somebody retimes
// a clip in the director panel and pastes the result into sequences/index.js,
// these cases fail until the landing copy follows.
describe('beatCards mirrors the edit list', () => {
    it('has one card per sequence, in order', () => {
        expect(BEAT_CARDS.map((beat) => beat.id)).toEqual(SEQUENCES.map((sequence) => sequence.id))
    })

    it('carries each sequence\'s title and window', () => {
        SEQUENCES.forEach((sequence, index) => {
            const card = BEAT_CARDS[index]
            expect(card.title).toBe(sequence.title)
            expect(card.startSec).toBe(sequence.startSec)
            expect(card.endSec).toBe(sequence.endSec)
        })
    })

    it('carries each sequence\'s world colour', () => {
        SEQUENCES.forEach((sequence, index) => {
            expect(BEAT_CARDS[index].world.toUpperCase()).toBe(sequence.backdrop.color.toUpperCase())
        })
    })

    it('derives the run time from the last window, like the piece does', () => {
        expect(RUN_TIME_SEC).toBe(Math.max(...SEQUENCES.map((sequence) => sequence.endSec)))
    })

    it('names a sketch that exists for every beat', async () => {
        const { BEAT_SKETCHES } = await import('./beatSketches.js')
        BEAT_CARDS.forEach((beat) => {
            expect(typeof BEAT_SKETCHES[beat.sketch]).toBe('function')
        })
    })
})

describe('beatsAtSec', () => {
    it('holds one beat in the middle of a window', () => {
        const live = beatsAtSec(2)
        expect(live).toHaveLength(1)
        expect(live[0].beat.id).toBe('s01-white-tunnel')
        expect(live[0].weight).toBe(1)
    })

    it('holds both beats inside a seam, each part-weighted', () => {
        // The tunnel ends at 5.6 and the halo starts at 4.4 — a 1.2s overlap.
        const live = beatsAtSec(5)
        expect(live.map((entry) => entry.beat.id)).toEqual(['s01-white-tunnel', 's01b-halo'])
        live.forEach((entry) => {
            expect(entry.weight).toBeGreaterThan(0)
            expect(entry.weight).toBeLessThan(1)
        })
    })

    it('never returns an empty frame, even past the end', () => {
        expect(beatsAtSec(RUN_TIME_SEC + 10)).toHaveLength(1)
        expect(beatsAtSec(RUN_TIME_SEC + 10)[0].beat.id).toBe('s07-dispersion-sphere')
    })
})

describe('leadBeatAtSec', () => {
    it('picks the arriving beat when a seam is even', () => {
        // Exactly halfway through the tunnel→halo overlap both weights match;
        // the later beat wins so the seam reads as arriving, not clinging on.
        expect(leadBeatAtSec(5).id).toBe('s01b-halo')
    })

    it('picks the only live beat outside a seam', () => {
        expect(leadBeatAtSec(2).id).toBe('s01-white-tunnel')
    })
})

describe('formatSec', () => {
    it('formats to a tenth, zero-padded', () => {
        expect(formatSec(0)).toBe('00.0s')
        expect(formatSec(5.64)).toBe('05.6s')
        expect(formatSec(53)).toBe('53.0s')
    })

    it('clamps negatives rather than printing a minus', () => {
        expect(formatSec(-3)).toBe('00.0s')
    })
})
