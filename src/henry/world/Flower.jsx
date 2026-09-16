import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import { makeLeafGeometry, makePetalGeometry, makeTaperGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// A lily, authored one unit tall so that the pair table can state its size in
// metres at both ends: 33 in the dream, 0.95 as the plant by the window.
//
// The lily is from reference 5 specifically — long tapered petals bent right
// back, spotted, with the stamens standing clear of the flower on stalks. It
// is not a generic five-petal daisy, and it matters: the deep bend is what
// gives the girl somewhere to sit and what makes the flower read as furniture
// at her scale rather than as decoration.
//
// The pot is present in BOTH states. In the dream it is a terracotta ridge
// running round the base that reads as landform; in the room it is obviously a
// pot. Nothing appears at the reveal that was not already there — that is the
// whole emotional mechanic of the piece, so it is worth the twelve triangles.

const PETAL_COUNT = 6
const STAMEN_COUNT = 6

export default function Flower({ seed = 0, ...props }) {
    const values = useDreamValues()
    const headRef = useRef(null)
    const petalRefs = useRef([])
    const stemRef = useRef(null)

    const geometry = useMemo(
        () => ({
            petal: makePetalGeometry({ length: 0.36, width: 0.1, bend: 1.35, cup: 0.4 }),
            leaf: makeLeafGeometry({ length: 0.3, width: 0.09, bend: 0.9 }),
            stamen: makeTaperGeometry({ length: 0.15, radius: 0.006, tipRadius: 0.004, bend: 0.5 })
        }),
        []
    )

    const petalMaterial = useTinted({
        dream: DREAM.blush,
        strange: STRANGE.rose,
        real: REAL.leaf,
        side: THREE.DoubleSide
    })
    const stemMaterial = useTinted({ dream: DREAM.teal, strange: STRANGE.teal, real: REAL.leaf })
    const leafMaterial = useTinted({
        dream: DREAM.seafoam,
        strange: STRANGE.seafoam,
        real: REAL.leaf,
        side: THREE.DoubleSide
    })
    const stamenMaterial = useTinted({
        dream: DREAM.amber,
        strange: STRANGE.amber,
        real: REAL.leaf,
        emissiveBoost: 0.35
    })
    const potMaterial = useTinted({ dream: DREAM.vermilion, strange: STRANGE.vermilion, real: REAL.pot })
    const soilMaterial = useTinted({ dream: DREAM.deepTeal, strange: STRANGE.deepTeal, real: REAL.soil })

    // Phase offsets so a field of these never pulses in unison.
    const phase = useMemo(() => seed * 2.399963, [seed])

    useFrame((state) => {
        const time = state.clock.elapsedTime
        const { strange } = values.current

        // Beat 4: "flowers move strangely". Not faster and not violent — the
        // sway quantises. A continuous drift becomes a series of held poses
        // that snap, which is what makes something alive look operated.
        const quantised = Math.round(Math.sin(time * 0.5 + phase) * 4) / 4
        const smooth = Math.sin(time * 0.5 + phase)
        const sway = THREE.MathUtils.lerp(smooth, quantised, strange)

        if (stemRef.current) {
            stemRef.current.rotation.z = sway * 0.05
            stemRef.current.rotation.x = Math.sin(time * 0.37 + phase * 1.7) * 0.03
        }
        if (headRef.current) {
            headRef.current.rotation.y = time * 0.06 + phase
        }
        // The petals open and close a little, breathing. In the strange beat
        // they stop breathing together — each petal takes its own rhythm, and
        // a flower whose petals disagree is the exact kind of wrong the brief
        // asks for: nothing is broken, it is just not one creature any more.
        for (let i = 0; i < petalRefs.current.length; i++) {
            const petal = petalRefs.current[i]
            if (!petal) continue
            const together = Math.sin(time * 0.8 + phase)
            const apart = Math.sin(time * (0.8 + i * 0.31) + phase + i)
            const breath = THREE.MathUtils.lerp(together, apart, strange)
            petal.rotation.x = -0.5 + breath * 0.06
        }
    })

    return (
        <group {...props}>
            {/* pot — landform in the dream, a pot in the room */}
            <mesh material={potMaterial} position={[0, 0.045, 0]}>
                <cylinderGeometry args={[0.13, 0.1, 0.09, 16, 1, true]} />
            </mesh>
            <mesh material={soilMaterial} position={[0, 0.085, 0]}>
                <cylinderGeometry args={[0.125, 0.125, 0.01, 16]} />
            </mesh>

            <group ref={stemRef}>
                <mesh material={stemMaterial} position={[0, 0.4, 0]}>
                    <cylinderGeometry args={[0.012, 0.02, 0.72, 7]} />
                </mesh>

                {[0.22, 0.4, 0.55].map((height, index) => (
                    <mesh
                        key={height}
                        geometry={geometry.leaf}
                        material={leafMaterial}
                        position={[0, height, 0]}
                        rotation={[0.4, index * 2.2 + phase, 0]}
                    />
                ))}

                <group ref={headRef} position={[0, 0.76, 0]}>
                    {Array.from({ length: PETAL_COUNT }, (_, index) => (
                        <group key={index} rotation={[0, (index / PETAL_COUNT) * Math.PI * 2, 0]}>
                            <mesh
                                ref={(node) => {
                                    petalRefs.current[index] = node
                                }}
                                geometry={geometry.petal}
                                material={petalMaterial}
                                rotation={[-0.5, 0, 0]}
                            />
                        </group>
                    ))}

                    {Array.from({ length: STAMEN_COUNT }, (_, index) => (
                        <group key={index} rotation={[0, (index / STAMEN_COUNT) * Math.PI * 2 + 0.4, 0]}>
                            <mesh
                                geometry={geometry.stamen}
                                material={stamenMaterial}
                                rotation={[-0.35, 0, 0]}
                            />
                        </group>
                    ))}
                </group>
            </group>
        </group>
    )
}
