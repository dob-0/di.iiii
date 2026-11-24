// Game-style collision for the first-person walker: it must not walk or fly through walls,
// columns, machines, the roof or the floor, and it slides along what it hits.
//
// The method is three-mesh-bvh's character controller: the walker is a capsule (a segment plus
// a radius), the building is one merged static geometry with a BVH, and every frame the capsule
// is pushed out of every triangle it overlaps, along the closest-point direction. Pushing along
// that direction (not stopping) is what makes sliding free: the component of the move that goes
// into the wall is removed, the tangent component stays.
//
// Walking adds a ground ray (gravity onto the floor, a step up of at most STEP_HEIGHT) and a
// lifted capsule, so a riser edge lower than a step is not an obstacle but a wall is.
// Flying is the same capsule in 3D with no gravity.
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export const CAPSULE_RADIUS = 0.3
export const STEP_HEIGHT = 0.4
export const GRAVITY = 22
// a mesh whose biggest side is under this is a fixture body, a lamp, a prop: not architecture
const MIN_MESH_SIZE = 0.9
// below this a collider is "a table", not a building: no outer box
const BOX_MIN_SPAN = 10
const MAX_SUBSTEP = 0.15

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _box = new THREE.Box3()
const _seg = new THREE.Line3()
const _ray = new THREE.Ray()
const _bb = new THREE.Box3()
const _m = new THREE.Matrix4()

// Which meshes are the building. Exported for the sake of the unit test.
export function isSolidMesh(o) {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return false
    if (o.name === 'night-outside' || o.userData?.noCollide) return false
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
        if (!m) return false
        if (m.visible === false) return false
        // beam hulls, fog volumes, glows, reflection helpers: ShaderMaterial / transparent / additive
        if (m.isShaderMaterial || m.isRawShaderMaterial) return false
        if (m.transparent || m.blending === THREE.AdditiveBlending) return false
    }
    const pos = o.geometry?.attributes?.position
    return !!pos && pos.count >= 3
}

// Walks the scene and returns { sig, meshes } where sig changes whenever the set of solid meshes
// does (a room switch, a model arriving late).
export function collectSolids(scene) {
    const meshes = []
    scene.updateWorldMatrix(true, true)
    scene.traverseVisible((o) => {
        if (!isSolidMesh(o)) return
        const g = o.geometry
        if (!g.boundingBox) g.computeBoundingBox()
        _bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld)
        const sx = _bb.max.x - _bb.min.x
        const sy = _bb.max.y - _bb.min.y
        const sz = _bb.max.z - _bb.min.z
        if (Math.max(sx, sy, sz) < MIN_MESH_SIZE) return
        meshes.push(o)
    })
    let sig = ''
    for (const o of meshes) sig += o.id + ','
    return { sig, meshes }
}

// One merged static geometry (world space) + its BVH. null when there is no building.
export function buildCollider(meshes) {
    if (!meshes.length) return null
    let vCount = 0
    let iCount = 0
    for (const o of meshes) {
        const g = o.geometry
        vCount += g.attributes.position.count
        iCount += g.index ? g.index.count : g.attributes.position.count
    }
    const pos = new Float32Array(vCount * 3)
    const idx = new Uint32Array(iCount)
    let vo = 0
    let io = 0
    for (const o of meshes) {
        const g = o.geometry
        const p = g.attributes.position
        _m.copy(o.matrixWorld)
        for (let i = 0; i < p.count; i++) {
            _v.fromBufferAttribute(p, i).applyMatrix4(_m)
            pos[(vo + i) * 3] = _v.x
            pos[(vo + i) * 3 + 1] = _v.y
            pos[(vo + i) * 3 + 2] = _v.z
        }
        if (g.index) {
            for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo
            io += g.index.count
        } else {
            for (let i = 0; i < p.count; i++) idx[io + i] = vo + i
            io += p.count
        }
        vo += p.count
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setIndex(new THREE.BufferAttribute(idx, 1))
    geometry.computeBoundingBox()
    const bvh = new MeshBVH(geometry, { maxLeafTris: 8 })
    const box = geometry.boundingBox.clone()
    const span = Math.min(box.max.x - box.min.x, box.max.z - box.min.z)
    return { geometry, bvh, box, hasBox: span >= BOX_MIN_SPAN }
}

export function disposeCollider(c) {
    c?.geometry?.dispose?.()
}

// Push the capsule (segment start/end, radius) out of every triangle it overlaps. start and end
// move together. Returns true if anything pushed. A few iterations settle corners.
export function pushOutCapsule(bvh, start, end, radius, iterations = 3) {
    _seg.start = start
    _seg.end = end
    let pushedAny = false
    for (let it = 0; it < iterations; it++) {
        _box.makeEmpty()
        _box.expandByPoint(start)
        _box.expandByPoint(end)
        _box.min.addScalar(-radius)
        _box.max.addScalar(radius)
        let pushed = false
        bvh.shapecast({
            intersectsBounds: (b) => b.intersectsBox(_box),
            intersectsTriangle: (tri) => {
                const dist = tri.closestPointToSegment(_seg, _v, _w)
                if (dist < radius) {
                    const depth = radius - dist
                    _w.sub(_v)
                    if (_w.lengthSq() < 1e-12) return false
                    _w.normalize()
                    start.addScaledVector(_w, depth)
                    end.addScaledVector(_w, depth)
                    // the box follows the capsule so later triangles see where it now is
                    _box.min.addScaledVector(_w, depth)
                    _box.max.addScaledVector(_w, depth)
                    pushed = true
                }
                return false
            },
        })
        if (!pushed) break
        pushedAny = true
    }
    return pushedAny
}

const _down = new THREE.Vector3(0, -1, 0)
// Height of the floor under (x, z), looking down from `fromY`. null when there is none.
export function groundBelow(bvh, x, z, fromY) {
    _ray.origin.set(x, fromY, z)
    _ray.direction.copy(_down)
    const hit = bvh.raycastFirst(_ray, THREE.DoubleSide)
    return hit ? hit.point.y : null
}

// ---- the per-frame step -------------------------------------------------------------------
// state: { feetY, vy, grounded } is the walker's vertical state, kept by the caller between frames.
// Moves the player from (player.x, player.z) to (toX, toZ) with collision; fills player.x/z
// (and altY in fly) in place.

// Walking. eyeHeight is the standing eye height; the capsule runs from the lifted feet to the eye.
export function stepWalk(collider, state, player, toX, toZ, dt, eyeHeight) {
    const { bvh } = collider
    const dist = Math.hypot(toX - player.x, toZ - player.z)
    // substeps, so a slow frame cannot tunnel through a thin wall
    const n = Math.max(1, Math.min(8, Math.ceil(dist / MAX_SUBSTEP)))
    const footLift = STEP_HEIGHT + CAPSULE_RADIUS
    const start = _a
    const end = _b
    let x = player.x
    let z = player.z
    for (let i = n; i >= 1; i--) {
        start.set(x + (toX - x) / i, state.feetY + footLift, z + (toZ - z) / i)
        end.set(start.x, Math.max(state.feetY + eyeHeight, start.y + 0.05), start.z)
        pushOutCapsule(bvh, start, end, CAPSULE_RADIUS, 3)
        x = start.x
        z = start.z
    }
    return finishWalk(bvh, state, x, z, dt)
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

function finishWalk(bvh, state, x, z, dt) {
    // vertical: the ground under the walker, from just above a step
    const g = groundBelow(bvh, x, z, state.feetY + STEP_HEIGHT + 0.05)
    if (g !== null) {
        if (g >= state.feetY - 1e-4) {
            // a step (or level ground): snap up, the eye smooths it
            state.feetY = g
            state.vy = 0
            state.grounded = true
        } else {
            state.vy -= GRAVITY * dt
            const next = state.feetY + state.vy * dt
            if (next <= g) {
                state.feetY = g
                state.vy = 0
                state.grounded = true
            } else {
                state.feetY = next
                state.grounded = false
            }
        }
    }
    return { x, z }
}

// Flying: the capsule around the eye, in 3D, no gravity. Returns { x, y, z }.
// `from` is where the walker was last frame: the move is cut into small substeps so a slow frame
// cannot carry the capsule past a thin surface (inside a solid the push-out would go the wrong way).
export function stepFly(collider, from, toX, toY, toZ) {
    const dist = Math.hypot(toX - from.x, toY - from.y, toZ - from.z)
    const n = Math.max(1, Math.min(10, Math.ceil(dist / MAX_SUBSTEP)))
    let x = from.x
    let y = from.y
    let z = from.z
    const start = _a
    const end = _b
    for (let i = n; i >= 1; i--) {
        const cx = x + (toX - x) / i
        const cy = y + (toY - y) / i
        const cz = z + (toZ - z) / i
        start.set(cx, cy - 0.05, cz)
        end.set(cx, cy + 0.05, cz)
        pushOutCapsule(collider.bvh, start, end, CAPSULE_RADIUS, 3)
        x = start.x
        y = (start.y + end.y) / 2
        z = start.z
    }
    return { x, y, z }
}

// Closed-building backstop: openings (gates, missing walls) do not let the walker out.
export function clampToBox(collider, p, player0) {
    if (!collider.hasBox) return p
    const b = collider.box
    const r = CAPSULE_RADIUS
    // only when the walker is inside the box to begin with (a spawn outside is left alone)
    if (player0.x < b.min.x || player0.x > b.max.x || player0.z < b.min.z || player0.z > b.max.z) return p
    p.x = Math.min(Math.max(p.x, b.min.x + r), b.max.x - r)
    p.z = Math.min(Math.max(p.z, b.min.z + r), b.max.z - r)
    if (p.y !== undefined) p.y = Math.min(p.y, b.max.y - r)
    return p
}
