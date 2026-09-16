import { useMemo } from 'react'
import { makeBlobGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// A long low mound. In the dream it is the ridge she walks around; in the room
// it is the sofa she has been leaning against the whole time.
//
// Deliberately the least interesting object in the piece. It exists to hold
// the horizon at dream scale and to be recognisable at room scale, and any
// more character than that would pull attention away from the bear.

export default function Rock({ seed = 21, ...props }) {
    const geometry = useMemo(() => makeBlobGeometry({ radius: 0.5, detail: 2, wobble: 0.3, seed }), [seed])
    const material = useTinted({ dream: DREAM.seafoam, strange: STRANGE.seafoam, real: REAL.sofa })

    return (
        <group {...props}>
            <mesh geometry={geometry} material={material} scale={[1.9, 0.62, 0.9]} position={[0, 0.3, 0]} />
        </group>
    )
}
