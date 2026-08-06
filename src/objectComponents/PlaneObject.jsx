import React from 'react'
import * as THREE from 'three'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'

export default function PlaneObject({ color, planeWidth = 2, planeDepth = 2, wireframe = false, opacity = 1, material = {} }) {
    const safeWidth = safeDimension(planeWidth, 2)
    const safeDepth = safeDimension(planeDepth, 2)
    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[safeWidth, safeDepth]} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} side={THREE.DoubleSide} {...material} />
        </mesh>
    )
}
