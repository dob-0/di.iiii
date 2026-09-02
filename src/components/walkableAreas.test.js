import { describe, expect, it } from 'vitest'
import { confineToAreas, isInsideAreas, nearestPointInAreas } from './walkableAreas.js'

// A corridor running along -Z with one room opening off its left side, i.e.
// the WCC floor plan in miniature.
const CORRIDOR = { minX: -3.5, maxX: 3.5, minZ: -20, maxZ: 10 }
const ROOM = { minX: -12, maxX: -3.5, minZ: -11, maxZ: -5 }
const AREAS = [CORRIDOR, ROOM]

describe('walkable areas', () => {
    it('leaves movement alone when no regions are declared', () => {
        expect(confineToAreas(null, 0, 0, 999, 999)).toEqual({ x: 999, z: 999 })
        expect(confineToAreas([], 0, 0, 999, 999)).toEqual({ x: 999, z: 999 })
        expect(isInsideAreas(null, 999, 999)).toBe(true)
    })

    it('allows movement inside a region', () => {
        expect(confineToAreas(AREAS, 0, 0, 1, -4)).toEqual({ x: 1, z: -4 })
    })

    it('blocks a walk straight through the corridor wall', () => {
        // heading -X from the middle of the corridor, at a z with no room
        expect(confineToAreas(AREAS, 0, 0, -9, 0)).toEqual({ x: 0, z: 0 })
    })

    it('lets the visitor step from the corridor into the adjoining room', () => {
        // the shared edge at x = -3.5 must not seal: this is what padding each
        // rectangle independently would break
        expect(confineToAreas(AREAS, -3, -8, -5, -8)).toEqual({ x: -5, z: -8 })
    })

    it('slides along a wall instead of stopping dead', () => {
        // pushing into the -X wall while also moving -Z keeps the -Z component
        expect(confineToAreas(AREAS, 0, 0, -9, -2)).toEqual({ x: 0, z: -2 })
        // and the mirror case keeps the -X component when only Z is blocked
        expect(confineToAreas(AREAS, -5, -8, -6, -20)).toEqual({ x: -6, z: -8 })
    })

    it('cannot leave the far end of the corridor', () => {
        expect(confineToAreas(AREAS, 0, -19, 0, -40)).toEqual({ x: 0, z: -19 })
    })

    it('walks a walker that starts outside every region back in, never freezing it', () => {
        const out = confineToAreas(AREAS, 100, 100, 99, 99)
        expect(isInsideAreas(AREAS, out.x, out.z)).toBe(true)
        expect(out).not.toEqual({ x: 100, z: 100 })
    })

    it('nearestPointInAreas clamps onto the closest rectangle', () => {
        expect(nearestPointInAreas(AREAS, 0, 40)).toEqual({ x: 0, z: 10 })
        expect(nearestPointInAreas(AREAS, -30, -8)).toEqual({ x: -12, z: -8 })
    })
})
