import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    computeFramingCamera,
    computeFitDistance,
    getAspectFitScale,
    getLimitingHalfFov,
    getViewportAspect,
    frameSphereInControls
} from './cameraFraming.js'

// 390x844 is an iPhone 12/13/14-class portrait viewport -- the shape a parent
// opens a published page in. 1440x900 stands in for a laptop.
const PORTRAIT_ASPECT = 390 / 844
const LANDSCAPE_ASPECT = 1440 / 900

const distanceOf = (view) => new THREE.Vector3(...view.position)
    .sub(new THREE.Vector3(...view.target))
    .length()

const sphereAt = (radius, center = [0, 0, 0]) =>
    new THREE.Sphere(new THREE.Vector3(...center), radius)

describe('getLimitingHalfFov', () => {
    it('uses the vertical fov when the viewport is square or wider', () => {
        const vertical = THREE.MathUtils.degToRad(25)
        expect(getLimitingHalfFov(50, 1)).toBeCloseTo(vertical, 6)
        expect(getLimitingHalfFov(50, LANDSCAPE_ASPECT)).toBeCloseTo(vertical, 6)
    })

    it('uses the narrower horizontal fov on a portrait viewport', () => {
        const vertical = THREE.MathUtils.degToRad(25)
        const limiting = getLimitingHalfFov(50, PORTRAIT_ASPECT)
        expect(limiting).toBeLessThan(vertical)
        expect(limiting).toBeCloseTo(Math.atan(Math.tan(vertical) * PORTRAIT_ASPECT), 6)
    })

    it('falls back to a square viewport for junk aspects', () => {
        for (const aspect of [0, -2, NaN, undefined, null, 'wide']) {
            expect(getLimitingHalfFov(50, aspect)).toBeCloseTo(getLimitingHalfFov(50, 1), 6)
        }
    })
})

describe('getAspectFitScale', () => {
    it('is 1 for landscape and roughly 2 for a portrait phone', () => {
        expect(getAspectFitScale(50, LANDSCAPE_ASPECT)).toBeCloseTo(1, 6)
        expect(getAspectFitScale(50, 1)).toBeCloseTo(1, 6)
        expect(getAspectFitScale(50, PORTRAIT_ASPECT)).toBeGreaterThan(1.9)
    })
})

describe('computeFramingCamera aspect handling', () => {
    it('pulls materially further back in portrait than in landscape', () => {
        const sphere = sphereAt(2)
        const landscape = computeFramingCamera(sphere, { fov: 50, aspect: LANDSCAPE_ASPECT })
        const portrait = computeFramingCamera(sphere, { fov: 50, aspect: PORTRAIT_ASPECT })

        expect(distanceOf(portrait) / distanceOf(landscape)).toBeGreaterThan(1.9)
    })

    it('agrees with frameSphereInControls for the same sphere and aspect', () => {
        const sphere = sphereAt(3, [1, 0.5, -2])
        const camera = new THREE.PerspectiveCamera(50, PORTRAIT_ASPECT, 0.1, 1000)
        camera.position.set(0.8, 0.45, 1).normalize().multiplyScalar(9).add(sphere.center)
        const controls = { object: camera, target: sphere.center.clone(), update: () => {} }

        const live = frameSphereInControls(controls, sphere)
        const precomputed = computeFramingCamera(sphere, {
            fov: 50,
            aspect: PORTRAIT_ASPECT,
            direction: camera.position.clone().sub(sphere.center).normalize().toArray()
        })

        const liveDistance = new THREE.Vector3(...live.position)
            .sub(new THREE.Vector3(...live.target)).length()
        expect(distanceOf(precomputed)).toBeCloseTo(liveDistance, 6)
    })

    it('treats a missing aspect as square, matching the pre-aspect behaviour', () => {
        const sphere = sphereAt(2)
        const noAspect = computeFramingCamera(sphere, { fov: 50 })
        const square = computeFramingCamera(sphere, { fov: 50, aspect: 1 })
        expect(distanceOf(noAspect)).toBeCloseTo(distanceOf(square), 6)
    })
})

describe('computeFramingCamera maxDistance clamp', () => {
    // The trap: a naive aspect fix is invisible on a phone because the clamp
    // yanks the corrected distance straight back down. AUTO_FRAME_MAX_DISTANCE
    // in PublicProjectSceneSurface is 25, and any scene wider than ~4 units
    // hits it.
    const MAX_DISTANCE = 25

    it('does not undo the portrait correction on a clamped scene', () => {
        const sphere = sphereAt(20)
        const landscape = computeFramingCamera(sphere, {
            fov: 50, aspect: LANDSCAPE_ASPECT, maxDistance: MAX_DISTANCE
        })
        const portrait = computeFramingCamera(sphere, {
            fov: 50, aspect: PORTRAIT_ASPECT, maxDistance: MAX_DISTANCE
        })

        // Both are clamped -- the point is that the portrait clamp is scaled.
        expect(distanceOf(landscape)).toBeCloseTo(MAX_DISTANCE, 6)
        expect(distanceOf(portrait)).toBeGreaterThan(MAX_DISTANCE * 1.9)
        expect(distanceOf(portrait) / distanceOf(landscape)).toBeGreaterThan(1.9)
    })

    it('keeps the landscape clamp exactly where it was', () => {
        const sphere = sphereAt(20)
        const clamped = computeFramingCamera(sphere, {
            fov: 50, aspect: LANDSCAPE_ASPECT, maxDistance: MAX_DISTANCE
        })
        expect(distanceOf(clamped)).toBeCloseTo(MAX_DISTANCE, 6)
    })

    it('still clamps in portrait rather than fitting an unbounded sprawl', () => {
        const sphere = sphereAt(500)
        const portrait = computeFramingCamera(sphere, {
            fov: 50, aspect: PORTRAIT_ASPECT, maxDistance: MAX_DISTANCE
        })
        const unclamped = computeFramingCamera(sphere, { fov: 50, aspect: PORTRAIT_ASPECT })
        expect(distanceOf(portrait)).toBeLessThan(distanceOf(unclamped))
        expect(distanceOf(portrait)).toBeCloseTo(
            MAX_DISTANCE * getAspectFitScale(50, PORTRAIT_ASPECT), 6
        )
    })

    it('never clamps a small scene that already fits', () => {
        const sphere = sphereAt(1)
        const portrait = computeFramingCamera(sphere, {
            fov: 50, aspect: PORTRAIT_ASPECT, maxDistance: MAX_DISTANCE
        })
        expect(distanceOf(portrait)).toBeCloseTo(
            computeFitDistance(1 * 1.35, { fov: 50, aspect: PORTRAIT_ASPECT }), 6
        )
    })
})

describe('getViewportAspect', () => {
    it('reads the live window and survives a missing one', () => {
        expect(getViewportAspect()).toBeCloseTo(window.innerWidth / window.innerHeight, 6)
        const { innerWidth } = window
        try {
            Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true })
            expect(getViewportAspect()).toBe(1)
            expect(getViewportAspect(0.5)).toBe(0.5)
        } finally {
            Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true })
        }
    })
})
