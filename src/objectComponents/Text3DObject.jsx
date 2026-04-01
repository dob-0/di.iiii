import React from 'react'
import { Text3D } from '@react-three/drei'

const FONT_MAP = {
    helvetiker_regular: '/fonts/helvetiker_regular.typeface.json',
    helvetiker_bold: '/fonts/helvetiker_bold.typeface.json',
    optimer_regular: '/fonts/optimer_regular.typeface.json',
    gentilis_regular: '/fonts/gentilis_regular.typeface.json'
}

export default function Text3DObject({
    data,
    color,
    fontSize3D = 0.5,
    depth3D = 0.2,
    bevelEnabled3D = true,
    bevelThickness3D = 0.02,
    bevelSize3D = 0.01,
    font3D = 'helvetiker_regular'
}) {
    const lines = (data || '').split(/\r?\n/)
    const lineSpacing = fontSize3D * 1.2
    const fontPath = FONT_MAP[font3D] || FONT_MAP.helvetiker_regular

    return (
        <group rotation-x={-Math.PI / 2} position-y={0.01}>
            {lines.map((line, index) => (
                <Text3D
                    key={`${line}-${index}`}
                    font={fontPath}
                    size={fontSize3D}
                    height={depth3D}
                    bevelEnabled={bevelEnabled3D}
                    bevelThickness={bevelThickness3D}
                    bevelSize={bevelSize3D}
                    bevelSegments={2}
                    position-y={-index * lineSpacing}
                >
                    <meshStandardMaterial color={color} />
                    {line || ' '}
                </Text3D>
            ))}
        </group>
    )
}
