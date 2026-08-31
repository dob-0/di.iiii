import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { DATA_WHITE } from '../palette.js'

// Sequence 03 — the scan.
//
// The Ikeda beat, on direction ("ryoji ikeda style but in our vibes").
//
// It sits between the data field and the assembly because that is the argument
// of the whole piece: noise, then MEASUREMENT, then image. Sequence 02 is data
// with no order in it — a thousand cubes each on their own clock, deliberately
// incoherent. This is the same material under a machine: hairline bars on exact
// radii, quantised widths, everything switching on ONE clock, and a scan plane
// sweeping the volume as though something were reading it. The field becomes
// legible before it becomes an image.
//
// WHAT IS TAKEN from Ikeda: monochrome only, hairline precision, barcode
// rhythm, hard on/off with no easing anywhere, a machine tick you can count.
//
// WHAT IS NOT: his work is a rectangle you sit in front of, often flashing at
// rates this piece will not use. The bars here are objects on cylindrical
// shells around a fixed standpoint, so turning your head slides the near shell
// across the far one and the barcode has parallax — it is a structure you are
// standing inside, which is the only reason to do this in a headset at all.
//
// "In our vibes" is the rest of it, and it is mostly a list of things this
// sequence does NOT get to do:
//   - one white, no colour (palette.js rule 1 — colour is light, not surface)
//   - no coherent flow across the field, so nothing reads as self-motion
//   - the tick stays well under the 15-25Hz photosensitivity band, and only a
//     FRACTION of the bars change on any one tick

// ---- the barcode -----------------------------------------------------------

const BAR_COUNT = 460

// Cylindrical shells, in metres. Discrete radii rather than a scatter: the
// whole point of this sequence is that the material has been sorted, and depth
// arriving in layers is what says so. Three is the fewest that still reads as
// depth when you turn your head — two shells give parallax but no order to it.
const SHELL_RADII = [5.5, 9, 14.5, 21]

// Bar dimensions. Hairline in width, tall in height. A bar as wide as it is
// visible is a plank; the whole vocabulary here is the LINE.
const BAR_HEIGHT_MIN = 2.2
const BAR_HEIGHT_MAX = 7.5
const BAR_DEPTH = 0.02

// Quantised widths, in metres, at the nearest shell — scaled up with radius so
// a far bar subtends roughly what a near one does. THREE values, not a range:
// a barcode is a small alphabet of widths repeated, and a continuous
// distribution of widths is just noise with extra steps.
const BAR_WIDTHS = [0.014, 0.035, 0.085]

// ---- the tick --------------------------------------------------------------
//
// One clock for the whole field, which is the opposite of the data field's rule
// and is the entire difference between the two sequences. There, coherence was
// the thing to avoid; here it is the subject.
//
// 6Hz — fast enough to read as machine rather than as rhythm, far enough below
// 15Hz to stay out of the band that matters, and it is not a global flash: the
// bars are grouped into sectors and only some sectors change on any given tick,
// so the field is never all-on or all-off.
const TICK_HZ = 6

// Sectors the field is switched in. A bar's sector is its angular position
// quantised, so a tick lights CONTIGUOUS WEDGES of the barcode rather than
// scattered individuals — data arriving in blocks, which is what a machine
// reading something looks like.
const SECTOR_COUNT = 24

// How many sectors are live at once, roughly. Under half: the dark between
// blocks is what makes the lit blocks read as information.
const SECTOR_DUTY = 0.42

// ---- the scan plane --------------------------------------------------------
//
// A horizontal band travelling up through the volume. Bars inside it go to full
// brightness regardless of their sector, so the sweep reads as something being
// READ rather than as another light.
//
// This is the one coherent motion in the sequence, and it is deliberately a
// thin band rather than a wall of light: a large coherent flow across the whole
// visual field is the textbook vection trigger (see the comfort note in
// DataField.jsx), and a 0.9m band travelling vertically at this rate is a line
// crossing the scene, not a floor rising.
const SWEEP_SPAN = 9
const SWEEP_BASE = -2.5
const SWEEP_THICKNESS = 0.9
const SWEEP_PASSES = 3

// Brightness ladder. The sweep is the brightest thing in the room, a live
// sector is legible, and an idle bar is not quite nothing — Ikeda's black is
// never empty, there is always structure sitting just above the floor of what
// you can see, and finding it is what makes you lean in.
const VALUE_IDLE = 0.06
const VALUE_LIVE = 0.55
const VALUE_SWEPT = 1

// Depth falloff, same reasoning as the data field: these are unfogged, so
// nothing but size and value says how far away a shell is.
const DEPTH_NEAR = 1
const DEPTH_FAR = 0.34

const SCAN_SEED = 20260732

/**
 * On/off for one sector at one tick.
 *
 * Integer avalanche rather than fract(sin(x)) — deterministic across machines,
 * and the same (sector, tick) always gives the same answer, so the sequence is
 * reproducible in the same way every scatter in this piece is.
 */
const hashStep = (index, step) => {
    let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 0x27d4eb2f, 0xc2b2ae35)
    h = Math.imul(h ^ (h >>> 15), 0x2545f491)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

const createBars = () => {
    const random = createRandom(SCAN_SEED)
    const bars = []

    for (let index = 0; index < BAR_COUNT; index++) {
        // Shells are weighted toward the far ones so the density looks even:
        // the same count spread round a 21m circle is far sparser than round a
        // 5.5m one, and an evenly-weighted pick puts a wall of bars at arm's
        // length and a handful in the distance.
        const shell = Math.min(
            SHELL_RADII.length - 1,
            Math.floor(Math.pow(random(), 0.55) * SHELL_RADII.length)
        )
        const radius = SHELL_RADII[shell]
        const angle = random() * Math.PI * 2

        const width = BAR_WIDTHS[Math.floor(random() * BAR_WIDTHS.length)]
            * (radius / SHELL_RADII[0])

        const height = BAR_HEIGHT_MIN + random() * (BAR_HEIGHT_MAX - BAR_HEIGHT_MIN)

        // Centred a little below eye level, so the bars run past the visitor
        // rather than hanging in front of their face. Varied, or every bar
        // shares a centre line and the field acquires a horizon.
        const centre = -0.4 + random() * 1.6

        bars.push({
            position: new THREE.Vector3(
                Math.sin(angle) * radius,
                centre,
                Math.cos(angle) * radius
            ),
            // Tangential: the bar's flat face points at the standpoint, so it
            // reads as a line rather than as a box seen end-on. Turning your
            // head is then what reveals it has any thickness at all.
            rotation: angle,
            width,
            height,
            centre,
            // Angular sector, for the tick. Contiguous by construction.
            sector: Math.floor((angle / (Math.PI * 2)) * SECTOR_COUNT) % SECTOR_COUNT,
            // Offsets this bar's tick within its sector by a frame or two, so a
            // block arrives as a fast wipe across the wedge instead of as a
            // rectangle appearing. Sub-tick, so the block still reads as one
            // event.
            skew: random() * 0.35,
            depth: THREE.MathUtils.lerp(
                DEPTH_NEAR,
                DEPTH_FAR,
                shell / Math.max(1, SHELL_RADII.length - 1)
            ),
            // Staggered arrival out of the data field's noise.
            birth: random() * 0.55
        })
    }

    return bars
}

export default function ScanField({ progress }) {
    const meshRef = useRef(null)

    const bars = useMemo(() => createBars(), [])

    const scratch = useMemo(() => ({
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        euler: new THREE.Euler(),
        scale: new THREE.Vector3(),
        color: new THREE.Color()
    }), [])

    // The bars never move, so their matrices are written ONCE. Only brightness
    // changes per frame, and that is a per-instance colour — 460 colour writes
    // against 460 matrix composes, for a field that is deliberately rigid.
    useEffect(() => {
        const mesh = meshRef.current
        if (!mesh) return

        bars.forEach((bar, index) => {
            scratch.euler.set(0, bar.rotation, 0)
            scratch.quaternion.setFromEuler(scratch.euler)
            scratch.scale.set(bar.width, bar.height, BAR_DEPTH)
            scratch.matrix.compose(bar.position, scratch.quaternion, scratch.scale)
            mesh.setMatrixAt(index, scratch.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
    }, [bars, scratch])

    useFrame(({ clock }) => {
        const mesh = meshRef.current
        if (!mesh) return

        const local = progress
        if (local === null) return

        const time = clock.getElapsedTime()

        // Emerges from the data field rather than fading up from black — the
        // two windows overlap, and this sequence is the same material being
        // sorted, so it has to arrive while the noise is still there.
        const emergence = smoothstep(0.05, 0.3, local)
        const envelope = smoothstep(0.02, 0.18, local) * smoothstep(1, 0.85, local)

        mesh.material.opacity = envelope

        const tick = time * TICK_HZ

        // Where the scan plane is. Sawtooth, not a sine: a sine sweep slows at
        // each end and turns around, which reads as a pendulum. A scan starts
        // at one end, crosses at a constant rate, and begins again.
        const sweepCycle = (local * SWEEP_PASSES) % 1
        const sweepY = SWEEP_BASE + sweepCycle * SWEEP_SPAN

        for (let index = 0; index < bars.length; index++) {
            const bar = bars[index]

            const sectorTick = Math.floor(tick + bar.skew)
            const live = hashStep(bar.sector, sectorTick) < SECTOR_DUTY

            // Distance from the bar's centre to the scan plane, as 0..1 across
            // the band. Hard-edged on purpose — a soft-edged scan line is a
            // glow passing over, and this has to read as an edge.
            const swept = Math.abs(bar.centre - sweepY) < SWEEP_THICKNESS ? 1 : 0

            const base = swept ? VALUE_SWEPT : (live ? VALUE_LIVE : VALUE_IDLE)
            const value = base * bar.depth * smoothstep(bar.birth, bar.birth + 0.25, emergence)

            // Vertex/instance colour is consumed as LINEAR — the same trap as
            // the data field's face tones. Written raw, every step of the
            // brightness ladder lands darker than it reads and the idle floor
            // disappears entirely.
            scratch.color.setScalar(value).convertSRGBToLinear()
            mesh.setColorAt(index, scratch.color)
        }

        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })

    if (progress === null) return null

    return (
        <group position={[0, 1.6, 0]}>
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, BAR_COUNT]}
                // Same reason as the data field: an InstancedMesh takes its
                // bounding sphere from the geometry, so the whole field would be
                // culled the moment the middle of the room left the frustum.
                frustumCulled={false}
            >
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial
                    color={DATA_WHITE}
                    transparent
                    opacity={0}
                    // Additive, so where a near bar crosses a far one the two
                    // sum into a brighter mark instead of one occluding the
                    // other. It is also what removes transparency sorting from
                    // a field of 460 quads at four depths, which in stereo is
                    // sorted twice and is where this kind of scene starts to
                    // flicker.
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    fog={false}
                    toneMapped={false}
                />
            </instancedMesh>
        </group>
    )
}
