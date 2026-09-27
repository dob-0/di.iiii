import { describe, expect, it } from 'vitest'

import { aimFixture, beamLocal, mountMatrix, poseFixture, solvePanTilt, tiltPivot, toTRS } from './fixture-lib.mjs'

// A moving head's built geometry, as build_fixtures.py writes it beside the GLB.
const head = { motion: 'pan-tilt', panY: 0.2, tiltY: 0.45, lensY: 0.69, parts: ['Base', 'Yoke', 'Head', 'Lens'] }
const close = (a, b, places = 4) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], places))
const unit = (v) => {
    const l = Math.hypot(...v)
    return v.map((c) => c / l)
}

describe('a moving head\'s pan and tilt', () => {
    it('sends the beam straight up at home, toward its front at tilt 90, and to its right at pan 90', () => {
        close(beamLocal(0, 0), [0, 1, 0])
        close(beamLocal(0, 90), [0, 0, 1])
        close(beamLocal(90, 90), [1, 0, 0])
    })

    it('poses the head so the lens sits on the beam axis, the tilt axis\' height above the base plus the lens offset', () => {
        const mount = mountMatrix({ pos: [2, 0, 3], orient: 'floor' })
        const posed = poseFixture(head, mount, { pan: 0, tilt: 0 })
        close(posed.lens, [2, 0.69, 3])
        close(posed.dir, [0, 1, 0])
        close(toTRS(posed.parts.Yoke).t, [2, 0.2, 3])
        close(toTRS(posed.parts.Head).t, [2, 0.45, 3])
    })

    it('solves pan/tilt for any direction and poses back to the same direction, standing and hung', () => {
        for (const orient of ['floor', 'hung']) {
            for (const face of [[0, 0, 1], [1, 0, 0], [0, 0, -1]]) {
                const spec = { pos: [1, orient === 'hung' ? 6 : 0, -4], orient, face }
                const mount = mountMatrix(spec)
                for (const d of [[0.3, 0.8, 0.2], [0, -1, 0], [-0.5, -0.4, 0.7], [0, 1, 0]]) {
                    const { pan, tilt } = solvePanTilt(mount, d)
                    close(poseFixture(head, mount, { pan, tilt }).dir, unit(d))
                }
            }
        }
    })

    it('aims from the tilt pivot, so the beam passes exactly through the target whatever the lens offset', () => {
        const spec = { pos: [0, 5.8, -40], orient: 'hung', face: [0, 0, 1] }
        const target = [4, 0, -30]
        const posed = aimFixture(head, spec, { target })
        const pivot = tiltPivot(head, mountMatrix(spec))
        close(unit(target.map((v, i) => v - posed.lens[i])), posed.dir)
        close(unit(target.map((v, i) => v - pivot[i])), posed.dir)
        // Hung: the lens is BELOW the clamp.
        expect(posed.lens[1]).toBeLessThan(5.8)
    })

    it('flags an aim past the head\'s tilt travel', () => {
        // Standing on the floor, straight down is 180 deg from home: out of reach.
        expect(aimFixture(head, { pos: [0, 0, 0] }, { dir: [0, -1, 0] }).reachable).toBe(false)
        expect(aimFixture(head, { pos: [0, 0, 0] }, { dir: [0, 1, 0.2] }).reachable).toBe(true)
    })

    it('turns the base to face the direction asked, standing or hung', () => {
        for (const orient of ['floor', 'hung']) {
            for (const face of [[0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 0, -1]]) {
                const m = mountMatrix({ pos: [0, 0, 0], orient, face })
                const front = [m.elements[8], m.elements[9], m.elements[10]] // the local +Z axis in the room
                close(front, face)
            }
        }
    })
})

describe('a machine that does not move (CO2, spark, smoke)', () => {
    it('stands where it is put, emitting up', () => {
        const body = { motion: 'none', lensY: 0.5, parts: ['Body', 'Lens'] }
        const posed = aimFixture(body, { pos: [3, 1.2, 0] }, { dir: [1, 0, 0] })
        close(posed.lens, [3, 1.7, 0])
        close(posed.dir, [0, 1, 0])
    })
})
