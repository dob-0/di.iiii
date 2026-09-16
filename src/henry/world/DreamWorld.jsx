import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Interactable from '../Interactable.jsx'
import { useGirl } from '../dreamClock.jsx'
import { PAIRS, pairById } from '../dual.js'
import Bear from './Bear.jsx'
import Deer from './Deer.jsx'
import DreamOnly from './DreamOnly.jsx'
import Flower from './Flower.jsx'
import GardenField from './GardenField.jsx'
import Ground from './Ground.jsx'
import MouthCreatures from './MouthCreatures.jsx'
import Pair from './Pair.jsx'
import RealRoom from './RealRoom.jsx'
import Rock from './Rock.jsx'
import Sparkles from './Sparkles.jsx'
import Tree from './Tree.jsx'

// The world, assembled.
//
// Everything positional lives here so that the pair table stays the only place
// that knows where anything is. The deer, the interactables and the creatures
// all derive their positions from PAIRS rather than repeating coordinates —
// move the bear in dual.js and its mouth, its trigger and its mice follow.
//
// The one-shot animations (the brush sweep, the sparkle, the glasses lifting)
// are driven from refs updated in a single useFrame here rather than from
// state in the components that play them. They are film cues, not object
// behaviour: the bear should not own the timing of the moment the bear is in.

const COMPONENTS = { flower: Flower, tree: Tree, bear: Bear, rock: Rock }

const BRUSH_SECONDS = 2.6
const SPARKLE_SECONDS = 1.8
const GLASSES_SECONDS = 1.5

// The deer, placed around the tree in its dream position. Angles are uneven
// and one of them is much closer than the rest: a ring of evenly spaced
// animals reads as a menu, and the brief asked for somewhere to sit down.
const DEER_LAYOUT = [
    { angle: 0.4, distance: 15, scale: 7, resting: true },
    { angle: 1.9, distance: 22, scale: 7.6, resting: false },
    { angle: 3.5, distance: 18, scale: 6.6, resting: true },
    { angle: 5.1, distance: 27, scale: 8.2, resting: false }
]

export default function DreamWorld() {
    const girl = useGirl()

    const brushRef = useRef(0)
    const sparkleRef = useRef(0)
    // Cues are REQUESTED from an event handler and STARTED on the next frame,
    // because the handler has no access to the render clock. Stamping them
    // with performance.now() instead would mix two time bases that share no
    // origin, and the brush would either be finished before it began or start
    // several minutes late depending on how long the tab had been open.
    const brushRequested = useRef(false)
    const glassesRequested = useRef(false)
    const brushStarted = useRef(-1)
    const glassesStarted = useRef(-1)

    const treePair = useMemo(() => pairById('tree'), [])
    const bearPair = useMemo(() => pairById('bear'), [])

    const deer = useMemo(
        () =>
            DEER_LAYOUT.map((entry, index) => {
                const [treeX, , treeZ] = treePair.dreamPosition
                const x = treeX + Math.cos(entry.angle) * entry.distance
                const z = treeZ + Math.sin(entry.angle) * entry.distance
                return {
                    key: index,
                    position: [x, 0, z],
                    // Facing the tree, which is where she will arrive from —
                    // so their heads are already almost toward her before beat
                    // 4 turns them the rest of the way.
                    rotation: [0, Math.atan2(treeX - x, treeZ - z), 0],
                    scale: entry.scale,
                    resting: entry.resting,
                    seed: index * 3 + 1
                }
            }),
        [treePair]
    )

    // Where she has to stand to be "at" each moment.
    const treeSpot = useMemo(() => treePair.dreamPosition, [treePair])
    const deerSpot = useMemo(() => deer[0].position, [deer])
    const mouthSpot = useMemo(() => {
        const [x, , z] = bearPair.dreamPosition
        // The mouth floor is at the bear's own origin, pushed forward by the
        // exported local offset and scaled up with the bear.
        return [x, 0, z + 0.08 * bearPair.dreamScale]
    }, [bearPair])

    const requestBrush = useCallback(() => {
        brushRequested.current = true
    }, [])

    const requestGlasses = useCallback(() => {
        glassesRequested.current = true
    }, [])

    useFrame((state) => {
        const time = state.clock.elapsedTime

        if (brushRequested.current && brushStarted.current < 0) brushStarted.current = time
        if (glassesRequested.current && glassesStarted.current < 0) glassesStarted.current = time

        if (brushStarted.current >= 0) {
            const since = time - brushStarted.current
            brushRef.current = THREE.MathUtils.clamp(since / BRUSH_SECONDS, 0, 1)
            // Sparkle starts as the brush finishes its first pass, not after
            // it — overlapping them by a beat is what makes it feel caused.
            const sparkleSince = since - BRUSH_SECONDS * 0.55
            sparkleRef.current = THREE.MathUtils.clamp(sparkleSince / SPARKLE_SECONDS, 0, 1)
        }

        if (glassesStarted.current >= 0) {
            const since = time - glassesStarted.current
            girl.current.glassesOff = THREE.MathUtils.clamp(since / GLASSES_SECONDS, 0, 1)
        }
    })

    return (
        <group>
            {/* Flat and frontal, exactly as the references are lit. The
                ambient does nearly all the work and the single directional is
                only there to give the toon ramp an edge to turn on — take it
                away and every form goes to one value and the silhouettes stop
                reading against each other. */}
            <ambientLight intensity={1.45} color="#FFF4F7" />
            <directionalLight position={[24, 60, 30]} intensity={0.75} color="#FFFFFF" />
            <directionalLight position={[-30, 12, -20]} intensity={0.3} color="#BFE6DC" />

            <Ground />
            <GardenField />
            <RealRoom />

            {PAIRS.map((pair) => {
                const Component = COMPONENTS[pair.kind]
                if (!Component) return null
                if (pair.id === 'bear') {
                    return (
                        <Pair key={pair.id} pair={pair}>
                            <Bear brushRef={brushRef}>
                                <DreamOnly>
                                    <MouthCreatures radius={0.2} />
                                </DreamOnly>
                                <Sparkles progressRef={sparkleRef} radius={0.34} color="#FFFFFF" />
                            </Bear>
                        </Pair>
                    )
                }
                return (
                    <Pair key={pair.id} pair={pair}>
                        <Component seed={pair.id.length} />
                    </Pair>
                )
            })}

            <DreamOnly>
                {deer.map((entry) => (
                    <group key={entry.key} position={entry.position} scale={entry.scale}>
                        {/* rotation goes on the Deer, not this group: the head
                            needs its own yaw to subtract when it turns to look
                            at her, and a rotation split across two nodes would
                            leave it tracking a point beside her. */}
                        <Deer seed={entry.seed} resting={entry.resting} rotation={entry.rotation} />
                    </group>
                ))}
            </DreamOnly>

            {/* Beat 1 -> 2: arriving is the interaction. */}
            <Interactable beat="garden" gate="reach-tree" position={treeSpot} radius={26} auto />

            {/* Beat 2 -> 3: sit with them. */}
            <Interactable beat="deer" gate="sit" position={deerSpot} radius={9} ringColor="#F7F0E4" />

            {/* Beat 3 -> 4: brush. */}
            <Interactable
                beat="bear"
                gate="brush"
                position={mouthSpot}
                radius={7}
                ringColor="#F9C2D4"
                onTrigger={requestBrush}
            />

            {/* Beat 5: take them off. Radius covers the whole walkable world —
                she has stopped wherever she happens to be, and making her walk
                somewhere first would be asking her to hit a mark. */}
            <Interactable
                beat="stop"
                gate="glasses"
                position={[0, 0, 0]}
                radius={400}
                ringColor="#F7F0E4"
                onTrigger={requestGlasses}
            />
        </group>
    )
}

