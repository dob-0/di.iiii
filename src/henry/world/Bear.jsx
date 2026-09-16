import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues, useGirl } from '../dreamClock.jsx'
import { makeBlobGeometry, makeTaperGeometry } from '../geometry.js'
import useTinted from '../materials/useTinted.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// The bear. Authored one unit tall sitting, so it is 26 units in the dream and
// a 42cm plush on the rug afterwards.
//
// This is reference 2 almost literally: an enormous round face filling the
// frame, eyes far too big and glassy with a star caught in them, a small
// triangular nose, three short brow marks, and a mouth open so wide it is
// architecture rather than anatomy — a room with a floor, walls and a ceiling
// of teeth. The tiny creatures playing inside are the reference's mice.
//
// Everything about the proportions is chosen so the mouth is ENTERABLE. The
// jaw sits almost on the ground with a low lip to step over, the throat is a
// back-faced sphere rather than a hole, and the tongue is a domed floor she
// can stand on. If the girl cannot walk in, the beat is a cutscene, and the
// brief asked for the opposite.
//
// The teeth are the interactive surface: each one dims slightly on its own and
// brightens when the brush passes it. See `brushProgress`.

const TOOTH_COUNT = 9
const MOUTH_CENTRE_Y = 0.3
const MOUTH_RADIUS = 0.28

// The girl has no vertical collision — she walks on y = 0, everywhere, always.
// That is a deliberate simplification (a two-minute walk does not need a
// character controller), and the price is that the mouth's floor has to BE
// y = 0 rather than merely being near it. TONGUE_TOP is that constraint
// written down: the tongue's top surface, in the mouth group's local space,
// lands exactly on the bear's origin plane. Change MOUTH_CENTRE_Y and this
// follows, so she can never end up shin-deep in a tongue.
const TONGUE_TOP = -MOUTH_CENTRE_Y
const TONGUE_SQUASH = 0.28
const TONGUE_RADIUS = MOUTH_RADIUS * 0.92

// Where the mouth floor is, in the bear's own unit space. The mouth group sits
// at MOUTH_CENTRE_Y and the tongue's top is TONGUE_TOP below that, so the two
// cancel and the floor is the bear's own origin plane. Exported because the
// creatures, the sparkle and the brushing trigger all have to stand on it, and
// three components independently guessing 0.18 is how a scene drifts apart.
export const BEAR_MOUTH_LOCAL = [0, 0, 0.08]

export default function Bear({ brushRef, children, ...props }) {
    const values = useDreamValues()
    const girl = useGirl()
    const headRef = useRef(null)
    const brushArmRef = useRef(null)
    const toothRefs = useRef([])
    const worldPosition = useMemo(() => new THREE.Vector3(), [])

    const geometry = useMemo(
        () => ({
            head: makeBlobGeometry({ radius: 0.5, detail: 3, wobble: 0.06, seed: 31 }),
            body: makeBlobGeometry({ radius: 0.42, detail: 2, wobble: 0.1, seed: 37 }),
            paw: makeBlobGeometry({ radius: 0.16, detail: 2, wobble: 0.12, seed: 41 }),
            ear: makeBlobGeometry({ radius: 0.15, detail: 2, wobble: 0.08, seed: 43 }),
            tooth: makeTaperGeometry({ length: 0.13, radius: 0.045, tipRadius: 0.004, bend: 0.05 }),
            fang: makeTaperGeometry({ length: 0.2, radius: 0.05, tipRadius: 0.004, bend: 0.12 })
        }),
        []
    )

    const furMaterial = useTinted({ dream: DREAM.amber, strange: STRANGE.amber, real: REAL.plushBlue })
    const bellyMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: REAL.plushCream })
    const innerEarMaterial = useTinted({ dream: DREAM.rose, strange: STRANGE.rose, real: REAL.plushCream })
    // The throat is the only emissive surface in the piece. In reference 2 the
    // inside of the mouth is the brightest thing in the picture — it glows
    // like a lit room seen from a dark street, and that glow is what makes an
    // open mouth read as somewhere to go rather than as a threat.
    const throatMaterial = useTinted({
        dream: DREAM.vermilion,
        strange: STRANGE.vermilion,
        real: REAL.plushCream,
        emissiveBoost: 0.5,
        side: THREE.BackSide
    })
    const tongueMaterial = useTinted({
        dream: DREAM.deepRose,
        strange: STRANGE.deepRose,
        real: REAL.plushCream,
        emissiveBoost: 0.2
    })
    const toothMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: REAL.plushCream })
    const noseMaterial = useTinted({ dream: DREAM.hotPink, strange: STRANGE.hotPink, real: REAL.plushCream })
    const markMaterial = useTinted({ dream: DREAM.vermilion, strange: STRANGE.vermilion, real: REAL.plushBlue })

    const eyeWhiteMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#F7F0E4' }), [])
    const irisMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7A4318' }), [])
    const pupilMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1B1008' }), [])
    const glintMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), [])
    const whiskerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#C9A46A' }), [])

    useFrame((state) => {
        const time = state.clock.elapsedTime
        const { strange } = values.current

        if (headRef.current) {
            // A plush toy does not breathe, so this is the smallest motion in
            // the piece: a slow settle, as if the head were heavy. In beat 4
            // it stops entirely — the one object that goes still while
            // everything else starts twitching.
            const alive = 1 - strange
            headRef.current.rotation.z = Math.sin(time * 0.19) * 0.012 * alive
            headRef.current.position.y = 0.62 + Math.sin(time * 0.27) * 0.004 * alive
        }

        // The brush sweeps once, driven from outside via brushRef so the
        // interaction owns the timing and the bear only has to play it.
        const brush = brushRef?.current ?? 0
        if (brushArmRef.current) {
            brushArmRef.current.visible = brush > 0.001 && brush < 0.999
            brushArmRef.current.position.x = (brush - 0.5) * 0.42
            brushArmRef.current.rotation.z = Math.sin(brush * Math.PI * 6) * 0.25
        }
        for (let i = 0; i < toothRefs.current.length; i++) {
            const tooth = toothRefs.current[i]
            if (!tooth) continue
            // A tooth pops when the brush is level with it, then settles a
            // little cleaner than it started.
            const at = i / (TOOTH_COUNT - 1)
            const hit = Math.max(0, 1 - Math.abs(brush - at) * 9)
            tooth.scale.setScalar(1 + hit * 0.22)
        }

        // Only used to keep the girl reference live for the sparkle emitter.
        if (headRef.current) headRef.current.getWorldPosition(worldPosition)
        void girl
    })

    return (
        <group {...props}>
            {/* seated body, mostly hidden behind the head at close range */}
            <mesh geometry={geometry.body} material={furMaterial} position={[0, 0.34, -0.3]} scale={[1, 0.85, 0.9]} />
            <mesh geometry={geometry.body} material={bellyMaterial} position={[0, 0.3, -0.06]} scale={[0.62, 0.55, 0.5]} />

            {/* paws resting in front, exactly as reference 2 crops them */}
            {[-1, 1].map((sideSign) => (
                <group key={sideSign}>
                    <mesh
                        geometry={geometry.paw}
                        material={furMaterial}
                        position={[sideSign * 0.46, 0.12, 0.3]}
                        scale={[1, 0.7, 1.25]}
                    />
                    {[0, 1, 2].map((stripe) => (
                        <mesh
                            key={stripe}
                            material={markMaterial}
                            position={[sideSign * 0.46 + (stripe - 1) * 0.05, 0.21, 0.34]}
                        >
                            <boxGeometry args={[0.012, 0.005, 0.1]} />
                        </mesh>
                    ))}
                </group>
            ))}

            <group ref={headRef} position={[0, 0.62, 0]}>
                <mesh geometry={geometry.head} material={furMaterial} scale={[1.12, 1, 0.92]} />

                {[-1, 1].map((sideSign) => (
                    <group key={sideSign} position={[sideSign * 0.42, 0.36, -0.04]}>
                        <mesh geometry={geometry.ear} material={furMaterial} scale={[1, 1.05, 0.55]} />
                        <mesh geometry={geometry.ear} material={innerEarMaterial} scale={[0.62, 0.66, 0.5]} position={[0, 0, 0.04]} />
                    </group>
                ))}

                {/* eyes: white, iris, pupil, star glint — four shells, because
                    a single dark sphere is the difference between "plush" and
                    "taxidermy", and the glint is what makes it look kind */}
                {[-1, 1].map((sideSign) => (
                    <group key={sideSign} position={[sideSign * 0.24, 0.12, 0.42]}>
                        <mesh material={eyeWhiteMaterial} scale={[1, 1, 0.5]}>
                            <sphereGeometry args={[0.115, 16, 14]} />
                        </mesh>
                        <mesh material={irisMaterial} position={[0, 0, 0.05]} scale={[1, 1, 0.4]}>
                            <sphereGeometry args={[0.085, 16, 14]} />
                        </mesh>
                        <mesh material={pupilMaterial} position={[0, 0, 0.075]} scale={[1, 1, 0.4]}>
                            <sphereGeometry args={[0.042, 12, 10]} />
                        </mesh>
                        <mesh material={glintMaterial} position={[sideSign * 0.03, 0.045, 0.09]} rotation={[0, 0, 0.6]}>
                            <octahedronGeometry args={[0.032, 0]} />
                        </mesh>
                    </group>
                ))}

                {/* three brow marks */}
                {[-1, 0, 1].map((offset) => (
                    <mesh key={offset} material={markMaterial} position={[offset * 0.075, 0.33, 0.38]} rotation={[0.3, 0, 0]}>
                        <boxGeometry args={[0.022, 0.008, 0.09]} />
                    </mesh>
                ))}

                <mesh material={noseMaterial} position={[0, 0.01, 0.48]} rotation={[0, 0, Math.PI]}>
                    <coneGeometry args={[0.05, 0.06, 3]} />
                </mesh>

                {/* whiskers */}
                {[-1, 1].map((sideSign) =>
                    [0.06, 0, -0.06].map((lift) => (
                        <mesh
                            key={`${sideSign}-${lift}`}
                            material={whiskerMaterial}
                            position={[sideSign * 0.42, lift + 0.02, 0.3]}
                            rotation={[0, sideSign * -0.5, sideSign * (lift * 3)]}
                        >
                            <boxGeometry args={[0.34, 0.005, 0.005]} />
                        </mesh>
                    ))
                )}
            </group>

            {/* --- the mouth: a room, not a hole --- */}
            <group position={[0, MOUTH_CENTRE_Y, 0.18]}>
                {/* throat: a back-faced sphere, so from outside you see into a
                    lit cavity and from inside you are surrounded by it */}
                <mesh material={throatMaterial} position={[0, 0.02, -0.22]} scale={[1.15, 0.95, 1.4]}>
                    <sphereGeometry args={[MOUTH_RADIUS, 20, 16]} />
                </mesh>

                {/* tongue: the floor she stands on, domed so it drains to the
                    edges and she never gets stuck in a flat dish */}
                <mesh
                    material={tongueMaterial}
                    position={[0, TONGUE_TOP - TONGUE_RADIUS * TONGUE_SQUASH, -0.1]}
                    scale={[1.1, TONGUE_SQUASH, 1.4]}
                >
                    <sphereGeometry args={[TONGUE_RADIUS, 20, 12]} />
                </mesh>

                {Array.from({ length: TOOTH_COUNT }, (_, index) => {
                    const at = index / (TOOTH_COUNT - 1)
                    const angle = (at - 0.5) * 2.1
                    const x = Math.sin(angle) * MOUTH_RADIUS * 1.02
                    const z = Math.cos(angle) * MOUTH_RADIUS * 0.55
                    return (
                        <group key={index}>
                            {/* upper: hanging down */}
                            <group
                                position={[x, MOUTH_RADIUS * 0.72, z]}
                                rotation={[Math.PI, 0, 0]}
                            >
                                <mesh geometry={geometry.tooth} material={toothMaterial} />
                            </group>
                            {/* Lower: standing up out of the tongue, a touch
                                shorter. These are the ones that hold the refs
                                and the ones the brush sweeps, because they are
                                the row at HER height — the upper row is ten
                                units above her head and a sparkle up there
                                would happen off-screen. */}
                            <group
                                ref={(node) => {
                                    toothRefs.current[index] = node
                                }}
                                position={[x, TONGUE_TOP, z]}
                                scale={0.82}
                            >
                                <mesh geometry={geometry.tooth} material={toothMaterial} />
                            </group>
                        </group>
                    )
                })}

                {/* the two long fangs at the corners */}
                {[-1, 1].map((sideSign) => (
                    <group
                        key={sideSign}
                        position={[sideSign * MOUTH_RADIUS * 1.02, MOUTH_RADIUS * 0.66, 0.02]}
                        rotation={[Math.PI, 0, sideSign * 0.12]}
                    >
                        <mesh geometry={geometry.fang} material={toothMaterial} />
                    </group>
                ))}

                {/* the brush she pushes along the lower row */}
                <group ref={brushArmRef} position={[0, TONGUE_TOP + 0.085, 0.14]} visible={false}>
                    <mesh material={tongueMaterial}>
                        <boxGeometry args={[0.02, 0.02, 0.34]} />
                    </mesh>
                    <mesh material={toothMaterial} position={[0, 0.028, -0.12]}>
                        <boxGeometry args={[0.035, 0.04, 0.1]} />
                    </mesh>
                </group>
            </group>

            {/* Whatever lives in the mouth — creatures, sparkle — placed by the
                caller at the exported floor so it inherits the bear's scale. */}
            <group position={BEAR_MOUTH_LOCAL}>{children}</group>
        </group>
    )
}
