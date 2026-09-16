import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues, useGirl, useHenryClock } from './dreamClock.jsx'
import { GIRL_HEIGHT } from './dual.js'

// The camera, which is doing more work than anything else in the piece.
//
// The single decision that makes the scale read is that the camera sits BELOW
// her shoulder and looks slightly UP. Object sizes alone do not do it: put the
// camera at an adult's eye height above a tiny girl and a thirty-metre flower
// just looks like a normal flower with a doll at the bottom, because that is
// the angle we look at gardens from. Drop the lens to her chest and tilt it up
// and the same geometry becomes overwhelming. Reference 5 is shot from exactly
// there; so is reference 1.
//
// Framings are per-beat and interpolated, so the camera performs the story:
//
//   walking   close, low, tilted up.       "everything is above you"
//   sitting   drops and widens a little.   "stay a moment"
//   reveal    pulls back and RISES.        the only high angle in the piece,
//                                          and the reason it lands: the world
//                                          shrinks and the lens grows up.
//   ending    low and close again, still.  ordinary, at her height.
//
// The visitor keeps yaw throughout (drag to look around). They never get
// pitch or distance — those are the film's, and handing them over is what
// separates an interactive short from a third-person game.

const FRAMING = {
    walking: { distance: 3.6, height: 0.62, look: 1.05, fov: 55 },
    sitting: { distance: 3.0, height: 0.5, look: 0.85, fov: 50 },
    reveal: { distance: 6.4, height: 3.1, look: 0.9, fov: 46 },
    ending: { distance: 2.2, height: 0.75, look: 0.7, fov: 42 }
}

const framingForBeat = (beatId) => {
    if (beatId === 'deer') return FRAMING.sitting
    if (beatId === 'stop') return FRAMING.sitting
    if (beatId === 'reveal') return FRAMING.reveal
    if (beatId === 'ending') return FRAMING.ending
    return FRAMING.walking
}

const DRAG_SENSITIVITY = 0.0055

export default function FollowCamera() {
    const camera = useThree((state) => state.camera)
    const gl = useThree((state) => state.gl)
    const girl = useGirl()
    const values = useDreamValues()
    const { beatId } = useHenryClock()

    const yaw = useRef(0)
    const current = useRef({ ...FRAMING.walking })
    const desiredPosition = useMemo(() => new THREE.Vector3(), [])
    const lookTarget = useMemo(() => new THREE.Vector3(), [])

    useEffect(() => {
        const element = gl.domElement
        let dragging = false
        let lastX = 0

        const down = (event) => {
            dragging = true
            lastX = event.clientX
            element.setPointerCapture?.(event.pointerId)
        }
        const move = (event) => {
            if (!dragging) return
            yaw.current -= (event.clientX - lastX) * DRAG_SENSITIVITY
            lastX = event.clientX
        }
        const up = (event) => {
            dragging = false
            element.releasePointerCapture?.(event.pointerId)
        }

        element.addEventListener('pointerdown', down)
        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
        return () => {
            element.removeEventListener('pointerdown', down)
            element.removeEventListener('pointermove', move)
            element.removeEventListener('pointerup', up)
            element.removeEventListener('pointercancel', up)
        }
    }, [gl])

    useFrame((_, delta) => {
        const step = Math.min(delta, 0.05)
        const goal = framingForBeat(beatId)

        // One shared smoothing constant for the whole rig. Frame-rate
        // independent (exponential, not a fixed fraction) so the piece cuts
        // the same on a 144Hz monitor as on a struggling laptop.
        const ease = 1 - Math.exp(-1.6 * step)
        current.current.distance += (goal.distance - current.current.distance) * ease
        current.current.height += (goal.height - current.current.height) * ease
        current.current.look += (goal.look - current.current.look) * ease
        current.current.fov += (goal.fov - current.current.fov) * ease

        girl.current.cameraYaw = yaw.current

        const { position } = girl.current
        desiredPosition.set(
            position.x + Math.sin(yaw.current) * current.current.distance,
            position.y + current.current.height * GIRL_HEIGHT,
            position.z + Math.cos(yaw.current) * current.current.distance
        )

        // The camera lags her rather than being welded to her — a rigid rig
        // makes the world swing around a stationary girl, which reads as the
        // scenery moving instead of her walking.
        camera.position.lerp(desiredPosition, 1 - Math.exp(-6 * step))

        lookTarget.set(position.x, position.y + current.current.look * GIRL_HEIGHT, position.z)
        camera.lookAt(lookTarget)

        // A whisper of drift in the strange beat. Not a shake — a slow, wide
        // wander, the feeling of a held shot that has stopped being held.
        const { strange } = values.current
        if (strange > 0.001) {
            camera.position.x += Math.sin(performance.now() * 0.00021) * 0.09 * strange
            camera.position.y += Math.sin(performance.now() * 0.00017) * 0.05 * strange
        }

        if (Math.abs(camera.fov - current.current.fov) > 0.01) {
            camera.fov = current.current.fov
            camera.updateProjectionMatrix()
        }
    })

    return null
}
