import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useDreamValues } from '../dreamClock.jsx'
import { resolvePairTransform } from '../dual.js'

// One dream/real pair, positioned every frame from the global dream dial.
//
// The component is four lines of logic and it is the hinge of the whole piece:
// there is no swap, no second object and no crossfade anywhere in here,
// because there is only ever one object. dual.js decides where it is and how
// big; this puts it there.
//
// Children are authored one unit tall and know nothing about any of this.

export default function Pair({ pair, children }) {
    const values = useDreamValues()
    const groupRef = useRef(null)

    useFrame(() => {
        const group = groupRef.current
        if (!group) return
        const transform = resolvePairTransform(pair, values.current.dream)
        group.position.set(transform.position[0], transform.position[1], transform.position[2])
        group.rotation.y = transform.rotationY
        group.scale.setScalar(transform.scale)
    })

    return <group ref={groupRef}>{children}</group>
}
