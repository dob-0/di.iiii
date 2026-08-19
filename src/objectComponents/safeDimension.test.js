import { describe, expect, it } from 'vitest'
import { safeDimension } from './safeDimension.js'

// Regression coverage for the shape-primitive renderers (SphereObject,
// ConeObject, CylinderObject, PlaneObject, RingObject, TorusObject,
// CapsuleObject): src/shared/projectSchema.js only clamps primitive.size (a
// vector); scalar fields like radius/height reach the geometry constructor
// unclamped, and importLegacyScene.js's `object.sphereRadius || 0.5` lets a
// negative value through `||` unchanged. Without this guard a negative/NaN
// primitive dimension produced a degenerate or invisible mesh with no error.
describe('safeDimension', () => {
    it('passes through a normal positive value', () => {
        expect(safeDimension(0.6, 0.5)).toBe(0.6)
    })

    it('falls back on a non-finite value (NaN / Infinity / undefined)', () => {
        expect(safeDimension(NaN, 0.5)).toBe(0.5)
        expect(safeDimension(Infinity, 0.5)).toBe(0.5)
        expect(safeDimension(undefined, 0.5)).toBe(0.5)
    })

    it('rectifies a negative value instead of passing it to the geometry constructor', () => {
        // importLegacyScene.js: `object.sphereRadius || 0.5` lets -3 through untouched.
        expect(safeDimension(-3, 0.5)).toBe(3)
    })

    it('clamps to a minimum instead of producing a degenerate zero-size geometry', () => {
        expect(safeDimension(0, 0.5)).toBeGreaterThan(0)
        expect(safeDimension(null, 0.5)).toBeGreaterThan(0)
    })

    it('clamps an absurdly large authored value', () => {
        expect(safeDimension(1e9, 0.5)).toBe(100)
    })
})
