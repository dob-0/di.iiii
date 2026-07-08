import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function CapsuleObject({ color, capsuleRadius = 0.35, capsuleHeight = 0.8, wireframe = false, opacity = 1, material = {} }) {
    return (
        <mesh position-y={capsuleHeight / 2 + capsuleRadius}>
            <capsuleGeometry args={[capsuleRadius, capsuleHeight, 8, 24]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
