import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function ConeObject({ color, coneRadius = 0.5, coneHeight = 1.5, wireframe = false, opacity = 1, material = {} }) {
    const safeRadius = safeDimension(coneRadius, 0.5)
    const safeHeight = safeDimension(coneHeight, 1.5)
    return (
        <mesh position-y={safeHeight / 2}>
            <coneGeometry args={[safeRadius, safeHeight, 32]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
