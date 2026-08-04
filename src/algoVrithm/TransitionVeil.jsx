import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { totalVeil, VEIL_PEAK } from './transitions.js'

// The thing that makes a scene change bearable in a headset — and, since
// 2026-07-31, the thing that makes it FELT. Her direction: "not faded, i need
// glitch nois transition". So the veil no longer dips the world toward a flat
// colour; it tears it. Horizontal strips of signal noise cut across the view,
// sparse at the edges of a handover, a full wall of static at the crossing
// point, then gone. The scenes still cross-fade underneath — the strips are
// the cover that hides the double exposure, exactly the job the flat dip used
// to do — but what the visitor SEES is the feed breaking up, which is the
// piece's own vocabulary: the medium failing is how the medium changes scene.
//
// WHY A SPHERE AND NOT A FULL-SCREEN QUAD, AND NOT A DOM OVERLAY.
//
//   A DOM overlay does not exist in VR at all. The headset renders the WebGL
//   scene and nothing else, so a CSS effect is invisible exactly where it is
//   needed most. This has to be geometry.
//
//   A quad parented to the camera has to be positioned against a projection
//   matrix that, in XR, is per-eye, asymmetric, and not the one R3F's camera
//   reports. A small sphere with its faces flipped inward has no such problem:
//   the camera is inside it, so it covers the field of view completely
//   whatever the projection does, in both eyes, for free.
//
// It is parented to the camera rather than positioned at it, so it inherits
// head motion exactly — the strips are locked to the VIEW, not the world,
// which is what says "the display is failing" rather than "the room is
// striped". A veil that lags the head by even a frame swims, and swimming
// geometry at arm's length is its own kind of unpleasant.
//
// PHOTOSENSITIVITY IS A HARD CONSTRAINT HERE, not a style note. The strips
// re-roll on a tick, and a full-field flicker in the 15-25Hz band is the
// classic photosensitive trigger. The tick is held below that band, the noise
// is spatially broken (strips with independent luminance, never the whole
// field stepping together), and the luminance swings around the room's own
// colour rather than slamming black-to-white. Test-guarded via GLITCH_TICK_HZ.

// Comfortably outside the near plane (0.05) and far inside anything in the
// scene. Small enough that its own geometry costs nothing.
const RADIUS = 0.25

// Drawn after everything else and with no depth testing, so it covers the
// scene rather than being sorted into it.
const RENDER_ORDER = 999

/**
 * Put the veil on the camera, and the camera somewhere it will actually be
 * drawn.
 *
 * Parenting to the camera is the whole design (see the note above): the strips
 * have to be locked to the VIEW. What that quietly depends on is the camera
 * being reachable from the scene root, because the renderer draws by walking
 * the SCENE — `renderer.render(scene, camera)` projects `scene`'s descendants
 * and the camera is merely the point of view. A camera with no parent is not in
 * that walk, so anything hanging off it is skipped.
 *
 * In XR that is already handled: the session's camera lives inside the rig
 * XROrigin mounts, which is in the scene, so the veil drew in the headset from
 * the day it was written. On the flat page R3F's default camera is a standalone
 * object with `parent === null`, so the veil attached itself to the camera on
 * frame one and was never rendered again — the glitch transitions were missing
 * on the desktop and present in the headset, with nothing logged either way.
 *
 * `if (!camera.parent)` is the whole fix, and it is deliberately conditional:
 * an unconditional `scene.add(camera)` would REPARENT the XR camera out of its
 * rig and break head tracking, which is a far worse bug than the one being
 * fixed. Only a camera that belongs to nothing gets adopted.
 *
 * This is the same class as the PositionalAudio bug in the reel globe — an
 * Object3D that is only constructed and never made reachable is inert, and
 * nothing throws or warns.
 */
export const attachVeil = (mesh, camera, scene) => {
    if (mesh.parent !== camera) camera.add(mesh)
    if (!camera.parent && scene) scene.add(camera)
}

// How often the noise re-rolls, in Hz. BELOW the 15-25Hz photosensitive band
// on purpose — raise this past 14 and you are building a seizure trigger into
// an installation. Exported for the test that pins it there.
export const GLITCH_TICK_HZ = 11

const VERTEX = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// The glitch. Everything is derived from three numbers — the strip row, a
// segment along it, and the current tick — hashed into pseudo-random values.
// No texture, no time-continuous noise: signal damage is quantised, and the
// quantisation IS the look.
const FRAGMENT = `
uniform float uAmount;
uniform float uPeak;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    float tick = floor(uTime * ${GLITCH_TICK_HZ.toFixed(1)});

    // Coverage: how much of the view the strips claim. Normalised against the
    // veil's peak so the crossing point reaches a full wall of noise — the
    // moment the scenes actually swap has to be hidden completely, same as
    // the flat dip used to.
    float coverage = clamp(uAmount / uPeak, 0.0, 1.0);
    coverage = coverage * coverage * (3.0 - 2.0 * coverage);

    // Strip rows. The row count itself re-rolls each tick, so the tearing
    // never settles into a stable grid — between 30 coarse bands and 90 fine
    // ones.
    float rows = mix(30.0, 90.0, hash(vec2(tick, 3.7)));
    float strip = floor(vUv.y * rows);
    float stripRoll = hash(vec2(strip, tick));

    // A strip is torn or it is not. step, not smoothstep: a glitch has hard
    // edges, and softening them turns the tear back into a fade.
    float torn = step(stripRoll, coverage);

    // Broken along their length into segments, each deciding independently —
    // so mid-transition the tears are ragged patches, not full-width bars.
    // The segment grid slides by the strip's own roll, which kills any
    // vertical alignment between rows.
    float segments = mix(4.0, 24.0, hash(vec2(strip, tick + 17.0)));
    float segment = floor((vUv.x + stripRoll) * segments);
    torn *= step(hash(vec2(segment + strip * 57.0, tick)), 0.35 + coverage * 0.65);

    if (torn <= 0.0) discard;

    // Strip luminance swings AROUND the room's own colour — dark static in a
    // white room, bright static in a dark one, never a hard black-to-white
    // slam. This is both the comfort rule and what keeps the glitch feeling
    // like the current world failing rather than a foreign overlay.
    float shade = hash(vec2(strip * 7.0 + segment, tick + 9.0));
    vec3 dark = uColor * 0.2;
    vec3 light = vec3(1.0) - (vec3(1.0) - uColor) * 0.2;
    vec3 noise = mix(dark, light, shade);

    // A thin minority of segments go full signal-white regardless — the hot
    // pixels that make it read as damage rather than texture.
    noise = mix(noise, vec3(1.0), step(0.96, shade) * 0.8);

    gl_FragColor = vec4(noise, 1.0);
}
`

export default function TransitionVeil({ sequences, playheadSec, durationSec }) {
    const camera = useThree((state) => state.camera)
    const scene = useThree((state) => state.scene)
    const meshRef = useRef(null)

    const geometry = useMemo(() => {
        const sphere = new THREE.SphereGeometry(RADIUS, 16, 12)
        // Flipped inward — the camera sits inside, so we need the back faces.
        sphere.scale(-1, 1, 1)
        return sphere
    }, [])

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
            uAmount: { value: 0 },
            uPeak: { value: VEIL_PEAK },
            uTime: { value: 0 },
            uColor: { value: new THREE.Color('#000000') }
        },
        // Not blended: a torn fragment is fully the noise and an untorn one is
        // discarded, so the world shows through the gaps unaltered. The
        // "opacity" of this veil is coverage, not alpha.
        transparent: false,
        depthTest: false,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: false
    }), [])

    useFrame((state) => {
        const mesh = meshRef.current
        if (!mesh) return

        // Parent to the camera on the first frame we have both. Doing it here
        // rather than declaratively keeps it correct across an XR session
        // starting, which swaps the camera out from under the scene.
        attachVeil(mesh, camera, scene)

        const amount = totalVeil(sequences, playheadSec, durationSec)

        // Skipped entirely when clear. This runs every frame of a piece that is
        // mostly not transitioning.
        mesh.visible = amount > 0.001
        if (!mesh.visible) return

        material.uniforms.uAmount.value = amount
        material.uniforms.uTime.value = state.clock.elapsedTime

        // The room's own colour, read live from the backdrop rather than
        // declared. Backdrop.jsx is already blending it across the handover, so
        // the noise is automatically centred on the right world at the moment
        // it matters.
        const background = scene.background
        if (background?.isColor) material.uniforms.uColor.value.copy(background)
    })

    return (
        <mesh
            ref={meshRef}
            geometry={geometry}
            material={material}
            renderOrder={RENDER_ORDER}
            frustumCulled={false}
        />
    )
}
