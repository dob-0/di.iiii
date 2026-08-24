import { describe, expect, it } from 'vitest'
import {
    JAM_PLACEMENT_MAX_DISTANCE,
    JAM_PLACEMENT_MIN_DISTANCE,
    clampPlacementDistance,
    facingViewerYaw,
    groundPointInFront,
    horizontalHeading,
    nudgeFromViewer,
    poseToRay,
    restOnGround,
    standHeightForType
} from './jamPlacement.js'

// The jam is a 3D scene, and a 3D scene is the hardest thing in this repo to
// check without a pair of eyes on a phone. So the placement rule — the one
// piece of this surface that decides whether twenty people's work lands in
// twenty places or in the same six — is plain maths on plain arrays, and it is
// checked here rather than assumed from a screenshot nobody took.

const reachFrom = (eye, point) => Math.hypot(point[0] - eye[0], point[2] - eye[2])

describe('poseToRay', () => {
    it('reads the walker pose the way the walker itself does', () => {
        // Walker builds its look vector as
        //   (sin(yaw)cos(pitch), sin(pitch), cos(yaw)cos(pitch))
        // and puts the camera at (x, altY, z). Facing yaw=0 is +Z.
        const ray = poseToRay({ x: 3, z: -2, altY: 1.6, yaw: 0, pitch: 0 })
        expect(ray.position).toEqual([3, 1.6, -2])
        expect(ray.direction[0]).toBeCloseTo(0, 6)
        expect(ray.direction[1]).toBeCloseTo(0, 6)
        expect(ray.direction[2]).toBeCloseTo(1, 6)
    })

    it('survives a pose that is missing fields', () => {
        const ray = poseToRay({})
        expect(ray.position).toEqual([0, 1.6, 0])
        expect(ray.direction.every(Number.isFinite)).toBe(true)
    })
})

describe('horizontalHeading', () => {
    it('flattens a look direction onto the ground and normalises it', () => {
        const heading = horizontalHeading([3, -9, 4])
        expect(heading[0]).toBeCloseTo(0.6, 6)
        expect(heading[1]).toBeCloseTo(0.8, 6)
    })

    it('has no answer when the walker is staring straight down', () => {
        expect(horizontalHeading([0, -1, 0])).toBeNull()
    })
})

describe('groundPointInFront', () => {
    it('lands on the floor where the walker is looking, not at the world origin', () => {
        // Standing well away from origin, looking down and forward.
        const eye = [10, 1.6, 10]
        const direction = [0, -Math.SQRT1_2, Math.SQRT1_2] // 45° down, facing +Z
        const point = groundPointInFront(eye, direction)
        expect(point[1]).toBe(0)
        // 45° down from 1.6m up meets the floor 1.6m ahead.
        expect(point[0]).toBeCloseTo(10, 6)
        expect(point[2]).toBeCloseTo(11.6, 6)
    })

    it('always answers, even looking at the horizon where no ray meets the ground', () => {
        const point = groundPointInFront([0, 1.6, 0], [0, 0, 1])
        expect(point[1]).toBe(0)
        expect(reachFrom([0, 1.6, 0], point)).toBeGreaterThan(0)
    })

    it('always answers looking upward too', () => {
        const point = groundPointInFront([0, 1.6, 0], [1, 0.9, 0])
        expect(point[1]).toBe(0)
        expect(point[0]).toBeGreaterThan(0)
    })

    // The one that matters at an event: a glance at a distant patch of floor
    // must not fling somebody's cube half a scene away, and a glance at your
    // own feet must not drop it inside you.
    it('clamps a far-off floor glance back to arm-and-a-bit reach', () => {
        const eye = [0, 1.6, 0]
        // Barely below the horizon: the ray meets y=0 a very long way off.
        const point = groundPointInFront(eye, [0, -0.02, 1])
        expect(reachFrom(eye, point)).toBeCloseTo(JAM_PLACEMENT_MAX_DISTANCE, 6)
        // and it keeps the DIRECTION of the look
        expect(point[2]).toBeGreaterThan(0)
        expect(point[0]).toBeCloseTo(0, 6)
    })

    it('clamps a glance at your own feet out to a reachable distance', () => {
        const eye = [0, 1.6, 0]
        const point = groundPointInFront(eye, [0, -0.99, 0.14])
        expect(reachFrom(eye, point)).toBeGreaterThanOrEqual(JAM_PLACEMENT_MIN_DISTANCE - 1e-9)
    })

    it('places relative to where the walker is standing', () => {
        const a = groundPointInFront([0, 1.6, 0], [0, -Math.SQRT1_2, Math.SQRT1_2])
        const b = groundPointInFront([25, 1.6, -40], [0, -Math.SQRT1_2, Math.SQRT1_2])
        expect(b[0] - a[0]).toBeCloseTo(25, 6)
        expect(b[2] - a[2]).toBeCloseTo(-40, 6)
    })
})

describe('clampPlacementDistance', () => {
    it('holds the reach between arm and a few paces', () => {
        expect(clampPlacementDistance(0)).toBe(JAM_PLACEMENT_MIN_DISTANCE)
        expect(clampPlacementDistance(999)).toBe(JAM_PLACEMENT_MAX_DISTANCE)
        expect(clampPlacementDistance(3)).toBe(3)
    })
})

describe('restOnGround / standHeightForType', () => {
    it('sits a shape on the floor rather than half inside it', () => {
        expect(restOnGround([2, 0, 3], { standHeight: standHeightForType('sphere') }))
            .toEqual([2, 0.6, 3])
        expect(restOnGround([2, 0, 3], { standHeight: standHeightForType('box') }))
            .toEqual([2, 0.5, 3])
    })

    it('hangs the things you read at reading height', () => {
        expect(standHeightForType('text')).toBeGreaterThan(1)
        expect(standHeightForType('image')).toBeGreaterThan(1)
    })

    it('has an answer for a type it has never heard of', () => {
        expect(standHeightForType('sprocket')).toBe(0.5)
    })
})

describe('facingViewerYaw', () => {
    it('turns a flat-fronted object round to face the person who added it', () => {
        expect(facingViewerYaw(0)).toBeCloseTo(Math.PI, 6)
        expect(facingViewerYaw(Math.PI)).toBeCloseTo(0, 6)
    })

    it('never returns a negative angle', () => {
        expect(facingViewerYaw(-Math.PI / 2)).toBeGreaterThanOrEqual(0)
    })
})

describe('nudgeFromViewer', () => {
    it('pushes an object further along the line between it and you', () => {
        const next = nudgeFromViewer([0, 0.5, 2], [0, 1.6, 0], 1)
        expect(next[2]).toBeCloseTo(3, 6)
        expect(next[1]).toBe(0.5) // height is not the thing being changed
    })

    it('pulls it nearer', () => {
        const next = nudgeFromViewer([0, 0.5, 4], [0, 1.6, 0], -1)
        expect(next[2]).toBeCloseTo(3, 6)
    })

    it('never pushes it through you', () => {
        const next = nudgeFromViewer([0, 0.5, 1], [0, 1.6, 0], -5)
        expect(next[2]).toBeCloseTo(JAM_PLACEMENT_MIN_DISTANCE, 6)
    })

    it('stops at the far edge instead of sending it out of the scene', () => {
        const next = nudgeFromViewer([0, 0.5, JAM_PLACEMENT_MAX_DISTANCE], [0, 1.6, 0], 5)
        expect(next[2]).toBeCloseTo(JAM_PLACEMENT_MAX_DISTANCE, 6)
    })
})
