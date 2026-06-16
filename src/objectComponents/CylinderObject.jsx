import React from 'react'

export default function CylinderObject({
    color,
    cylinderRadiusTop = 0.5,
    cylinderRadiusBottom = 0.5,
    cylinderHeight = 1.5
}) {
    return (
        <mesh position-y={cylinderHeight / 2}>
            <cylinderGeometry args={[cylinderRadiusTop, cylinderRadiusBottom, cylinderHeight, 32]} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}
