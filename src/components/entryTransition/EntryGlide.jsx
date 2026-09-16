import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerFrameSource } from './entryTransition.js'

// The room's half of going through a door: the camera travels, and the last
// frame it sees is handed to the curtain (entryTransition.js), which holds it
// while the destination loads. Lives inside whatever <Canvas> the door is
// drawn in, so it needs no cooperation from the controller that was driving
// the camera — see the priority note below.

// The frame on screen, copied out. `gl.render` then `drawImage` in the same
// task is the one moment a WebGL canvas without preserveDrawingBuffer still
// holds its pixels, which is why this renders before it copies.
export function captureRendererFrame({ gl, scene, camera }, maxWidth = 2880) {
    if (typeof document === 'undefined' || !gl?.domElement) return null
    try {
        gl.render(scene, camera)
        const source = gl.domElement
        if (!source.width || !source.height) return null
        const k = Math.min(1, maxWidth / source.width)
        const copy = document.createElement('canvas')
        copy.width = Math.round(source.width * k)
        copy.height = Math.round(source.height * k)
        const ctx = copy.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(source, 0, 0, copy.width, copy.height)
        return copy
    } catch {
        return null
    }
}

/**
 * Lets the page this scene sits in be held through a door with no room behind
 * it (a front-page button): the curtain's copy of the page asks for this
 * canvas's current frame, and only the scene can re-render it in the same
 * task to hand one over. Mount inside the <Canvas>.
 */
export function FrameSource() {
    const gl = useThree((state) => state.gl)
    const get = useThree((state) => state.get)
    useEffect(() => registerFrameSource(gl?.domElement, () => captureRendererFrame(get())), [gl, get])
    return null
}

// Accelerates out of rest and is still moving when it ends: the held frame
// picks the motion up from there, so the glide has no stop in it.
export const glideEase = (t) => {
    const c = Math.min(1, Math.max(0, t))
    const cut = 0.82
    return (1 - Math.cos(Math.PI * c * cut)) / (1 - Math.cos(Math.PI * cut))
}

// Turning to face the door finishes early, so the last stretch is a straight
// push and not a pan.
const turnEase = (t) => {
    const c = Math.min(1, Math.max(0, t / 0.6))
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

// Where the camera stops: in front of the door, near enough that the ring
// sits just outside the frame on its tighter axis.
export const glideEndPosition = ({ from, centre, radius, fov, aspect, reach = 1 }) => {
    const approach = from.clone().sub(centre)
    if (approach.lengthSq() < 1e-6) approach.set(0, 0, 1)
    approach.normalize()
    const vHalf = THREE.MathUtils.degToRad((fov || 60) / 2)
    const hHalf = Math.atan(Math.tan(vHalf) * (aspect || 1))
    // Measured on the horizontal field. Landscape: the ring passes just out
    // past both sides. Portrait: the ring just meets the sides, so the door's
    // name plate — as wide as the opening — is read whole, not cropped.
    const fill = (aspect || 1) >= 1 ? 1.5 : 1.05
    const stop = Math.max(0.35, radius / (fill * Math.tan(hHalf)))
    const full = centre.clone().addScaledVector(approach, stop)
    return from.clone().lerp(full, Math.min(1, Math.max(0, reach)))
}

/**
 * Mounted for the length of one entry. `request` is { ms, reach, target, resolve }.
 *
 * Priority 1: r3f runs this after every priority-0 frame callback — the
 * walker, OrbitControls — so whatever they did to the camera this frame is
 * overwritten here, and nothing has to be told to stand down. A positive
 * priority also hands rendering to this component, which is why it renders.
 */
export default function EntryGlideCamera({ request }) {
    const stateRef = useRef(null)

    useFrame((frame) => {
        const { camera, gl, scene, clock } = frame
        let s = stateRef.current
        if (!s) {
            const box = new THREE.Box3().setFromObject(request.target)
            const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
            const size = box.isEmpty() ? new THREE.Vector3(2, 2, 2) : box.getSize(new THREE.Vector3())
            const radius = Math.max(size.x, size.y, size.z) / 2 || 1
            const from = camera.position.clone()
            s = {
                started: clock.getElapsedTime(),
                from,
                centre,
                fromQuat: camera.quaternion.clone(),
                end: glideEndPosition({ from, centre, radius, fov: camera.fov, aspect: camera.aspect, reach: request.reach }),
                look: new THREE.Object3D(),
                done: false
            }
            stateRef.current = s
        }
        const t = request.ms > 0 ? (clock.getElapsedTime() - s.started) * 1000 / request.ms : 1
        camera.position.lerpVectors(s.from, s.end, glideEase(t))
        s.look.position.copy(camera.position)
        s.look.up.copy(camera.up)
        s.look.lookAt(s.centre)
        // Object3D.lookAt points +z at the target for non-cameras; a camera
        // looks down -z, so turn the helper round before borrowing it.
        s.look.rotateY(Math.PI)
        camera.quaternion.slerpQuaternions(s.fromQuat, s.look.quaternion, turnEase(t))
        camera.updateMatrixWorld()

        if (t >= 1 && !s.done) {
            s.done = true
            request.resolve(request.reach >= 1 ? captureRendererFrame({ gl, scene, camera }) : null)
            return
        }
        gl.render(scene, camera)
    }, 1)

    return null
}
