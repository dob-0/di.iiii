import { SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS } from './primitiveSegments.js'
import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function SphereObject({ color, sphereRadius = 0.5, wireframe = false, opacity = 1, material = {} }) {
    const safeRadius = safeDimension(sphereRadius, 0.5)
    return (
        <mesh position-y={safeRadius}>
            <sphereGeometry args={[safeRadius, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
