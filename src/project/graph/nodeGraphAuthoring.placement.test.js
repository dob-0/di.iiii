import { describe, expect, it } from 'vitest'
import { buildNodeValues, findFreeSpot } from './nodeGraphAuthoring.js'

// Every new object used to take its type's default position, so the SECOND
// thing you made landed exactly inside the first and a scene became a pile at
// the origin. Reported as "i have create other geometry what it will happen so
// there are still something wrong" — and it was.
describe('where a new object stands', () => {
    it('takes the middle of the room when the room is empty', () => {
        expect(findFreeSpot([], 0.5)).toEqual([0, 0.5, 0])
    })

    it('steps aside when the middle is taken', () => {
        const spot = findFreeSpot([[0, 0.5, 0]], 0.5)
        expect(spot).not.toEqual([0, 0.5, 0])
        expect(Math.hypot(spot[0], spot[2])).toBeGreaterThan(0.9)
    })

    it('never lands inside anything already there, however many there are', () => {
        const placed = []
        for (let i = 0; i < 20; i += 1) {
            const spot = findFreeSpot(placed, 0.5)
            for (const other of placed) {
                expect(
                    Math.hypot(spot[0] - other[0], spot[2] - other[2]),
                    `object ${i} landed on top of another`
                ).toBeGreaterThanOrEqual(0.9)
            }
            placed.push(spot)
        }
    })

    // A row marches off into the distance and is out of shot by the fifth
    // object; a ring keeps the scene in view.
    it('keeps them all within sight of each other', () => {
        const placed = []
        for (let i = 0; i < 12; i += 1) placed.push(findFreeSpot(placed, 0.5))
        for (const spot of placed) expect(Math.hypot(spot[0], spot[2])).toBeLessThan(9)
    })

    it('honours a real 3D point when there is one — pointing wins over stepping aside', () => {
        const values = buildNodeValues('geom.cube', {}, { point: [3, 0, -2] }, { occupied: [[0, 0.5, 0]] })
        expect(values.position[0]).toBe(3)
        expect(values.position[2]).toBe(-2)
    })

    it('steps aside when placed from the canvas, where there is no 3D point', () => {
        const values = buildNodeValues('geom.sphere', {}, { graphX: 10, graphY: 10 }, { occupied: [[0, 1.2, 0]] })
        expect(Math.hypot(values.position[0], values.position[2])).toBeGreaterThan(0.9)
    })

    // Callers that pass nothing keep exactly the old behaviour.
    it('changes nothing for a caller that does not say what is in the room', () => {
        const values = buildNodeValues('geom.cube', {}, {}, {})
        expect(values.position).toEqual([0, 0.5, 0])
    })
})
