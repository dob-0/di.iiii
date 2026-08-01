import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fadeEnvelope } from '../ritualClock.js'
import { TUNNEL_WHITE } from '../palette.js'
import { createRandom } from '../random.js'
import { STROBE_HZ, STROBE_SHARPNESS } from './WhiteTunnel.jsx'

// Sequence 01b — the halo. The first breath.
//
// The tunnel's grammar, freed from the tunnel: white light standing in black
// air, pulsing on the piece's one heartbeat. The corridor has just been
// crushed flat against the eye — and its pulse survives it. Every swell of
// the strobe emits one ring that ripples outward across the floor or the air
// overhead, expanding away from the visitor and dissolving into the dark.
// The tunnel is gone; its rhythm keeps rippling through the space where it
// stood.
//
// WHY THE RINGS ARE NOT AT EYE HEIGHT, and this was built wrong once: a
// circle whose centre is the visitor's own head lies in a plane THROUGH the
// eye, and a plane through the eye is seen edge-on from every direction,
// forever — the "expanding ring" renders as a fat white band lying across
// the middle of the view and nothing else, at every tilt (tilting the plane
// about the eye still leaves it a plane through the eye). For a ring to read
// as a ring its plane has to sit clear of the eye line. So the ripples run
// on two horizontal sheets the visitor stands between — one at the floor,
// one overhead — and looking down or up shows true expanding circles while
// level gaze gets two thin horizons, which is an enclosure, not a blindfold.
//
// Same rules as the tunnel otherwise: the camera never moves, the world is
// black, the light is TUNNEL_WHITE.ring — the piece's one true white, reused
// rather than re-declared so "one white" stays a fact and not a claim.

// One ring per pulse, alternating floor / overhead — the pulse bounces
// between the two sheets. Life long enough that three or four are always
// alive, short enough that the oldest has fully dissolved before its slot
// comes round again.
const RING_SLOTS = 8
const PULSE_PERIOD = 1 / STROBE_HZ
const RING_LIFE = 3.6

// Born small enough to be an event directly below (or above) the visitor,
// dead well inside the fog. The far end does not rely on fog alone — each
// ring also dies in its own colour (see the life envelope below), because a
// birth or death the fog does not fully cover is a pop.
const RING_BORN = 1.2
const RING_DEAD = 20

// The wavefront decelerates: fast out of the birth, relaxing as it
// dissolves. A constant-speed ring reads as an object flying away; an easing
// one reads as a wave losing energy, which is what it is.
const RING_EASE = 0.72

// The two sheets. The floor ripples sit just off the ground (ON it they
// z-fight with nothing but read as painted); the canopy sits at twice eye
// height with jitter, far enough that a newborn 1.2m ring overhead is a
// shape, not a hat. The visitor's eye at 1.6 is between the sheets, clear of
// both planes — which is the whole point (see the note above).
const FLOOR_BASE = 0.06
const FLOOR_JITTER = 0.22
const CANOPY_BASE = 3.3
const CANOPY_JITTER = 0.35
const SHEET_SEED = 20260801

// Thin at birth, thickening as it expands (the tube scales with the ring).
// 0.02 at unit radius keeps a newborn ring near the tunnel rings' 0.06 and
// a dying ring at ~0.4m — a band of light relaxing, not a hairline at 20m
// that aliases into shimmer.
const TUBE_RADIUS = 0.02

// Parked rings keep a non-zero scale — a zero scale is a non-invertible
// matrix, which three warns about once per frame (the tunnel's CRUSH_FLOOR
// lesson).
const PARK_SCALE = 0.001

export default function Halo({ progress }) {
    const ringsRef = useRef(null)
    const dummy = useMemo(() => new THREE.Object3D(), [])
    const color = useMemo(() => new THREE.Color(), [])
    const white = useMemo(() => new THREE.Color(TUNNEL_WHITE.ring), [])

    // Seeded sheet heights — the same halo on every load and at every scrub.
    // Even slots ripple the floor, odd slots the canopy, so consecutive
    // pulses alternate and neither sheet ever fires twice in a row.
    const sheets = useMemo(() => {
        const random = createRandom(SHEET_SEED)
        return Array.from({ length: RING_SLOTS }, (unused, index) => (
            index % 2 === 0
                ? FLOOR_BASE + random() * FLOOR_JITTER
                : CANOPY_BASE + random() * CANOPY_JITTER
        ))
    }, [])

    const envelope = fadeEnvelope(progress, 0.16, 0.3)

    useFrame(({ clock }) => {
        const mesh = ringsRef.current
        if (!mesh) return
        const time = clock.getElapsedTime()

        // The same swell as the tunnel, on the same clock. This is the whole
        // argument of the beat: one heartbeat, different body.
        const wave = Math.sin(time * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5
        const flash = Math.pow(wave, STROBE_SHARPNESS)

        for (let index = 0; index < RING_SLOTS; index++) {
            // Slot i owns the births at t = (i + k * SLOTS) * PERIOD. Age is
            // measured from the most recent of those, so every pulse hands a
            // fresh ring to the next free slot — deterministic in time, which
            // is what keeps the field identical under scrubbing.
            const cycles = Math.floor((time / PULSE_PERIOD - index) / RING_SLOTS)
            const birth = (index + cycles * RING_SLOTS) * PULSE_PERIOD
            const age = time - birth
            const life = age / RING_LIFE

            if (life < 0 || life >= 1) {
                dummy.position.set(0, sheets[index], 0)
                dummy.rotation.set(Math.PI / 2, 0, 0)
                dummy.scale.setScalar(PARK_SCALE)
                dummy.updateMatrix()
                mesh.setMatrixAt(index, dummy.matrix)
                mesh.setColorAt(index, color.setScalar(0))
                continue
            }

            const eased = Math.pow(life, RING_EASE)
            const radius = RING_BORN + (RING_DEAD - RING_BORN) * eased

            // Flat in its sheet — the same rotation that lays the tunnel's
            // torus geometry into a plane, laid horizontal here.
            dummy.position.set(0, sheets[index], 0)
            dummy.rotation.set(Math.PI / 2, 0, 0)
            dummy.scale.setScalar(radius)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)

            // Bright at the pulse that made it, dissolving over its life —
            // both ends of a ring's existence are covered in its own colour,
            // so neither the birth below the feet nor the death at 20m is a
            // pop. The global swell rides on top so the whole field breathes
            // together.
            const dissolve = Math.pow(1 - life, 1.5)
            const breathe = 0.55 + 0.45 * flash
            mesh.setColorAt(index, color.copy(white).multiplyScalar(envelope * dissolve * breathe))
        }
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })

    if (progress === null) return null

    return (
        <group>
            {/* One instanced mesh, eight rings. Additive with depthWrite off:
                light in black air sums where rings cross instead of a dim ring
                occluding a bright one behind it — the same reasoning as the
                tunnel's throat sprites. Fog stays ON: distance dissolving the
                far arc of a ring into the dark IS the depth cue. */}
            <instancedMesh ref={ringsRef} args={[undefined, undefined, RING_SLOTS]}>
                <torusGeometry args={[1, TUBE_RADIUS, 8, 96]} />
                <meshBasicMaterial
                    color={TUNNEL_WHITE.ring}
                    transparent
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </instancedMesh>
        </group>
    )
}
