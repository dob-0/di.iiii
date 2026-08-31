import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fadeEnvelope, smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { LUMINOUS_RAMP } from '../palette.js'

// Sequence 03 — assembly.
//
// The hinge of the piece. The loose data of sequence 02 stops being ambient and
// ORGANISES: the same pixels gather into a 9:16 rectangle floating in front of
// the viewer. A feed. Baudrillard's line is the brief — the map precedes the
// territory, so the copy assembles itself first and the real footage arrives
// afterwards to fill it (sequences 04 and 05).
//
// It never resolves into a solid surface. The rectangle stays visibly MADE OF
// pixels, jittering slightly forever, because the moment it looks like a clean
// screen the piece is showing a phone instead of showing the thing a phone is.
//
// WHY THE PANEL CONSTANTS ARE EXPORTED: 04 and 05 have to put the feed in
// exactly the same place, at exactly the same size. If the rectangle shifts
// across a cut the illusion that it is one continuous object dies instantly.

// 9:16 — 72 x 128 lands on the ratio exactly, and 9,216 points is a raster
// dense enough to read as an image and cheap enough for a standalone headset.
export const PANEL_COLUMNS = 72
export const PANEL_ROWS = 128

export const PANEL_HEIGHT = 1.1
export const PANEL_WIDTH = (PANEL_HEIGHT * 9) / 16

// Far enough to be comfortable in a headset (anything under ~1m fights the
// viewer's vergence and reads as eye strain), close enough that the rectangle
// still feels like an object at hand rather than a billboard across a room.
export const PANEL_DISTANCE = 1.4
export const PANEL_EYE_HEIGHT = 1.6

const COUNT = PANEL_COLUMNS * PANEL_ROWS

// Where the points come FROM. Matches PixelField's disc so the handover looks
// like the same cloud reorganising rather than one cloud swapped for another.
const SCATTER_RADIUS = 24

// Same seed family as PixelField: fixed, so what you approve is what the
// audience sees on every load.
const SCATTER_SEED = 20260726

// Fraction of the sequence spent staggering arrivals. The sweep is what makes
// this read as an image LOADING rather than a shape popping into place.
const STAGGER_SPREAD = 0.55

// Point size is in framebuffer pixels and the `300.0 / -z` falloff below is an
// arbitrary tuning constant, not physics — these two numbers are the ones to
// touch if the raster looks gappy (raise) or like porridge (lower). Scattered
// points are far away and need to be large; assembled points are 1.4m from the
// face and need to be tiny.
const SCATTER_POINT_SIZE = 2.2
const ASSEMBLED_POINT_SIZE = 0.032

const vertexShader = /* glsl */`
    uniform float uTime;
    uniform float uAssembly;
    uniform float uScatterSize;
    uniform float uAssembledSize;

    attribute vec3 aTarget;
    attribute float aDelay;
    attribute vec3 aColor;

    varying vec3 vColor;
    varying float vAssembled;

    #include <fog_pars_vertex>

    void main() {
        // Per-point stagger. Each point's window is shifted by its own delay,
        // so the field arrives as a sweep instead of every point landing on the
        // same frame. Rescaled by (1 - spread) so the LAST point still reaches
        // fully assembled by the time uAssembly hits 1.
        float staggered = (uAssembly - aDelay * ${STAGGER_SPREAD.toFixed(2)})
            / (1.0 - ${STAGGER_SPREAD.toFixed(2)});
        float eased = clamp(staggered, 0.0, 1.0);
        eased = eased * eased * (3.0 - 2.0 * eased);

        vAssembled = eased;

        vec3 transformed = mix(position, aTarget, eased);

        // Residual jitter. Never reaches zero: at rest the raster still breathes
        // by a fraction of a pixel, which is the difference between "a screen"
        // and "pixels currently agreeing to be a screen".
        float unrest = mix(0.35, 0.06, eased);
        transformed.x += sin(uTime * 2.3 + aDelay * 41.0) * 0.004 * unrest * 10.0;
        transformed.y += cos(uTime * 1.9 + aDelay * 27.0) * 0.004 * unrest * 10.0;

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

        float pointSize = mix(uScatterSize, uAssembledSize, eased);
        // Clamped to 1: a sub-pixel point is not drawn at all, so without this
        // the raster thins out into holes on lower-DPI displays.
        gl_PointSize = max(1.0, pointSize * (300.0 / -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;

        // The colour shift is what sells the change of state — data becoming a
        // screen. It resolves toward a PALE CYAN rather than toward white:
        // pushing 75% to near-white made the assembled panel the brightest
        // white surface in the piece, and a lit screen has a colour temperature
        // like any other lamp.
        vColor = mix(aColor, vec3(0.81, 0.89, 0.93), eased * 0.6);

        #include <fog_vertex>
    }
`

const fragmentShader = /* glsl */`
    uniform float uOpacity;

    varying vec3 vColor;
    varying float vAssembled;

    #include <fog_pars_fragment>

    void main() {
        vec2 offset = gl_PointCoord - vec2(0.5);
        float distanceSquared = dot(offset, offset);
        if (distanceSquared > 0.25) discard;

        // Soft while scattered, hard-edged once assembled: a square-ish pixel
        // grid reads as a raster, a field of soft dots reads as dust.
        float softness = mix(0.25, 0.06, vAssembled);
        float alpha = smoothstep(0.25, 0.25 - softness, distanceSquared) * uOpacity;

        gl_FragColor = vec4(vColor, alpha);

        #include <fog_fragment>
    }
`

// Inherited from PixelField so the cloud arrives already the right colour.
// Shared with the rest of the piece — see palette.js. The old inline list was
// pure cyan and pure white, which against a lifted backdrop reads as confetti
// rather than as a feed made of light.
const POINT_COLORS = LUMINOUS_RAMP

export default function Assembly({ progress }) {
    const materialRef = useRef(null)
    const envelope = fadeEnvelope(progress, 0.14, 0.1)

    const geometry = useMemo(() => {
        const positions = new Float32Array(COUNT * 3)
        const targets = new Float32Array(COUNT * 3)
        const delays = new Float32Array(COUNT)
        const colors = new Float32Array(COUNT * 3)
        const color = new THREE.Color()
        const random = createRandom(SCATTER_SEED)

        for (let index = 0; index < COUNT; index++) {
            // --- where it comes from: PixelField's disc, on the floor ---
            // sqrt() spreads points evenly across the disc's AREA; a linear
            // radius bunches them at the centre.
            const radius = SCATTER_RADIUS * Math.sqrt(random())
            const angle = random() * Math.PI * 2
            positions[index * 3] = Math.cos(angle) * radius
            positions[index * 3 + 1] = 0
            positions[index * 3 + 2] = Math.sin(angle) * radius

            // --- where it goes: a raster cell on the panel ---
            const column = index % PANEL_COLUMNS
            const row = Math.floor(index / PANEL_COLUMNS)
            // +0.5 centres each point in its cell, so the grid is inset by half
            // a cell rather than hanging off the panel's edge.
            const u = (column + 0.5) / PANEL_COLUMNS
            const v = (row + 0.5) / PANEL_ROWS

            targets[index * 3] = (u - 0.5) * PANEL_WIDTH
            targets[index * 3 + 1] = PANEL_EYE_HEIGHT + (0.5 - v) * PANEL_HEIGHT
            targets[index * 3 + 2] = -PANEL_DISTANCE

            // Delay by row: the panel fills top to bottom, the way an image
            // used to load over a slow connection. Plus a little per-point
            // noise so the sweep is a ragged edge, not a ruler.
            delays[index] = Math.min(1, v * 0.85 + random() * 0.15)

            color.set(POINT_COLORS[index % POINT_COLORS.length])
            color.toArray(colors, index * 3)
        }

        const result = new THREE.BufferGeometry()
        result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        result.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3))
        result.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1))
        result.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
        return result
    }, [])

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTime: { value: 0 },
                uAssembly: { value: 0 },
                uOpacity: { value: 0 },
                uScatterSize: { value: SCATTER_POINT_SIZE },
                uAssembledSize: { value: ASSEMBLED_POINT_SIZE }
            }
        ]),
        fog: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }), [])

    useFrame(({ clock }) => {
        const current = materialRef.current
        if (!current) return
        current.uniforms.uTime.value = clock.getElapsedTime()
        // Assembly completes at 70% of the sequence, leaving the last third to
        // simply hold on the finished rectangle. A cut that lands the instant
        // the motion stops gives the viewer no beat to register what happened.
        current.uniforms.uAssembly.value = smoothstep(0.08, 0.7, progress)
        current.uniforms.uOpacity.value = envelope
    })

    if (progress === null) return null

    return (
        <points geometry={geometry}>
            <primitive object={material} ref={materialRef} attach="material" />
        </points>
    )
}
