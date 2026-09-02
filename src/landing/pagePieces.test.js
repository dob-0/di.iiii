import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { PIECE_DISTANCE_M, placeInWorld } from './pagePieces.js'

// The rest camera the landing composes against — the space's own entry shot.
const camera = { position: [0, 3, 14.5], target: [0, 1.2, -14], fov: 50 }
const viewport = { width: 1440, height: 900 }

// A piece placed from a screen rect has to project back onto exactly that
// rect, or the first frame of the fall is not the last frame of the page and
// the handover is visible. This is the whole contract of the swap.
const projectToScreen = (world) => {
    const cam = new THREE.PerspectiveCamera(camera.fov, viewport.width / viewport.height, 0.1, 500)
    cam.position.set(...camera.position)
    cam.lookAt(new THREE.Vector3(...camera.target))
    cam.updateMatrixWorld(true)
    const ndc = world.clone().project(cam)
    return {
        x: (ndc.x + 1) / 2 * viewport.width,
        y: (-ndc.y + 1) / 2 * viewport.height
    }
}

describe('placeInWorld', () => {
    it('puts a piece back on the pixels its element covered', () => {
        for (const rect of [
            { left: 620, top: 400, width: 200, height: 60 },
            { left: 0, top: 0, width: 1440, height: 56 },
            { left: 1100, top: 700, width: 300, height: 120 }
        ]) {
            const placed = placeInWorld({ rect, camera, viewport })
            const screen = projectToScreen(placed.position)
            expect(screen.x).toBeCloseTo(rect.left + rect.width / 2, 1)
            expect(screen.y).toBeCloseTo(rect.top + rect.height / 2, 1)
        }
    })

    it('sizes the plane so it covers the element, not more or less', () => {
        const rect = { left: 520, top: 390, width: 400, height: 120 }
        const placed = placeInWorld({ rect, camera, viewport })
        // Half the viewport's height at that distance, scaled by the fraction
        // of the viewport the element occupied.
        const halfHeight = PIECE_DISTANCE_M * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
        expect(placed.height).toBeCloseTo((rect.height / viewport.height) * halfHeight * 2, 6)
        expect(placed.width / placed.height).toBeCloseTo(
            (rect.width / rect.height) * (viewport.width / viewport.height) / (viewport.width / viewport.height),
            6
        )
    })

    // Every piece lies in the camera's own plane, not aimed at the eye. That
    // is the difference between a billboard and a page: an element in the top
    // corner of the screen was never square to the eye either, and turning it
    // to face the eye would move it off the pixels it was on.
    it('lies in the camera plane, which is where the element was', () => {
        const forward = new THREE.Vector3(...camera.target)
            .sub(new THREE.Vector3(...camera.position)).normalize()
        for (const rect of [
            { left: 100, top: 100, width: 200, height: 100 },
            { left: 620, top: 420, width: 200, height: 60 }
        ]) {
            const placed = placeInWorld({ rect, camera, viewport })
            const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(placed.quaternion)
            expect(normal.dot(forward)).toBeLessThan(-0.999)
        }
    })

    it('hangs everything at the same distance, so nothing crosses anything else', () => {
        const eye = new THREE.Vector3(...camera.position)
        const forward = new THREE.Vector3(...camera.target).sub(eye).normalize()
        for (const rect of [
            { left: 0, top: 0, width: 100, height: 40 },
            { left: 1340, top: 860, width: 100, height: 40 }
        ]) {
            const placed = placeInWorld({ rect, camera, viewport })
            const along = placed.position.clone().sub(eye).dot(forward)
            expect(along).toBeCloseTo(PIECE_DISTANCE_M, 6)
        }
    })
})
