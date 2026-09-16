import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues, useGirl } from '../dreamClock.jsx'
import { makeBlobGeometry, makeTaperGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, STRANGE } from '../palette.js'

// The deer under the tree. Authored one unit tall at the shoulder.
//
// Reference 5 crops them at the top of the frame — muzzle, ear, one eye — so
// the head is built to be the readable part and the body is barely more than a
// mass. Long tapered muzzle, ears set wide and high, and eyes far too large
// and far too dark for the head, which is the single detail that decides
// whether a deer reads as storybook or as wildlife.
//
// Their whole performance is one line of the brief: "the deer start looking at
// her". Until beat 4 the head drifts on its own slow idle and the eyes blink;
// from beat 4 the head tracks the girl exactly and the blinking stops. Nothing
// else about them changes. Being watched by something that has stopped
// blinking is enough.

const LEG_POSITIONS = [
    [0.17, 0, 0.24],
    [-0.17, 0, 0.24],
    [0.15, 0, -0.26],
    [-0.15, 0, -0.26]
]

export default function Deer({ seed = 1, resting = false, ...props }) {
    const values = useDreamValues()
    const girl = useGirl()
    const headRef = useRef(null)
    const lidRefs = useRef([])
    const worldPosition = useMemo(() => new THREE.Vector3(), [])
    const toGirl = useMemo(() => new THREE.Vector3(), [])

    const geometry = useMemo(
        () => ({
            body: makeBlobGeometry({ radius: 0.3, detail: 2, wobble: 0.14, seed }),
            head: makeBlobGeometry({ radius: 0.13, detail: 2, wobble: 0.1, seed: seed + 5 }),
            muzzle: makeTaperGeometry({ length: 0.2, radius: 0.075, tipRadius: 0.045, bend: 0.25 }),
            ear: makeTaperGeometry({ length: 0.16, radius: 0.045, tipRadius: 0.006, bend: 0.35 }),
            leg: makeTaperGeometry({ length: 0.42, radius: 0.035, tipRadius: 0.022, bend: 0.05 })
        }),
        [seed]
    )

    const coatMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: DREAM.cream })
    const shadeMaterial = useTinted({ dream: DREAM.blush, strange: STRANGE.blush, real: DREAM.blush })
    const hoofMaterial = useTinted({ dream: DREAM.deepTeal, strange: STRANGE.deepTeal, real: DREAM.deepTeal })
    // The eye is deliberately NOT toon-shaded: it is the one wet thing in a
    // matte world, and giving it the same ramp as the coat is what would make
    // the whole animal read as plastic.
    const eyeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#12303A' }), [])
    const glintMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), [])

    const phase = useMemo(() => seed * 1.7, [seed])
    const bodyY = resting ? 0.22 : 0.44
    const ownYaw = props.rotation ? props.rotation[1] : 0

    useFrame((state) => {
        const time = state.clock.elapsedTime
        const { strange } = values.current
        const head = headRef.current
        if (!head) return

        // Idle: a slow, incurious drift, looking anywhere but at her.
        const idleYaw = Math.sin(time * 0.23 + phase) * 0.5
        const idlePitch = Math.sin(time * 0.31 + phase * 2) * 0.12

        // Watching: the true angle to the girl, in the head's own space.
        head.getWorldPosition(worldPosition)
        toGirl.copy(girl.current.position).sub(worldPosition)
        const watchYaw = Math.atan2(toGirl.x, toGirl.z) - ownYaw
        const watchPitch = -Math.atan2(toGirl.y, Math.hypot(toGirl.x, toGirl.z)) * 0.5

        head.rotation.y = THREE.MathUtils.lerp(idleYaw, watchYaw, strange)
        head.rotation.x = THREE.MathUtils.lerp(idlePitch, watchPitch, strange)

        // Blink: a sharp pulse every few seconds, damped to nothing as the
        // watching takes over.
        const cycle = (time * 0.28 + phase) % 1
        const blink = cycle > 0.94 ? 1 - Math.abs(cycle - 0.97) / 0.03 : 0
        const lidScale = 1 - blink * (1 - strange)
        for (const lid of lidRefs.current) {
            if (lid) lid.scale.y = Math.max(0.02, lidScale)
        }
    })

    return (
        <group {...props}>
            <mesh geometry={geometry.body} material={coatMaterial} position={[0, bodyY, 0]} scale={[0.72, 0.78, 1.25]} />

            {!resting &&
                LEG_POSITIONS.map((position, index) => (
                    <group key={index} position={position}>
                        <mesh geometry={geometry.leg} material={coatMaterial} />
                        <mesh geometry={geometry.leg} material={hoofMaterial} scale={[1.15, 0.12, 1.15]} />
                    </group>
                ))}

            {/* neck */}
            <mesh
                geometry={geometry.leg}
                material={coatMaterial}
                position={[0, bodyY + 0.12, 0.26]}
                rotation={[-0.5, 0, 0]}
                scale={[1.5, 0.85, 1.5]}
            />

            <group ref={headRef} position={[0, bodyY + 0.42, 0.44]}>
                <mesh geometry={geometry.head} material={coatMaterial} scale={[0.85, 0.9, 1.05]} />
                <mesh
                    geometry={geometry.muzzle}
                    material={coatMaterial}
                    position={[0, -0.02, 0.05]}
                    rotation={[Math.PI / 2 - 0.15, 0, 0]}
                />
                <mesh material={shadeMaterial} position={[0, -0.035, 0.24]}>
                    <sphereGeometry args={[0.042, 10, 8]} />
                </mesh>

                {[-1, 1].map((sideSign, sideIndex) => (
                    <group key={sideSign}>
                        <mesh
                            geometry={geometry.ear}
                            material={coatMaterial}
                            position={[sideSign * 0.11, 0.08, -0.02]}
                            rotation={[0.1, 0, sideSign * 0.95]}
                        />
                        <group
                            ref={(node) => {
                                lidRefs.current[sideIndex] = node
                            }}
                            position={[sideSign * 0.095, 0.025, 0.075]}
                        >
                            <mesh material={eyeMaterial}>
                                <sphereGeometry args={[0.046, 12, 10]} />
                            </mesh>
                            <mesh material={glintMaterial} position={[sideSign * 0.014, 0.016, 0.038]}>
                                <sphereGeometry args={[0.012, 8, 6]} />
                            </mesh>
                        </group>
                    </group>
                ))}
            </group>
        </group>
    )
}
