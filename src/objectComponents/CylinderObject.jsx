import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function CylinderObject({
    color,
    cylinderRadiusTop = 0.5,
    cylinderRadiusBottom = 0.5,
    cylinderHeight = 1.5,
    wireframe = false,
    opacity = 1,
    material = {}
}) {
    return (
        <mesh position-y={cylinderHeight / 2}>
            <cylinderGeometry args={[cylinderRadiusTop, cylinderRadiusBottom, cylinderHeight, 32]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
