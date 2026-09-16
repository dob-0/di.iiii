import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import useTinted from '../materials/useTinted.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// The one surface that exists in both worlds and never changes size.
//
// Everything else in the piece shrinks at the reveal. The ground cannot — she
// is standing on it — so it does the transition by colour alone: the meadow
// she has been walking across is, and always was, the floor of the room. It is
// the quietest object here and it carries the largest idea, which is why it
// gets its own file rather than being a plane dropped into the scene root.
//
// The rug is the only thing that arrives rather than transforms. That is
// deliberate and it is the single exception in the piece: something has to
// tell the visitor where they are the instant the flowers are gone, and a
// round rug directly under her does it in one frame with no dialogue.

export default function Ground() {
    const values = useDreamValues()
    const rugRef = useRef(null)

    const groundMaterial = useTinted({ dream: DREAM.teal, strange: STRANGE.teal, real: REAL.floor })
    const rugMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(REAL.rug),
                transparent: true,
                opacity: 0,
                depthWrite: false
            }),
        []
    )

    useFrame(() => {
        if (!rugRef.current) return
        const fade = 1 - THREE.MathUtils.clamp(values.current.dream * 2.4, 0, 1)
        rugMaterial.opacity = fade
        rugRef.current.visible = fade > 0.004
    })

    return (
        <group>
            <mesh material={groundMaterial} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
                <circleGeometry args={[240, 64]} />
            </mesh>
            <mesh ref={rugRef} material={rugMaterial} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} visible={false}>
                <circleGeometry args={[2.6, 48]} />
            </mesh>
        </group>
    )
}
