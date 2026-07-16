import { describe, expect, it } from 'vitest'
import { asColor } from './colorValue.js'

// Regression test for audit finding #18 (phase 4, 3D/viewport): port
// type-compatibility is only enforced in the UI's drag gesture — an edge
// created any other way (import, hand-edit, an op-log replay) can wire a
// vec3-typed output straight into a color input (nodeRegistry.js declares
// them cross-compatible), reaching THREE.Color unvalidated. A vec3 like a
// position ([8, 12, 4]) produces an out-of-range/garish color instead of a
// crash — this closes the gap at the render boundary.
describe('asColor', () => {
    it('passes a valid color string through untouched', () => {
        expect(asColor('#ff0000')).toBe('#ff0000')
        expect(asColor('red')).toBe('red')
    })

    it('passes a numeric hex color through untouched', () => {
        expect(asColor(0xff0000)).toBe(0xff0000)
    })

    it('clamps a finite 3-length array (a vec3 wired into a color input) to the 0-1 range', () => {
        expect(asColor([8, 12, 4])).toEqual([1, 1, 1])
        expect(asColor([-2, 0.5, 3])).toEqual([0, 0.5, 1])
        expect(asColor([0.2, 0.4, 0.6])).toEqual([0.2, 0.4, 0.6])
    })

    it('falls back to the default for a non-finite array (NaN/undefined components)', () => {
        expect(asColor([NaN, 0, 0])).toBe('#ffffff')
        expect(asColor([undefined, 0, 0])).toBe('#ffffff')
        expect(asColor(['not-a-number', 0, 0])).toBe('#ffffff')
    })

    it('falls back to the default for garbage input (object, null, too-short array)', () => {
        expect(asColor({ r: 1, g: 0, b: 0 })).toBe('#ffffff')
        expect(asColor(null)).toBe('#ffffff')
        expect(asColor(undefined)).toBe('#ffffff')
        expect(asColor([1, 2])).toBe('#ffffff')
    })

    it('uses a custom fallback when provided', () => {
        expect(asColor(null, '#000000')).toBe('#000000')
        expect(asColor([NaN, 0, 0], '#000000')).toBe('#000000')
    })
})
