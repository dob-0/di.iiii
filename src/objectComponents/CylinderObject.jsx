import React from 'react'

export default function CylinderObject({
    color,
    cylinderRadiusTop = 0.5,
    cylinderRadiusBottom = 0.5,
    cylinderHeight = 1.5,
    wireframe = false,
    opacity = 1
}) {
    return (
        <mesh position-y={cylinderHeight / 2}>
            <cylinderGeometry args={[cylinderRadiusTop, cylinderRadiusBottom, cylinderHeight, 32]} />
            <meshStandardMaterial color={color} wireframe={wireframe} transparent={wireframe || opacity < 1} opacity={opacity} />
        </mesh>
    )
}
