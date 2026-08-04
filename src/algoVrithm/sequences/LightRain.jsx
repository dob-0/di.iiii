import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fadeEnvelope } from '../ritualClock.js'
import { TUNNEL_WHITE } from '../palette.js'
import { createRandom } from '../random.js'
import { STROBE_HZ, STROBE_SHARPNESS } from './WhiteTunnel.jsx'

// Sequence 02b — the light rain. The second breath.
//
// The tunnel's grammar again — white light in black air, the piece's one
// pulse — placed between the scan and the test pattern, and that seat is the
// argument: the scan has just MEASURED the material, and here it precipitates.
// Hairline white streaks fall slowly all around the visitor, and the next
// thing the piece does is stand them up as architecture (the test pattern's
// bars) and walk through them. Measurement → rainfall → structure.
//
// Same rules as the other white beats: the camera never moves (the rain
// falls past a fixed standpoint), the world is black, the light is
// TUNNEL_WHITE.ring, and everything breathes at STROBE_HZ.

const STREAK_COUNT = 420

// A thin vertical bar of light, not a drop. Drops read as weather; bars read
// as the same LED grammar as the tunnel's runs, turned on end.
const STREAK_WIDTH = 0.025
const STREAK_LENGTH = 0.85

// THE LANE, this beat's version. Flow here is along -Y, so a streak's whole
// path is decided by its horizontal placement — one radius test at placement
// time and nothing ever has to be culled or faded beside somebody's head
// (TestPattern's lesson, verbatim). 2.5m is well clear of the 0.7m the
// pattern proved sufficient; rain touching the shoulders is a different and
// worse piece.
const FIELD_INNER = 2.5
const FIELD_OUTER = 10

// The treadmill, vertical. Streaks fall from above the view and retire below
// it, wrapping. UNLIKE the tunnel's wraps these cannot be pushed past fogFar
// — a wrap 30m overhead would need a 30m fog range and the room would have
// no falloff left — so both ends are covered by each streak's own height
// fade instead (see below). The fog covers distance; the fade covers birth
// and death.
const RAIN_TOP = 11
const RAIN_BOTTOM = -5
const RAIN_SPAN = RAIN_TOP - RAIN_BOTTOM

// Constant, and slower than the test pattern's walk. Vection is driven by
// coherent flow across the retina, and this beat surrounds the visitor the
// way the pattern does — coverage has to be paid for in velocity. Vertical
// flow also reads faster than it is (nothing in the room gives it scale), so
// it sits under the pattern's 0.9 rather than matching it.
const FALL_SPEED = 0.8

// Where a streak's own brightness ramps in and out, as fractions of the
// span. Wide enough that a birth is never a visible pop even on a streak the
// visitor is looking straight up at.
const EDGE_FADE = 0.14

const RAIN_SEED = 20260802

export default function LightRain({ progress }) {
    const streaksRef = useRef(null)
    const dummy = useMemo(() => new THREE.Object3D(), [])
    const color = useMemo(() => new THREE.Color(), [])
    const white = useMemo(() => new THREE.Color(TUNNEL_WHITE.ring), [])

    // Seeded scatter — the same rain on every load and at every scrub. Radius
    // by sqrt so the annulus fills evenly instead of crowding the centre.
    const streaks = useMemo(() => {
        const random = createRandom(RAIN_SEED)
        return Array.from({ length: STREAK_COUNT }, () => {
            const bearing = random() * Math.PI * 2
            const radius = Math.sqrt(
                random() * (FIELD_OUTER * FIELD_OUTER - FIELD_INNER * FIELD_INNER)
                + FIELD_INNER * FIELD_INNER
            )
            return {
                x: Math.cos(bearing) * radius,
                z: Math.sin(bearing) * radius,
                offset: random() * RAIN_SPAN,
                // Not all streaks at one value — a field of identical bars
                // reads as a texture. Static per streak, so the variation is
                // placement, not flicker.
                strength: 0.55 + random() * 0.45
            }
        })
    }, [])

    const envelope = fadeEnvelope(progress, 0.16, 0.3)

    useFrame(({ clock }) => {
        const mesh = streaksRef.current
        if (!mesh) return
        const time = clock.getElapsedTime()

        // The one heartbeat, again.
        const wave = Math.sin(time * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5
        const flash = Math.pow(wave, STROBE_SHARPNESS)
        const breathe = 0.6 + 0.4 * flash

        for (let index = 0; index < STREAK_COUNT; index++) {
            const streak = streaks[index]
            // Falling treadmill: offset drifts down, wraps at the span.
            const fallen = (streak.offset - time * FALL_SPEED) % RAIN_SPAN
            const y = RAIN_BOTTOM + ((fallen + RAIN_SPAN) % RAIN_SPAN)

            dummy.position.set(streak.x, y, streak.z)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.setScalar(1)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)

            // Birth and death in the streak's own colour — the vertical wraps
            // sit inside the fog range by necessity, so the fade is what makes
            // them invisible.
            const span = (y - RAIN_BOTTOM) / RAIN_SPAN
            const edge = Math.min(span / EDGE_FADE, (1 - span) / EDGE_FADE, 1)
            mesh.setColorAt(
                index,
                color.copy(white).multiplyScalar(envelope * streak.strength * edge * breathe)
            )
        }
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })

    if (progress === null) return null

    return (
        <group>
            {/* Additive, depthWrite off, fog on — same stack as the halo and
                for the same reasons: crossings sum instead of occluding, and
                distance dissolving a streak into the dark is the depth cue. */}
            <instancedMesh ref={streaksRef} args={[undefined, undefined, STREAK_COUNT]}>
                <boxGeometry args={[STREAK_WIDTH, STREAK_LENGTH, STREAK_WIDTH]} />
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
