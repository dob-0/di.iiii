import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useDreamValues } from '../dreamClock.jsx'

// Wrapper for the things that have no counterpart in the room — the deer, the
// tiny creatures, the sparkle. They are not revealed as anything; they simply
// were not there.
//
// Scale to zero rather than toggling `visible`. Visibility is a cut and the
// piece has no cuts: at 1:25 the deer have to shrink away with everything else
// so that a viewer cannot tell, in the moment, which objects are about to turn
// into furniture and which are about to stop existing. Learning that only
// afterwards is the whole feeling of the ending.
//
// The extra power curve makes them leave slightly ahead of the real objects
// arriving, so the room is never briefly full of both.

export default function DreamOnly({ children, ...props }) {
    const values = useDreamValues()
    const groupRef = useRef(null)

    useFrame(() => {
        if (!groupRef.current) return
        const scale = Math.pow(Math.max(0, values.current.dream), 1.6)
        groupRef.current.scale.setScalar(scale)
        groupRef.current.visible = scale > 0.002
    })

    return (
        <group ref={groupRef} {...props}>
            {children}
        </group>
    )
}
