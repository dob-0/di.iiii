import React from 'react'

export default function BoxObject({ color, boxSize = [1, 1, 1] }) {
    return (
        <mesh position-y={boxSize[1] / 2}>
            <boxGeometry args={boxSize} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}
