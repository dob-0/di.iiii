import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { makeBlobGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// The tree the deer gather under — and, at 1/30th, the standing lamp in the
// corner of the room.
//
// That pairing is why the canopy is one wide low dome on a thin straight trunk
// rather than a branching tree: a lamp silhouette and a storybook tree
// silhouette are the same drawing, and the shape has to survive being read as
// both without changing a vertex.

const CANOPY = [
    { position: [0, 0.78, 0], radius: 0.46, seed: 3 },
    { position: [-0.26, 0.68, 0.12], radius: 0.3, seed: 7 },
    { position: [0.28, 0.7, -0.1], radius: 0.28, seed: 11 },
    { position: [0.04, 0.62, 0.3], radius: 0.24, seed: 13 }
]

export default function Tree(props) {
    const canopyRef = useRef(null)

    const geometry = useMemo(
        () => CANOPY.map((part) => makeBlobGeometry({ radius: part.radius, detail: 2, wobble: 0.22, seed: part.seed })),
        []
    )

    const trunkMaterial = useTinted({ dream: DREAM.teal, strange: STRANGE.teal, real: REAL.wallShadow })
    const canopyMaterial = useTinted({ dream: DREAM.mint, strange: STRANGE.mint, real: REAL.daylight })

    useFrame((state) => {
        if (!canopyRef.current) return
        // One very slow breath. At dream scale the canopy fills the sky, so
        // anything faster than this reads as an earthquake rather than as air.
        const time = state.clock.elapsedTime
        canopyRef.current.rotation.y = Math.sin(time * 0.07) * 0.05
        canopyRef.current.position.y = Math.sin(time * 0.11) * 0.008
    })

    return (
        <group {...props}>
            <mesh material={trunkMaterial} position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.045, 0.09, 0.62, 9]} />
            </mesh>
            {/* the base flare: reads as roots at 30x and as a lamp foot at 1x */}
            <mesh material={trunkMaterial} position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.12, 0.2, 0.05, 12]} />
            </mesh>
            <group ref={canopyRef}>
                {CANOPY.map((part, index) => (
                    <mesh key={index} geometry={geometry[index]} material={canopyMaterial} position={part.position} />
                ))}
            </group>
        </group>
    )
}
