import { describe, expect, it } from 'vitest'
import { cornerPinTransform } from './cornerPin.js'
import { buildWarpMesh, edgePoint, pinFunction, warpFunction, warpOutline } from './warpMesh.js'

const near = (point, expected, digits = 5) => {
    expect(point[0]).toBeCloseTo(expected[0], digits)
    expect(point[1]).toBeCloseTo(expected[1], digits)
}

// A keystone: the top narrower than the bottom, the way a projector below
// a wall draws a rectangle.
const keystone = [[0.2, 0.1], [0.8, 0.1], [0.9, 0.9], [0.1, 0.9]]

describe('the pin as a function', () => {
    it('sends the unit corners to the corners', () => {
        const pin = pinFunction(keystone)
        near(pin(0, 0), keystone[0])
        near(pin(1, 0), keystone[1])
        near(pin(1, 1), keystone[2])
        near(pin(0, 1), keystone[3])
    })

    it('is the same pin the CSS matrix3d uses — the centre lands where perspective puts it, not the bilinear middle', () => {
        // matrix3d is a projective map; the centre of a keystone sits nearer
        // the wide end than halfway. Compare against the matrix itself.
        const pin = pinFunction(keystone.map(([x, y]) => [x * 1000, y * 1000]))
        const matrix = cornerPinTransform(1, 1, keystone.map(([x, y]) => [x * 1000, y * 1000]))
        const m = matrix.match(/matrix3d\(([^)]+)\)/)[1].split(',').map(Number)
        // Column-major 4x4; a 2D point (x, y, 0, 1).
        const x = 0.5; const y = 0.5
        const w = (m[3] * x) + (m[7] * y) + m[15]
        const expected = [((m[0] * x) + (m[4] * y) + m[12]) / w, ((m[1] * x) + (m[5] * y) + m[13]) / w]
        near(pin(0.5, 0.5), expected, 3)
    })
})

describe('sides and parameters', () => {
    it('run from each corner to the next, the way the corners are numbered', () => {
        expect(edgePoint(0, 0.25)).toEqual([0.25, 0])
        expect(edgePoint(1, 0.25)).toEqual([1, 0.25])
        expect(edgePoint(2, 0.25)).toEqual([0.75, 1])
        expect(edgePoint(3, 0.25)).toEqual([0, 0.75])
    })
})

describe('the warp', () => {
    it('is exactly the pin when there are no points', () => {
        const pin = pinFunction(keystone)
        const warp = warpFunction(keystone, [])
        for (const [u, v] of [[0.3, 0.7], [0.5, 0.5], [0.9, 0.1]]) near(warp(u, v), pin(u, v))
    })

    it('passes the edge through a point exactly where it was dragged', () => {
        const dragged = { side: 0, t: 0.5, x: 0.5, y: 0.3 }
        const warp = warpFunction(keystone, [dragged])
        near(warp(0.5, 0), [0.5, 0.3])
    })

    it('leaves the corners and the opposite edge where they were', () => {
        const warp = warpFunction(keystone, [{ side: 0, t: 0.5, x: 0.5, y: 0.3 }])
        const pin = pinFunction(keystone)
        near(warp(0, 0), keystone[0])
        near(warp(1, 0), keystone[1])
        near(warp(0.5, 1), pin(0.5, 1))
    })

    it('bends the inside proportionally between the pulled edge and the still one', () => {
        const warp = warpFunction(keystone, [{ side: 0, t: 0.5, x: 0.5, y: 0.3 }])
        const pin = pinFunction(keystone)
        const pull = 0.3 - pin(0.5, 0)[1]
        const mid = warp(0.5, 0.5)
        expect(mid[1] - pin(0.5, 0.5)[1]).toBeCloseTo(pull * 0.5, 5)
    })

    it('runs the bottom and left sides the other way round, so a bottom point still lands where it was dragged', () => {
        const dragged = { side: 2, t: 0.25, x: 0.7, y: 0.95 }
        const warp = warpFunction(keystone, [dragged])
        const [u, v] = edgePoint(2, 0.25)
        near(warp(u, v), [0.7, 0.95])
        const left = { side: 3, t: 0.5, x: 0.05, y: 0.5 }
        const warp2 = warpFunction(keystone, [left])
        const [u2, v2] = edgePoint(3, 0.5)
        near(warp2(u2, v2), [0.05, 0.5])
    })
})

describe('the mesh', () => {
    it('has the right shape and its corners on the pinned corners, in pixels', () => {
        const mesh = buildWarpMesh(keystone, [], 1920, 1080, 4)
        expect(mesh.positions.length).toBe(25 * 2)
        expect(mesh.indices.length).toBe(16 * 6)
        near([mesh.positions[0], mesh.positions[1]], [0.2 * 1920, 0.1 * 1080])
        const last = 24 * 2
        near([mesh.positions[last], mesh.positions[last + 1]], [0.9 * 1920, 0.9 * 1080])
        expect(mesh.uvs[last]).toBe(1)
        expect(mesh.uvs[last + 1]).toBe(1)
        expect(mesh.degenerate).toBe(false)
    })

    it('reports a collapsed surface rather than drawing it', () => {
        const flat = [[0, 0], [1, 0], [1, 0], [0, 0]]
        expect(buildWarpMesh(flat, [], 100, 100, 2).degenerate).toBe(true)
    })
})

describe('the outline', () => {
    it('walks the corners in order with each side\'s points between them, sorted along the side', () => {
        const points = [{ side: 2, t: 0.7, x: 0.3, y: 0.95 }, { side: 0, t: 0.6, x: 0.6, y: 0.05 }, { side: 0, t: 0.2, x: 0.3, y: 0.05 }]
        const outline = warpOutline(keystone, points)
        expect(outline.map((entry) => entry.corner ?? `p${entry.index}`)).toEqual([0, 'p2', 'p1', 1, 2, 'p0', 3])
    })
})
