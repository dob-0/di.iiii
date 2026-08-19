import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { attachVeil, GLITCH_TICK_HZ } from './TransitionVeil.jsx'

// Is this object reachable from the scene root? That is exactly the question
// the renderer asks — it draws by walking the scene, so an object that fails
// this is never drawn, however correct its transform and material are.
const reachableFromScene = (object, scene) => {
    let node = object
    while (node) {
        if (node === scene) return true
        node = node.parent
    }
    return false
}

describe('the veil is actually in the rendered graph', () => {
    it('adopts a parentless camera so the veil is drawn on the flat page', () => {
        // The bug this pins: parenting to the camera is the design, but R3F's
        // flat camera has no parent, so the veil left the scene graph on frame
        // one and the desktop simply had no glitch transitions. Nothing threw,
        // nothing warned, and the headset was fine — which is the worst shape
        // a bug can have, because the place it is visible is the place that is
        // hardest to look at.
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera()
        const mesh = new THREE.Mesh()

        expect(reachableFromScene(mesh, scene)).toBe(false)
        attachVeil(mesh, camera, scene)

        expect(mesh.parent).toBe(camera)
        expect(reachableFromScene(mesh, scene)).toBe(true)
    })

    it('never reparents a camera that already belongs to a rig', () => {
        // The XR case. Adopting this camera would pull it out of the rig
        // XROrigin mounts and break head tracking — a much worse bug than the
        // one being fixed, so the adoption has to stay conditional.
        const scene = new THREE.Scene()
        const rig = new THREE.Group()
        const camera = new THREE.PerspectiveCamera()
        const mesh = new THREE.Mesh()

        scene.add(rig)
        rig.add(camera)
        attachVeil(mesh, camera, scene)

        expect(camera.parent).toBe(rig)
        expect(reachableFromScene(mesh, scene)).toBe(true)
    })

    it('is idempotent across frames', () => {
        // attachVeil runs every frame. It must not keep re-adding.
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera()
        const mesh = new THREE.Mesh()

        for (let frame = 0; frame < 5; frame++) attachVeil(mesh, camera, scene)

        expect(camera.children.filter((child) => child === mesh)).toHaveLength(1)
        expect(scene.children.filter((child) => child === camera)).toHaveLength(1)
    })
})

describe('the glitch veil', () => {
    it('re-rolls below the photosensitive band', () => {
        // Full-field flicker between 15 and 25Hz is the classic photosensitive
        // seizure trigger. The glitch covers the entire view at the crossing
        // point of every handover, so its tick rate is a safety property, not
        // a style choice — anyone "making the glitch faster" has to come
        // through this test and read this comment first.
        expect(GLITCH_TICK_HZ).toBeGreaterThan(0)
        expect(GLITCH_TICK_HZ).toBeLessThan(15)
    })
})
