import { describe, expect, it } from 'vitest'
import {
    coveredCount,
    emptyRing,
    markHeading,
    ringReading,
    SECTOR_COUNT,
    SECTOR_DEGREES,
    sectorFor,
    widestGap
} from './sectorRing.js'

describe('sectorFor', () => {
    it('cuts the circle into 36 tens of a degree', () => {
        expect(SECTOR_COUNT).toBe(36)
        expect(SECTOR_DEGREES).toBe(10)
        expect(sectorFor(0)).toBe(0)
        expect(sectorFor(9.9)).toBe(0)
        expect(sectorFor(10)).toBe(1)
        expect(sectorFor(355)).toBe(35)
    })

    // A compass wraps and a browser is not careful about which side of 0 it
    // reports; the ring must not open a 36th sector nobody can reach.
    it('wraps rather than growing a sector nothing can fill', () => {
        expect(sectorFor(360)).toBe(0)
        expect(sectorFor(720)).toBe(0)
        expect(sectorFor(-10)).toBe(35)
        expect(sectorFor(-370)).toBe(35)
    })

    it('says nothing when there is no heading — a refused permission, not north', () => {
        expect(sectorFor(null)).toBeNull()
        expect(sectorFor(undefined)).toBeNull()
        expect(sectorFor(NaN)).toBeNull()
        expect(sectorFor('north')).toBeNull()
        // The one that bit: `Number(null)` is 0, which is a real heading — due
        // north — so a refused orientation permission would have filled the
        // ring's first sector with something nobody ever pointed at.
        expect(sectorFor('')).toBeNull()
    })
})

describe('markHeading', () => {
    it('fills the sector a heading falls in', () => {
        const ring = markHeading(emptyRing(), 95)
        expect(ring[9]).toBe(true)
        expect(coveredCount(ring)).toBe(1)
    })

    // A compass fires many times a second and a person holds still. Returning a
    // new array every time would re-render the whole ring on every event.
    it('returns the SAME ring when nothing changed', () => {
        const first = markHeading(emptyRing(), 95)
        expect(markHeading(first, 95)).toBe(first)
        expect(markHeading(first, 91)).toBe(first)
        expect(markHeading(first, 105)).not.toBe(first)
    })

    it('leaves the ring alone when there is no heading', () => {
        const ring = emptyRing()
        expect(markHeading(ring, null)).toBe(ring)
        expect(coveredCount(markHeading(ring, null))).toBe(0)
    })

    it('survives being handed something that is not a ring', () => {
        expect(coveredCount(markHeading(null, 20))).toBe(1)
        expect(markHeading([true, false], 20)).toHaveLength(SECTOR_COUNT)
    })
})

describe('widestGap', () => {
    // Nothing pointed at yet is not "no gap" — it is the biggest gap there is.
    it('is the whole circle for an untouched ring', () => {
        expect(widestGap(emptyRing())).toBe(360)
    })

    it('is nothing for a full ring', () => {
        const full = new Array(SECTOR_COUNT).fill(true)
        expect(widestGap(full)).toBe(0)
    })

    it('measures the arc nobody looked at', () => {
        // Headings every 10° from 0 to 170: half the circle covered.
        let ring = emptyRing()
        for (let heading = 0; heading < 180; heading += 10) ring = markHeading(ring, heading)
        expect(coveredCount(ring)).toBe(18)
        expect(widestGap(ring)).toBe(180)
    })

    // A walk that started facing south and turned both ways leaves its gap
    // straddling north. One gap, not two.
    it('counts a gap that wraps past north as one gap', () => {
        let ring = emptyRing()
        for (let heading = 40; heading < 320; heading += 10) ring = markHeading(ring, heading)
        // 40°..319° covered; the hole is 320°..39°, which is 80° wide.
        expect(widestGap(ring)).toBe(80)
    })

    it('reports the WIDEST hole, not the first or the sum', () => {
        let ring = emptyRing()
        // Cover everything, then punch a 20° hole and a 50° hole.
        for (let sector = 0; sector < SECTOR_COUNT; sector += 1) ring = markHeading(ring, sector * 10)
        const punched = [...ring]
        punched[3] = false
        punched[4] = false
        for (let sector = 20; sector < 25; sector += 1) punched[sector] = false
        expect(widestGap(punched)).toBe(50)
    })
})

describe('ringReading', () => {
    // "directions covered", never "room covered". A person can turn on the spot
    // in a doorway and fill this ring having seen nothing of the hall.
    it('counts directions against 36 and nothing else', () => {
        let ring = emptyRing()
        for (let heading = 0; heading < 90; heading += 10) ring = markHeading(ring, heading)
        expect(ringReading(ring)).toMatchObject({ covered: 9, total: 36 })
    })

    it('says nothing at all before the first heading', () => {
        expect(ringReading(emptyRing()).hint).toBe('')
    })

    it('asks for a turn when a whole arc was never looked at', () => {
        let ring = emptyRing()
        for (let heading = 0; heading < 180; heading += 10) ring = markHeading(ring, heading)
        expect(ringReading(ring).hint).toBe('turn — 180° never looked at')
    })

    // Under the camera's own field of view there is nothing to do about it.
    it('stays quiet about a gap narrower than the lens', () => {
        let ring = emptyRing()
        for (let sector = 0; sector < SECTOR_COUNT; sector += 1) ring = markHeading(ring, sector * 10)
        const punched = [...ring]
        punched[7] = false
        punched[8] = false
        expect(ringReading(punched).gap).toBe(20)
        expect(ringReading(punched).hint).toBe('')
    })
})
