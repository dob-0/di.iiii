import { describe, expect, it } from 'vitest'
import { buildJamObject, detectJamObjectType } from './jamObject.js'
import { JAM_PRIMITIVES } from '../entityPalette.js'
import { JAM_PLACEMENT_MAX_DISTANCE } from './jamPlacement.js'

// The whole point of the surface, in one assertion: two people standing in
// different places must not put their work in the same spot. Studio's own
// placement (a six-slot ring around the saved orbit target, keyed to the global
// object count) does exactly that at an event, because everybody opens on the
// same saved view.

const reach = (pose, object) => {
    const [x, , z] = object.components.transform.position
    return Math.hypot(x - pose.x, z - pose.z)
}

describe('what a tap on a shape produces', () => {
    it('makes a real object of the type that was tapped', () => {
        const object = buildJamObject('sphere', { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 })
        expect(object.type).toBe('sphere')
        expect(object.id).toBeTruthy()
        expect(object.components.transform.position).toHaveLength(3)
    })

    it('handles every shape in the jam palette', () => {
        for (const { key } of JAM_PRIMITIVES) {
            const object = buildJamObject(key, { x: 1, z: 1, altY: 1.6, yaw: 0.3, pitch: -0.5 })
            expect(object.type).toBe(key)
            expect(object.components.transform.position.every(Number.isFinite)).toBe(true)
        }
    })

    // The defect this surface exists to fix.
    it('lands in front of the person who added it, wherever they are standing', () => {
        const here = { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 }
        const overThere = { x: 30, z: -18, altY: 1.6, yaw: 2.2, pitch: -0.6 }

        const mine = buildJamObject('box', here)
        const theirs = buildJamObject('box', overThere)

        const [mx, , mz] = mine.components.transform.position
        const [tx, , tz] = theirs.components.transform.position
        expect(Math.hypot(tx - mx, tz - mz)).toBeGreaterThan(10)
        expect(reach(here, mine)).toBeLessThanOrEqual(JAM_PLACEMENT_MAX_DISTANCE + 1e-9)
        expect(reach(overThere, theirs)).toBeLessThanOrEqual(JAM_PLACEMENT_MAX_DISTANCE + 1e-9)
    })

    it('does not stack a second object on top of the first when you turn away', () => {
        const a = buildJamObject('box', { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 })
        const b = buildJamObject('box', { x: 0, z: 0, altY: 1.6, yaw: Math.PI, pitch: -0.6 })
        expect(a.components.transform.position[2]).not.toBeCloseTo(b.components.transform.position[2], 3)
    })

    it('rests a shape on the floor instead of burying half of it', () => {
        const object = buildJamObject('sphere', { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 })
        expect(object.components.transform.position[1]).toBeCloseTo(0.6, 6)
    })

    it('hangs words at reading height, turned to face you', () => {
        const object = buildJamObject('text', { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 })
        expect(object.components.transform.position[1]).toBeGreaterThan(1)
        expect(object.components.transform.rotation[1]).toBeCloseTo(Math.PI, 6)
    })

    it('leaves a shape with no front unrotated', () => {
        const object = buildJamObject('sphere', { x: 0, z: 0, altY: 1.6, yaw: 1, pitch: -0.6 })
        expect(object.components.transform.rotation).toEqual([0, 0, 0])
    })

    it('carries an uploaded photo onto the object it makes', () => {
        const asset = { id: 'asset-1', name: 'sunset.jpg' }
        const object = buildJamObject('image', { x: 0, z: 0, altY: 1.6, yaw: 0, pitch: -0.6 }, asset)
        expect(object.type).toBe('image')
        expect(object.components.media.assetId).toBe('asset-1')
        expect(object.name).toBe('sunset')
    })

    it('never produces NaN from a pose that has not settled', () => {
        const object = buildJamObject('box', {})
        expect(object.components.transform.position.every(Number.isFinite)).toBe(true)
    })
})

describe('detectJamObjectType', () => {
    it('reads a photo as a photo and a clip as a clip', () => {
        expect(detectJamObjectType({ type: 'image/jpeg' })).toBe('image')
        expect(detectJamObjectType({ type: 'video/mp4' })).toBe('video')
        expect(detectJamObjectType({ mimeType: 'video/quicktime' })).toBe('video')
    })

    it('treats anything else a phone hands over as a photo', () => {
        expect(detectJamObjectType({})).toBe('image')
        expect(detectJamObjectType(null)).toBe('image')
    })
})
