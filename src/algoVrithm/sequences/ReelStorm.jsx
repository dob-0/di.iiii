import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { reelPlayers, playReels } from '../reelPlayers.js'

// Sequence — the reel storm.
//
// The footage beat, on direction: "i have reels now, want them in the world,
// chaotic, too many of them". This is the scene the arc has been waiting on
// since 2026-07-26, when the piece's 04 and 05 were parked because there was
// nothing to put in them that was not somebody else's video.
//
// It is the hyperreality argument's last move and the only one made out of real
// footage: every other sequence is the medium — light, noise, measurement,
// pattern — and this is what the medium is actually FULL of. Hundreds of them,
// at every distance, tilted, overlapping, most of them unreadable, none of them
// looked at for more than a second. The composition is the excess.
//
// ---- WHY THERE ARE NOT ACTUALLY HUNDREDS OF VIDEOS -------------------------
//
// A browser will not decode a hundred videos. Each <video> is a real decoder —
// on a standalone headset the practical budget is single digits before the frame
// rate collapses, and the failure is not graceful: audio-less stutter, dropped
// frames, and in a headset dropped frames are nausea rather than an aesthetic
// problem.
//
// So the scene runs a POOL of players and shares each one across many panels.
// Nine decoders, a hundred and fifty-odd panels. The same reel therefore appears
// in the room a dozen times at once.
//
// That repetition is not a compromise being tolerated — it is the truest thing
// in the sequence. A feed IS the same clip arriving again from twelve accounts.
// Trying to hide it would be both more expensive and less honest.
//
// One InstancedMesh per player, so the whole storm is nine draw calls no matter
// how many panels are in it.

// The decoders live in reelPlayers.js — shared with the reel globe, built once
// for the life of the page and paused between beats. See that file for why nine.

// Panels per player. The storm's density is this times PLAYER_COUNT.
const PANELS_PER_PLAYER = 17

// The shell they hang in. Nothing inside SAFE_RADIUS: a screen inside arm's
// reach in VR is a flinch, and one that crosses the face ends the piece for
// whoever it happens to.
const SAFE_RADIUS = 3.1
const INNER_RADIUS = 3.6
const OUTER_RADIUS = 17

// Panel height in metres, before the giants. A reel at 1.2m seen from 6m is
// about the angular size of a phone held at arm's length — which is the size
// this footage was made to be seen at, and worth keeping as the baseline the
// exceptions depart from.
const HEIGHT_MIN = 0.75
const HEIGHT_MAX = 2.4

// The giants. A few panels far larger than the rest, near enough to dominate.
// Without them the storm is an even texture and the eye has nothing to be
// caught by — with them there is always something too big in the corner of your
// vision, which is what the excess is supposed to feel like.
const GIANT_CHANCE = 0.07
const GIANT_HEIGHT_MIN = 3.4
const GIANT_HEIGHT_MAX = 6.5

// The tilt. Feeds are upright; this is what says the room is not one. Radians.
// Kept off any multiple of a right angle — panels at exactly 90 degrees read as
// a deliberate arrangement, and the note was "chaotic".
const ROLL_MAX = 0.55

// Drift and turn, per panel, on its own axis and its own clock. Same rule as the
// data field and for the same reason: motion everywhere, no net flow anywhere,
// so nothing in the field can be read as self-motion.
const DRIFT_SPAN = 1.5
const DRIFT_HZ_MIN = 0.05
const DRIFT_HZ_MAX = 0.22
const TURN_HZ_MIN = 0.03
const TURN_HZ_MAX = 0.14

// The churn. Panels cut in and out on their own clocks, so the count never
// settles and the room reads as more than it is — you cannot count what keeps
// changing. Slow enough to be a feed refreshing rather than a strobe.
const CHURN_HZ_MIN = 0.18
const CHURN_HZ_MAX = 0.7
const CHURN_DUTY = 0.78

const STORM_SEED = 20260730

const hashStep = (index, step) => {
    let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 0x27d4eb2f, 0xc2b2ae35)
    h = Math.imul(h ^ (h >>> 15), 0x2545f491)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

/** Panels for one player. Seeded per player so the storm is reproducible. */
const createPanels = (playerIndex) => {
    const random = createRandom(STORM_SEED + playerIndex * 7919)

    return Array.from({ length: PANELS_PER_PLAYER }, (_, index) => {
        const direction = new THREE.Vector3(
            random() * 2 - 1,
            random() * 2 - 1,
            random() * 2 - 1
        )
        if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1)
        direction.normalize()

        // Cube root, so density is even through the volume rather than crowding
        // the inner shell — the same correction the data field and the glyph
        // plates both needed.
        const radius = Math.max(
            SAFE_RADIUS,
            INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * Math.cbrt(random())
        )

        const giant = random() < GIANT_CHANCE
        const height = giant
            ? GIANT_HEIGHT_MIN + random() * (GIANT_HEIGHT_MAX - GIANT_HEIGHT_MIN)
            : HEIGHT_MIN + random() * (HEIGHT_MAX - HEIGHT_MIN)

        return {
            position: direction.multiplyScalar(radius),
            radius,
            height,
            roll: (random() * 2 - 1) * ROLL_MAX,
            rollHz: TURN_HZ_MIN + random() * (TURN_HZ_MAX - TURN_HZ_MIN),
            rollPhase: random() * Math.PI * 2,
            driftAxis: Math.floor(random() * 3),
            driftHz: DRIFT_HZ_MIN + random() * (DRIFT_HZ_MAX - DRIFT_HZ_MIN),
            driftPhase: random() * Math.PI * 2,
            churnHz: CHURN_HZ_MIN + random() * (CHURN_HZ_MAX - CHURN_HZ_MIN),
            churnOffset: random() * 100,
            // Staggered arrival, so the storm accumulates rather than being
            // switched on.
            birth: random() * 0.55
        }
    })
}

export default function ReelStorm({ progress }) {
    const groupRef = useRef(null)
    const meshRefs = useRef([])

    const pool = useMemo(() => reelPlayers(), [])
    const panelSets = useMemo(
        () => pool.map((_, index) => createPanels(index)),
        [pool]
    )

    const scratch = useMemo(() => ({
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3(),
        up: new THREE.Vector3(0, 1, 0),
        target: new THREE.Vector3(),
        object: new THREE.Object3D()
    }), [])

    // Play while the sequence is on screen, pause when it is not — the elements
    // themselves survive between beats. See reelPlayers.js.
    useEffect(() => playReels(pool), [pool])

    useFrame(({ clock }) => {
        const local = progress
        if (local === null) return

        const time = clock.getElapsedTime()

        const emergence = smoothstep(0.04, 0.34, local)
        const envelope = smoothstep(0.02, 0.16, local) * smoothstep(1, 0.88, local)

        for (let playerIndex = 0; playerIndex < pool.length; playerIndex++) {
            const mesh = meshRefs.current[playerIndex]
            if (!mesh) continue

            const player = pool[playerIndex]
            const panels = panelSets[playerIndex]

            mesh.material.opacity = envelope

            for (let index = 0; index < panels.length; index++) {
                const panel = panels[index]

                // Drift along one axis, as a slow oscillation rather than a
                // loop — a panel that travels and wraps has to disappear
                // somewhere, and there is no edge here to hide that at.
                scratch.position.copy(panel.position)
                scratch.position.setComponent(
                    panel.driftAxis,
                    scratch.position.getComponent(panel.driftAxis)
                        + Math.sin(time * panel.driftHz * Math.PI * 2 + panel.driftPhase) * DRIFT_SPAN
                )

                // Face the standpoint. Recomputed per frame because the panel
                // has drifted — a panel oriented once at build time and then
                // moved ends up showing the room its edge.
                scratch.object.position.copy(scratch.position)
                scratch.object.up.copy(scratch.up)
                scratch.object.lookAt(0, 0, 0)
                // The tilt, wandering slowly around its own resting angle. This
                // is the chaos: applied after lookAt, as a roll about the panel's
                // own view axis, so it stays square to the viewer while refusing
                // to be upright.
                scratch.object.rotateZ(
                    panel.roll + Math.sin(time * panel.rollHz * Math.PI * 2 + panel.rollPhase) * 0.18
                )
                scratch.quaternion.copy(scratch.object.quaternion)

                // The churn — on or off, hard, on this panel's own clock.
                const churn = hashStep(
                    index + playerIndex * 313,
                    Math.floor(time * panel.churnHz + panel.churnOffset)
                ) < CHURN_DUTY

                const arrival = smoothstep(panel.birth, panel.birth + 0.3, emergence)
                const height = churn ? panel.height * arrival : 0

                // Aspect comes from the video itself, so portrait stays portrait
                // and a stray landscape clip is not squeezed into a phone frame.
                scratch.scale.set(height * player.aspect, height, 1)

                scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale)
                mesh.setMatrixAt(index, scratch.matrix)
            }

            mesh.instanceMatrix.needsUpdate = true
        }
    })

    if (progress === null) return null

    if (pool.length === 0) {
        // No video in src/algoVrithm/assets/. Renders nothing rather than
        // throwing — a missing-media crash at an exhibition is worse than a
        // quiet beat, and the director panel's bin already shows the folder is
        // empty.
        return null
    }

    return (
        <group ref={groupRef} position={[0, 1.6, 0]}>
            {pool.map((player, playerIndex) => (
                <instancedMesh
                    key={player.asset.id}
                    ref={(mesh) => { meshRefs.current[playerIndex] = mesh }}
                    args={[undefined, undefined, PANELS_PER_PLAYER]}
                    // The panels are spread through the whole shell, but an
                    // InstancedMesh takes its bounding sphere from the geometry —
                    // a 1m plane at the origin — so the entire storm would be
                    // culled the moment the middle of the room left the frustum.
                    frustumCulled={false}
                >
                    <planeGeometry args={[1, 1]} />
                    {/* Unlit and untone-mapped: these are screens, not surfaces
                        being lit, and the footage should arrive at exactly the
                        values it was shot at.

                        DoubleSide because a panel drifts and the visitor turns —
                        a single-sided quad caught edge-on from behind is simply
                        gone, and in a storm that reads as flickering.

                        Fogged, unlike the emissive sequences: the far panels
                        have to sink into the room's own darkness or the shell
                        has a visible outer edge. */}
                    <meshBasicMaterial
                        map={player.texture}
                        transparent
                        opacity={0}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </instancedMesh>
            ))}
        </group>
    )
}
