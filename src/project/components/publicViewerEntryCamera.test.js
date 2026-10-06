import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { resolveViewerCamera } from './PublicProjectSceneSurface.jsx'
import { getAspectFitScale } from '../../utils/cameraFraming.js'

const PORTRAIT_ASPECT = 390 / 844
const LANDSCAPE_ASPECT = 1440 / 900

const fixedCamera = {
    projection: 'perspective',
    position: [0, 3, 14.5],
    target: [0, 1.2, -14],
    fov: 50,
    zoom: 1,
    near: 0.1,
    far: 200,
    locked: false
}

const documentWith = (presentationState, worldState = {}) => ({
    entities: [
        { components: { transform: { position: [-10.7, 0.05, -9] } } },
        { components: { transform: { position: [10.7, 0.05, -9] } } }
    ],
    presentationState,
    worldState
})

const distanceOf = (view) => new THREE.Vector3(...view.position)
    .sub(new THREE.Vector3(...view.target))
    .length()

describe('resolveViewerCamera on a composed entry', () => {
    it('gives a landscape visitor exactly the authored shot', () => {
        const view = resolveViewerCamera(
            documentWith({ entryView: 'fixed-camera', fixedCamera }),
            LANDSCAPE_ASPECT
        )
        expect(view).toEqual(fixedCamera)
    })

    it('widens the same shot for a portrait phone rather than cropping it', () => {
        const view = resolveViewerCamera(
            documentWith({ entryView: 'fixed-camera', fixedCamera }),
            PORTRAIT_ASPECT
        )
        expect(distanceOf(view)).toBeCloseTo(
            distanceOf(fixedCamera) * getAspectFitScale(fixedCamera.fov, PORTRAIT_ASPECT),
            6
        )
        expect(view.target).toEqual(fixedCamera.target)
    })

    // A locked camera is the one the visitor cannot fix by moving, so it is
    // the one that most needs to arrive uncropped.
    it('widens a locked camera too', () => {
        const locked = { ...fixedCamera, locked: true }
        const view = resolveViewerCamera(
            documentWith({ entryView: 'fixed-camera', fixedCamera: locked }),
            PORTRAIT_ASPECT
        )
        expect(distanceOf(view)).toBeGreaterThan(distanceOf(locked))
        expect(view.locked).toBe(true)
    })

    it('widens the savedView a composed entry falls back to', () => {
        const savedView = { ...fixedCamera, position: [0, 8, 20] }
        const view = resolveViewerCamera(
            documentWith({ entryView: 'fixed-camera' }, { savedView }),
            PORTRAIT_ASPECT
        )
        expect(distanceOf(view)).toBeGreaterThan(distanceOf(savedView))
    })

    it('leaves the auto-framed entry to its own aspect handling', () => {
        const view = resolveViewerCamera(documentWith({ entryView: 'scene' }), PORTRAIT_ASPECT)
        expect(view).toBeTruthy()
        expect(view.position).not.toEqual(fixedCamera.position)
    })
})

describe('resolveViewerCamera in an enclosed room', () => {
    // MOXIR on a 390x844 phone: the composed entry is at eye height looking up
    // at the rig; before the arm was bounded it landed under the hall floor.
    it('keeps a phone visitor above the floor and inside the declared plan', () => {
        const doc = {
            entities: [],
            presentationState: {
                entryView: 'fixed-camera',
                fixedCamera: { projection: 'perspective', position: [0, 1.6, 20.2], target: [0, 5.2, 3.2], fov: 55, locked: false }
            },
            worldState: { walkableAreas: [{ minX: -36, maxX: 60, minZ: -54.1, maxZ: 55.5 }] }
        }
        const view = resolveViewerCamera(doc, PORTRAIT_ASPECT)
        expect(view.position[1]).toBeGreaterThan(0)
        expect(view.position[2]).toBeLessThanOrEqual(55.5)
        expect(view.fov).toBeGreaterThan(55)
    })
})

describe('front room arrival fits its doors on a portrait phone', () => {
    const door = (x, z) => ({
        type: 'portal',
        components: { transform: { position: [x, 0.05, z], scale: [1.7, 1.7, 1.7] }, reference: {} }
    })
    const frontRoom = {
        entities: [door(-10.72, -9), door(-4.09, -13.39), door(4.09, -13.39), door(10.72, -9)],
        presentationState: { entryView: 'fixed-camera', fixedCamera },
        worldState: {}
    }
    // A door ring (radius 1.22 * 1.7) is whole when its outer edge is inside the horizontal field.
    const allDoorsWhole = (view, aspect) => {
        const half = Math.tan(THREE.MathUtils.degToRad(view.fov / 2)) * aspect
        const fwd = new THREE.Vector3(...view.target).sub(new THREE.Vector3(...view.position)).setY(0).normalize()
        return frontRoom.entities.every((e) => {
            const [x, , z] = e.components.transform.position
            const d = new THREE.Vector3(x - view.position[0], 0, z - view.position[2])
            const ahead = d.dot(fwd)
            const lateral = Math.abs(d.x * fwd.z - d.z * fwd.x)
            return (lateral + 1.22 * 1.7) / ahead <= half
        })
    }

    it('without the option the composed camera still clips the outer doors on 390x844', () => {
        expect(allDoorsWhole(resolveViewerCamera(frontRoom, PORTRAIT_ASPECT), PORTRAIT_ASPECT)).toBe(false)
    })

    it('with fitDoors all four doors are whole on 390x844', () => {
        const view = resolveViewerCamera(frontRoom, PORTRAIT_ASPECT, { fitDoors: true })
        expect(allDoorsWhole(view, PORTRAIT_ASPECT)).toBe(true)
        expect(view.position[1]).toBe(resolveViewerCamera(frontRoom, PORTRAIT_ASPECT).position[1])
    })

    it('landscape is byte-identical with or without it', () => {
        expect(resolveViewerCamera(frontRoom, LANDSCAPE_ASPECT, { fitDoors: true }))
            .toEqual(resolveViewerCamera(frontRoom, LANDSCAPE_ASPECT))
    })

    it('a room that is not asked for it is untouched, and so is a scene-lane document', () => {
        expect(resolveViewerCamera(frontRoom, PORTRAIT_ASPECT)).toEqual(resolveViewerCamera(frontRoom, PORTRAIT_ASPECT, { fitDoors: false }))
        const scene = { ...frontRoom, presentationState: { entryView: 'scene' } }
        expect(resolveViewerCamera(scene, PORTRAIT_ASPECT, { fitDoors: true })).toEqual(resolveViewerCamera(scene, PORTRAIT_ASPECT))
    })
})
