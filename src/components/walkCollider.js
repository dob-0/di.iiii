// Solid rooms for the walker: walls, pillars, booths and barriers block the
// body; portals, lights, text and light effects do not.
//
// Method: the three-mesh-bvh character controller (gkjohnson/three-mesh-bvh,
// example/characterMovement.js). The room's static meshes are merged in world
// space (StaticGeometryGenerator) into one BVH; each fixed tick the body is a
// capsule pushed out of every triangle closer than its radius, and a few short
// rays down find the ground under the feet. Steps up to STEP_HEIGHT are walked
// onto (the capsule starts above them); anything taller blocks.
//
// Owner's call 2026-09-28: "yes make walls and booth solid, portals pass through".

import * as THREE from 'three'
import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh'
import { WALK_BODY_RADIUS, WALK_BODY_HEIGHT, WALK_STEP_HEIGHT, FLY_BODY_RADIUS } from './walkModeConfig.js'

// Entity types the body passes through. Everything else is solid unless the
// entity says `components.collision.enabled === false`.
const PASS_THROUGH_TYPES = new Set([
    'portal',              // doors between rooms: walking into one is how you use it
    'pointLight', 'spotLight', 'directionalLight', 'ambientLight',
    'text', 'audio', 'ring',
])

export function entityCollides(entity) {
    if (!entity) return false
    const authored = entity.components?.collision?.enabled
    if (authored === false) return false
    if (authored === true) return true
    return !PASS_THROUGH_TYPES.has(entity.type)
}

// A mesh inside a solid entity can still be light, not matter: additive beams,
// baked light pools, glows. Those draw without writing depth.
function meshIsMatter(mesh) {
    if (!mesh.isMesh || mesh.isInstancedMesh) return false
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    return mats.some((m) => m && m.visible !== false && m.depthWrite !== false &&
        m.blending !== THREE.AdditiveBlending && (m.opacity ?? 1) > 0.02)
}

export function collectColliderMeshes(root) {
    const out = []
    if (!root) return out
    const visit = (obj) => {
        if (obj.visible === false) return
        if (obj.userData?.walkCollide === false) return
        if (meshIsMatter(obj) && obj.geometry?.attributes?.position) out.push(obj)
        for (const child of obj.children) visit(child)
    }
    visit(root)
    return out
}

// Cheap fingerprint: rebuild only when meshes appear/disappear (models load late).
export function colliderSignature(meshes) {
    let s = `${meshes.length}`
    for (const m of meshes) s += `|${m.geometry.uuid}`
    return s
}

export function buildWalkCollider(root) {
    root?.updateMatrixWorld(true)
    const meshes = collectColliderMeshes(root)
    const signature = colliderSignature(meshes)
    if (!meshes.length) return { bvh: null, signature, triangles: 0 }
    const generator = new StaticGeometryGenerator(meshes)
    generator.attributes = ['position']
    const geometry = generator.generate()
    const bvh = new MeshBVH(geometry)
    return { bvh, signature, triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3 }
}

const _ray = new THREE.Ray()
const _down = new THREE.Vector3(0, -1, 0)
const _seg = new THREE.Line3()
const _box = new THREE.Box3()
const _tri = new THREE.Vector3()
const _cap = new THREE.Vector3()
const _dir = new THREE.Vector3()
const FOOT_OFFSETS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Highest ground under the body's footprint that is at most `stepHeight`
 * above the feet. null when there is nothing below (the grid's y = 0 then).
 */
export function groundBelow(collider, x, z, feetY, { radius = WALK_BODY_RADIUS, stepHeight = WALK_STEP_HEIGHT } = {}) {
    const bvh = collider?.bvh
    if (!bvh) return null
    let best = null
    const r = radius * 0.7
    for (const [ox, oz] of FOOT_OFFSETS) {
        _ray.origin.set(x + ox * r, feetY + stepHeight, z + oz * r)
        _ray.direction.copy(_down)
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide)
        if (hit && (best === null || hit.point.y > best)) best = hit.point.y
    }
    return best
}

function pushOut(bvh, segment, radius, horizontalOnly) {
    let pushed = false
    _box.makeEmpty()
    _box.expandByPoint(segment.start)
    _box.expandByPoint(segment.end)
    _box.min.addScalar(-radius)
    _box.max.addScalar(radius)
    bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
            const distance = tri.closestPointToSegment(segment, _tri, _cap)
            if (distance >= radius) return
            _dir.subVectors(_cap, _tri)
            if (horizontalOnly) _dir.y = 0
            const len = _dir.length()
            if (len < 1e-6) return
            _dir.multiplyScalar((radius - distance) / len)
            segment.start.add(_dir)
            segment.end.add(_dir)
            pushed = true
        },
    })
    return pushed
}

/**
 * Walking body: a capsule from the step height to the top of the head.
 * Pushes out horizontally only, so floors and ceilings never shove it.
 */
export function resolveWalkBody(collider, x, feetY, z, {
    radius = WALK_BODY_RADIUS, height = WALK_BODY_HEIGHT, stepHeight = WALK_STEP_HEIGHT,
} = {}) {
    const bvh = collider?.bvh
    if (!bvh) return { x, z, pushed: false }
    _seg.start.set(x, feetY + stepHeight + radius, z)
    _seg.end.set(x, feetY + Math.max(stepHeight + radius, height - radius), z)
    const pushed = pushOut(bvh, _seg, radius, true)
    return { x: _seg.start.x, z: _seg.start.z, pushed }
}

/** Flying camera: a sphere at the eye, pushed out in all three axes. */
export function resolveFlyBody(collider, x, y, z, { radius = FLY_BODY_RADIUS } = {}) {
    const bvh = collider?.bvh
    if (!bvh) return { x, y, z, pushed: false }
    _seg.start.set(x, y, z)
    _seg.end.set(x, y, z)
    const pushed = pushOut(bvh, _seg, radius, false)
    return { x: _seg.start.x, y: _seg.start.y, z: _seg.start.z, pushed }
}
