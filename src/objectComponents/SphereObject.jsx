import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function SphereObject({ color, sphereRadius = 0.5, wireframe = false, opacity = 1, material = {} }) {
    return (
        <mesh position-y={sphereRadius}>
            <sphereGeometry args={[sphereRadius, 32, 32]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
