import { describe, expect, it } from 'vitest'
import {
    VEIL_PEAK,
    bookendAmount,
    handovers,
    totalVeil,
    veilAmount
} from './transitions.js'
import { SEQUENCES, ritualDurationSec } from './sequences/index.js'

const room = { color: '#101010', fogNear: 1, fogFar: 10 }
const clip = (id, startSec, endSec) => ({ id, startSec, endSec, backdrop: room })

describe('handovers', () => {
    it('finds one handover per pair, at the middle of the overlap', () => {
        // Not one per clip boundary. Boundaries come in pairs — one clip ends
        // at 7.2 while the next started at 4.95 — and veiling each separately
        // would dip the view twice per transition.
        const list = [clip('a', 0, 10), clip('b', 8, 20)]
        const found = handovers(list)
        expect(found).toHaveLength(1)
        expect(found[0].atSec).toBe(9)
    })

    it('scales the veil width to the overlap', () => {
        const tight = handovers([clip('a', 0, 10), clip('b', 9, 20)])[0]
        const loose = handovers([clip('a', 0, 10), clip('b', 4, 20)])[0]
        expect(loose.halfWidthSec).toBeGreaterThan(tight.halfWidthSec)
    })

    it('still covers a hard cut, which is the case that needs it most', () => {
        const [cut] = handovers([clip('a', 0, 10), clip('b', 10, 20)])
        expect(cut.isCut).toBe(true)
        expect(cut.halfWidthSec).toBeGreaterThan(0)
    })

    it('covers a gap too', () => {
        const [gap] = handovers([clip('a', 0, 10), clip('b', 14, 20)])
        expect(gap.isCut).toBe(true)
    })

    it('reads the list in time order, not array order', () => {
        // The director panel hands over whatever order the last drag produced.
        const shuffled = [clip('b', 8, 20), clip('a', 0, 10)]
        expect(handovers(shuffled)[0].atSec).toBe(9)
    })

    it('skips the handover into a row that declares veil: false', () => {
        // A row whose arrival is its own transition — the reel globe comes in
        // through a portal the metaball field opens — must not get the generic
        // grey dip stacked on top of the reveal.
        const list = [clip('a', 0, 10), { ...clip('b', 8, 20), veil: false }, clip('c', 18, 30)]
        const found = handovers(list)
        expect(found).toHaveLength(1)
        // The seam that survives is c's arrival, not b's.
        expect(found[0].atSec).toBe(19)
    })

    it('ignores rows with no backdrop', () => {
        // An asset clip placed over an existing scene is not a scene change —
        // veiling for it would dip the room for a cut-in.
        const list = [clip('a', 0, 10), { id: 'asset', startSec: 3, endSec: 5 }]
        expect(handovers(list)).toHaveLength(0)
    })

    it('has none for a single sequence', () => {
        expect(handovers([clip('a', 0, 10)])).toEqual([])
        expect(handovers([])).toEqual([])
    })
})

describe('veilAmount', () => {
    const list = [clip('a', 0, 10), clip('b', 8, 20)]

    it('is clear well away from any handover', () => {
        expect(veilAmount(list, 2)).toBe(0)
        expect(veilAmount(list, 15)).toBe(0)
    })

    it('peaks at the crossing point', () => {
        expect(veilAmount(list, 9)).toBeCloseTo(VEIL_PEAK, 6)
    })

    it('never fully blinds the viewer', () => {
        // A full white-out is a scene change you WATCH. Three of those in
        // thirty seconds turns the piece into a slideshow.
        for (let step = 0; step <= 400; step++) {
            expect(veilAmount(list, (step / 400) * 20)).toBeLessThan(1)
        }
    })

    it('rises and falls smoothly, with no jump at the edges', () => {
        // A veil that snaps on is a transition of its own rather than a cover
        // for one — and a luminance step is the thing headsets punish hardest.
        let previous = veilAmount(list, 0)
        for (let step = 1; step <= 600; step++) {
            const value = veilAmount(list, (step / 600) * 20)
            expect(Math.abs(value - previous)).toBeLessThan(0.05)
            previous = value
        }
    })

    it('takes the strongest of two close handovers rather than stacking them', () => {
        const crowded = [clip('a', 0, 10), clip('b', 8, 12), clip('c', 10, 20)]
        for (let step = 0; step <= 400; step++) {
            expect(veilAmount(crowded, (step / 400) * 20)).toBeLessThanOrEqual(VEIL_PEAK + 1e-9)
        }
    })
})

describe('bookendAmount', () => {
    it('opens from and closes to the veil', () => {
        // Mounting straight into a lit scene is abrupt on a monitor and
        // startling in a headset.
        expect(bookendAmount(30, 0)).toBeCloseTo(1, 6)
        expect(bookendAmount(30, 30)).toBeCloseTo(1, 6)
    })

    it('is clear through the body of the piece', () => {
        expect(bookendAmount(30, 15)).toBe(0)
    })

    it('survives a zero-length piece', () => {
        expect(bookendAmount(0, 0)).toBe(0)
    })
})

describe('the shipped edit list', () => {
    const total = ritualDurationSec()

    it('veils every handover except the ones that carry their own transition', () => {
        // Rows with veil: false arrive by a choreographed reveal (the reel
        // globe's portal) rather than under the generic dip, so they are not
        // counted — but everything else still gets covered.
        const rows = SEQUENCES.filter((s) => s.backdrop)
        const selfCovered = rows.filter((s, index) => index > 0 && s.veil === false)
        expect(handovers(SEQUENCES).length).toBe(rows.length - 1 - selfCovered.length)
        handovers(SEQUENCES).forEach(({ atSec }) => {
            expect(veilAmount(SEQUENCES, atSec)).toBeGreaterThan(0.5)
        })
    })

    it('leaves the portal reveal unveiled', () => {
        // The metaball -> globe overlap is 27.4..30.6s; the veil used to peak
        // at its middle, greying out the portal at the moment it opens.
        const globe = SEQUENCES.find((s) => s.id === 's06-reel-globe')
        const metaball = SEQUENCES.find((s) => s.id === 's05-metaball-field')
        expect(globe.veil).toBe(false)
        const crossing = (globe.startSec + metaball.endSec) / 2
        expect(veilAmount(SEQUENCES, crossing)).toBe(0)
    })

    it('leaves most of the piece unveiled', () => {
        // The veil is a cover for handovers, not a look. If it is up for a
        // large share of the run time the piece is being watched through gauze.
        let veiled = 0
        const steps = 800
        for (let step = 0; step <= steps; step++) {
            if (totalVeil(SEQUENCES, (step / steps) * total, total) > 0.05) veiled++
        }
        expect(veiled / steps).toBeLessThan(0.35)
    })

    it('never reaches full opacity anywhere in the piece', () => {
        for (let step = 0; step <= 800; step++) {
            expect(totalVeil(SEQUENCES, (step / 800) * total, total)).toBeLessThanOrEqual(1)
        }
    })

    it('fades the piece up from nothing and back down', () => {
        expect(totalVeil(SEQUENCES, 0, total)).toBeCloseTo(1, 3)
        expect(totalVeil(SEQUENCES, total, total)).toBeCloseTo(1, 3)
        expect(totalVeil(SEQUENCES, total / 2, total)).toBeLessThan(1)
    })
})
