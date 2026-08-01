import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { worldWeights } from './worldLights.js'
import { SEQUENCES } from './sequences/index.js'

// The room itself. Each sequence declares a backdrop colour and fog range in
// the edit list; this blends between whichever sequences are currently active,
// weighted by how faded-in each one is.
//
// Why this exists: the tunnel is near-white and the field is near-black. A
// declarative <color attach="background"> would swap the instant the playhead
// crossed the boundary — a white-to-black hard cut, which in a headset is
// genuinely unpleasant. Blending makes the world dim as one scene hands over
// to the next.

// The weighting itself (BLEND_FADE, the active-row shares and both fallbacks)
// lives in worldLights.js. It is shared with the room's ambient level, which
// has to cross over on exactly the same curve as the colour and fog do — two
// copies of it would drift the first time anyone tuned one.

// Time constant of the approach, in seconds. Even with blended targets, a fast
// scrub can jump the playhead; easing the applied colour keeps the room from
// strobing. This is the last thing between the edit list and the eye: at 0.47s
// the room takes roughly half a second to arrive anywhere and you cannot catch
// it moving.
//
// A TIME constant, not a per-frame factor. This was `0.035` applied per frame,
// which converges 1.5x faster in a 90Hz headset than on the 60Hz monitor it was
// tuned on, and slower again on a stuttering phone — the one room-crossing
// speed in the piece, different on every device. 0.47s is what 0.035/frame
// worked out to at 60fps, so the monitor look is unchanged and the headset now
// matches it.
const APPROACH_TAU = 0.47

// Longest delta the easing will honour, mirroring MAX_STEP_SEC in the clock: a
// backgrounded tab returning with a multi-second delta would otherwise snap the
// room to its target in one frame.
const MAX_EASE_DELTA = 0.1

// Exported for tests — the end-of-piece fallback is easy to regress and
// invisible until someone scrubs to the very end.
export const resolveBackdrop = (playheadSec, sequences = SEQUENCES) => {
    const weights = worldWeights(playheadSec, sequences)
    if (!weights.length) return null

    let r = 0
    let g = 0
    let b = 0
    let fogNear = 0
    let fogFar = 0
    const scratch = new THREE.Color()

    for (const { sequence, share } of weights) {
        const backdrop = sequence.backdrop
        if (!backdrop) continue
        scratch.set(backdrop.color)
        r += scratch.r * share
        g += scratch.g * share
        b += scratch.b * share
        fogNear += backdrop.fogNear * share
        fogFar += backdrop.fogFar * share
    }

    return { r, g, b, fogNear, fogFar }
}

// The blend is summed in the working (linear) space, which is the space
// THREE.Color's three-number form reads — so this is the same colour the
// components were sampled from, not an sRGB reinterpretation of it.
const targetColor = (target) => new THREE.Color(target.r, target.g, target.b)

// `fogScale` pushes the far plane out without touching the edit list. The
// outside authoring view uses it: every sequence's fog is tuned for a viewer
// standing inside it, so orbiting out to see the whole installation would
// otherwise show nothing but flat fog colour. The piece itself always renders
// at scale 1.
export default function Backdrop({ playheadSec, sequences = SEQUENCES, fogScale = 1 }) {
    const scene = useThree((state) => state.scene)

    // Created once and mutated in place. Assigning a fresh Color/Fog every
    // frame would churn objects at 90fps for no reason.
    const { background, fog } = useMemo(() => ({
        background: new THREE.Color('#eef1f5'),
        fog: new THREE.Fog('#eef1f5', 3, 34)
    }), [])

    // Attach before the first render, not on the first animation frame. Until
    // something assigns scene.background the renderer clears to dark — so the
    // opening frame of a piece that starts white would flash black.
    useLayoutEffect(() => {
        const opening = resolveBackdrop(0, sequences)
        if (opening) {
            background.copy(targetColor(opening))
            fog.color.copy(background)
            fog.near = opening.fogNear
            fog.far = opening.fogFar
        }
        scene.background = background
        scene.fog = fog
        // `sequences` deliberately omitted: this only sets the opening frame,
        // and re-running it mid-scrub would snap the room back to the top of
        // the piece every time the author drags a clip.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene, background, fog])

    useFrame((state, delta) => {
        const target = resolveBackdrop(playheadSec, sequences)
        if (!target) return

        // Exponential decay toward the target, framed in real time so the
        // room crosses over at one speed on every display — see APPROACH_TAU.
        const eased = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_EASE_DELTA) : 0
        const approach = 1 - Math.exp(-eased / APPROACH_TAU)

        background.lerp(targetColor(target), approach)
        fog.color.copy(background)
        fog.near += ((target.fogNear ?? fog.near) - fog.near) * approach
        // Scaled, then eased like everything else, so toggling the outside view
        // opens the fog out over a beat instead of snapping.
        const farTarget = (target.fogFar ?? fog.far) * fogScale
        fog.far += (farTarget - fog.far) * approach

        scene.background = background
        scene.fog = fog
    })

    return null
}
