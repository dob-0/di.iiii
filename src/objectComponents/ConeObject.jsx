import React from 'react'

export default function ConeObject({ color, coneRadius = 0.5, coneHeight = 1.5 }) {
    return (
        <mesh position-y={coneHeight / 2}>
            <coneGeometry args={[coneRadius, coneHeight, 32]} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}
