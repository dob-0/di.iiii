import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
    DEFAULT_ORBIT,
    ORBIT_PIVOT,
    orbitAim,
    clampOrbitPitch,
    orbitPosition,
    zoomOrbitDistance
} from '../../algoVrithm/stageView.js'

// The outside camera. Orbits the standpoint instead of sitting on it.
//
// Mounts only while the author is in the outside view, and never during an XR
// session — a headset owns its own pose and there is no such thing as watching
// yourself from outside while wearing it.
//
// Mutually exclusive with LookAround by construction: both write
// camera.rotation every frame, so mounting both means whichever runs second
// wins and the camera judders. The experience swaps one for the other rather
// than disabling a flag inside either.

const DRAG_SENSITIVITY = 0.006
const DAMPING = 0.15

// Pointer travel, in pixels, past which a press counts as a drag rather than a
// click. Below this a shaky hand on a trackpad would swallow every click on the
// standpoint marker.
const DRAG_THRESHOLD = 4

export default function OrbitView({ dragRef, suppressRef, travel }) {
    const camera = useThree((state) => state.camera)
    const domElement = useThree((state) => state.gl.domElement)

    const target = useRef({ ...DEFAULT_ORBIT })
    const current = useRef({ ...DEFAULT_ORBIT })
    const pressing = useRef(false)
    const last = useRef({ x: 0, y: 0 })

    useEffect(() => {
        const onPointerDown = (event) => {
            // The transform gizmo is on the same canvas and grabs the pointer
            // first. Without this, dragging an arrow also swings the camera and
            // the object appears to fly away from the handle.
            if (suppressRef?.current) return
            pressing.current = true
            last.current = { x: event.clientX, y: event.clientY }
            // Fresh press, no travel yet — so a click that follows immediately
            // is a real click. Standpoint reads this on release.
            if (dragRef) dragRef.current = { moved: false, travel: 0 }
            domElement.style.cursor = 'grabbing'
        }

        const onPointerMove = (event) => {
            if (!pressing.current || suppressRef?.current) return
            const dx = event.clientX - last.current.x
            const dy = event.clientY - last.current.y
            last.current = { x: event.clientX, y: event.clientY }

            if (dragRef?.current) {
                dragRef.current.travel += Math.abs(dx) + Math.abs(dy)
                if (dragRef.current.travel > DRAG_THRESHOLD) dragRef.current.moved = true
            }

            // Negated so the installation follows the pointer — drag left and
            // the scene swings left, the way grabbing an object works. Matching
            // an orbit control's convention here matters more than matching
            // LookAround's, because this view is a model you are turning, not a
            // head you are turning.
            target.current.yaw -= dx * DRAG_SENSITIVITY
            target.current.pitch = clampOrbitPitch(target.current.pitch + dy * DRAG_SENSITIVITY)
        }

        const onPointerUp = () => {
            pressing.current = false
            domElement.style.cursor = 'grab'
        }

        const onWheel = (event) => {
            event.preventDefault()
            target.current.distance = zoomOrbitDistance(target.current.distance, event.deltaY)
        }

        domElement.style.cursor = 'grab'
        domElement.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)
        // Not passive: the handler calls preventDefault so the page behind the
        // canvas does not scroll while the author is zooming.
        domElement.addEventListener('wheel', onWheel, { passive: false })

        return () => {
            domElement.style.cursor = ''
            domElement.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointercancel', onPointerUp)
            domElement.removeEventListener('wheel', onWheel)
        }
    }, [domElement, dragRef, suppressRef])

    useFrame(() => {
        current.current.yaw += (target.current.yaw - current.current.yaw) * DAMPING
        current.current.pitch += (target.current.pitch - current.current.pitch) * DAMPING
        current.current.distance += (target.current.distance - current.current.distance) * DAMPING

        // Orbit the viewer wherever they have been carried to, not the world
        // origin they started at — otherwise a travel move slides the subject
        // of the shot out of frame.
        const pivot = {
            x: ORBIT_PIVOT.x + (travel?.[0] ?? 0),
            y: ORBIT_PIVOT.y + (travel?.[1] ?? 0),
            z: ORBIT_PIVOT.z + (travel?.[2] ?? 0)
        }
        const { x, y, z } = orbitPosition(current.current, pivot)
        camera.position.set(x, y, z)

        // lookAt writes a quaternion, but LookAround left Euler order as YXZ and
        // R3F reads rotation back from the same object — resetting the order
        // keeps a later switch back to inside view from inheriting a rolled
        // horizon.
        camera.rotation.order = 'XYZ'
        const aim = orbitAim(current.current.distance, pivot)
        camera.lookAt(new THREE.Vector3(aim.x, aim.y, aim.z))
    })

    return null
}
