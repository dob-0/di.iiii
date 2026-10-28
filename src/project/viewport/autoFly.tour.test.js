import { describe, expect, it } from 'vitest'
import { checkFlight, sampleFlight, tourPath, tourStops, TOUR_DEFAULTS } from './autoFly.js'

// A round hall like the Dilijan one: doors on a ring of 24 m, a board standing between two of them.
const frame = { bounds: { min: [-30, 0, -30], max: [30, 20, 30] }, floorY: 0, roofCut: 20, center: [0, 5, 0], radius: 40 }
const doors = [0, 60, 120, 180, 240, 300].map((deg) => [24 * Math.cos((deg * Math.PI) / 180), 2, 24 * Math.sin((deg * Math.PI) / 180)])
const board = { min: [10, 0, -1.5], max: [14, 7, 1.5] }   // across the path between the doors at 300° and 0°... and 0° itself
const path = tourPath(frame, doors, { obstacles: [board] })

describe('tourPath', () => {
    it('stays inside the room and never banks', () => {
        const c = checkFlight(path, frame)
        expect(c.outside).toBe(0)
        expect(c.rollMaxDeg).toBe(0)
        expect(c.speedMax).toBeLessThanOrEqual(TOUR_DEFAULTS.maxSpeed + 1e-9)
    })
    it('halts in front of each door, looking into it', () => {
        for (const s of tourStops(frame, doors)) {
            const flat = (q) => Math.hypot(q.x - s.eye[0], q.z - s.eye[2])
            const i = path.pts.reduce((best, q, k) => (flat(q) < flat(path.pts[best]) ? k : best), 0)
            expect(path.speed[i]).toBeLessThan(0.8)
            const at = path.look[i]
            expect(Math.hypot(at.x - s.at[0], at.z - s.at[2])).toBeLessThan(1.5)
        }
    })
    it('never passes through the board: every sample in its footprint is above it', () => {
        const k = TOUR_DEFAULTS.clearance
        const inside = path.pts.filter((q) => q.x > board.min[0] - k && q.x < board.max[0] + k && q.z > board.min[2] - k && q.z < board.max[2] + k)
        expect(inside.length).toBeGreaterThan(0)
        for (const q of inside) expect(q.y).toBeGreaterThanOrEqual(board.max[1] + k - 1e-6)
    })
    it('samples at any time with the door as the look target, and loops', () => {
        const a = sampleFlight(path, 3)
        const b = sampleFlight(path, 3 + path.duration)
        expect(a.eye).toEqual(b.eye)
        expect(a.roll).toBe(0)
    })
    it('needs two doors', () => {
        expect(tourPath(frame, [doors[0]])).toBeNull()
    })
})

describe('doorsFrame and tourDoors', async () => {
    const { doorsFrame, tourDoors } = await import('./autoFly.js')
    it('spans the doors, widened, from the floor up', () => {
        const f = doorsFrame(doors)
        expect(f.bounds.min[0]).toBeCloseTo(-30)
        expect(f.bounds.max[2]).toBeCloseTo(24 * Math.sin(Math.PI / 3) + 6)
        expect(f.floorY).toBe(0)
        expect(f.bounds.max[1]).toBe(10)
        const p = tourPath(f, doors)
        expect(checkFlight(p, f).outside).toBe(0)
    })
    it('takes only top-level portals with a position', () => {
        expect(tourDoors([
            { type: 'portal', components: { transform: { position: [1, 2, 3] } } },
            { type: 'portal', parentId: 'g', components: { transform: { position: [0, 0, 0] } } },
            { type: 'box', components: { transform: { position: [0, 0, 0] } } }
        ])).toEqual([[1, 2, 3]])
        expect(doorsFrame([[0, 0, 0]])).toBeNull()
    })
})
