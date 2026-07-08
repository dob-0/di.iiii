import React from 'react'
import * as THREE from 'three'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function RingObject({ color, ringInnerRadius = 0.4, ringOuterRadius = 0.8, wireframe = false, opacity = 1, material = {} }) {
    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[ringInnerRadius, ringOuterRadius, 48]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} side={THREE.DoubleSide} {...material} />
        </mesh>
    )
}
