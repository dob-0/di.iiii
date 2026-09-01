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
