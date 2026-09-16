import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import { REAL } from '../palette.js'

// The room. Two walls, a window, and the light coming through it.
//
// It fades in rather than arriving, and it fades in LAST — after the flowers
// have gone but while the shrinking is still finishing. The order matters: if
// the walls are already there while the garden is still enormous, the piece
// has shown its hand and the reveal is a formality. Held back until the world
// is nearly small, the walls read as something that was always behind the
// dream and simply became visible.
//
// Two walls, not four. She is sitting in a corner, the camera is over her
// shoulder, and the two walls she is facing away from would never be seen —
// building them would only give the camera something to clip through.
//
// The window is the only warm thing in the room and it is deliberately doing
// what the hot-pink sky did ninety seconds earlier: one large flat field of
// light that the whole space is lit by. Same composition, ordinary colour.

const FADE_START = 0.42

export default function RealRoom() {
    const values = useDreamValues()
    const groupRef = useRef(null)

    const materials = useMemo(() => {
        const make = (color, extra = {}) =>
            new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0, ...extra })
        return {
            wall: make(REAL.wall),
            wallShadow: make(REAL.wallShadow),
            window: make(REAL.daylight),
            frame: make(REAL.wallShadow),
            shaft: make(REAL.daylight, { depthWrite: false, side: THREE.DoubleSide })
        }
    }, [])

    useFrame(() => {
        const group = groupRef.current
        if (!group) return
        // Remaps dream 0.42..0 onto opacity 0..1 — see FADE_START above.
        const fade = THREE.MathUtils.clamp((FADE_START - values.current.dream) / FADE_START, 0, 1)
        materials.wall.opacity = fade
        materials.wallShadow.opacity = fade
        materials.window.opacity = fade
        materials.frame.opacity = fade
        materials.shaft.opacity = fade * 0.22
        group.visible = fade > 0.004
    })

    useEffect(
        () => () => {
            for (const material of Object.values(materials)) material.dispose()
        },
        [materials]
    )

    return (
        <group ref={groupRef} visible={false}>
            {/* back wall, with the window cut into it as three panels rather
                than a real hole — cheaper, and at this angle identical */}
            <group position={[0, 0, -5.2]}>
                <mesh material={materials.wall} position={[-2.6, 1.7, 0]}>
                    <planeGeometry args={[3.4, 3.4]} />
                </mesh>
                <mesh material={materials.wall} position={[2.6, 1.7, 0]}>
                    <planeGeometry args={[3.4, 3.4]} />
                </mesh>
                <mesh material={materials.wall} position={[0, 3.05, 0]}>
                    <planeGeometry args={[1.8, 0.7, 1]} />
                </mesh>
                <mesh material={materials.wall} position={[0, 0.35, 0]}>
                    <planeGeometry args={[1.8, 0.7]} />
                </mesh>
                <mesh material={materials.window} position={[0, 1.7, -0.02]}>
                    <planeGeometry args={[1.8, 2.0]} />
                </mesh>
                <mesh material={materials.frame} position={[0, 1.7, 0.01]}>
                    <boxGeometry args={[0.05, 2.0, 0.02]} />
                </mesh>
                <mesh material={materials.frame} position={[0, 1.7, 0.01]}>
                    <boxGeometry args={[1.8, 0.05, 0.02]} />
                </mesh>
            </group>

            {/* side wall */}
            <mesh material={materials.wallShadow} position={[-5.4, 1.7, -1.6]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[7.2, 3.4]} />
            </mesh>

            {/* the shaft of afternoon light on the floor. A soft quad, not a
                volumetric — the references have no atmosphere in them, they
                have shapes of light lying on things. */}
            <mesh material={materials.shaft} rotation={[-Math.PI / 2, 0, 0]} position={[0.15, 0.02, -2.6]}>
                <planeGeometry args={[2.4, 4.4]} />
            </mesh>
        </group>
    )
}
