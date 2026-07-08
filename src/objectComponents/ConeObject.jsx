import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function ConeObject({ color, coneRadius = 0.5, coneHeight = 1.5, wireframe = false, opacity = 1, material = {} }) {
    return (
        <mesh position-y={coneHeight / 2}>
            <coneGeometry args={[coneRadius, coneHeight, 32]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
