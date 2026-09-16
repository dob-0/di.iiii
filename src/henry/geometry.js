import * as THREE from 'three'

// Procedural geometry for the dream.
//
// Nothing here is loaded. Two reasons, and the second is the real one:
//
// 1. A downloaded model arrives with somebody else's style baked into its
//    silhouette, and the brief is that the references — not an asset store —
//    decide what things look like.
// 2. Every giant dream object has to survive being scaled to 1/35th of itself
//    at the reveal and still read as the ordinary thing it turns out to be.
//    That only works if the shapes were authored as one continuous family with
//    controllable proportions, which is what parametric surfaces give and what
//    a mesh from disk does not.
//
// Each builder returns a plain BufferGeometry, is deterministic given its
// arguments, and is meant to be built once and shared by instances.

/**
 * A parametric surface, sampled on a grid and indexed as triangles.
 * `fn(u, v, target)` writes a position for u,v in 0..1.
 */
const parametric = (fn, uSegments, vSegments) => {
    const positions = []
    const uvs = []
    const indices = []
    const point = new THREE.Vector3()

    for (let i = 0; i <= uSegments; i++) {
        const u = i / uSegments
        for (let j = 0; j <= vSegments; j++) {
            const v = j / vSegments
            fn(u, v, point)
            positions.push(point.x, point.y, point.z)
            uvs.push(v, u)
        }
    }

    const stride = vSegments + 1
    for (let i = 0; i < uSegments; i++) {
        for (let j = 0; j < vSegments; j++) {
            const a = i * stride + j
            const b = a + stride
            indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
}

/**
 * A lily petal, growing up +Y from the origin and curling back over +Z.
 *
 * The proportions come from reference 5: long, narrow, sharply pointed, and
 * bent far enough back that a petal read edge-on still shows its full length.
 * `cup` is the shallow trough down the middle — without it a petal catches
 * light as a flat card and the flower dies on screen.
 */
export const makePetalGeometry = ({
    length = 1,
    width = 0.26,
    bend = 1.15,
    cup = 0.32,
    tip = 0.62,
    uSegments = 14,
    vSegments = 5
} = {}) =>
    parametric(
        (u, v, target) => {
            // Pointed at the tip, narrow at the base, widest around a third of
            // the way up. `tip` below 1 sharpens the point.
            const halfWidth = Math.sin(Math.PI * Math.pow(u, tip)) * width
            const angle = bend * u * u
            const across = (v - 0.5) * 2
            target.set(
                across * halfWidth,
                Math.cos(angle) * u * length,
                Math.sin(angle) * u * length + cup * across * across * halfWidth
            )
        },
        uSegments,
        vSegments
    )

/**
 * A broad leaf on the same construction, plus a midrib fold. The fold is what
 * keeps an enormous leaf from reading as a painted plane when the girl walks
 * underneath it — at her scale you are looking at the underside most of the
 * time, and a plane has no underside.
 */
export const makeLeafGeometry = ({
    length = 1,
    width = 0.42,
    bend = 0.75,
    fold = 0.14,
    uSegments = 12,
    vSegments = 6
} = {}) =>
    parametric(
        (u, v, target) => {
            const halfWidth = Math.sin(Math.PI * Math.pow(u, 0.85)) * width
            const angle = bend * u * u
            const across = (v - 0.5) * 2
            const drop = fold * Math.abs(across) * length
            target.set(
                across * halfWidth,
                Math.cos(angle) * u * length - drop,
                Math.sin(angle) * u * length
            )
        },
        uSegments,
        vSegments
    )

// Deterministic value hash. A seeded wobble has to be the same on every
// reload, or the composition the beats were framed against moves under them.
const hash3 = (x, y, z, seed) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 43.3) * 43758.5453
    return s - Math.floor(s)
}

/**
 * A soft irregular blob: the bear's head and body, the tree canopy, the rock.
 *
 * An icosphere pushed around by a deterministic hash. Detail stays low on
 * purpose — the references are made of few, large, confident shapes, and
 * subdividing this is the fastest way to turn a storybook silhouette into a
 * generic organic lump.
 */
export const makeBlobGeometry = ({ radius = 1, detail = 3, wobble = 0.12, seed = 1 } = {}) => {
    const geometry = new THREE.IcosahedronGeometry(radius, detail)
    const position = geometry.attributes.position
    const vector = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
        vector.fromBufferAttribute(position, i)
        const n = hash3(vector.x, vector.y, vector.z, seed) - 0.5
        // Squash slightly on Y as well: nothing in the references is a sphere,
        // everything sits under its own weight.
        vector.multiplyScalar(1 + n * wobble)
        vector.y *= 0.94
        position.setXYZ(i, vector.x, vector.y, vector.z)
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    return geometry
}

/**
 * A cone with a curved axis — a tooth, a stamen, a deer ear, a grass blade.
 * One builder covers all four because in the references they are all the same
 * gesture at different sizes.
 */
export const makeTaperGeometry = ({
    length = 1,
    radius = 0.1,
    bend = 0.2,
    tipRadius = 0.0,
    uSegments = 8,
    vSegments = 7
} = {}) =>
    parametric(
        (u, v, target) => {
            const r = radius + (tipRadius - radius) * u
            const angle = v * Math.PI * 2
            const lean = bend * u * u
            target.set(
                Math.cos(angle) * r + Math.sin(lean) * length * 0,
                Math.cos(lean) * u * length,
                Math.sin(angle) * r + Math.sin(lean) * u * length
            )
        },
        uSegments,
        vSegments
    )
