import { describe, expect, it } from 'vitest'
import { cameraAim, floorHint, FLOOR_LOST_ELEVATION } from './deviceAim.js'

const aim = (alpha, beta, gamma) => cameraAim({ alpha, beta, gamma })

describe('cameraAim — elevation', () => {
    // The four poses anybody can check by picking up a phone.
    it('reads a phone lying on its back as the lens at the floor', () => {
        expect(aim(0, 0, 0).elevation).toBeCloseTo(-90, 6)
    })

    it('reads a phone lying face down as the lens at the ceiling', () => {
        expect(aim(0, 180, 0).elevation).toBeCloseTo(90, 6)
    })

    it('reads a phone held upright as the lens at the horizon', () => {
        expect(aim(0, 90, 0).elevation).toBeCloseTo(0, 6)
    })

    // The whole reason this is not read off `beta`: turned sideways, beta says
    // the phone is flat and the lens is still looking straight at the far wall.
    // Nothing had to ask the screen which way up it was.
    it('reads a phone turned sideways as the lens at the horizon, whatever beta says', () => {
        expect(aim(0, 0, 90).elevation).toBeCloseTo(0, 6)
        expect(aim(0, 0, -90).elevation).toBeCloseTo(0, 6)
        expect(aim(0, 45, 90).elevation).toBeCloseTo(0, 6)
        expect(aim(0, 180, -90).elevation).toBeCloseTo(0, 6)
    })

    it('reads a phone tipped back from upright as the lens above the horizon', () => {
        expect(aim(0, 120, 0).elevation).toBeGreaterThan(0)
        expect(aim(0, 120, 0).elevation).toBeCloseTo(30, 6)
        expect(aim(0, 60, 0).elevation).toBeCloseTo(-30, 6)
    })

    // A rotation about the vertical cannot change how high something points, so
    // turning on the spot must not move the elevation by a degree.
    it('does not depend on which way the person is facing', () => {
        const straightAhead = aim(0, 70, 0).elevation
        for (const alpha of [45, 90, 180, 271, 359]) {
            expect(aim(alpha, 70, 0).elevation).toBeCloseTo(straightAhead, 9)
        }
    })

    it('says nothing when the browser gave nothing', () => {
        expect(cameraAim()).toEqual({ heading: null, elevation: null })
        expect(cameraAim({ beta: 90 })).toEqual({ heading: null, elevation: null })
        expect(cameraAim({ beta: null, gamma: null })).toEqual({ heading: null, elevation: null })
    })
})

describe('cameraAim — heading', () => {
    it('reads an upright phone with alpha 0 as looking north', () => {
        expect(aim(0, 90, 0).heading).toBeCloseTo(0, 6)
    })

    // Turning on the spot must turn the heading, degree for degree. This is the
    // property the ring of directions is built on, and the one raw alpha gets
    // backwards.
    it('turns with the person', () => {
        expect(aim(90, 90, 0).heading).toBeCloseTo(270, 6)
        expect(aim(180, 90, 0).heading).toBeCloseTo(180, 6)
        expect(aim(270, 90, 0).heading).toBeCloseTo(90, 6)
    })

    // THE ONE THIS FILE EXISTS FOR. Rolling the phone from portrait into
    // landscape does not change where the lens looks — but it DOES change alpha
    // by 90°, because alpha is the device's own yaw and rolling re-decomposes
    // the whole rotation. So a ring filled from raw alpha would swing a quarter
    // turn for a person who simply turned the phone sideways to get a wider
    // shot, and would not have moved at all if they had instead walked round a
    // pillar without rolling it.
    //
    // Read through the lens axis, the three poses below are one bearing.
    it('reports one bearing for one aim, however the phone is rolled', () => {
        const upright = aim(140, 90, 0).heading
        // Rolled one way: gamma +90, and alpha is now 90° LESS for the same aim.
        const rolledLeft = cameraAim({ alpha: 50, beta: 0, gamma: 90 })
        // …and the other way: gamma −90, alpha 90° more.
        const rolledRight = cameraAim({ alpha: 230, beta: 0, gamma: -90 })
        expect(rolledLeft.elevation).toBeCloseTo(0, 6)
        expect(rolledRight.elevation).toBeCloseTo(0, 6)
        expect(rolledLeft.heading).toBeCloseTo(upright, 6)
        expect(rolledRight.heading).toBeCloseTo(upright, 6)
        // And to be sure the test is testing something: alpha really did move.
        expect(aim(50, 90, 0).heading).not.toBeCloseTo(upright, 1)
    })

    it('always answers inside one turn of the circle', () => {
        for (const alpha of [-400, -1, 0, 359, 360, 700]) {
            const { heading } = aim(alpha, 90, 0)
            expect(heading).toBeGreaterThanOrEqual(0)
            expect(heading).toBeLessThan(360)
        }
    })

    // iOS gives no absolute alpha. Safari's compass counts the other way round.
    it('takes Safari\'s compass in place of alpha, counting the other way', () => {
        const fromCompass = cameraAim({ beta: 90, gamma: 0, compassHeading: 90 })
        expect(fromCompass.heading).toBeCloseTo(aim(270, 90, 0).heading, 6)
        // …and it wins over alpha, which on iOS points at nothing.
        expect(cameraAim({ alpha: 12, beta: 90, gamma: 0, compassHeading: 90 }).heading)
            .toBeCloseTo(fromCompass.heading, 6)
    })

    // A refused orientation permission, or an Android without absolute
    // orientation: the ring says so and the rest of the page works. Elevation
    // comes from gravity, so it is still there.
    it('reports no heading but still reports elevation when nothing absolute is known', () => {
        const reading = cameraAim({ beta: 90, gamma: 0 })
        expect(reading.heading).toBeNull()
        expect(reading.elevation).toBeCloseTo(0, 6)
    })

    // Straight up or straight down every heading is equally true, so none is
    // reported — a phone on a table must not fill a sector of the ring.
    it('refuses a heading when the lens points straight up or straight down', () => {
        expect(aim(0, 0, 0).heading).toBeNull()
        expect(aim(37, 180, 0).heading).toBeNull()
    })
})

describe('floorHint', () => {
    it('says nothing while the floor is in frame', () => {
        expect(floorHint(-20, 10000)).toBe('')
        expect(floorHint(0, 10000)).toBe('')
        expect(floorHint(FLOOR_LOST_ELEVATION, 10000)).toBe('')
    })

    // Not for the moment somebody stepped over a cable.
    it('waits two seconds before saying anything', () => {
        expect(floorHint(40, 0)).toBe('')
        expect(floorHint(40, 1999)).toBe('')
        expect(floorHint(40, 2000)).toBe('keep the floor in frame')
    })

    it('says nothing at all when there is no orientation to read', () => {
        expect(floorHint(null, 99999)).toBe('')
    })
})
