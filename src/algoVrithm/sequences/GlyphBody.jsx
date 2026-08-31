import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { DATA_WHITE } from '../palette.js'

// Sequence 06 — the body.
//
// The end of the argument. Sequence 02 is code as noise, 03 is code measured,
// 04 is code assembled into an image — and this is code taking a form that
// looks back at you. "Pixels and code becoming reality", literally: the data in
// the room condenses into a standing figure at conversational distance and then
// will not quite hold still.
//
// It is the one moment in the piece with a subject in it. Everything before is
// space, light and material; a human silhouette is the only thing in 30 seconds
// that the visitor is going to read as SOMEONE, and it arrives last on purpose.
//
// THE FIGURE NEVER RESOLVES. Every mark keeps a small jitter after it lands, so
// the body is permanently on the edge of being a body — it is made of data and
// the data has not stopped being data. A figure that settled into a clean
// silhouette would be a statue, and the piece would be about sculpture.
//
// NO MODEL FILE. The form is sampled from a handful of capsules, which is a
// deliberate constraint rather than a shortcut: a scanned or downloaded body
// would carry someone else's likeness into an exhibited work, which is the same
// rights problem that ruled out scraped footage for sequences 04 and 05.

// ---- comfort ---------------------------------------------------------------
//
// The marks converge on a point in FRONT of the visitor, which means most of
// them travel past them to get there. Two rules keep that safe.
//
// Every path is bowed OUTWARD (see the control point below), so nothing takes
// the straight line through the standpoint that a plain lerp would give it.
// And the flight is inward-converging rather than a coherent flow across the
// visual field: the marks are moving toward each other, not all one way, so
// there is no direction the vestibular system can read as self-motion. Same
// argument as the incoherent drift in DataField.jsx, reached from the opposite
// end.

const MARK_COUNT = 900

// Where the figure stands. Facing the visitor, a little over three metres away
// — inside conversational distance, outside the range where a person in VR
// feels crowded. Standing on the floor rather than floating: the sequence's
// whole claim is that the data became REAL, and real things have feet on the
// ground.
const BODY_DISTANCE = -3.4

// Mark size. Small enough that the silhouette reads as a surface rather than as
// a pile of boxes, large enough to still be a square rather than a point at
// this distance.
const MARK_SIZE_MIN = 0.014
const MARK_SIZE_MAX = 0.032

// Where the marks come from: the same shell the data field occupied, so this
// reads as the room's own material collecting rather than as something new
// arriving from off-stage.
const SOURCE_INNER = 5
const SOURCE_OUTER = 16

// How far each path bows away from the standpoint at its midpoint. This is the
// number that keeps 900 objects out of the visitor's face.
const PATH_BOW = 2.6

// The flight. Marks leave on staggered delays and each takes this long, so the
// body accretes over most of the sequence instead of snapping together.
const FLIGHT_SPAN = 0.42
const FLIGHT_LAST_DEPARTURE = 0.5

// The jitter that never stops. Metres, and tiny — at this scale it is the
// difference between a surface that is alive and one that is finished.
const JITTER = 0.006
const JITTER_HZ_MIN = 0.7
const JITTER_HZ_MAX = 3.4

// Shading. The marks are unlit, so the figure's form has to be baked into their
// values at build time from the surface normal each one was sampled on.
// Otherwise 900 identical white squares in the shape of a person render as a
// flat white person-shaped hole — the same failure the data field's per-face
// tones exist to prevent, one level up.
const KEY_DIRECTION = new THREE.Vector3(0.35, 0.65, 0.7).normalize()
const SHADE_FLOOR = 0.22
const SHADE_RANGE = 0.78

const BODY_SEED = 20260733

/**
 * The figure, as capsules. Origin at the feet, facing +Z — toward the viewer.
 *
 * Proportions are a standing adult at BODY_HEIGHT, arms at the sides. Nothing
 * here is posed: a gesture would read as a character doing something, and the
 * figure is meant to be a presence rather than a performance.
 */
const SEGMENTS = [
    // [x0, y0, z0, x1, y1, z1, radius]
    [0, 1.52, 0, 0, 1.72, 0, 0.105],   // head
    [0, 1.44, 0, 0, 1.53, 0, 0.048],   // neck
    [0, 1.02, 0, 0, 1.44, 0, 0.165],   // chest
    [0, 0.90, 0, 0, 1.03, 0, 0.145],   // hips
    [-0.18, 1.38, 0, -0.29, 1.10, 0, 0.052],  // upper arm, left
    [-0.29, 1.10, 0, -0.33, 0.82, 0, 0.042],  // forearm, left
    [0.18, 1.38, 0, 0.29, 1.10, 0, 0.052],    // upper arm, right
    [0.29, 1.10, 0, 0.33, 0.82, 0, 0.042],    // forearm, right
    [-0.09, 0.90, 0, -0.11, 0.48, 0, 0.082],  // thigh, left
    [-0.11, 0.48, 0, -0.11, 0.05, 0, 0.055],  // shin, left
    [0.09, 0.90, 0, 0.11, 0.48, 0, 0.082],    // thigh, right
    [0.11, 0.48, 0, 0.11, 0.05, 0, 0.055]     // shin, right
]

/**
 * A point on the surface of one capsule, with the outward normal it sat on.
 *
 * Sampled on the SURFACE rather than through the volume: 900 marks spread
 * through a solid body is a sparse cloud you can see the far side of, where the
 * same count on the skin is a silhouette. The figure is a shell, which is all
 * anybody can see of a person anyway.
 */
const sampleSegment = (segment, random, position, normal) => {
    const [x0, y0, z0, x1, y1, z1, radius] = segment

    const t = random()
    position.set(
        THREE.MathUtils.lerp(x0, x1, t),
        THREE.MathUtils.lerp(y0, y1, t),
        THREE.MathUtils.lerp(z0, z1, t)
    )

    // The ring around the axis at this point. The capsules are near-vertical, so
    // the axis is approximated as up for the purpose of building the ring —
    // exact enough at these angles, and it keeps the sampler to two trig calls.
    const angle = random() * Math.PI * 2
    normal.set(Math.sin(angle), 0, Math.cos(angle))

    // Chests and hips are not cylinders. Flattening front-to-back turns the
    // torso capsule into something with shoulders and a back, which is most of
    // what makes a silhouette read as a person rather than as a snowman. Only
    // the thick segments get it — a flattened forearm is a plank.
    const flatten = radius > 0.12 ? 0.62 : 1
    position.x += normal.x * radius
    position.z += normal.z * radius * flatten

    return position
}

const createMarks = () => {
    const random = createRandom(BODY_SEED)
    const marks = []

    // Sampling weighted by surface area (radius × length) so the head does not
    // end up with the same number of marks as the chest — an evenly-weighted
    // pick over twelve segments builds a figure with a very bright face and a
    // transparent torso.
    const weights = SEGMENTS.map(([x0, y0, z0, x1, y1, z1, radius]) => {
        const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
        return radius * (length + radius)
    })
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

    const position = new THREE.Vector3()
    const normal = new THREE.Vector3()

    for (let index = 0; index < MARK_COUNT; index++) {
        let pick = random() * totalWeight
        let segment = 0
        while (segment < weights.length - 1 && pick > weights[segment]) {
            pick -= weights[segment]
            segment++
        }

        sampleSegment(SEGMENTS[segment], random, position, normal)

        const target = new THREE.Vector3(
            position.x,
            position.y,
            position.z + BODY_DISTANCE
        )

        // Where it comes from. Anywhere in the shell the data field filled.
        const direction = new THREE.Vector3(
            random() * 2 - 1,
            random() * 2 - 1,
            random() * 2 - 1
        )
        if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1)
        direction.normalize()
        const origin = direction.multiplyScalar(
            SOURCE_INNER + (SOURCE_OUTER - SOURCE_INNER) * Math.cbrt(random())
        )
        origin.y = Math.max(0.2, origin.y + 1.2)

        // The bow. Midpoint of the straight line, pushed away from the
        // standpoint — this is what turns a swarm passing through the visitor's
        // head into a swarm curving around it.
        const control = origin.clone().add(target).multiplyScalar(0.5)
        const outward = control.clone()
        outward.y = 0
        if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1)
        control.addScaledVector(outward.normalize(), PATH_BOW)

        marks.push({
            origin,
            control,
            target,
            size: MARK_SIZE_MIN + random() * (MARK_SIZE_MAX - MARK_SIZE_MIN),
            depart: random() * FLIGHT_LAST_DEPARTURE,
            // Baked shading — see KEY_DIRECTION.
            value: SHADE_FLOOR + SHADE_RANGE * Math.max(0, normal.dot(KEY_DIRECTION)),
            jitterHz: JITTER_HZ_MIN + random() * (JITTER_HZ_MAX - JITTER_HZ_MIN),
            jitterPhase: random() * Math.PI * 2,
            spin: random() * Math.PI * 2
        })
    }

    return marks
}

export default function GlyphBody({ progress }) {
    const meshRef = useRef(null)
    const marks = useMemo(() => createMarks(), [])

    const scratch = useMemo(() => ({
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        euler: new THREE.Euler(),
        scale: new THREE.Vector3(),
        color: new THREE.Color(),
        a: new THREE.Vector3(),
        b: new THREE.Vector3()
    }), [])

    // Per-mark shading, written once. It is baked from the surface normal and
    // never changes, so pushing it every frame would upload 900 colours to say
    // nothing.
    const colorsWritten = useRef(false)

    useFrame(({ clock }) => {
        const mesh = meshRef.current
        if (!mesh) return

        const local = progress
        if (local === null) return

        const time = clock.getElapsedTime()

        if (!colorsWritten.current) {
            marks.forEach((mark, index) => {
                scratch.color.setScalar(mark.value).convertSRGBToLinear()
                mesh.setColorAt(index, scratch.color)
            })
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
            colorsWritten.current = true
        }

        // No fade-out at the end. This is the last thing in the piece and the
        // veil's own bookend takes it away — fading the figure out as well would
        // dissolve it twice, and the second dissolve is the one nobody asked for.
        mesh.material.opacity = smoothstep(0.02, 0.14, local)

        for (let index = 0; index < marks.length; index++) {
            const mark = marks[index]

            // Where this mark is in its own flight, eased. Smoothstep is right
            // here in a way it is not for the viewer's own travel: these are
            // objects, and an object that accelerates and settles reads as
            // something arriving. Acceleration only causes sickness when it is
            // applied to the visitor.
            const flight = smoothstep(mark.depart, mark.depart + FLIGHT_SPAN, local)

            // Quadratic Bezier along origin → control → target. Two lerps, no
            // allocation, and the curve is what keeps the path out of the
            // visitor's head.
            scratch.a.lerpVectors(mark.origin, mark.control, flight)
            scratch.b.lerpVectors(mark.control, mark.target, flight)
            scratch.position.lerpVectors(scratch.a, scratch.b, flight)

            // The jitter that never stops, faded in with arrival so it is a
            // property of the body rather than of the flight.
            const shimmer = JITTER * flight
            scratch.position.x += Math.sin(time * mark.jitterHz + mark.jitterPhase) * shimmer
            scratch.position.y += Math.sin(time * mark.jitterHz * 1.31 + mark.jitterPhase) * shimmer
            scratch.position.z += Math.cos(time * mark.jitterHz * 0.83 + mark.jitterPhase) * shimmer

            // Marks arrive tumbling and end up axis-aligned. A field of boxes
            // all square to the world is a grid, and a grid is what this whole
            // sequence is supposed to be leaving behind — but a body of
            // permanently tumbling squares never reads as a surface. So the
            // rotation dies as it lands.
            const tumble = (1 - flight) * mark.spin * 3
            scratch.euler.set(tumble, tumble * 0.7, tumble * 1.3)
            scratch.quaternion.setFromEuler(scratch.euler)

            // In flight the marks are bigger — they are still loose data, and
            // data at that distance has to be visible. They shrink into the
            // body as they lock, which is also what stops the figure being a
            // pile of gravel.
            scratch.scale.setScalar(mark.size * (1 + (1 - flight) * 1.6))

            scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale)
            mesh.setMatrixAt(index, scratch.matrix)
        }

        mesh.instanceMatrix.needsUpdate = true
    })

    if (progress === null) return null

    return (
        // Floor-relative, unlike every other sequence in the piece, which hangs
        // its content around the eye at 1.6m. A standing figure is measured from
        // the ground up or it is a person floating at chest height.
        <group>
            <instancedMesh ref={meshRef} args={[undefined, undefined, MARK_COUNT]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial
                    color={DATA_WHITE}
                    transparent
                    opacity={0}
                    // NOT additive, alone among the late sequences. Additive
                    // marks sum where they overlap, and the far side of the body
                    // would add straight through the near side — the figure
                    // would be brightest exactly where it is deepest and would
                    // read as a glowing cloud. An opaque mark occludes the one
                    // behind it, which is what gives the silhouette an inside.
                    fog={false}
                    toneMapped={false}
                />
            </instancedMesh>
        </group>
    )
}
