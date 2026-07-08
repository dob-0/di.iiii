import React from 'react'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'

export default function BoxObject({ color, boxSize = [1, 1, 1], wireframe = false, opacity = 1, material = {} }) {
    const safeSize = Array.isArray(boxSize)
        ? boxSize.map((entry) => {
            const next = Math.abs(Number(entry))
            if (!Number.isFinite(next)) return 1
            return Math.min(100, Math.max(0.001, next))
        })
        : [1, 1, 1]

    return (
        <mesh position-y={safeSize[1] / 2}>
            <boxGeometry args={safeSize} />
            <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />
        </mesh>
    )
}
