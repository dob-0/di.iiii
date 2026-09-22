import { describe, expect, it } from 'vitest'
import {
    panTiltFromRotation,
    rotationFromPanTilt,
    spotAimDirection
} from './spotLightAim.js'

// Pan and tilt are the two numbers a lighting person aims with, and the room
// stores neither: both live in `components.transform.rotation`, which every
// document already has. These tests hold the conversion to the fixture's
// language -- tilt 0 is dead down, tilt 90 is flat, pan turns round the
// vertical -- and to round-tripping, because an inspector field that does not
// come back the same number is a field nobody can aim with.

const close = (got, want, label, precision = 6) => {
    expect(got.length, label).toBe(3)
    got.forEach((v, i) => expect(v, `${label}[${i}]`).toBeCloseTo(want[i], precision))
}
const aim = (pan, tilt) => spotAimDirection(rotationFromPanTilt({ pan, tilt }))

describe('aiming a spot by pan and tilt', () => {
    it('tilt 0 is straight down — the hung lamp every old room already has', () => {
        close(aim(0, 0), [0, -1, 0], 'pan 0')
        close(aim(90, 0), [0, -1, 0], 'pan is moot when the lamp points at the deck')
        close(aim(-137, 0), [0, -1, 0], 'and stays moot')
        expect(rotationFromPanTilt({ pan: 0, tilt: 0 })).toEqual([0, 0, 0])
    })

    it('tilt 90 lays the beam flat, and pan says which way it faces', () => {
        const r = Math.SQRT1_2
        close(aim(0, 90), [0, 0, -1], 'pan 0 faces -Z')
        close(aim(90, 90), [-1, 0, 0], 'pan +90 faces -X')
        close(aim(-90, 90), [1, 0, 0], 'pan -90 faces +X')
        close(aim(180, 90), [0, 0, 1], 'pan 180 faces +Z')
        close(aim(45, 90), [-r, 0, -r], 'pan 45 splits the corner')
    })

    it('tilt past 90 is an uplight, and 180 points at the ceiling', () => {
        expect(aim(0, 135)[1]).toBeCloseTo(Math.SQRT1_2, 6)
        close(aim(0, 180), [0, 1, 0], 'straight up')
    })

    it('pan turns the beam round the vertical without changing its height', () => {
        // The physical claim: panning a fixture does not raise or lower it.
        for (const tilt of [20, 45, 60, 115]) {
            const down = Math.cos(tilt * (Math.PI / 180))
            for (const pan of [-180, -90, -33, 0, 17, 90, 179]) {
                expect(aim(pan, tilt)[1], `pan ${pan} tilt ${tilt}`).toBeCloseTo(-down, 6)
            }
        }
    })

    it('a 45° tilt splits the beam between down and the way it is panned', () => {
        const r = Math.SQRT1_2
        close(aim(0, 45), [0, -r, -r], 'pan 0')
        close(aim(90, 45), [-r, -r, 0], 'pan 90')
    })

    it('reads back exactly what was set — the field a person can aim with', () => {
        for (const [pan, tilt] of [[0, 0], [0, 90], [90, 90], [-90, 45], [37, 120], [145, 73], [-179, 12]]) {
            const back = panTiltFromRotation(rotationFromPanTilt({ pan, tilt }))
            expect(back.tilt, `tilt ${pan}/${tilt}`).toBeCloseTo(tilt, 3)
            // Pan is meaningless at tilt 0 and reported as 0 there.
            if (tilt > 0) expect(back.pan, `pan ${pan}/${tilt}`).toBeCloseTo(pan, 3)
        }
    })

    it('a rotation read as pan/tilt and written back aims at the same place', () => {
        // The other direction, and the honest invariant: rotation.y is inert
        // for a spot, and rz/rx have more than one spelling for the same beam,
        // so the rotation is not required to come back identical. The BEAM is.
        for (const rot of [[0.3, -1.2, 2.1], [-2, 0.7, 0.1], [Math.PI / 4, 0, 0], [0, 0, -Math.PI / 3], [0, 0, 0]]) {
            const round = rotationFromPanTilt(panTiltFromRotation(rot), rot)
            // 5 places, not 6: pan/tilt are reported to four decimal DEGREES,
            // which is about 2e-6 radians of slack and far finer than a lamp.
            close(spotAimDirection(round), spotAimDirection(rot), `direction ${rot}`, 5)
        }
    })

    it('spells an aim with yaw 0, because yaw is only inert while roll is zero', () => {
        // spotLightAim.test.js pins that yaw ALONE cannot move a spot's beam --
        // the forward vector is the Y axis. That stops being true the moment
        // roll tips the vector off that axis: then Ry pans it round the
        // vertical like a real pan wheel. Two beams at the same height, two
        // different directions:
        const rolled = spotAimDirection([0, 0, 0.8])
        const rolledAndYawed = spotAimDirection([0, 1.2, 0.8])
        expect(rolledAndYawed[1]).toBeCloseTo(rolled[1], 9)
        expect(Math.abs(rolledAndYawed[2] - rolled[2])).toBeGreaterThan(0.5)
        // So pan/tilt owns the whole aim and writes yaw 0; an authored yaw left
        // in place would put the beam somewhere the pan number does not say.
        expect(rotationFromPanTilt({ pan: 40, tilt: 30 })[1]).toBe(0)
    })

    it('reports a tilt of 0..180 and a pan of -180..180, whatever it is given', () => {
        for (const rot of [[0.3, -1.2, 2.1], [-2, 0.7, 0.1], [5, 5, 5], [-8.4, 0, 3.3]]) {
            const { pan, tilt } = panTiltFromRotation(rot)
            expect(tilt, `tilt ${rot}`).toBeGreaterThanOrEqual(0)
            expect(tilt, `tilt ${rot}`).toBeLessThanOrEqual(180)
            expect(pan, `pan ${rot}`).toBeGreaterThanOrEqual(-180)
            expect(pan, `pan ${rot}`).toBeLessThanOrEqual(180)
        }
    })

    it('treats missing or nonsense input as a lamp hanging straight down', () => {
        expect(panTiltFromRotation(undefined)).toEqual({ pan: 0, tilt: 0 })
        expect(panTiltFromRotation([Number.NaN, null, 'x'])).toEqual({ pan: 0, tilt: 0 })
        expect(rotationFromPanTilt()).toEqual([0, 0, 0])
        expect(rotationFromPanTilt({ pan: 'x', tilt: null })).toEqual([0, 0, 0])
    })

    it('clamps a tilt outside the fixture’s travel instead of flipping the beam', () => {
        close(spotAimDirection(rotationFromPanTilt({ pan: 0, tilt: 400 })), [0, 1, 0], 'over the top')
        close(spotAimDirection(rotationFromPanTilt({ pan: 0, tilt: -40 })), [0, -1, 0], 'below the deck')
    })
})
