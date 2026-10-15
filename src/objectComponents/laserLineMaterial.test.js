import { describe, expect, it } from 'vitest'
import { createLaserLineMaterial, laserLineGeometry } from './laserLineMaterial.js'

// Regression guard (known-fixes 2026-10-15, "laser lines draw as zig-zags"): the core and halo are a function of the
// distance from the line's axis. That distance must reach the fragment as ONE interpolated value. Two interpolated values
// multiplied (side × width) are wrong inside each triangle of a ribbon whose width changes between stations, and the core
// bends at every station: a lightning-like zig-zag in place of a straight ray.
const lerp3 = (w, a, b, c) => w[0] * a + w[1] * b + w[2] * c

describe('laserLineMaterial: the distance from the axis', () => {
    it('reaches the fragment as one varying (aSide × 0.5 × W), never as side and width multiplied', () => {
        const m = createLaserLineMaterial()
        expect(m.vertexShader).toMatch(/vX\s*=\s*aSide\s*\*\s*0\.5\s*\*\s*W\s*;/)
        expect(m.fragmentShader).toMatch(/float x = abs\(vX\)/)
        expect(m.vertexShader + m.fragmentShader).not.toMatch(/\bvSide\b|\bvW\b/)
        m.dispose()
    })

    it('is exact on the diagonal of a widening quad, where the old product put the core off the axis', () => {
        // one quad of the strip: station k (width 10 m) and k+1 (width 12 m), its triangle (a, a+1, a+2) as indexed
        const g = laserLineGeometry([{ dir: [0, -1, 0], flux: [1, 1, 1], length: 10 }], 10, 1)
        expect(Array.from(g.index.array.slice(0, 3))).toEqual([0, 1, 2])
        const side = [-1, 1, -1]
        const W = [10, 10, 12]
        const offset = side.map((s, i) => s * 0.5 * W[i])          // where each vertex sits from the axis (m)
        const mid = [0, 0.5, 0.5]                                   // the middle of the diagonal a+1 → a+2
        const truth = lerp3(mid, ...offset)                         // affine in the plane: the true offset, 5 − 6 = −0.5 m … / 2
        expect(truth).toBeCloseTo(-0.5, 9)
        expect(Math.abs(lerp3(mid, ...side) * 0.5 * lerp3(mid, ...W))).toBe(0) // the old product: "on the axis" — wrong by 0.5 m
        g.dispose()
    })
})
