import { describe, expect, it } from 'vitest'
import {
    DEFAULT_ORBIT,
    MAX_ORBIT_DISTANCE,
    MIN_ORBIT_DISTANCE,
    ORBIT_PITCH_LIMIT,
    ORBIT_PIVOT,
    orbitAim,
    STANDPOINT,
    VIEW_INSIDE,
    VIEW_OUTSIDE,
    clampOrbitDistance,
    clampOrbitPitch,
    isOutside,
    orbitPosition,
    toggleView,
    zoomOrbitDistance
} from './stageView.js'

const distanceFromPivot = ({ x, y, z }) => Math.hypot(
    x - ORBIT_PIVOT.x,
    y - ORBIT_PIVOT.y,
    z - ORBIT_PIVOT.z
)

describe('orbitPosition', () => {
    it('always sits exactly `distance` from the standpoint', () => {
        // The whole promise of an orbit: turning the view must not also dolly
        // it, or the author cannot judge scale from outside.
        const samples = [
            { yaw: 0, pitch: 0, distance: 6 },
            { yaw: 1.2, pitch: 0.4, distance: 6 },
            { yaw: -2.7, pitch: -0.8, distance: 6 },
            { yaw: 4.4, pitch: 1.1, distance: 22 }
        ]
        samples.forEach((orbit) => {
            expect(distanceFromPivot(orbitPosition(orbit))).toBeCloseTo(orbit.distance, 5)
        })
    })

    it('puts yaw 0 behind the viewer, facing the same way they do', () => {
        // Viewer faces -Z, so the default outside shot is over their shoulder.
        // Landing in front of them instead would mean every scene is composed
        // while looking at the back of the marker.
        const position = orbitPosition({ yaw: 0, pitch: 0, distance: 5 })
        expect(position.z).toBeCloseTo(ORBIT_PIVOT.z + 5, 5)
        expect(position.x).toBeCloseTo(0, 5)
    })

    it('reads positive pitch as above the standpoint', () => {
        expect(orbitPosition({ yaw: 0, pitch: 0.5, distance: 5 }).y)
            .toBeGreaterThan(ORBIT_PIVOT.y)
        expect(orbitPosition({ yaw: 0, pitch: -0.5, distance: 5 }).y)
            .toBeLessThan(ORBIT_PIVOT.y)
    })

    it('clamps pitch short of vertical so lookAt cannot roll the horizon', () => {
        const overhead = orbitPosition({ yaw: 0, pitch: Math.PI, distance: 5 })
        expect(distanceFromPivot(overhead)).toBeCloseTo(5, 5)
        // Still short of straight up: some horizontal offset survives.
        expect(Math.abs(overhead.z - ORBIT_PIVOT.z)).toBeGreaterThan(0)
    })

    it('clamps distance rather than letting the camera pass through the viewer', () => {
        expect(distanceFromPivot(orbitPosition({ yaw: 0, pitch: 0, distance: 0 })))
            .toBeCloseTo(MIN_ORBIT_DISTANCE, 5)
        expect(distanceFromPivot(orbitPosition({ yaw: 0, pitch: 0, distance: 5000 })))
            .toBeCloseTo(MAX_ORBIT_DISTANCE, 5)
    })
})

describe('clamps', () => {
    it('bounds pitch symmetrically', () => {
        expect(clampOrbitPitch(99)).toBeCloseTo(ORBIT_PITCH_LIMIT, 6)
        expect(clampOrbitPitch(-99)).toBeCloseTo(-ORBIT_PITCH_LIMIT, 6)
        expect(clampOrbitPitch(0.2)).toBe(0.2)
    })

    it('bounds distance', () => {
        expect(clampOrbitDistance(0)).toBe(MIN_ORBIT_DISTANCE)
        expect(clampOrbitDistance(1e6)).toBe(MAX_ORBIT_DISTANCE)
    })
})

describe('zoomOrbitDistance', () => {
    it('is multiplicative, so a notch feels the same near and far', () => {
        const near = zoomOrbitDistance(4, 100) / 4
        const far = zoomOrbitDistance(40, 100) / 40
        expect(near).toBeCloseTo(far, 6)
    })

    it('pushes out on positive delta and pulls in on negative', () => {
        expect(zoomOrbitDistance(10, 100)).toBeGreaterThan(10)
        expect(zoomOrbitDistance(10, -100)).toBeLessThan(10)
    })

    it('never escapes the clamp', () => {
        expect(zoomOrbitDistance(MIN_ORBIT_DISTANCE, -100000)).toBe(MIN_ORBIT_DISTANCE)
        expect(zoomOrbitDistance(MAX_ORBIT_DISTANCE, 100000)).toBe(MAX_ORBIT_DISTANCE)
    })
})

describe('view', () => {
    it('toggles between the two and treats anything unknown as inside', () => {
        expect(toggleView(VIEW_INSIDE)).toBe(VIEW_OUTSIDE)
        expect(toggleView(VIEW_OUTSIDE)).toBe(VIEW_INSIDE)
        expect(toggleView(undefined)).toBe(VIEW_OUTSIDE)
    })

    it('only reports outside for the outside view', () => {
        // The audience path passes VIEW_INSIDE unconditionally; a truthy-ish
        // bug here would show a visitor the standpoint marker and the
        // machinery of the installation.
        expect(isOutside(VIEW_OUTSIDE)).toBe(true)
        expect(isOutside(VIEW_INSIDE)).toBe(false)
        expect(isOutside(null)).toBe(false)
        expect(isOutside('OUTSIDE')).toBe(false)
    })
})

describe('the standpoint', () => {
    it('is the standing eye height the sequences are built around', () => {
        expect(STANDPOINT.y).toBe(1.6)
        expect(STANDPOINT.x).toBe(0)
        expect(STANDPOINT.z).toBe(0)
    })

    it('starts the outside view above the horizon and clear of the piece', () => {
        // A dead-level outside view reads as just another first-person shot.
        expect(DEFAULT_ORBIT.pitch).toBeGreaterThan(0)
        expect(DEFAULT_ORBIT.distance).toBeGreaterThan(MIN_ORBIT_DISTANCE)
    })
})

describe('orbitAim', () => {
    it('aims straight at the pivot now that nothing covers the stage', () => {
        // The drop existed only to lift floor-anchored content out from behind
        // a panel that floated over the bottom of the canvas. The split layout
        // gives the canvas its own row, so the optical centre is visible and a
        // compensating tilt would just be an unexplained lean.
        expect(orbitAim(6).y).toBe(ORBIT_PIVOT.y)
        expect(orbitAim(6).x).toBe(ORBIT_PIVOT.x)
        expect(orbitAim(6).z).toBe(ORBIT_PIVOT.z)
    })

    it('stays level at every zoom', () => {
        // Whatever the drop is, it is a fraction of distance rather than a
        // fixed number of metres — so at zero it is zero everywhere, and the
        // view cannot tilt as a side effect of scrolling the wheel.
        expect(orbitAim(6).y).toBe(orbitAim(24).y)
        expect(orbitAim(1.5).y).toBe(orbitAim(60).y)
    })

    it('clamps distance the same way the camera does', () => {
        // Otherwise a wheel event past the clamp aims somewhere the camera
        // never goes, and the view tilts without the zoom changing.
        expect(orbitAim(1e6)).toEqual(orbitAim(MAX_ORBIT_DISTANCE))
        expect(orbitAim(0)).toEqual(orbitAim(MIN_ORBIT_DISTANCE))
    })
})
