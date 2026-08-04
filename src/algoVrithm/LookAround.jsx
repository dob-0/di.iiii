import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useXR } from '@react-three/xr'

// Flat-screen look-around.
//
// In a headset the piece already surrounds you — you turn your head and the
// scene is there. On a monitor the camera is bolted in place, so everything
// behind and above the viewer is unreachable. This makes the flat-screen
// camera turn in place: same 360 world, drag instead of a neck.
//
// It rotates the camera only. It never MOVES it — the viewer stays at the
// centre of the piece, which is the same rule the sequences are built to.

// Radians of rotation per pixel dragged. Tuned so a drag across a 1440px
// window turns roughly 180 degrees.
const SENSITIVITY = 0.0022

// Stop just short of straight up/down. At exactly 90 degrees the camera's
// up-vector becomes ambiguous and the view rolls — the classic gimbal flip.
export const PITCH_LIMIT = THREE.MathUtils.degToRad(85)

export const clampPitch = (pitch) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch))

// How fast the camera catches up to the pointer. Damping rather than direct
// assignment so a fast flick glides instead of snapping.
const DAMPING = 0.12

export default function LookAround() {
    const camera = useThree((state) => state.camera)
    const domElement = useThree((state) => state.gl.domElement)
    const isPresenting = useXR((state) => state.session != null)

    const target = useRef({ yaw: 0, pitch: 0 })
    const current = useRef({ yaw: 0, pitch: 0 })
    const dragging = useRef(false)
    const last = useRef({ x: 0, y: 0 })

    useEffect(() => {
        if (isPresenting) return undefined

        const onPointerDown = (event) => {
            dragging.current = true
            last.current = { x: event.clientX, y: event.clientY }
            domElement.style.cursor = 'grabbing'
        }

        const onPointerMove = (event) => {
            if (!dragging.current) return
            const dx = event.clientX - last.current.x
            const dy = event.clientY - last.current.y
            last.current = { x: event.clientX, y: event.clientY }
            // Dragging right turns the view left, the way dragging a photo
            // moves the photo — this is what every panorama viewer does, and
            // reversing it reads as broken.
            target.current.yaw += dx * SENSITIVITY
            target.current.pitch = clampPitch(target.current.pitch + dy * SENSITIVITY)
        }

        const onPointerUp = () => {
            dragging.current = false
            domElement.style.cursor = 'grab'
        }

        domElement.style.cursor = 'grab'
        domElement.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)

        return () => {
            domElement.style.cursor = ''
            domElement.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointercancel', onPointerUp)
        }
    }, [domElement, isPresenting])

    useFrame(() => {
        // During an XR session the headset owns the camera pose. Writing to it
        // here would fight the visitor's own head movement.
        if (isPresenting) return

        current.current.yaw += (target.current.yaw - current.current.yaw) * DAMPING
        current.current.pitch += (target.current.pitch - current.current.pitch) * DAMPING

        // YXZ order applies yaw around world-up first, then pitch around the
        // camera's own right axis — the order a head actually turns. The
        // default XYZ tilts the horizon as you look up.
        camera.rotation.order = 'YXZ'
        camera.rotation.y = current.current.yaw
        camera.rotation.x = current.current.pitch
        camera.rotation.z = 0
    })

    return null
}
