import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function CylinderObject({
    color,
    cylinderRadiusTop = 0.5,
    cylinderRadiusBottom = 0.5,
    cylinderHeight = 1.5,
    wireframe = false,
    opacity = 1,
    material = {}
}) {
    const safeRadiusTop = safeDimension(cylinderRadiusTop, 0.5)
    const safeRadiusBottom = safeDimension(cylinderRadiusBottom, 0.5)
    const safeHeight = safeDimension(cylinderHeight, 1.5)
    return (
        <mesh position-y={safeHeight / 2}>
            <cylinderGeometry args={[safeRadiusTop, safeRadiusBottom, safeHeight, 32]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
