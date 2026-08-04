import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../ritualClock.js'
import { createRandom } from '../random.js'
import { DATA_WHITE } from '../palette.js'
import { ATLAS_CELLS, cellUv, glyphAtlas, GLYPH_COLUMNS, GLYPH_ROWS } from '../glyphAtlas.js'

// Sequence 02 — the data field.
//
// Third pass (2026-07-30). The first two were a painted surround: a shader on
// the inside of a sphere, cells lighting on a grid. The artist's direction after
// seeing the second one — "more minimal, more movement, maybe 3d cubes" — rules
// that whole approach out, because a painted sphere can only ever move the way a
// screen moves. At radius 12 with no parallax it IS a screen, and in a headset a
// screen is the one thing the medium is not for.
//
// So the data is now OBJECTS. Real boxes in real space around the standpoint,
// each drifting on its own line, at every distance from arm's reach to the edge
// of the fog. Stereo depth does the work the grid was faking: you can see that
// the near ones are near, and turning your head slides them past each other.
//
// Removed, not hidden: the grid sphere, the three code ribbons, the ribbon
// bitmap. That is the minimalism half of the note — one kind of thing in the
// room, nothing else. `src/algoVrithm/` is untracked, so the cell version is not
// in git; it is saved outside the repo, and the code-ribbon machinery in it is
// worth reading before rebuilding that from scratch.
//
// What is kept from the Ikeda reading: no colour at all, one white; nothing
// placed by hand; density as the composition. What is gone: the two-value rule
// (a cube has to be shaded to read as a cube) and the machine tick.

// ---- comfort: why the motion is incoherent ---------------------------------
//
// "More movement" is the one note in this piece that can make somebody ill, so
// it is worth being explicit about the shape of the answer.
//
// Vection is the illusion of self-motion you get from a large coherent flow
// across the visual field. A field of cubes all streaming the same way is the
// textbook trigger — and streaming toward or away from the viewer, which is the
// obvious way to make a data field feel like flight, is the worst case of it.
//
// So every cube travels on its OWN axis in its own direction at its own speed.
// The result has as much motion in it as a stream would, and no net flow at any
// point in the field, so there is nothing for the vestibular system to read as
// "I am moving". Same reasoning as the ribbons in the previous version scrolling
// by texture offset instead of by moving their mesh, and the same reasoning
// behind viewerTravel.js's trapezoid velocity. Rotation is per-cube only — the
// field is never rotated as a whole, because rotational vection is far worse
// than linear (see the note in viewerTravel.js).

// ---- fourth pass: more squares, noise, strobe (2026-07-30) ------------------
//
// The artist's note — "data field, we need more squares, noise, strobe" —
// arrived with a fragment shader as the reference: a grid of random dot-matrix
// characters re-rolling on a fast clock. Raw code, as pixels, as the image.
//
// The previous pass answered "more minimal" and it went too quiet: 260 slow
// cubes is a calm scatter, and this beat of the piece is supposed to be the
// moment the data is overwhelming. So three things change, and the reason they
// are three rather than one is that "noise" in a HEADSET is not the same problem
// as noise on a screen.
//
//   MORE SQUARES — the count goes up four-fold. Still one draw call.
//   NOISE        — the field now blinks. Each cube is switched on or off by a
//                  hash of (its index, the current tick), which is the shader's
//                  re-roll moved into the field's own scale term.
//   STROBE       — plates of actual glyphs, from a real dot-matrix atlas, at
//                  every depth. This is where the "code" reading comes from; a
//                  cube is data as an OBJECT, a glyph is data as a CHARACTER,
//                  and the piece needs both to be about code rather than dust.
//
// What is deliberately NOT copied is the reference's construction: a full-screen
// procedural shader, which in stereo is paid for twice and which would put the
// image back on a surface at a fixed distance — the exact failure the second
// pass was thrown out for. Every glyph here is a quad at a real depth with real
// parallax. See glyphAtlas.js.
//
// The blink rates all sit well under the 15-25Hz photosensitivity band, and
// because each cube runs its own rate off its own hash there is no moment when
// the field flashes as one — which is both the safety argument and the reason it
// reads as noise instead of as a light being switched.

// How many cubes. Up from 260, which was tuned for "more minimal" and answered
// the wrong note by the time this pass was asked for. Still one instanced draw
// call, and the per-frame cost is a matrix compose each — the count is limited
// by what reads as a field, not by what the GPU will take.
const CUBE_COUNT = 1100

// The shell they live in. Nothing closer than SAFE_RADIUS to the head: a cube
// inside arm's reach in VR is a flinch, and one that passes through the face is
// the end of anybody's immersion. The far edge sits inside the backdrop's fog so
// the field has no visible boundary — a field you can see the end of is a prop.
const SAFE_RADIUS = 3.4
const INNER_RADIUS = 4.2
const OUTER_RADIUS = 17.5

// Sizes. Mostly small, a few anchors. A field of one size is a texture; the
// large ones are what give the small ones a scale to be small against, and they
// are the ones the eye tracks when it wants something to hold onto.
const SIZE_MIN = 0.05
const SIZE_MAX = 0.17
const ANCHOR_CHANCE = 0.08
const ANCHOR_SIZE_MIN = 0.3
const ANCHOR_SIZE_MAX = 0.52

// Travel. Each cube runs a straight segment SPAN long and then repeats it, so
// the composition can never drift apart — the field looks the same at second 5
// and second 15 without any cube being still.
const SPAN = 6.4
const SPEED_MIN = 0.22
const SPEED_MAX = 0.85

// Rotation, radians/sec. Slow, and around a per-cube axis. This is what keeps
// the far cubes alive: at 15 metres a drift of half a metre a second is almost
// no angular motion, but a face turning out of the light changes its value, and
// a value change at that distance still reads as movement.
const SPIN_MIN = 0.06
const SPIN_MAX = 0.4

// Depth falloff. Applied per cube as a fixed tint rather than as fog: fog mixes
// toward the world colour and would tie the field's value to the backdrop, and
// this sequence's whole palette is one white against black. Far cubes are dimmer
// because they are further, which is the only depth cue an unlit object has
// besides its size.
const NEAR_VALUE = 1.0
const FAR_VALUE = 0.22

// Per-face tones, in BoxGeometry's group order: +x, -x, +y, -y, +z, -z.
//
// This is the load-bearing detail of the whole sequence. An unlit box with one
// value on every face has no interior edges and renders as a flat white
// hexagon — 260 of those is a field of confetti, not cubes. Giving each face its
// own value is what makes the form legible, and it is why the two-value rule
// from the earlier passes cannot survive here: three tones per object minimum.
//
// Top brightest, bottom darkest, as if lit from above — the reading every
// viewer already has. Opposite faces deliberately differ (+x vs -x, +z vs -z) so
// a slowly spinning cube keeps changing value instead of repeating every 90°.
const FACE_TONES = [0.66, 0.46, 1.0, 0.2, 0.8, 0.34]

// ---- the noise -------------------------------------------------------------
//
// Each cube is switched on and off by a hash of (index, tick). A tick is a
// quantised slice of the clock, so the field changes in STEPS rather than
// continuously — a smoothly fading cube reads as breathing, and this has to read
// as data being rewritten.
//
// Rates are per cube and deliberately not harmonically related, so no two parts
// of the field ever come into phase. The band is well under the 15-25Hz range
// associated with photosensitive seizures, and no cube runs anywhere near the
// top of it for long because its own rate is fixed at build time.
const BLINK_HZ_MIN = 1.6
const BLINK_HZ_MAX = 7.5

// What fraction of the field is lit at any instant. Below about half the room
// empties out between ticks and the composition flickers as a whole; at 0.62 the
// density holds steady and what changes is WHICH cubes are making it up.
const BLINK_DUTY = 0.62

// The anchors — the few large cubes — never blink. They are what the eye holds
// onto, and a field where everything is unreliable has nothing to be measured
// against. They also keep the scene from ever being momentarily empty.

// ---- the glyphs ------------------------------------------------------------
//
// Plates of dot-matrix characters, scattered through the same shell as the
// cubes. Each one is a quad pointing at ONE cell of the shared atlas, all of
// them merged into a single geometry — a hundred separate meshes would be a
// hundred draw calls, which is the budget the whole piece has.
//
// Oriented to face the standpoint at BUILD time rather than billboarded per
// frame. The viewer does not move during this sequence (pure look-around from a
// fixed head position), so the result is identical to billboarding and costs
// nothing per frame — but because they are genuinely oriented in space rather
// than tracking the camera, turning your head still slides them past each other
// with real parallax, and in stereo they sit at their own depths. A billboard
// that chases the eye is a sprite; this is a plate hanging in a room.
const PLATE_COUNT = 150

// Held further out than the cubes' inner shell. A character at arm's length is
// legible, and a legible character is a label — the field wants illegible type
// at a distance, which is what raw data looks like when you are inside it.
const PLATE_INNER_RADIUS = 6
const PLATE_OUTER_RADIUS = 19

// Plate height in metres. The atlas cell is 5 wide by 7 tall, and the quads
// carry that ratio so a glyph is never stretched.
const PLATE_SIZE_MIN = 0.34
const PLATE_SIZE_MAX = 1.05
const PLATE_ASPECT = GLYPH_COLUMNS / GLYPH_ROWS

// Glyph plates blink faster and harder than the cubes. They are flat, unlit and
// additive, so they carry no shading to read as form — the only thing they can
// be is a signal, and a signal that changes slowly is a sign.
const PLATE_BLINK_HZ_MIN = 3
const PLATE_BLINK_HZ_MAX = 11
const PLATE_BLINK_DUTY = 0.45

// Additive white on black, so the plates SUM where they overlap in depth. Kept
// under 1 because that summing is the point: two plates crossing should be the
// bright event, not two things already at maximum.
const PLATE_VALUE = 0.85

const FIELD_SEED = 20260730
const PLATE_SEED = 20260731

// Keeps the plate hash off the cube hash. Both fields index from 0, and the same
// (index, tick) gives the same answer by construction — without an offset, plate
// 12 and cube 12 would switch together every time their rates crossed, which the
// eye finds as a pattern long before anybody could explain why.
const PLATE_HASH_OFFSET = 7919

/**
 * On or off for one thing at one tick.
 *
 * An integer avalanche rather than the fract(sin(x)) idiom every noise shader
 * uses: sin at large arguments loses precision differently on different GPUs and
 * CPUs, and this runs on the CPU where there is no reason to accept that. Two
 * multiplies and three shifts, and the same (index, tick) always gives the same
 * answer — so the noise is deterministic and the field is reproducible, exactly
 * like every other scatter in the piece.
 */
const hashStep = (index, step) => {
    let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 0x27d4eb2f, 0xc2b2ae35)
    h = Math.imul(h ^ (h >>> 15), 0x2545f491)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

// Colour attributes — vertex colours and instanceColor both — are consumed as
// LINEAR values, unlike a material's `color`, which three converts from sRGB for
// you. Written raw, every tone above lands darker than it reads: a 0.2 bottom
// face displays around 0.48, so the shading washes out to mid-grey and the cubes
// go back to looking flat, which is the one thing FACE_TONES exists to prevent.
// This is the same class of trap as getHSL() reporting linear — see the colour
// notes in palette.test.js.
const toLinear = (value) => new THREE.Color().setScalar(value).convertSRGBToLinear()

/**
 * A box whose faces carry their own brightness in a vertex-colour attribute.
 *
 * Vertex colours rather than a custom shader: three multiplies vColor by
 * instanceColor for free (see color_vertex.glsl), so per-face tone and per-cube
 * depth tint compose without a line of GLSL, and a stock material cannot fail
 * to compile on a headset driver.
 */
const createCubeGeometry = () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const colors = new Float32Array(geometry.attributes.position.count * 3)

    geometry.groups.forEach((group, face) => {
        const tone = toLinear(FACE_TONES[face] ?? 1)
        for (let i = group.start; i < group.start + group.count; i++) {
            const vertex = geometry.index.getX(i)
            colors[vertex * 3] = tone.r
            colors[vertex * 3 + 1] = tone.g
            colors[vertex * 3 + 2] = tone.b
        }
    })

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
}

/**
 * The field, built once.
 *
 * Seeded, so the scatter is identical on every load — what gets approved is what
 * an audience sees, and a scene that reshuffles itself cannot be approved at
 * all. Same reasoning as the ribbon bitmap in the previous version.
 */
const createCubes = () => {
    const random = createRandom(FIELD_SEED)
    const cubes = []

    for (let index = 0; index < CUBE_COUNT; index++) {
        // Scattered by direction and radius rather than in a box, so the
        // density is even in every direction the visitor might turn. The cube
        // root is what stops the shell from crowding at its inner surface —
        // uniform radius puts far more cubes per cubic metre near the head,
        // which reads as a ball around you instead of as a field you are in.
        const direction = new THREE.Vector3(
            random() * 2 - 1,
            random() * 2 - 1,
            random() * 2 - 1
        )
        if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1)
        direction.normalize()

        const radius = INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * Math.cbrt(random())
        const position = direction.multiplyScalar(radius)

        // Which way this one travels. Axis-aligned: the cubes are axis-aligned
        // themselves at rest, and a field of boxes sliding along their own edges
        // reads as machine motion where free directions read as drifting dust.
        const axis = Math.floor(random() * 3)
        const sign = random() < 0.5 ? -1 : 1

        // Keep the travel line out of the viewer's head. For an axis-aligned
        // line the distance from the origin is just the length of the other two
        // components, so pushing those two out is exact rather than a guess —
        // no cube can reach the middle of the room at any point in its run.
        const others = [0, 1, 2].filter((component) => component !== axis)
        const lateral = Math.hypot(position.getComponent(others[0]), position.getComponent(others[1]))
        if (lateral < SAFE_RADIUS) {
            const push = SAFE_RADIUS / Math.max(lateral, 1e-4)
            others.forEach((component) => {
                position.setComponent(component, position.getComponent(component) * push)
            })
        }

        const anchor = random() < ANCHOR_CHANCE
        const size = anchor
            ? ANCHOR_SIZE_MIN + random() * (ANCHOR_SIZE_MAX - ANCHOR_SIZE_MIN)
            : SIZE_MIN + random() * (SIZE_MAX - SIZE_MIN)

        const spinAxis = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1)
        if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0, 1, 0)
        spinAxis.normalize()

        cubes.push({
            position,
            axis,
            sign,
            size,
            speed: SPEED_MIN + random() * (SPEED_MAX - SPEED_MIN),
            // The noise. Anchors are exempt — see the note above BLINK_HZ_MIN.
            blinks: !anchor,
            blinkHz: BLINK_HZ_MIN + random() * (BLINK_HZ_MAX - BLINK_HZ_MIN),
            // Offsets the tick as well as the phase, so two cubes that happen to
            // share a rate still change on different frames.
            blinkOffset: random() * 100,
            // Phase, so the field is mid-run the moment it appears. Without it
            // every cube starts and ends its segment together and the whole
            // field pulses on one clock — the exact machine tick this pass is
            // supposed to have got rid of.
            phase: random(),
            spinAxis,
            spinSpeed: SPIN_MIN + random() * (SPIN_MAX - SPIN_MIN),
            spinOffset: random() * Math.PI * 2,
            // When this cube arrives during the emergence. Staggered, so the
            // field assembles out of the tunnel's blackout cube by cube instead
            // of the whole thing being turned up at once.
            birth: random() * 0.7,
            // Fixed at build time from the resting radius. The drift is metres
            // and the radius is tens of metres, so recomputing it per frame
            // would cost 260 square roots to change nothing visible.
            value: THREE.MathUtils.lerp(
                NEAR_VALUE,
                FAR_VALUE,
                THREE.MathUtils.clamp((radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS), 0, 1)
            )
        })
    }

    return cubes
}

/**
 * The glyph plates, as ONE geometry.
 *
 * Merged by hand rather than instanced, because each plate needs its own UV
 * rect — it points at one cell of the atlas — and per-instance UVs are the thing
 * InstancedMesh cannot give you without a custom shader. Four vertices and six
 * indices apiece is a tiny buffer, built once at mount, and the whole field is a
 * single draw call either way.
 *
 * Brightness lives in a vertex-colour attribute so the blink can be written per
 * plate from the frame loop: four floats to switch a plate off, against a custom
 * shader or 150 materials for the alternatives.
 */
const createPlates = () => {
    const random = createRandom(PLATE_SEED)

    const positions = new Float32Array(PLATE_COUNT * 4 * 3)
    const uvs = new Float32Array(PLATE_COUNT * 4 * 2)
    const colors = new Float32Array(PLATE_COUNT * 4 * 3)
    const indices = new Uint16Array(PLATE_COUNT * 6)
    const plates = []

    const centre = new THREE.Vector3()
    const facing = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const reference = new THREE.Vector3()
    const corner = new THREE.Vector3()

    for (let index = 0; index < PLATE_COUNT; index++) {
        const direction = new THREE.Vector3(
            random() * 2 - 1,
            random() * 2 - 1,
            random() * 2 - 1
        )
        if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1)
        direction.normalize()

        // Cube root for the same reason as the cubes: uniform radius crowds the
        // plates against the inner shell and the room reads as a ball of type
        // around your head rather than as type going away from you.
        const radius = PLATE_INNER_RADIUS
            + (PLATE_OUTER_RADIUS - PLATE_INNER_RADIUS) * Math.cbrt(random())
        centre.copy(direction).multiplyScalar(radius)

        // Face the standpoint. The cross-product basis needs a reference that is
        // not parallel to the facing direction — straight up fails for a plate
        // directly overhead, which is exactly where a visitor looks first.
        facing.copy(direction).negate()
        reference.set(0, 1, 0)
        if (Math.abs(facing.y) > 0.94) reference.set(0, 0, 1)
        right.crossVectors(reference, facing).normalize()
        up.crossVectors(facing, right).normalize()

        const height = PLATE_SIZE_MIN + random() * (PLATE_SIZE_MAX - PLATE_SIZE_MIN)
        const halfUp = height * 0.5
        const halfRight = height * PLATE_ASPECT * 0.5

        // Corners in reading order: bottom-left, bottom-right, top-right,
        // top-left, matching the UV rect below.
        const [u0, v0, u1, v1] = cellUv(Math.floor(random() * ATLAS_CELLS * ATLAS_CELLS))
        const cornerSigns = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
        const cornerUvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]

        for (let vertex = 0; vertex < 4; vertex++) {
            const [signRight, signUp] = cornerSigns[vertex]
            corner.copy(centre)
                .addScaledVector(right, signRight * halfRight)
                .addScaledVector(up, signUp * halfUp)

            const base = (index * 4 + vertex) * 3
            positions[base] = corner.x
            positions[base + 1] = corner.y
            positions[base + 2] = corner.z

            const uvBase = (index * 4 + vertex) * 2
            uvs[uvBase] = cornerUvs[vertex][0]
            uvs[uvBase + 1] = cornerUvs[vertex][1]
        }

        const first = index * 4
        const indexBase = index * 6
        indices[indexBase] = first
        indices[indexBase + 1] = first + 1
        indices[indexBase + 2] = first + 2
        indices[indexBase + 3] = first
        indices[indexBase + 4] = first + 2
        indices[indexBase + 5] = first + 3

        plates.push({
            blinkHz: PLATE_BLINK_HZ_MIN + random() * (PLATE_BLINK_HZ_MAX - PLATE_BLINK_HZ_MIN),
            blinkOffset: random() * 100,
            // Dimmer with distance, on the same reasoning as the cubes' depth
            // tint: these are unfogged, so nothing else would tell you how far
            // away a plate is except how big it is.
            value: PLATE_VALUE * THREE.MathUtils.lerp(
                1,
                0.3,
                THREE.MathUtils.clamp(
                    (radius - PLATE_INNER_RADIUS) / (PLATE_OUTER_RADIUS - PLATE_INNER_RADIUS),
                    0,
                    1
                )
            ),
            // Staggered arrival, like the cubes: the type resolves out of the
            // tunnel's blackout rather than being switched on as a block.
            birth: random() * 0.7
        })
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    return { geometry, plates }
}

export default function DataField({ progress }) {
    const meshRef = useRef(null)
    const platesRef = useRef(null)

    const geometry = useMemo(() => createCubeGeometry(), [])
    const cubes = useMemo(() => createCubes(), [])
    const atlas = useMemo(() => glyphAtlas(), [])
    const { geometry: plateGeometry, plates } = useMemo(() => createPlates(), [])

    // Scratch objects, allocated once. Composing a matrix per cube per frame is
    // 260 × 72Hz calls; allocating a Matrix4 and a Quaternion inside that is how
    // a scene ends up spending its frame budget in the garbage collector.
    const scratch = useMemo(() => ({
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3(),
        color: new THREE.Color()
    }), [])

    // Depth tint, written once. Per-instance colour never changes here, so
    // pushing it every frame would be an upload of 260 colours to say nothing.
    useEffect(() => {
        const mesh = meshRef.current
        if (!mesh) return
        cubes.forEach((cube, index) => {
            scratch.color.setScalar(cube.value).convertSRGBToLinear()
            mesh.setColorAt(index, scratch.color)
        })
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }, [cubes, scratch])

    // Everything animated is driven from here rather than from the render body:
    // the clock runs per FRAME and `progress` arrives per RENDER, and those are
    // not the same rate. R3F re-binds this callback after every render, so the
    // closure sees the current `progress` without a ref to carry it across.
    useFrame(({ clock }) => {
        const mesh = meshRef.current
        if (!mesh) return

        const local = progress
        if (local === null) return

        const time = clock.getElapsedTime()

        // Delayed, NOT a plain fade from zero. Sequence 01 ends on a true
        // blackout and the two windows overlap by design, so a field that starts
        // lifting at local progress 0 is already visible behind the tunnel's
        // dark and the blackout never actually happens. It has to emerge FROM
        // the black.
        const emergence = smoothstep(0.15, 0.42, local)
        const envelope = smoothstep(0.02, 0.2, local) * smoothstep(1.0, 0.86, local)

        mesh.material.opacity = envelope

        // The glyph plates. Nothing here moves — only the brightness of each
        // plate changes — so this writes four vertex colours per plate and
        // touches no geometry.
        const plateMesh = platesRef.current
        if (plateMesh) {
            const plateColor = plateMesh.geometry.attributes.color
            for (let index = 0; index < plates.length; index++) {
                const plate = plates[index]
                // Offset index so a plate never ticks in lockstep with the cube
                // that happens to share its number — two fields blinking on the
                // same hash would visibly correlate.
                const tick = Math.floor(time * plate.blinkHz + plate.blinkOffset)
                const on = hashStep(index + PLATE_HASH_OFFSET, tick) < PLATE_BLINK_DUTY
                const value = on
                    ? plate.value * smoothstep(plate.birth, plate.birth + 0.3, emergence)
                    : 0
                for (let vertex = 0; vertex < 4; vertex++) {
                    plateColor.setXYZ(index * 4 + vertex, value, value, value)
                }
            }
            plateColor.needsUpdate = true
            plateMesh.material.opacity = envelope
        }

        for (let index = 0; index < cubes.length; index++) {
            const cube = cubes[index]

            // Position on its segment. fract of (time × speed) keeps the run
            // periodic, so nothing accumulates and the field cannot slowly
            // empty itself over a long rehearsal.
            const cycle = (time * cube.speed / SPAN + cube.phase) % 1
            const travel = (cycle - 0.5) * SPAN * cube.sign

            scratch.position.copy(cube.position)
            scratch.position.setComponent(
                cube.axis,
                scratch.position.getComponent(cube.axis) + travel
            )

            // Born and dying at the ends of its own run. A cube that simply
            // wrapped would pop out of existence at one end of the segment and
            // into it at the other, and a pop is the loudest event in a quiet
            // scene — the eye finds it immediately and then waits for the next
            // one. Scaling to nothing at both ends means the arrival and the
            // departure are the same gesture, and the loop is invisible.
            const ends = smoothstep(0.0, 0.16, cycle) * smoothstep(1.0, 0.84, cycle)

            // The noise. A hash of (index, tick) — see hashStep. Hard on/off
            // rather than a fade, because the subject is data being rewritten
            // and a value that eases between states is a dimmer, not a bit.
            const blink = cube.blinks
                ? (hashStep(index, Math.floor(time * cube.blinkHz + cube.blinkOffset)) < BLINK_DUTY ? 1 : 0)
                : 1

            // Scale carries every fade in this sequence, not opacity. Per-
            // instance opacity would need a custom shader, and a thousand
            // transparent boxes at a thousand depths is a sort order the
            // renderer has to guess at every frame — in stereo, guessing
            // differently for each eye.
            const scale = cube.size * ends * blink
                * smoothstep(cube.birth, cube.birth + 0.3, emergence)

            if (scale <= 0.0001) {
                // Zero scale rather than a skip: the previous frame's matrix is
                // still in the buffer, so a cube that is not written is a cube
                // frozen in place at full size.
                scratch.scale.setScalar(0)
                scratch.quaternion.identity()
            } else {
                scratch.scale.setScalar(scale)
                scratch.quaternion.setFromAxisAngle(
                    cube.spinAxis,
                    cube.spinOffset + time * cube.spinSpeed
                )
            }

            scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale)
            mesh.setMatrixAt(index, scratch.matrix)
        }

        mesh.instanceMatrix.needsUpdate = true
    })

    if (progress === null) return null

    return (
        <group position={[0, 1.6, 0]}>
            <instancedMesh
                ref={meshRef}
                args={[geometry, undefined, CUBE_COUNT]}
                // An InstancedMesh takes its bounding sphere from the GEOMETRY,
                // which here is a 1m box at the origin — so the whole field gets
                // culled the moment the middle of the room leaves the frustum,
                // i.e. as soon as anybody looks slightly up. 260 boxes is far
                // too cheap to be worth culling anyway.
                frustumCulled={false}
            >
                <meshBasicMaterial
                    color={DATA_WHITE}
                    // The per-face tones and the per-cube depth tint both live
                    // in colour attributes; this is what switches them on.
                    vertexColors
                    transparent
                    opacity={0}
                    // No fog and no tone mapping. Fog would mix the white toward
                    // the world colour and flatten the depth tint that replaces
                    // it; tone mapping rolls the highlight off so the white stops
                    // being maximum.
                    fog={false}
                    toneMapped={false}
                />
            </instancedMesh>

            {/* The glyph plates — the code, as characters, at every depth.

                ADDITIVE and depthWrite off. Both follow from what these are: not
                surfaces but marks of light, so where two cross in depth they
                should sum rather than one of them winning. It also sidesteps
                transparency sorting entirely, which in stereo is sorted per eye
                and is where a field of transparent quads normally starts
                flickering.

                DoubleSide because a plate is oriented at build time and the
                visitor can turn all the way round — a single-sided quad seen
                from behind is simply not there, and half the field would vanish
                as they turned.

                One geometry, one material, one draw call. See createPlates. */}
            <mesh ref={platesRef} geometry={plateGeometry} frustumCulled={false}>
                <meshBasicMaterial
                    map={atlas}
                    color={DATA_WHITE}
                    // Per-plate brightness and the blink both ride this.
                    vertexColors
                    transparent
                    opacity={0}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    fog={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    )
}
