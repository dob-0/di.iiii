import React from 'react'

export default function SphereObject({ color, sphereRadius = 0.5, wireframe = false, opacity = 1 }) {
    return (
        <mesh position-y={sphereRadius}>
            <sphereGeometry args={[sphereRadius, 32, 32]} />
            <meshStandardMaterial color={color} wireframe={wireframe} transparent={wireframe || opacity < 1} opacity={opacity} />
        </mesh>
    )
}
