import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { cloudPoints } from './scanPoints.js'
import scanUrl from '../assets/scan.glb?url'

// Sequence — the scan, POINT CLOUD VERSION. PARKED 2026-07-31, hours after it
// was built: the direction moved on to the raw textured mesh, static, with a
// slice-glitch shader (see ScanRoom.jsx). Kept whole under the standing rule —
// nothing is deleted — and because the machinery here (surface-sampled cloud
// via scanPoints.js, CPU texture readback, per-point dissolve with a seeded
// death order, gaze-driven turntable) is finished, tested, and one row-swap
// away if the cloud comes back.
//
// (2026-07-31, her direction: "find
// good view point... like 2d scan point cloud and scan rotation", then same
// day: "like this view point and like point cloud there will be disspear",
// with a screenshot of the room seen from above, diagonally, whole).
//
// The scan is a specimen you are shown, not a room you stand in. The whole
// captured room floats ahead of and BELOW the standpoint as a cloud of
// coloured points — the visitor overlooks it from above its rim, the
// screenshot's vantage: you see down INTO the room, floor and furniture and
// all, the way a scan viewer frames a dollhouse. It turns on its own axis,
// faster while it is being watched. And it does not survive the beat: over
// the second half the points die off one by one until nothing is left — the
// captured room erodes back into the nothing it was reconstructed from, and
// the metaballs arrive in the space it vacates. That dissolve is the beat's
// exit; the handover needs no cover because the scene removes itself.
//
// THE INTERACTION is attention. Always turning, slowly; several times faster
// under the visitor's gaze. Head direction in the headset, drag-look on a
// screen — the zero-learning rule holds. An object rotating in front of you
// is the safe kind of motion; it is the surround rotating that the inner ear
// bills you for.
//
// Earlier forms of this beat, both parked whole: the walk-in mesh room
// (rejected on sight — from inside, a raw scan is mostly its reconstruction
// smears) and the gaze-pull shards (ScanShardRoom.jsx).
//
// ---- WHAT THE FILE ACTUALLY IS ---------------------------------------------
//
//   1. ONE mesh, 100k triangles, 58.6k vertices, three JPEG textures.
//   2. POSITION and TEXCOORD_0 and NOTHING ELSE — no normals, no vertex
//      colours. The cloud's colours are sampled OUT OF THE TEXTURES on the
//      CPU, once, at build: each point reads the texel its uv lands on.
//   3. Bounds 5.80 x 2.39 x 4.86, centred at (0, 1.19, 0), already metric.
//      x/z centred on the origin, which is what makes the turntable free: a
//      rotation about the group's own Y axis IS a rotation about the room's
//      centre.
//
// The sampling itself (points scattered on triangles, stretched-triangle
// cull, material slots) is pure and tested in scanPoints.js.

// Display scale. LESS than life size — the room is an exhibit, not a place.
// At 0.85 the cloud is about 4.9m wide and 2m tall.
const SCALE = 0.85

// From the file's accessor bounds, hard-coded for the same reason as ever:
// they are properties of this asset, not things to re-derive per mount.
const MODEL_CENTRE_Y = 1.19

// THE VIEW POINT, built from her screenshot: the room seen from above its own
// rim, diagonally, all of it in frame. The visitor cannot be moved (the
// standpoint is fixed, eye at 1.6m — STANDPOINT.y in stageView.js), so the
// room is placed to produce that view instead: its centre 3.4m ahead and at
// 0.5m height, which puts the visitor's eye a metre above the room's middle
// — looking DOWN into it at about eighteen
// degrees, over the near wall, onto the floor. The ceiling half of the scan
// mostly faces away; the room reads as an open box, which is exactly the
// screenshot.
const VIEW_DISTANCE = 3.4
const CENTRE_HEIGHT = 0.5

// And diagonally: the turntable starts a third of a turn in, so a CORNER
// leads rather than a flat wall face-on. The screenshot's framing is
// diagonal, and a face-on wall reads as a picture where a corner reads as a
// volume.
const START_ANGLE = 0.7

// Longest believed triangle edge, in the scan's own metres — the smear cull.
// Real surfaces in this scan are dense, so a long edge is reconstruction
// guesswork bridging a hole, and no points land on it.
const EDGE_LIMIT = 0.45

// Two points scattered on every surviving triangle — about 190k points, one
// draw call. Sampled on the surface rather than taken from the vertices so
// density follows actual surface area.
const SAMPLES_PER_TRIANGLE = 2

// Fixed, so the cloud is the same cloud on every load — the piece's standing
// rule for noise. The dissolve order gets its own stream: reseeding one must
// not silently reshuffle the other.
const CLOUD_SEED = 20260731
const DISSOLVE_SEED = 730

// Point size in world metres (parent scale already folded in where it is
// used). About 1.7cm.
const POINT_SIZE = 0.017

// THE DISSOLVE. Points die in a fixed random order across the second half of
// the beat — by the end nothing is left. Each point shrinks out over a short
// window as the death front passes it rather than popping. The front is
// driven a little past 1 so the very last points are genuinely gone before
// the sequence ends.
const DISSOLVE_START = 0.5
const DISSOLVE_END = 0.96
const DISSOLVE_OVERDRIVE = 1.06

// The turntable. Always turning — a still cloud reads as a broken hologram —
// and several times faster under the visitor's gaze.
const TURN_SLOW = 0.15
const TURN_FAST = 0.6

// Gaze cone for "actually looking at it", as cos(half-angle). Generous — 25
// degrees — because the target is a four-metre object.
const GAZE_COS = Math.cos(0.44)

// The speed change eases rather than switching: quick to answer a look,
// slower to coast back down.
const SPIN_IN_TAU = 0.35
const SPIN_OUT_TAU = 0.9

useGLTF.preload(scanUrl)

// Pull a texture's pixels down to the CPU once. Returns null when there is
// nothing to read (missing image, test environment without a real canvas) —
// the caller falls back to a flat grey rather than crashing the Canvas, since
// a throw in one sequence's useMemo unmounts the whole piece.
const readTexture = (texture) => {
    const image = texture?.image
    if (!image || !image.width || !image.height) return null
    try {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return null
        context.drawImage(image, 0, 0)
        return {
            data: context.getImageData(0, 0, image.width, image.height).data,
            width: image.width,
            height: image.height,
            // glTF textures arrive with flipY=false and top-origin UVs, so v
            // maps straight to a pixel row. Honour the flag rather than
            // assuming, in case the asset is ever re-exported differently.
            flipY: texture.flipY === true
        }
    } catch {
        return null
    }
}

const VERTEX = `
attribute float aDeath;
attribute vec3 aColor;
uniform float uDissolve;
uniform float uSize;
uniform float uScale;
varying vec3 vColor;
varying float vAlive;
void main() {
    vColor = aColor;
    // The death front sweeps 0 to just past 1; a point shrinks out over the
    // 0.05 before the front reaches its own threshold.
    float alive = smoothstep(uDissolve - 0.05, uDissolve, aDeath);
    vAlive = alive;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uScale * alive / max(0.1, -mv.z);
}
`

// Written straight out with no tone mapping or colour-space conversion — the
// colours below are stored as the JPEGs' own sRGB values, so what was
// photographed is what is displayed. Same decision as the metaball field and
// the test pattern, for the same reason.
const FRAGMENT = `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlive;
void main() {
    if (vAlive < 0.02 || uOpacity <= 0.002) discard;
    vec2 offset = gl_PointCoord - vec2(0.5);
    if (dot(offset, offset) > 0.25) discard;
    gl_FragColor = vec4(vColor, uOpacity);
}
`

const GROUP_Y = CENTRE_HEIGHT - MODEL_CENTRE_Y * SCALE

export default function ScanCloudRoom({ progress }) {
    const { scene } = useGLTF(scanUrl)

    const { geometry, material } = useMemo(() => {
        let source = null
        scene.traverse((child) => {
            if (!source && child.isMesh) source = child
        })

        const sourceGeometry = source.geometry
        const cloud = cloudPoints(
            sourceGeometry.getAttribute('position').array,
            sourceGeometry.getAttribute('uv').array,
            sourceGeometry.getIndex().array,
            {
                groups: sourceGeometry.groups?.length ? sourceGeometry.groups : null,
                edgeLimit: EDGE_LIMIT,
                samplesPerTriangle: SAMPLES_PER_TRIANGLE,
                random: createRandom(CLOUD_SEED)
            }
        )

        // One ImageData per material slot, read once and shared by every
        // point that samples it. Colours stay in sRGB — see FRAGMENT.
        const materials = Array.isArray(source.material) ? source.material : [source.material]
        const images = materials.map((slotMaterial) => readTexture(slotMaterial?.map))

        const colors = new Float32Array(cloud.count * 3)
        for (let point = 0; point < cloud.count; point++) {
            const image = images[cloud.slots[point]] ?? images[0]
            if (!image) {
                // No pixels to read — a visible, honest grey, not black.
                colors[point * 3] = 0.45
                colors[point * 3 + 1] = 0.45
                colors[point * 3 + 2] = 0.45
                continue
            }
            const u = Math.min(1, Math.max(0, cloud.uvs[point * 2]))
            const vRaw = Math.min(1, Math.max(0, cloud.uvs[point * 2 + 1]))
            const v = image.flipY ? 1 - vRaw : vRaw
            const x = Math.min(image.width - 1, Math.floor(u * image.width))
            const y = Math.min(image.height - 1, Math.floor(v * image.height))
            const texel = (y * image.width + x) * 4
            colors[point * 3] = image.data[texel] / 255
            colors[point * 3 + 1] = image.data[texel + 1] / 255
            colors[point * 3 + 2] = image.data[texel + 2] / 255
        }

        // Every point's place in the dissolve order, fixed at build. Its own
        // seeded stream, so the cloud and its dying order can be tuned
        // independently.
        const deathRandom = createRandom(DISSOLVE_SEED)
        const deaths = new Float32Array(cloud.count)
        for (let point = 0; point < cloud.count; point++) deaths[point] = deathRandom()

        const built = new THREE.BufferGeometry()
        built.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3))
        built.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
        built.setAttribute('aDeath', new THREE.BufferAttribute(deaths, 1))

        return {
            geometry: built,
            material: new THREE.ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                uniforms: {
                    uDissolve: { value: 0 },
                    uOpacity: { value: 0 },
                    uSize: { value: POINT_SIZE * SCALE },
                    uScale: { value: 1000 }
                },
                transparent: true,
                // Points do not occlude each other: with a fading transparent
                // cloud, depth-writing points punch invisible holes through
                // the ones behind them.
                depthWrite: false
            })
        }
    }, [scene])

    useEffect(() => () => {
        geometry.dispose()
        material.dispose()
    }, [geometry, material])

    // The turntable's live state, plus scratch for the gaze test.
    const state = useMemo(() => ({
        angle: START_ANGLE,
        rate: TURN_SLOW,
        lastLocal: 0,
        group: null,
        forward: new THREE.Vector3(),
        toScan: new THREE.Vector3(),
        buffer: new THREE.Vector2()
    }), [])

    useFrame((frame, delta) => {
        const local = progress
        if (local === null) return

        material.uniforms.uOpacity.value = smoothstep(0, 0.12, local) * smoothstep(1, 0.88, local)
        material.uniforms.uDissolve.value =
            smoothstep(DISSOLVE_START, DISSOLVE_END, local) * DISSOLVE_OVERDRIVE

        // Perspective point sizing has to know the real drawing buffer, which
        // in XR is not the canvas: pixels-per-radian from the buffer height
        // and the camera's field of view.
        const bufferSize = frame.gl.getDrawingBufferSize(state.buffer)
        const fov = ((frame.camera.fov ?? 70) * Math.PI) / 180
        material.uniforms.uScale.value = bufferSize.y / (2 * Math.tan(fov / 2))

        // The loop restarts the piece without unmounting anything, so the
        // turntable rewinds itself when the playhead does — every pass shows
        // the scan from the same leading corner.
        if (local < state.lastLocal) {
            state.angle = START_ANGLE
            state.rate = TURN_SLOW
        }
        state.lastLocal = local

        const dt = Math.min(Math.max(delta, 0), 0.1)
        const camera = frame.camera
        camera.getWorldDirection(state.forward)
        state.toScan
            .set(
                -camera.position.x,
                CENTRE_HEIGHT - camera.position.y,
                -VIEW_DISTANCE - camera.position.z
            )
            .normalize()
        const watched = state.toScan.dot(state.forward) > GAZE_COS

        const targetRate = watched ? TURN_FAST : TURN_SLOW
        const tau = targetRate > state.rate ? SPIN_IN_TAU : SPIN_OUT_TAU
        state.rate += (targetRate - state.rate) * (1 - Math.exp(-dt / tau))

        state.angle += state.rate * dt
        if (state.group) state.group.rotation.y = state.angle
    })

    if (progress === null) return null

    return (
        <group
            ref={(group) => { state.group = group }}
            position={[0, GROUP_Y, -VIEW_DISTANCE]}
            rotation={[0, START_ANGLE, 0]}
            scale={SCALE}
        >
            <points geometry={geometry} material={material} frustumCulled={false} />
        </group>
    )
}
