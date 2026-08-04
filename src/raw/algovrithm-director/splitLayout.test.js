import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SPLIT,
    MAX_SPLIT,
    MIN_SPLIT,
    SPLIT_STORAGE_KEY,
    clampSplit,
    formatSplit,
    readSplit,
    splitFromPointer,
    writeSplit
} from './splitLayout.js'

/** Minimal Storage stand-in. `throws` reproduces Safari private mode. */
const fakeStorage = ({ initial = null, throws = false } = {}) => {
    let value = initial
    return {
        getItem: () => {
            if (throws) throw new Error('access denied')
            return value
        },
        setItem: (key, next) => {
            if (throws) throw new Error('access denied')
            expect(key).toBe(SPLIT_STORAGE_KEY)
            value = next
        },
        read: () => value
    }
}

describe('clampSplit', () => {
    it('keeps a sane fraction untouched', () => {
        expect(clampSplit(0.5)).toBe(0.5)
    })

    it('never lets either half be dragged out of existence', () => {
        expect(clampSplit(0)).toBe(MIN_SPLIT)
        expect(clampSplit(1)).toBe(MAX_SPLIT)
        expect(clampSplit(-4)).toBe(MIN_SPLIT)
    })

    it('falls back rather than passing NaN through to the CSS', () => {
        // NaN survives Math.min/Math.max, so without the guard this reaches the
        // custom property as `NaN%` and collapses the layout.
        expect(clampSplit(Number.NaN)).toBe(DEFAULT_SPLIT)
        expect(clampSplit(undefined)).toBe(DEFAULT_SPLIT)
        expect(clampSplit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SPLIT)
    })
})

describe('splitFromPointer', () => {
    it('gives the editor everything below the pointer', () => {
        // Divider dragged to a quarter from the top => editor keeps 75%, which
        // the ceiling then trims to MAX_SPLIT.
        expect(splitFromPointer(250, 1000)).toBe(MAX_SPLIT)
        expect(splitFromPointer(600, 1000)).toBeCloseTo(0.4, 5)
    })

    it('inverts, so dragging DOWN shrinks the editor', () => {
        const high = splitFromPointer(400, 1000)
        const low = splitFromPointer(700, 1000)
        expect(high).toBeGreaterThan(low)
    })

    it('survives a zero-height viewport during layout', () => {
        expect(splitFromPointer(100, 0)).toBe(DEFAULT_SPLIT)
    })
})

describe('formatSplit', () => {
    it('emits a percentage the custom property can use', () => {
        expect(formatSplit(0.45)).toBe('45.000%')
    })

    it('clamps before formatting, so no out-of-range value reaches the DOM', () => {
        expect(formatSplit(9)).toBe(`${(MAX_SPLIT * 100).toFixed(3)}%`)
    })
})

describe('storage', () => {
    it('round-trips a split', () => {
        const storage = fakeStorage()
        writeSplit(storage, 0.62)
        expect(readSplit(storage)).toBeCloseTo(0.62, 5)
    })

    it('defaults when nothing has been stored', () => {
        expect(readSplit(fakeStorage())).toBe(DEFAULT_SPLIT)
    })

    it('defaults on junk rather than collapsing the layout', () => {
        expect(readSplit(fakeStorage({ initial: 'tall' }))).toBe(DEFAULT_SPLIT)
    })

    it('clamps a stored value from an older or hand-edited range', () => {
        expect(readSplit(fakeStorage({ initial: '0.95' }))).toBe(MAX_SPLIT)
    })

    it('never throws when storage is blocked', () => {
        // Safari private mode throws on access rather than returning null.
        const blocked = fakeStorage({ throws: true })
        expect(() => writeSplit(blocked, 0.5)).not.toThrow()
        expect(readSplit(blocked)).toBe(DEFAULT_SPLIT)
    })

    it('does nothing when there is no storage at all', () => {
        expect(() => writeSplit(null, 0.5)).not.toThrow()
        expect(readSplit(undefined)).toBe(DEFAULT_SPLIT)
    })
})
