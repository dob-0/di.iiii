import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function TorusObject({ color, torusRadius = 0.5, torusTube = 0.18, wireframe = false, opacity = 1, material = {} }) {
    return (
        <mesh position-y={torusRadius + torusTube}>
            <torusGeometry args={[torusRadius, torusTube, 24, 48]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
