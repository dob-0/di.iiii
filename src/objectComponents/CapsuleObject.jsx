import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function CapsuleObject({ color, capsuleRadius = 0.35, capsuleHeight = 0.8, wireframe = false, opacity = 1, material = {} }) {
    const safeRadius = safeDimension(capsuleRadius, 0.35)
    const safeHeight = safeDimension(capsuleHeight, 0.8)
    return (
        <mesh position-y={safeHeight / 2 + safeRadius}>
            <capsuleGeometry args={[safeRadius, safeHeight, 8, 24]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
