import { TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS } from './primitiveSegments.js'
import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function TorusObject({ color, torusRadius = 0.5, torusTube = 0.18, wireframe = false, opacity = 1, material = {} }) {
    const safeRadius = safeDimension(torusRadius, 0.5)
    const safeTube = safeDimension(torusTube, 0.18)
    return (
        <mesh position-y={safeRadius + safeTube}>
            <torusGeometry args={[safeRadius, safeTube, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
