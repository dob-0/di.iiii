import { describe, expect, it } from 'vitest'
import {
    applyTimingOverlay,
    hasTimingOverlay,
    readTimingSettings,
    timingOverlayFrom,
    writeTimingSettings
} from './timingOverlay.js'

const Component = () => null
const BASE = [
    { id: 'a', title: 'A', startSec: 0, endSec: 5.6, Component },
    { id: 'b', title: 'B', startSec: 4.4, endSec: 9.4, Component }
]

describe('timing overlay', () => {
    it('carries only the numbers that moved', () => {
        const edited = [BASE[0], { ...BASE[1], endSec: 11 }]
        expect(timingOverlayFrom(edited, BASE)).toEqual({ b: { endSec: 11 } })
    })

    // A row invented in the panel needs a Component, which is code — Copy is
    // the route for that, and the overlay must not pretend otherwise.
    it('ignores rows the file does not declare', () => {
        const edited = [...BASE, { id: 'new', startSec: 20, endSec: 25 }]
        expect(timingOverlayFrom(edited, BASE)).toEqual({})
    })

    it('never carries anything but timing', () => {
        const edited = [{ ...BASE[0], title: 'Renamed', note: 'rewritten' }, BASE[1]]
        expect(timingOverlayFrom(edited, BASE)).toEqual({})
    })

    it('applies an overlay without touching code fields', () => {
        const out = applyTimingOverlay(BASE, { a: { endSec: 6.2 } })
        expect(out[0]).toMatchObject({ id: 'a', title: 'A', endSec: 6.2, Component })
        expect(out[0].startSec).toBe(0)
        expect(out[1]).toBe(BASE[1])
    })

    // Identity is how a caller tells "nothing is saved" from "saved, and the
    // same" — a fresh array on every render would restart the piece's memos.
    it('returns the same array when nothing differs', () => {
        expect(applyTimingOverlay(BASE, null)).toBe(BASE)
        expect(applyTimingOverlay(BASE, {})).toBe(BASE)
        expect(applyTimingOverlay(BASE, { a: { endSec: 5.6 } })).toBe(BASE)
    })

    // A beat can be cut from the file while a stale override for it still sits
    // on the server. The piece has to keep playing.
    it('ignores overrides for rows that no longer exist, and junk values', () => {
        expect(applyTimingOverlay(BASE, { gone: { endSec: 99 } })).toBe(BASE)
        expect(applyTimingOverlay(BASE, { a: { endSec: 'soon' } })).toBe(BASE)
        expect(applyTimingOverlay(BASE, { a: { endSec: Infinity } })).toBe(BASE)
        expect(applyTimingOverlay(BASE, { a: null })).toBe(BASE)
    })

    it('round-trips through the settings blob and leaves other keys alone', () => {
        const overlay = { b: { startSec: 4 } }
        const settings = writeTimingSettings({ other: { keep: true } }, overlay)
        expect(settings.other).toEqual({ keep: true })
        expect(readTimingSettings(settings)).toEqual(overlay)
        expect(readTimingSettings({})).toBe(null)
        expect(hasTimingOverlay(overlay)).toBe(true)
        expect(hasTimingOverlay({})).toBe(false)
    })
})
