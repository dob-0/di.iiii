import { describe, expect, it } from 'vitest'
import { geometryPoints, geometryTriangles } from './geometryPoints.js'

const each = (cloud, check) => {
    for (let point = 0; point < cloud.count; point++) {
        check(cloud.positions[point * 3], cloud.positions[point * 3 + 1], cloud.positions[point * 3 + 2])
    }
}

describe('geometryPoints', () => {
    it('puts every point on the surface of a wired sphere, standing on the floor as the viewport draws it', () => {
        // A Sphere's piece is lifted by its radius (laserTrace pieceShape), so its centre is (0, r, 0).
        const cloud = geometryPoints({ kind: 'sphere', radius: 0.5 }, 2000)
        expect(cloud.count).toBe(2000)
        each(cloud, (x, y, z) => {
            // The 32x32 mesh is inscribed: its flat faces sit up to ~0.5% inside the true radius.
            const r = Math.hypot(x, y - 0.5, z)
            expect(r).toBeGreaterThan(0.49)
            expect(r).toBeLessThanOrEqual(0.5 + 1e-5)
        })
    })

    it('puts every point on the faces of a box, not inside it', () => {
        const cloud = geometryPoints({ kind: 'box', size: [2, 1, 1] }, 1000)
        each(cloud, (x, y, z) => {
            const onFace = Math.abs(Math.abs(x) - 1) < 1e-5 || Math.abs(y) < 1e-5 || Math.abs(y - 1) < 1e-5
                || Math.abs(Math.abs(z) - 0.5) < 1e-5
            expect(onFace).toBe(true)
        })
    })

    it('carries the group frame: an Array of two spheres offset by 3 gives points around both', () => {
        const sphere = { kind: 'sphere', radius: 0.5 }
        const pair = {
            kind: 'group',
            children: [
                { kind: 'group', position: [0, 0, 0], children: [sphere] },
                { kind: 'group', position: [3, 0, 0], children: [sphere] }
            ]
        }
        const cloud = geometryPoints(pair, 4000)
        let left = 0
        let right = 0
        each(cloud, (x) => { if (x < 1.5) left += 1; else right += 1 })
        // Equal areas: expected 2000 each, sd ~32; 1800..2200 is six sd.
        expect(left).toBeGreaterThan(1800)
        expect(right).toBeGreaterThan(1800)
        each(cloud, (x) => expect(x < 0.51 || (x > 2.49 && x < 3.51)).toBe(true))
    })

    it('gives no points for a line, nothing, or something that is not geometry', () => {
        expect(geometryPoints({ kind: 'line', from: [0, 0, 0], to: [1, 0, 0] }, 100).count).toBe(0)
        expect(geometryPoints(undefined, 100).count).toBe(0)
        expect(geometryPoints({ kind: 'teapot' }, 100).count).toBe(0)
        expect(geometryTriangles(undefined).length).toBe(0)
    })

    it('is the same cloud on every load, and a different one for another seed', () => {
        const cube = { kind: 'box', size: [1, 1, 1] }
        expect(geometryPoints(cube, 300, 7)).toEqual(geometryPoints(cube, 300, 7))
        expect(geometryPoints(cube, 300, 7)).not.toEqual(geometryPoints(cube, 300, 8))
    })
})
