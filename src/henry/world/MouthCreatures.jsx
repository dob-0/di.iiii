import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import { makeBlobGeometry, makeTaperGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, STRANGE } from '../palette.js'

// The tiny creatures playing inside the bear's mouth. Straight from reference
// 2, where six mice are standing about on a tiger's tongue holding a
// toothbrush between them, entirely unbothered.
//
// The unbotheredness is the whole joke and it has to be in the animation: they
// hop, they wander, they turn to look at each other, and not one of them ever
// acknowledges the mouth they are standing in. If they reacted to the girl the
// scene would become a scene; ignoring her is what makes it absurd.
//
// They are dream-only — nothing in the room turns out to have been them. In
// beat 4 they stop wandering and face outward, all six at once, which is the
// cheapest and least explicable unpleasant thing in the piece.

const CREATURE_COUNT = 6

export default function MouthCreatures({ radius = 0.2, ...props }) {
    const values = useDreamValues()
    const creatureRefs = useRef([])

    const geometry = useMemo(
        () => ({
            body: makeBlobGeometry({ radius: 0.045, detail: 1, wobble: 0.1, seed: 71 }),
            ear: makeBlobGeometry({ radius: 0.022, detail: 1, wobble: 0.05, seed: 73 }),
            tail: makeTaperGeometry({ length: 0.05, radius: 0.005, tipRadius: 0.002, bend: 0.9, uSegments: 4, vSegments: 4 })
        }),
        []
    )

    const bodyMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: DREAM.cream })
    const earMaterial = useTinted({ dream: DREAM.blush, strange: STRANGE.blush, real: DREAM.blush })
    const brushMaterial = useTinted({ dream: DREAM.teal, strange: STRANGE.teal, real: DREAM.teal })
    const eyeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#241414' }), [])

    const seeds = useMemo(
        () =>
            Array.from({ length: CREATURE_COUNT }, (_, index) => ({
                angle: (index / CREATURE_COUNT) * Math.PI * 2 + 0.4,
                orbit: 0.35 + ((index * 31) % 10) / 20,
                speed: 0.35 + ((index * 17) % 10) / 30,
                hop: 2.4 + ((index * 13) % 10) / 6,
                phase: index * 1.31,
                hasBrush: index % 2 === 0
            })),
        []
    )

    useFrame((state) => {
        const time = state.clock.elapsedTime
        const { strange } = values.current

        for (let i = 0; i < seeds.length; i++) {
            const creature = creatureRefs.current[i]
            if (!creature) continue
            const seed = seeds[i]

            const wanderAngle = seed.angle + time * seed.speed * 0.5
            const held = seed.angle
            const angle = THREE.MathUtils.lerp(wanderAngle, held, strange)
            const distance = radius * seed.orbit

            creature.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)

            // The hop. Damped to a standstill in beat 4 — a hopping creature
            // that stops hopping is legible from any distance, which a subtle
            // change of expression would not be.
            const hop = Math.abs(Math.sin(time * seed.hop + seed.phase)) * 0.03 * (1 - strange)
            creature.position.y = hop

            // Facing: along its own path normally, outward at the viewer in
            // beat 4.
            const wanderFacing = angle + Math.PI / 2
            const stareFacing = angle
            creature.rotation.y = THREE.MathUtils.lerp(wanderFacing, stareFacing, strange)
            creature.rotation.z = Math.sin(time * seed.hop + seed.phase) * 0.12 * (1 - strange)
        }
    })

    return (
        <group {...props}>
            {seeds.map((seed, index) => (
                <group
                    key={index}
                    ref={(node) => {
                        creatureRefs.current[index] = node
                    }}
                >
                    <mesh geometry={geometry.body} material={bodyMaterial} scale={[1, 1.15, 1]} position={[0, 0.045, 0]} />
                    {[-1, 1].map((sideSign) => (
                        <mesh
                            key={sideSign}
                            geometry={geometry.ear}
                            material={earMaterial}
                            position={[sideSign * 0.03, 0.085, 0]}
                            scale={[1, 1, 0.5]}
                        />
                    ))}
                    {[-1, 1].map((sideSign) => (
                        <mesh key={`eye${sideSign}`} material={eyeMaterial} position={[sideSign * 0.016, 0.055, 0.038]}>
                            <sphereGeometry args={[0.008, 6, 5]} />
                        </mesh>
                    ))}
                    <mesh
                        geometry={geometry.tail}
                        material={earMaterial}
                        position={[0, 0.03, -0.04]}
                        rotation={[1.2, 0, 0]}
                    />
                    {seed.hasBrush && (
                        <group position={[0.05, 0.06, 0.02]} rotation={[0, 0, -0.7]}>
                            <mesh material={brushMaterial}>
                                <boxGeometry args={[0.008, 0.11, 0.008]} />
                            </mesh>
                            <mesh material={bodyMaterial} position={[0, 0.062, 0]}>
                                <boxGeometry args={[0.014, 0.018, 0.014]} />
                            </mesh>
                        </group>
                    )}
                </group>
            ))}
        </group>
    )
}
