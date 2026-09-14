import { describe, expect, it } from 'vitest'
import { doorsOf, fitArrivalToDoors, MAX_PULLBACK } from './arrivalFraming.js'

// The front room as it stands on the tiers: four doors in an arc, the
// authored spawn at z=15 facing -z (yaw π).
const SPAWN = { x: 0, z: 15, yaw: Math.PI, pitch: 0, altY: 1.6 }
const DOORS = [[-10.72, -9], [-4.09, -13.39], [4.09, -13.39], [10.72, -9]]
    .map(([x, z]) => ({ x, z, radius: 1.22 * 1.7 }))
const PHONE = 390 / 844

const inFrame = (pose, door, aspect, fov = 60) => {
    const fx = Math.sin(pose.yaw)
    const fz = Math.cos(pose.yaw)
    const dx = door.x - pose.x
    const dz = door.z - pose.z
    const ahead = dx * fx + dz * fz
    const lateral = Math.abs(dx * fz - dz * fx)
    const tanH = Math.tan((fov * Math.PI) / 360) * aspect
    return ahead > 0 && (lateral + door.radius) / ahead <= tanH
}

describe('fitArrivalToDoors', () => {
    it('leaves a landscape arrival exactly as composed', () => {
        expect(fitArrivalToDoors(SPAWN, DOORS, 1440 / 900)).toBe(SPAWN)
        expect(fitArrivalToDoors(SPAWN, DOORS, 1)).toBe(SPAWN)
    })

    // The reported gap: on a 390px phone the outer doors were cut off.
    it('puts every door of the front room in frame on a 390px phone', () => {
        expect(DOORS.filter((d) => inFrame(SPAWN, d, PHONE)).length).toBeLessThan(4)
        const fitted = fitArrivalToDoors(SPAWN, DOORS, PHONE)
        expect(DOORS.every((d) => inFrame(fitted, d, PHONE))).toBe(true)
    })

    it('only steps back along the view — never turns or slides the visitor', () => {
        const fitted = fitArrivalToDoors(SPAWN, DOORS, PHONE)
        expect(fitted.yaw).toBe(SPAWN.yaw)
        expect(fitted.altY).toBe(SPAWN.altY)
        expect(Math.abs(fitted.x - SPAWN.x)).toBeLessThan(1e-3)
        expect(fitted.z).toBeGreaterThan(SPAWN.z)
    })

    it('fits the nearest door at least, even past the allowance', () => {
        const far = [{ x: 30, z: -5, radius: 2 }]
        const fitted = fitArrivalToDoors(SPAWN, far, PHONE)
        expect(inFrame(fitted, far[0], PHONE)).toBe(true)
    })

    it('prefers fewer doors large over all of them as specks', () => {
        const wide = [{ x: 0, z: -10, radius: 2 }, { x: 60, z: -10, radius: 2 }]
        const fitted = fitArrivalToDoors(SPAWN, wide, PHONE)
        expect(fitted.z - SPAWN.z).toBeLessThanOrEqual(MAX_PULLBACK)
        expect(inFrame(fitted, wide[0], PHONE)).toBe(true)
    })

    it('ignores doors behind the visitor and rooms with no doors', () => {
        expect(fitArrivalToDoors(SPAWN, [{ x: 0, z: 40, radius: 2 }], PHONE)).toBe(SPAWN)
        expect(fitArrivalToDoors(SPAWN, [], PHONE)).toBe(SPAWN)
    })
})

describe('doorsOf', () => {
    it('reads travellable portals, not embeds or hidden ones', () => {
        const doors = doorsOf([
            { type: 'portal', components: { transform: { position: [1, 0, 2], scale: [2, 2, 2] }, reference: { spaceId: 'x' } } },
            { type: 'portal', components: { transform: { position: [0, 0, 0] }, reference: { mode: 'embed' } } },
            { type: 'portal', components: { transform: { position: [0, 0, 0] }, runtime: { visible: false } } },
            { type: 'text', components: { transform: { position: [0, 0, 0] } } }
        ])
        expect(doors).toEqual([{ x: 1, z: 2, radius: 2.44 }])
    })
})
