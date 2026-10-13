import { describe, it, expect } from 'vitest'
import {
    laserUnitKey, laserUnitsOf, unitMembersOf, unitFrame, fieldRays, cornersOnPlane, measureSquare, squareLabel
} from './laserTest.js'

const DEG = Math.PI / 180
const laserEntity = (id, extra = {}) => ({ id, components: { beam: { laser: { mW: [1, 1, 1] } }, ...extra } })

describe('laser unit grouping', () => {
    it('a unit is the beams that share an id without its trailing letter, or a named unit', () => {
        expect(laserUnitKey({ id: 'rig-laser-41a' })).toBe('rig-laser-41')
        expect(laserUnitKey({ id: 'rig-laser-41f' })).toBe('rig-laser-41')
        expect(laserUnitKey({ id: 'rig-laser-41' })).toBe('rig-laser-41')
        expect(laserUnitKey({ id: 'x1a', components: { beam: { laser: { unit: 'cube-A' } } } })).toBe('cube-A')
        expect(laserUnitKey({ id: 'plain' })).toBe('plain')
    })
    it('laserUnitsOf lists visible laser lines by unit; a lamp or a hidden line is not in it', () => {
        const entities = [
            laserEntity('rig-laser-11a'), laserEntity('rig-laser-11b'), laserEntity('rig-laser-12a'),
            laserEntity('rig-laser-12b', { runtime: { visible: false } }),
            { id: 'lamp-1', components: { light: {} } }
        ]
        const units = laserUnitsOf(entities)
        expect([...units.keys()]).toEqual(['rig-laser-11', 'rig-laser-12'])
        expect(units.get('rig-laser-11')).toEqual(['rig-laser-11a', 'rig-laser-11b'])
        expect(units.get('rig-laser-12')).toEqual(['rig-laser-12a'])
    })
    it('unitMembersOf: one line selects every line of its unit; other ids pass through; locked lines stay out', () => {
        const entities = [
            laserEntity('u1a'), laserEntity('u1b'), laserEntity('u1c', { runtime: { locked: true } }), laserEntity('u2a'),
            { id: 'lamp', components: { light: {} } }
        ]
        expect(unitMembersOf(entities, ['u1b']).sort()).toEqual(['u1a', 'u1b'])
        expect(unitMembersOf(entities, ['u1a', 'lamp']).sort()).toEqual(['lamp', 'u1a', 'u1b'])
        expect(unitMembersOf(entities, ['lamp'])).toEqual(['lamp'])
    })
})

describe('the square a unit throws', () => {
    // three lines leaving one aperture at (0, 3, 0), pointing at -Z with +-5 deg of spread; mean axis -Z
    const beams = [-5, 0, 5].map((a) => ({ position: [0, 3, 0], direction: [Math.sin(a * DEG), 0, -Math.cos(a * DEG)] }))

    it('origin is the mean of the beams, axis the mean direction', () => {
        const f = unitFrame([{ position: [0, 3, 0], direction: [0, 0, -1] }, { position: [2, 3, 0], direction: [0, 0, -1] }])
        expect(f.origin).toEqual([1, 3, 0])
        const g = unitFrame(beams)
        expect(g.axis[0]).toBeCloseTo(0, 9)
        expect(g.axis[2]).toBeCloseTo(-1, 9)
        expect(unitFrame([])).toBeNull()
    })
    it('corners on a wall square to the axis at 10 m: edge = 2 * 10 * tan(H), for a 18.5 deg half field', () => {
        const f = unitFrame(beams)
        const c = cornersOnPlane(f, 18.5, 10)
        const side = 2 * 10 * Math.tan(18.5 * DEG)
        const m = measureSquare(f.origin, c, [0, 3, -10])
        expect(m.complete).toBe(true)
        expect(m.width).toBeCloseTo(side, 9)
        expect(m.height).toBeCloseTo(side, 9)
        expect(m.width).toBeCloseTo(6.69, 2)
        expect(m.distance).toBeCloseTo(10, 9)
        // the four corners sit at z = -10 and the right corner is on +X (looking down -Z, up is +Y, right is +X)
        for (const p of c) expect(p[2]).toBeCloseTo(-10, 9)
        expect(c[1][0]).toBeGreaterThan(0)
        expect(c[0][1]).toBeGreaterThan(3)
    })
    it('a wall turned 30 deg off square: the near edge is shorter than the far one, width is their mean', () => {
        const f = unitFrame(beams)
        const rays = fieldRays(f, 18.5)
        // wall through (0,3,-10) with normal n = (sin30, 0, cos30): hit t = d / dot(ray, -n)... solve n.(o + t r - p0) = 0
        const n = [Math.sin(30 * DEG), 0, Math.cos(30 * DEG)]
        const p0 = [0, 3, -10]
        const hit = (r) => {
            const t = (n[0] * (p0[0] - f.origin[0]) + n[2] * (p0[2] - f.origin[2])) / (n[0] * r[0] + n[2] * r[2])
            return [f.origin[0] + t * r[0], f.origin[1] + t * r[1], f.origin[2] + t * r[2]]
        }
        const corners = rays.corners.map(hit)
        const m = measureSquare(f.origin, corners, hit(rays.centre))
        // independent check of the left/right asymmetry: the right edge runs farther (the wall recedes to +X side? it comes toward -X)
        // the wall passes through the axis point at 10 m, so the centre ray still measures 10 m
        expect(m.distance).toBeCloseTo(10, 9)
        // the two side edges differ (the +X side meets the wall farther out than the -X side), width and height are their means;
        // values from the line-plane intersection above, computed once and pinned
        expect(m.edges[1]).toBeCloseTo(8.294, 2)
        expect(m.edges[3]).toBeCloseTo(5.608, 2)
        expect(m.width).toBeCloseTo(8.138, 2) // a slanted wall stretches the picture (flat: 6.69)
        expect(m.height).toBeCloseTo((8.294 + 5.608) / 2, 2)
    })
    it('moving the unit moves the square: twice as far, twice as wide', () => {
        const f = unitFrame(beams)
        const near = measureSquare(f.origin, cornersOnPlane(f, 18.5, 8), [0, 3, -8])
        const far = measureSquare(f.origin, cornersOnPlane(f, 18.5, 16), [0, 3, -16])
        expect(far.width / near.width).toBeCloseTo(2, 9)
    })
    it('a vertical axis still has a frame (right falls back to +X)', () => {
        const f = unitFrame([{ position: [0, 5, 0], direction: [0, -1, 0] }])
        expect(Math.hypot(...f.right)).toBeCloseTo(1, 9)
        const c = cornersOnPlane(f, 18.5, 5)
        const m = measureSquare(f.origin, c, [0, 0, 0])
        expect(m.width).toBeCloseTo(2 * 5 * Math.tan(18.5 * DEG), 9)
    })
})

describe('the label', () => {
    it('reads width x height in metres and the distance to the centre hit', () => {
        const m = { complete: true, centreHit: true, width: 9.64, height: 9.6, distance: 14.23 }
        expect(squareLabel('Cube 1', m)).toBe('Cube 1 · 9.6 × 9.6 m · 14.2 m')
    })
    it('says what is missing when a ray finds no surface', () => {
        expect(squareLabel('Cube 1', { complete: false, centreHit: false })).toBe('Cube 1 · no surface in reach')
        expect(squareLabel('Cube 1', { complete: false, centreHit: true, distance: 7 })).toBe('Cube 1 · size: a corner found no surface · 7.0 m')
    })
})
