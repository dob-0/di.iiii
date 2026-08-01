import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { STANDPOINT } from './stageView.js'
import { SETTLE_FRAMES, standpointLift } from './xrStandpoint.js'

// Carries the viewer along the edit list's travel offset, and puts their eyes
// where the piece expects them.
//
// Two different things have to move depending on where the piece is running,
// and getting this wrong is the classic WebXR bug:
//
//   FLAT SCREEN — no XR camera exists, so the camera itself is moved. Position
//   only; LookAround owns rotation and writing both here would fight it.
//
//   IN A HEADSET — the headset owns the camera pose absolutely, and any write
//   to camera.position is overwritten on the next XR frame (and, if it did
//   land, would tear the view away from the user's actual head). The play space
//   is moved instead, by positioning XROrigin. Everything inside the origin
//   travels with it, including the user's real-world walking area.
//
// The offset is applied on top of the standpoint rather than replacing it, so
// eye height stays wherever the piece says it is. On a flat screen that is
// STANDPOINT.y outright. In a headset it is the head pose the session reports,
// which SHOULD already be measured from the floor — plus a one-off correction
// for when it plainly is not. See xrStandpoint.js.

// Reused rather than allocated per frame: a new Vector3 sixty times a second is
// garbage the frame loop has to collect mid-piece.
const HEAD = new THREE.Vector3()
const RIG = new THREE.Vector3()

export default function ViewerDolly({ offset, originRef, onEyeHeight }) {
    const camera = useThree((state) => state.camera)
    const isPresenting = useXR((state) => state.session != null)
    const previous = useRef([0, 0, 0])

    // Measured once per session and then held. Re-measuring every frame would
    // make the lift follow the viewer's own head — crouch and the world would
    // sink with you, which is the floor moving under someone in a headset.
    const lift = useRef(0)
    const framesIn = useRef(0)

    useFrame(() => {
        const [x, y, z] = offset ?? previous.current
        previous.current = [x, y, z]

        if (isPresenting) {
            // Moving the rig, not the head. The headset keeps full authority
            // over where the user is looking and where their head is within
            // the play space.
            const origin = originRef?.current
            if (!origin) return

            if (framesIn.current < SETTLE_FRAMES) {
                framesIn.current += 1

                if (framesIn.current === SETTLE_FRAMES) {
                    // Head height measured against the rig, not the world, so
                    // the reading is independent of any lift already applied —
                    // otherwise the correction would feed back into its own
                    // measurement and run away.
                    //
                    // Read straight off the world matrices: getWorldPosition()
                    // would recompute them from position/quaternion, and during
                    // a session those are decomposed FROM the XR pose rather
                    // than being the source of it.
                    HEAD.setFromMatrixPosition(camera.matrixWorld)
                    RIG.setFromMatrixPosition(origin.matrixWorld)

                    const eyeHeight = HEAD.y - RIG.y
                    lift.current = standpointLift(eyeHeight)
                    onEyeHeight?.({ eyeHeight, lift: lift.current })
                }
            }

            origin.position.set(x, y + lift.current, z)
            return
        }

        // Back on the flat screen. Dropped rather than kept, so a session that
        // needed a lift cannot leave the browser view raised by 1.6m after it
        // ends, and so the next Enter VR measures the headset fresh instead of
        // trusting a number from a session that may have been on another device.
        framesIn.current = 0
        lift.current = 0

        camera.position.set(
            STANDPOINT.x + x,
            STANDPOINT.y + y,
            STANDPOINT.z + z
        )
    })

    return null
}
