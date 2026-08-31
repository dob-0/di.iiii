import { beforeEach, describe, expect, it } from 'vitest'
import {
    DISPERSION_DEFAULTS,
    DISPERSION_KEYS,
    DISPERSION_RANGES,
    clampControl,
    dispersionControls,
    dispersionSource,
    normaliseControls,
    resetDispersionControls,
    setDispersionControl
} from './dispersionControls.js'

// The module holds live mutable state on purpose (see its header), so every
// test starts from the committed defaults rather than from whatever the
// previous one left behind.
beforeEach(() => {
    resetDispersionControls()
})

describe('clampControl', () => {
    it('holds a value inside its declared range', () => {
        expect(clampControl('speed', 99)).toBe(DISPERSION_RANGES.speed.max)
        expect(clampControl('speed', -5)).toBe(DISPERSION_RANGES.speed.min)
        expect(clampControl('turbulence', 0.5)).toBe(0.5)
    })

    it('falls back to the default rather than passing NaN through', () => {
        // A range input hands back a string, and an emptied one hands back ''.
        // NaN in a uniform does not throw — it propagates through the shader
        // and the sphere goes black, which is indistinguishable from a compile
        // failure and sends you reading GLSL instead of reading this.
        expect(clampControl('bloom', '')).toBe(DISPERSION_DEFAULTS.bloom)
        expect(clampControl('bloom', 'nonsense')).toBe(DISPERSION_DEFAULTS.bloom)
        expect(clampControl('bloom', undefined)).toBe(DISPERSION_DEFAULTS.bloom)
        expect(clampControl('bloom', Infinity)).toBe(DISPERSION_DEFAULTS.bloom)
    })

    it('coerces the strings a range input actually produces', () => {
        expect(clampControl('sphereSize', '7.5')).toBe(7.5)
    })

    it('leaves an unknown key alone instead of inventing a range for it', () => {
        expect(clampControl('notAControl', 42)).toBe(42)
    })
})

describe('the declared ranges', () => {
    it('covers every default, and every default sits inside its range', () => {
        // The panel renders one slider per key from DISPERSION_KEYS and reads
        // its bounds from DISPERSION_RANGES. A key present in one and missing
        // from the other renders a slider with no min/max — which silently
        // becomes 0..100 in the browser, not an error.
        DISPERSION_KEYS.forEach((key) => {
            const range = DISPERSION_RANGES[key]
            expect(range, key).toBeTruthy()
            expect(range.max).toBeGreaterThan(range.min)
            expect(DISPERSION_DEFAULTS[key]).toBeGreaterThanOrEqual(range.min)
            expect(DISPERSION_DEFAULTS[key]).toBeLessThanOrEqual(range.max)
        })
    })

    it('declares no range without a default behind it', () => {
        expect(Object.keys(DISPERSION_RANGES).sort()).toEqual([...DISPERSION_KEYS].sort())
    })
})

describe('normaliseControls', () => {
    it('fills every missing key from the defaults', () => {
        expect(normaliseControls({})).toEqual(DISPERSION_DEFAULTS)
    })

    it('clamps what it is given', () => {
        expect(normaliseControls({ sphereSize: 500 }).sphereSize)
            .toBe(DISPERSION_RANGES.sphereSize.max)
    })
})

describe('the live control object', () => {
    it('is what setDispersionControl writes to, clamped', () => {
        setDispersionControl('speed', 0.8)
        expect(dispersionControls.speed).toBe(0.8)
        setDispersionControl('speed', 40)
        expect(dispersionControls.speed).toBe(DISPERSION_RANGES.speed.max)
    })

    it('ignores a key it does not own', () => {
        setDispersionControl('somethingElse', 1)
        expect(dispersionControls.somethingElse).toBeUndefined()
    })

    it('is restored wholesale by reset', () => {
        setDispersionControl('bloom', 1.9)
        setDispersionControl('turbulence', 0)
        resetDispersionControls()
        expect({ ...dispersionControls }).toEqual(DISPERSION_DEFAULTS)
    })
})

describe('dispersionSource', () => {
    it('emits every key as pasteable source', () => {
        const source = dispersionSource()
        DISPERSION_KEYS.forEach((key) => {
            expect(source).toContain(`${key}:`)
        })
    })

    it('rounds off float noise rather than pasting back 0.35000000000000003', () => {
        setDispersionControl('speed', 0.1 + 0.25)
        expect(dispersionSource()).toContain('speed: 0.35')
    })
})
