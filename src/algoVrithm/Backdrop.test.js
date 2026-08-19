import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { resolveBackdrop } from './Backdrop.jsx'
import { ritualDurationSec, SEQUENCES } from './sequences/index.js'

const toColor = (result) => (
    result.r === undefined ? new THREE.Color(result.color) : new THREE.Color(result.r, result.g, result.b)
)

/**
 * Compared in sRGB, not linear.
 *
 * three.js holds colour in Linear-sRGB, where every dark value is crushed into
 * a tiny range: a slate #1B242B and a near-black #0D1114 are plainly different
 * rooms on screen but sit 0.008 apart linearly, inside any sane tolerance. Two
 * distinct dark backdrops would therefore compare as identical and this file's
 * regression guards would silently stop guarding anything.
 */
const srgb = (color) => {
    const out = { r: 0, g: 0, b: 0 }
    color.getRGB(out, THREE.SRGBColorSpace)
    return out
}

const near = (colorA, colorB, tolerance = 0.02) => {
    const a = srgb(colorA)
    const b = srgb(colorB)
    return Math.abs(a.r - b.r) < tolerance
        && Math.abs(a.g - b.g) < tolerance
        && Math.abs(a.b - b.b) < tolerance
}

const TOTAL = ritualDurationSec()

describe('Backdrop.resolveBackdrop', () => {
    const first = new THREE.Color(SEQUENCES[0].backdrop.color)
    const last = new THREE.Color(SEQUENCES[SEQUENCES.length - 1].backdrop.color)

    it('opens on the first sequence backdrop', () => {
        expect(near(toColor(resolveBackdrop(0)), first)).toBe(true)
    })

    it('holds the final sequence backdrop past the end of the piece', () => {
        // Regression: the empty-active fallback used to return SEQUENCES[0],
        // snapping the room back to the opening white the moment the playhead
        // cleared the last window.
        expect(near(toColor(resolveBackdrop(TOTAL)), last)).toBe(true)
        expect(near(toColor(resolveBackdrop(TOTAL + 5)), last)).toBe(true)
    })

    it('gives the opening sequence no say once its window has closed', () => {
        // Asserted by REMOVING the opening sequence and requiring the same
        // answer, rather than by checking the colour is not the opening colour.
        //
        // The colour version only worked while the opening was white and every
        // other room was dark — one glance apart. The opening is now a dark
        // corridor like the rooms after it, so a cross-fade between two of them
        // legitimately passes within a hair of it, and the old assertion
        // started failing on a piece that was behaving perfectly. This states
        // the actual invariant and does not care what colour anything is.
        const withoutOpening = SEQUENCES.filter((sequence) => sequence !== SEQUENCES[0])
        const past = SEQUENCES[0].endSec

        for (let step = 0; step <= 100; step++) {
            const playheadSec = past + (step / 100) * (TOTAL - past)
            const withAll = toColor(resolveBackdrop(playheadSec))
            const without = toColor(resolveBackdrop(playheadSec, withoutOpening))
            expect(near(withAll, without, 1e-6)).toBe(true)
        }
    })

    it('blends rather than jumping across a handover between different rooms', () => {
        // Measured on the first handover where the two rooms are ACTUALLY
        // different colours, found rather than hardcoded.
        //
        // This used to sit on the 01->02 handover, which stopped meaning
        // anything the moment both opening sequences went to true black: with
        // identical worlds there is nothing to cross-fade, so `before`, `mid`
        // and `after` were all zero and the test was asserting 0 < 0. A guard
        // that can only pass by accident of the palette is worse than none,
        // because it reads as coverage.
        const pair = SEQUENCES.slice(0, -1).findIndex((sequence, index) => (
            !near(
                new THREE.Color(sequence.backdrop.color),
                new THREE.Color(SEQUENCES[index + 1].backdrop.color)
            )
        ))
        expect(pair, 'no two consecutive sequences differ in colour').toBeGreaterThan(-1)

        const current = SEQUENCES[pair]
        const next = SEQUENCES[pair + 1]
        const before = srgb(toColor(resolveBackdrop(next.startSec - 0.5)))
        const mid = srgb(toColor(resolveBackdrop((next.startSec + current.endSec) / 2)))
        const after = srgb(toColor(resolveBackdrop(current.endSec + 0.5)))

        // Mid-handover must sit strictly between the two rooms on the channel
        // that actually separates them, not equal either — that is what makes
        // it a cross-fade instead of a cut. Which channel that is depends on
        // which pair was found, so it is picked rather than assumed.
        const channel = ['r', 'g', 'b'].reduce((widest, key) => (
            Math.abs(before[key] - after[key]) > Math.abs(before[widest] - after[widest]) ? key : widest
        ), 'r')
        const low = Math.min(before[channel], after[channel])
        const high = Math.max(before[channel], after[channel])

        expect(mid[channel]).toBeGreaterThan(low)
        expect(mid[channel]).toBeLessThan(high)
    })

    it('hands the opening straight into the data field with no colour change', () => {
        // Both opening sequences share one true-black world on purpose, so this
        // handover is deliberately invisible in colour and carries entirely on
        // content. Locked down because the previous test can no longer see it:
        // if somebody re-tints either room, that is a real change to the piece
        // and should have to be made on purpose.
        expect(near(
            new THREE.Color(SEQUENCES[0].backdrop.color),
            new THREE.Color(SEQUENCES[1].backdrop.color),
            1e-6
        )).toBe(true)
    })

    it('always returns usable fog distances', () => {
        for (let step = 0; step <= 100; step++) {
            const result = resolveBackdrop((step / 100) * TOTAL)
            const fogNear = result.fogNear ?? 0
            const fogFar = result.fogFar ?? 0
            expect(fogFar).toBeGreaterThan(fogNear)
        }
    })

    it('reads a draft edit list left unsorted by a director-panel drag', () => {
        // The panel hands over whatever order the last drag produced. Picking
        // "the sequence before the playhead" by array position instead of by
        // time would hold the wrong backdrop at the ends of the piece.
        // The whole list reversed, not a hand-picked pair — a two-element
        // literal silently stopped covering the last sequence the moment a
        // third one was added, and `last` is exactly what this asserts on.
        const shuffled = [...SEQUENCES].reverse()
        expect(near(toColor(resolveBackdrop(0, shuffled)), first)).toBe(true)
        expect(near(toColor(resolveBackdrop(TOTAL + 5, shuffled)), last)).toBe(true)
    })
})
