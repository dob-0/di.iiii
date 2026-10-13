import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { buildingOf, createReachTracker } from './beamReach.js'
import { hazeUniformsFor, setHazeBox } from './hazeUniforms.js'

// THE CAST, MOUNTED IN THE LAMP (beamReach.js): an empty anchor at the lamp's origin, in its frame, and a frame hook
// that casts the lamp's directions against the building when — and only when — something changed: the lamp's world
// pose (a drag, a look re-aiming it), the directions (a laser's next frame), or the building (a model loaded late).
// Still lamps cost a 16-number compare a frame and no cast; a moving look re-casts at most at 15 Hz (RECAST_MS), and a
// pose left pending keeps the on-demand loop alive until it is cast (createReachTracker). Reports { hits, planes } up
// only when a length moves by more than 2 cm, so a lamp swaying in place does not rebuild its geometry every cast.
// Inside a Canvas only (useFrame): the lamp renders it only when it has a real fiber store.
export default function BeamReachProbe({ dirs, onReach }) {
    const anchor = useRef(null)
    const { scene, gl, invalidate } = useThree()
    const tracker = useMemo(() => createReachTracker(), [])
    const key = JSON.stringify(dirs)
    useFrame(() => {
        const a = anchor.current
        if (!a) return
        const building = buildingOf(scene, Date.now(), (box) => setHazeBox(hazeUniformsFor(gl), box))
        a.updateWorldMatrix(true, false)
        const out = tracker.step({ matrixWorld: a.matrixWorld, dirs, key, building, now: performance.now() })
        if (out === 'pending') invalidate()
        else if (out) onReach?.(out)
    })
    return <object3D ref={anchor} />
}
