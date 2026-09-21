import { describe, it, expect } from 'vitest'
import {
    quatFromTo, applyQuat, eulerFromQuaternion, fitTransform,
    walkableFromBounds, spawnFrom, buildPlaceRecord, readPlaceRecord
} from './fit-lib.mjs'
import { chooseScale, DOOR_HEIGHT_METRES } from './fit.mjs'

const close = (actual, expected, tolerance = 1e-6) => {
    expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
}

describe('quatFromTo', () => {
    it('turns a tipped floor normal onto +Y', () => {
        // Written to four decimals, so it is not quite a unit vector — the
        // slack here is that rounding, not the maths.
        const tipped = [0.3692, 0.9034, 0.218]
        const turned = applyQuat(tipped, quatFromTo(tipped, [0, 1, 0]))
        close(turned[0], 0, 1e-4)
        close(turned[1], 1, 1e-4)
        close(turned[2], 0, 1e-4)
    })

    it('does nothing to a normal that already points up', () => {
        expect(quatFromTo([0, 1, 0], [0, 1, 0])).toEqual([0, 0, 0, 1])
    })

    it('handles a room that came back exactly upside down', () => {
        const turned = applyQuat([0, -1, 0], quatFromTo([0, -1, 0], [0, 1, 0]))
        close(turned[1], 1, 1e-6)
    })
})

describe('eulerFromQuaternion', () => {
    it('round-trips: the Euler rotates a point the same way the quaternion did', () => {
        const q = quatFromTo([0.4, 0.8, 0.45], [0, 1, 0])
        const [ex, ey, ez] = eulerFromQuaternion(q)
        // three.js XYZ Euler → matrix, applied by hand
        const [cx, sx] = [Math.cos(ex), Math.sin(ex)]
        const [cy, sy] = [Math.cos(ey), Math.sin(ey)]
        const [cz, sz] = [Math.cos(ez), Math.sin(ez)]
        const m = [
            [cy * cz, -cy * sz, sy],
            [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
            [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy]
        ]
        const point = [1.3, -0.7, 2.2]
        const byEuler = m.map((row) => row[0] * point[0] + row[1] * point[1] + row[2] * point[2])
        const byQuat = applyQuat(point, q)
        byEuler.forEach((value, index) => close(value, byQuat[index], 1e-6))
    })
})

describe('fitTransform', () => {
    // A room 8 x 3 x 6 model units, floor plane at y = 0.2 (there is slab
    // below it), sitting off to one side of the model's origin.
    const bounds = { min: [10, 0, -4], max: [18, 3.2, 2] }

    it('puts the floor PLANE on y=0 and the room over the origin', () => {
        const fit = fitTransform({ floorNormal: [0, 1, 0], bounds, floorY: 0.2, scale: 1 })
        expect(fit.position).toEqual([-14, -0.2, 1])
        expect(fit.placedBounds.min[1]).toBeCloseTo(-0.2)   // the slab, below the floor
        expect(fit.placedBounds.max[1]).toBeCloseTo(3.0)    // 3 m to the ceiling
        expect(fit.placedBounds.min[0]).toBeCloseTo(-4)
        expect(fit.placedBounds.max[0]).toBeCloseTo(4)
    })

    it('scales every length by the same number', () => {
        const fit = fitTransform({ floorNormal: [0, 1, 0], bounds, floorY: 0.2, scale: 2.5 })
        expect(fit.size).toEqual([20, 8, 15])
        expect(fit.placedBounds.max[1]).toBeCloseTo(7.5)
    })

    it('places a point of the model where the room will actually have it', () => {
        const fit = fitTransform({ floorNormal: [0, 1, 0], bounds, floorY: 0.2, scale: 2 })
        // the far corner of the floor
        expect(fit.place([18, 0.2, 2])).toEqual([fit.placedBounds.max[0], 0, fit.placedBounds.max[2]])
    })

    it('uses a given quaternion over the bare normal, so the room stays square', () => {
        const square = [0, 0.3826834, 0, 0.9238795]   // 45 degrees about +Y
        const fit = fitTransform({ quaternion: square, floorNormal: [0, 1, 0], bounds, scale: 1 })
        expect(fit.quaternion).toBe(square)
        expect(fit.rotation[1]).toBeCloseTo(Math.PI / 4, 5)
    })
})

describe('walkableFromBounds', () => {
    it('keeps the visitor off the walls', () => {
        const areas = walkableFromBounds({ min: [-4, 0, -3], max: [4, 3, 3] }, 0.6)
        expect(areas).toHaveLength(1)
        expect(areas[0]).toEqual({ minX: -3.4, maxX: 3.4, minZ: -2.4, maxZ: 2.4 })
    })

    it('never insets a small room out of existence', () => {
        const areas = walkableFromBounds({ min: [-1, 0, -1], max: [1, 3, 1] }, 5)
        expect(areas[0].maxX - areas[0].minX).toBeGreaterThan(0)
    })
})

describe('spawnFrom', () => {
    const placedBounds = { min: [-4, 0, -3], max: [4, 3, 3] }

    it('stands the visitor inside the doorway, looking into the room', () => {
        const spawn = spawnFrom({ placedBounds, door: { x: 0, z: 3 } })
        expect(spawn.z).toBeLessThan(3)      // stepped in off the threshold
        expect(spawn.z).toBeGreaterThan(0)   // but not all the way across
        // Looking at the middle means looking down -Z from the near wall.
        close(Math.abs(spawn.yaw), Math.PI, 1e-3)   // the record rounds to 3 decimals
        expect(spawn.altY).toBe(1.6)
    })

    it('faces whatever --forward says instead', () => {
        const spawn = spawnFrom({ placedBounds, door: { x: 0, z: 3 }, forwardDegrees: 90 })
        close(spawn.yaw, Math.PI / 2, 1e-3)
    })

    it('with no doorway, arrives at the near edge facing across', () => {
        const spawn = spawnFrom({ placedBounds })
        expect(spawn.z).toBeGreaterThan(0)
        close(Math.abs(spawn.yaw), Math.PI, 1e-3)
    })
})

describe('chooseScale', () => {
    const bounds = { min: [0, 0, 0], max: [4, 1.5, 3] }

    it('a measured edge is MEASURED', () => {
        const chosen = chooseScale({ bounds, scaleEdge: 12, edge: 'width' })
        expect(chosen.source).toBe('measured')
        expect(chosen.scale).toBe(3)
    })

    it('defaults a measured edge to the longest side', () => {
        expect(chooseScale({ bounds, scaleEdge: 8 }).scale).toBe(2)
    })

    it('a doorway is a GUESS and says so', () => {
        const chosen = chooseScale({ bounds, door: { height: 0.7 }, doorGuess: true })
        expect(chosen.source).toBe('guess')
        expect(chosen.scale).toBeCloseTo(DOOR_HEIGHT_METRES / 0.7)
        expect(chosen.note).toContain('GUESS')
    })

    it('refuses to guess with no doorway', () => {
        const chosen = chooseScale({ bounds, door: null, doorGuess: true })
        expect(chosen.source).toBe('none')
        expect(chosen.scale).toBe(1)
    })

    it('says plainly when nobody measured anything', () => {
        expect(chooseScale({ bounds }).source).toBe('none')
    })
})

describe('place.json', () => {
    it('round-trips through JSON unchanged', () => {
        const fit = fitTransform({
            floorNormal: [0.3692, 0.9034, 0.218],
            bounds: { min: [10, 0, -4], max: [18, 3.2, 2] },
            floorY: 0.2,
            scale: 2.632
        })
        const record = buildPlaceRecord({
            glb: '/tmp/place.glb',
            fit,
            door: { x: 2.1, z: -2.9, height: 2.1 },
            scaleSource: 'measured',
            scaleNote: '8 m, measured',
            spawn: spawnFrom({ placedBounds: fit.placedBounds }),
            walkable: walkableFromBounds(fit.placedBounds),
            confidence: { verdict: 'likely', note: 'as a room does' }
        })
        const back = readPlaceRecord(JSON.parse(JSON.stringify(record)))
        expect(back.transform).toEqual(record.transform)
        expect(back.scaleSource).toBe('measured')
        expect(back.door).toEqual(record.door)
        expect(back.walkableAreas).toEqual(record.walkableAreas)
        expect(back.spawn).toEqual(record.spawn)
    })

    it('refuses a record from a version it does not know', () => {
        expect(readPlaceRecord({ version: 99 })).toBeNull()
        expect(readPlaceRecord(null)).toBeNull()
    })
})
