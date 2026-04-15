import React from 'react'

export default function SphereObject({ color, sphereRadius = 0.5 }) {
    return (
        <mesh position-y={sphereRadius}>
            <sphereGeometry args={[sphereRadius, 32, 32]} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}
