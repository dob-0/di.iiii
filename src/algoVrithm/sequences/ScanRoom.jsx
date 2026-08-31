import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import scanUrl from '../assets/scan.glb?url'

// Sequence — the scan, GLITCHING MESH VERSION (2026-07-31, her direction:
// "remove point cloud... keep model position but i want not to rotate, i want
// like see it from there, and glitch 3d scan and see that scan").
//
// So: the raw textured photogrammetry mesh, exactly as the scanner returned
// it — ragged holes, stretched patches and all — held STILL at the overlook
// viewpoint, and glitching. Horizontal slices of the model tear sideways on
// an irregular tick, their texture splitting into colour fringes, then snap
// back. The visitor stands above the room's rim and just watches it: a real
// place, captured, failing to hold itself together. That reads with the
// transitions now — the veil glitches BETWEEN scenes, and here is a scene
// whose SUBJECT is glitching — the one beat where the noise is not covering
// anything. What the medium does to a real room is the image.
//
// No rotation, on direction. The still pose also does something the turntable
// undid: the scan's torn silhouette against the dark backdrop stays a fixed
// composition, the way her reference screenshot is one.
//
// Earlier forms of this beat, all parked whole, one row-swap away:
// walk-in mesh room → gaze-pull shards (ScanShardRoom.jsx) → point cloud on a
// turntable with a dissolve exit (ScanCloudRoom.jsx).
//
// ---- WHAT THE FILE ACTUALLY IS ---------------------------------------------
//
//   1. ONE hundred thousand triangles, 58.6k vertices, three JPEG textures —
//      the loader may deliver that as one mesh or one per texture, so the
//      build traverses and wraps EVERY mesh it finds rather than the first.
//   2. POSITION and TEXCOORD_0 and NOTHING ELSE — no normals. Unlit is the
//      only honest rendering: the light that was in the room when it was shot
//      is already in the texture, and lighting it again means fabricating
//      normals for surfaces the scanner never measured.
//   3. Bounds 5.80 x 2.39 x 4.86, centred at (0, 1.19, 0), already metric.
//
// NO SMEAR CULL in this version, deliberately. The stretched reconstruction
// patches were the enemy when the visitor stood inside them; from the outside
// they are the scan's own damage, which is now the subject. Her screenshot —
// the one this viewpoint is built from — is full of them.

// Display scale. Less than life size — the room is an exhibit, not a place.
const SCALE = 0.85

// From the file's accessor bounds, hard-coded: properties of this asset, not
// things to re-derive per mount.
const MODEL_CENTRE_Y = 1.19

// THE VIEW POINT, from her screenshot: the room seen from above its own rim,
// diagonally, all of it in frame. The visitor cannot be moved (the standpoint
// is fixed, eye at 1.6m — STANDPOINT.y in stageView.js), so the room is
// placed to produce that view: centre 3.4m ahead at 0.5m height puts the eye
// just over a metre above the room's middle — looking DOWN into it over the
// near wall, onto the floor, like an open box.
const VIEW_DISTANCE = 3.4
const CENTRE_HEIGHT = 0.5

// Diagonal, a third of a turn in, so a CORNER leads rather than a wall
// face-on. A face-on wall reads as a picture; a corner reads as a volume.
// This is a fixed pose now, not a starting angle.
const POSE_ANGLE = 0.7

// ---- THE GLITCH -------------------------------------------------------------
//
// Same grammar as the transition veil (TransitionVeil.jsx) so the piece has
// ONE kind of damage: quantised ticks, hard-edged horizontal slices, no
// smooth noise anywhere. Here it displaces GEOMETRY instead of covering the
// view — a slice of the room jumps sideways, its texture splits into colour
// fringes, and the triangles that straddle the slice boundary stretch into
// exactly the kind of tearing the scan already has.
//
// The tick rate is held below the 15-25Hz photosensitive band for the same
// reason the veil's is — this is a big object in the middle of view. Slices
// are a partial-field effect (most of the model holds still on any tick),
// which is the other half of that safety argument.
const GLITCH_TICK_HZ = 9

// Horizontal slice bands per model-metre of height. At 12, slices are about
// 8cm thick on the model — thick enough to carry readable texture when they
// jump, thin enough that a jump reads as signal damage, not the room moving.
const SLICE_BANDS = 12

// How far a glitched slice jumps, in model metres (about 17cm displayed).
// And how far its colour channels split, in uv space.
const JUMP_X = 0.5
const JUMP_Z = 0.3
const FRINGE = 0.007

// How much of the model glitches: the resting fraction of slices torn on any
// tick, and the fraction during a burst. Bursts are whole ticks where the
// damage spikes — about one tick in five — which keeps the glitch irregular
// instead of a steady shimmer.
const TEAR_BASE = 0.05
const TEAR_BURST = 0.24
const BURST_CHANCE = 0.2

useGLTF.preload(scanUrl)

const VERTEX = `
uniform float uTime;
varying vec2 vUv;
varying float vTorn;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vUv = uv;

    float tick = floor(uTime * ${GLITCH_TICK_HZ.toFixed(1)});
    float slice = floor(position.y * ${SLICE_BANDS.toFixed(1)});

    // Whole ticks burst, individual slices tear. Two independent rolls: the
    // first is shared by every slice this tick (the burst), the second is the
    // slice's own.
    float burst = step(1.0 - ${BURST_CHANCE.toFixed(2)}, hash(vec2(tick, 91.0)));
    float threshold = mix(${TEAR_BASE.toFixed(2)}, ${TEAR_BURST.toFixed(2)}, burst);
    float torn = step(hash(vec2(slice, tick)), threshold);
    vTorn = torn;

    vec3 displaced = position;
    displaced.x += torn * (hash(vec2(slice * 3.1, tick + 7.0)) - 0.5) * ${(JUMP_X * 2).toFixed(2)};
    displaced.z += torn * (hash(vec2(slice * 1.7, tick + 3.0)) - 0.5) * ${(JUMP_Z * 2).toFixed(2)};

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

// Written straight out, no tone mapping, no colour-space conversion — the
// texture holds what the camera saw and that is what is displayed, the same
// authored-values rule as the metaball ink and the test pattern. Torn slices
// sample the map three times with the uv offset flipped per channel, which is
// the colour-fringe of a failing signal; untorn fragments collapse to one
// clean sample because the offset is zero.
const FRAGMENT = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vTorn;

void main() {
    if (uOpacity <= 0.002) discard;
    vec2 fringe = vec2(vTorn * ${FRINGE.toFixed(4)}, 0.0);
    float red = texture2D(uMap, vUv + fringe).r;
    vec4 centre = texture2D(uMap, vUv);
    float blue = texture2D(uMap, vUv - fringe).b;
    gl_FragColor = vec4(red, centre.g, blue, uOpacity);
}
`

const GROUP_Y = CENTRE_HEIGHT - MODEL_CENTRE_Y * SCALE

export default function ScanRoom({ progress }) {
    const { scene } = useGLTF(scanUrl)

    // One clone per mount, materials replaced with the glitch shader. The
    // uniforms objects for time and opacity are SHARED across every material
    // (the scan may load as several meshes, one per texture), so one write in
    // the frame loop drives them all in lockstep — slices must tear on the
    // same tick everywhere or the model looks cut into layers.
    const { model, materials, shared } = useMemo(() => {
        const copy = scene.clone(true)
        const time = { value: 0 }
        const opacity = { value: 0 }
        const built = []

        copy.traverse((child) => {
            if (!child.isMesh) return

            const sources = Array.isArray(child.material) ? child.material : [child.material]
            const replacements = sources.map((source) => {
                const map = source?.map ?? null
                if (map) map.colorSpace = THREE.SRGBColorSpace
                const material = new THREE.ShaderMaterial({
                    vertexShader: VERTEX,
                    fragmentShader: FRAGMENT,
                    uniforms: {
                        uMap: { value: map },
                        uTime: time,
                        uOpacity: opacity
                    },
                    // DoubleSide: an interior scan's surfaces face inward, and
                    // from above the rim you see both faces of every wall. A
                    // missing back face reads as a hole in the room.
                    side: THREE.DoubleSide,
                    transparent: true,
                    fog: false
                })
                built.push(material)
                return material
            })

            child.material = Array.isArray(child.material) ? replacements : replacements[0]

            // The displaced slices leave the source bounding sphere, and the
            // model nearly fills the view anyway — the culling test has
            // nothing useful to say.
            child.frustumCulled = false
        })

        return { model: copy, materials: built, shared: { time, opacity } }
    }, [scene])

    useEffect(() => () => {
        materials.forEach((material) => material.dispose())
    }, [materials])

    useFrame((state) => {
        const local = progress
        if (local === null) return

        shared.opacity.value = smoothstep(0, 0.12, local) * smoothstep(1, 0.88, local)
        shared.time.value = state.clock.elapsedTime
    })

    if (progress === null) return null

    return (
        <primitive
            object={model}
            position={[0, GROUP_Y, -VIEW_DISTANCE]}
            rotation={[0, POSE_ANGLE, 0]}
            scale={SCALE}
        />
    )
}
