import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
    BEATS,
    beatById,
    beatProgress,
    blackAmount,
    dreamAmount,
    isWaitingForGate,
    nextBeatId,
    shouldAdvance,
    strangeAmount
} from './timeline.js'

// One playhead for the whole piece.
//
// The dials (dream, strange, black) change every frame and are read by almost
// every object in the scene, so they live in a MUTABLE REF, not in state. Put
// them in state and React re-renders the entire dream sixty times a second to
// move a flower; in a ref, the frame loop writes and the objects read, and
// React only hears about it when the beat actually changes — five times in two
// minutes.
//
// `fireGate` is how the world talks back to the film: brushing the bear's
// teeth calls fireGate('brush'), and the timeline decides when that matters.

const HenryClockContext = createContext(null)

const initialValues = () => ({
    beatId: BEATS[0].id,
    elapsed: 0,
    progress: 0,
    dream: 1,
    strange: 0,
    black: 0,
    waiting: false
})

// Where the girl is, shared. The deer turn to face her, the camera follows her,
// and every interactable measures its distance to her — three systems that
// would otherwise each need a prop chain down through the world tree. She is a
// singleton by definition, but this lives on the provider rather than in a
// module so a remount cannot leave a stale Vector3 behind.
const initialGirl = () => ({
    position: new THREE.Vector3(0, 0, 0),
    facing: 0,
    speed: 0,
    seated: false,
    // Written by the camera, read by the controller. Movement is relative to
    // where the visitor is LOOKING, not to where the girl is facing — press
    // forward and she goes away from you, which is the only mapping that
    // survives a camera the beats are allowed to take over.
    cameraYaw: 0,
    glassesOff: 0
})

export function HenryClockProvider({ children }) {
    const valuesRef = useRef(initialValues())
    const girlRef = useRef(initialGirl())
    const gatesRef = useRef(new Set())
    // Mirrored into state purely so UI that must re-render on a beat change
    // (nothing yet, but the director overlay will) has something to subscribe
    // to. The scene itself never reads this.
    const [beatId, setBeatId] = useState(BEATS[0].id)

    const fireGate = useCallback((gate) => {
        if (!gate) return
        gatesRef.current.add(gate)
    }, [])

    const restart = useCallback(() => {
        valuesRef.current = initialValues()
        girlRef.current = initialGirl()
        gatesRef.current = new Set()
        setBeatId(BEATS[0].id)
    }, [])

    const value = useMemo(
        () => ({ valuesRef, girlRef, gatesRef, fireGate, restart, beatId, setBeatId }),
        [fireGate, restart, beatId]
    )

    return <HenryClockContext.Provider value={value}>{children}</HenryClockContext.Provider>
}

export const useHenryClock = () => {
    const context = useContext(HenryClockContext)
    if (!context) throw new Error('useHenryClock must be used inside <HenryClockProvider>')
    return context
}

/** Read-only handle for scene objects: `clock.current.dream`, every frame. */
export const useDreamValues = () => useHenryClock().valuesRef

/** Read-only handle for the girl: `girl.current.position`, every frame. */
export const useGirl = () => useHenryClock().girlRef

/**
 * Advances the playhead. Mounted exactly once, inside the Canvas, and BEFORE
 * everything that reads the dials — R3F runs useFrame callbacks in mount order
 * at equal priority, so mounting the driver first is what keeps every object
 * in a frame reading the same numbers instead of a mix of this frame's and
 * last frame's.
 */
export function HenryClockDriver() {
    const { valuesRef, gatesRef, setBeatId } = useHenryClock()

    useFrame((_, delta) => {
        const values = valuesRef.current
        // Cap the step. A backgrounded tab returns with a multi-second delta
        // and would otherwise skip a whole beat while the visitor was away.
        values.elapsed += Math.min(delta, 0.1)

        let beat = beatById(values.beatId)
        while (beat && shouldAdvance(beat, values.elapsed, gatesRef.current)) {
            const next = nextBeatId(beat.id)
            if (!next) break
            values.elapsed -= beat.sec
            values.beatId = next
            beat = beatById(next)
            setBeatId(next)
        }

        values.progress = beatProgress(beat, values.elapsed)
        values.waiting = isWaitingForGate(beat, values.elapsed)
        values.dream = dreamAmount(values.beatId, values.progress)
        values.strange = strangeAmount(values.beatId, values.progress)
        values.black = blackAmount(values.beatId, values.progress)
    })

    return null
}
