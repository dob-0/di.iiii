// WHERE A BEAM STOPS — light ends at the first surface it meets (owner, 2026-10-13: "lights go out of the
// space - they must stay inside - fix the physics").
//
// Before, the room drew each beam to a STORED length (beam.length, else light.distance; epic-build gave a lamp
// with no measured throw 120 m) along the lamp's CURRENT aim. A look re-aims a lamp at run time, so a length that
// fit the old aim ran through the roof. Here the length is measured from the scene, along the axis the lamp
// points down NOW, against the building's own triangles (three-mesh-bvh where the mesh has one).
//
// Two halves:
//   1. pure maths, no scene: a ray against a box and against a plane, the first of several, and the length to
//      draw from a hit (or a miss). Tested in beamReach.test.js.
//   2. the cast against the building: its meshes are the ones under an entity group tagged `userData.svBuilding`
//      (both renderers tag the architecture entities, smartViewGeometry.isArchitectureEntity) or that Studio's
//      SmartView has given a role (`userData.svRole`, its bounds fallback included). Found once a second per
//      scene at most, not per lamp. The building's box also bounds the haze (hazeUniforms: uHazeBox*), so no
//      beam scatters light in the air outside it.
//
// Limits, stated: a laser's line and a spot's axis and rim are cast, not the cone's whole solid angle — a cone
// meeting two surfaces at once is cut by up to four planes (the flat cone) or by the haze box (the beam in air);
// the haze box is the building's axis-aligned box, so the air under a pitched roof's eaves counts as inside.
//
// STEEL (2026-10-14): meshes under an entity group tagged `userData.svSteel` (steelOccluder.js isSteelEntity: a truss or
// tower piece, or an entity flagged components.occluder 'steel') stop a beam like the building does, but are NOT part of
// the building: they never widen the haze box. A lamp's own mount never stops its own beam: a steel mesh whose box
// (grown by MOUNT_CLEARANCE) holds the lamp's lens is skipped for that lamp. Lamp bodies stop nothing.
import { Box3, DoubleSide, Matrix4, Plane, Ray, Raycaster, Vector3 } from 'three'
import { computeBoundsTree } from 'three-mesh-bvh'

const EPS = 1e-6

// A beam that meets nothing (a lamp outside the building, or aimed out of an open door) keeps its stored length,
// never more than this. 60 m is the longest throw the rig's own fixtures are drawn to by type (epic-build DIST tops
// out at 40 m) with margin; the old 120 m default is what the owner saw standing over the roof.
export const MISS_REACH_CAP = 60
// The surface is never nearer than this: the lens sits a few cm inside the lamp's own housing.
export const MIN_REACH = 0.05
// A drawn beam ends this far short of the surface it meets: its end cap ON the surface fights the surface for the
// depth test and shows through it from the other side (seen in the outside shot, 2026-10-13). 2 cm is under a pixel
// at any distance a beam is looked at from.
export const SURFACE_GAP = 0.02
// The spot light's own cutoff (three.js `distance`) is the farthest hit × this. three's distance is a window
// (1 − (d/D)⁴)², not a wall: at D = 2× the farthest hit the lit surface keeps ≥ 88 % of its inverse-square light,
// and nothing lights past twice the throw. Without shadows a lamp's light does not know the wall is there; this is
// how far it reaches past it.
export const LIGHT_REACH_FACTOR = 2
// A steel mesh whose box, grown by this much, holds a lamp's lens is that lamp's own mount (a lamp clamped to a truss, hung
// from a bridge) and is skipped for it. 0.25 m: past a 290 mm truss section (0.145 m half) and a clamp.
export const MOUNT_CLEARANCE = 0.25
// Rim rays: the axis plus this many around the cone's edge.
export const RIM_RAYS = 8
// A re-cast at most this often while a lamp moves (a moving look): 15 Hz.
export const RECAST_MS = 1000 / 15

// --------------------------------------------------------------------------------------------------------------
// 1. Pure maths.

/**
 * Distance along a ray (origin o, unit direction d) to the first face of an axis-aligned box it meets: the far
 * face when the ray starts inside (a beam inside the hall meets its walls from inside), the near face otherwise.
 * @returns {number|null} metres, or null for a miss
 */
export const rayBox = (o, d, box) => {
    let tmin = -Infinity
    let tmax = Infinity
    for (let k = 0; k < 3; k += 1) {
        const lo = box.min[k]
        const hi = box.max[k]
        if (Math.abs(d[k]) < EPS) {
            if (o[k] < lo || o[k] > hi) return null
            continue
        }
        let t1 = (lo - o[k]) / d[k]
        let t2 = (hi - o[k]) / d[k]
        if (t1 > t2) [t1, t2] = [t2, t1]
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return null
    }
    if (tmax <= EPS) return null
    return tmin > EPS ? tmin : tmax
}

/**
 * Distance along a ray to a plane { normal, point } (either side faces: a wall stops light from both sides).
 * @returns {number|null}
 */
export const rayPlane = (o, d, plane) => {
    const n = plane.normal
    const denom = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]
    if (Math.abs(denom) < EPS) return null
    const p = plane.point
    const t = (n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1]) + n[2] * (p[2] - o[2])) / denom
    return t > EPS ? t : null
}

/**
 * The first surface along a ray among boxes ({ min, max }) and planes ({ normal, point }).
 * @returns {number|null}
 */
export const firstHit = (o, d, surfaces = []) => {
    let best = null
    for (const s of surfaces) {
        const t = s.normal ? rayPlane(o, d, s) : rayBox(o, d, s)
        if (t != null && (best == null || t < best)) best = t
    }
    return best
}

/** The length to draw a beam: to the surface it meets, else its stored length capped at MISS_REACH_CAP. */
export const reachFrom = (hit, stored) => {
    if (Number.isFinite(hit) && hit > 0) return Math.max(hit - SURFACE_GAP, MIN_REACH)
    const s = Number(stored)
    return Math.min(s > 0 ? s : MISS_REACH_CAP, MISS_REACH_CAP)
}

/**
 * The rim directions of a cone of half-angle `half` around local −Y (the spot's forward, spotLightAim.js), plus
 * the axis first. Unit vectors in the lamp's local frame.
 */
export const coneRays = (half, n = RIM_RAYS) => {
    const out = [[0, -1, 0]]
    const h = Math.min(Math.max(Number(half) || 0, 0), Math.PI / 2 - 0.01)
    if (!(h > 0) || n <= 0) return out
    const s = Math.sin(h)
    const c = Math.cos(h)
    for (let i = 0; i < n; i += 1) {
        const a = (2 * Math.PI * i) / n
        out.push([s * Math.cos(a), -c, s * Math.sin(a)])
    }
    return out
}

/**
 * A cone's reach from its rays' hits ([axis, ...rim], each { t } or null, in metres): the drawn length along the
 * axis reaches every surface point the cone meets (a rim hit at t lies t·cos(half) down the axis), the light's
 * cutoff is LIGHT_REACH_FACTOR × the farthest slant hit (or the authored distance when nearer; 0 = none).
 * A miss on every ray: the stored length, capped, and the authored distance as it was.
 */
export const coneReach = (hits, { half = 0, stored = 0, distance = 0 } = {}) => {
    const c = Math.cos(Math.min(Math.max(Number(half) || 0, 0), Math.PI / 2 - 0.01))
    let along = 0
    let farthest = 0
    let any = false
    hits.forEach((h, i) => {
        if (!h || !(h.t > 0)) return
        any = true
        along = Math.max(along, i === 0 ? h.t : h.t * c)
        farthest = Math.max(farthest, h.t)
    })
    if (!any) return { length: reachFrom(null, stored), distance: Number(distance) > 0 ? Number(distance) : 0, hit: false }
    // a ray that missed while others hit (a rim out through a door): the axis hit still bounds the draw
    const length = Math.max(along - SURFACE_GAP, MIN_REACH)
    const cut = farthest * LIGHT_REACH_FACTOR
    const d = Number(distance) > 0 ? Math.min(Number(distance), cut) : cut
    return { length, distance: d, hit: true }
}

/** Distinct hit planes (world { normal, point }), at most `max`, merged when within ~5° and 0.25 m. */
export const distinctPlanes = (planes, max = 4) => {
    const out = []
    for (const p of planes) {
        if (!p) continue
        const same = out.some((q) => {
            const dot = q.normal[0] * p.normal[0] + q.normal[1] * p.normal[1] + q.normal[2] * p.normal[2]
            const off = (p.point[0] - q.point[0]) * q.normal[0] + (p.point[1] - q.point[1]) * q.normal[1] + (p.point[2] - q.point[2]) * q.normal[2]
            return Math.abs(dot) > 0.996 && Math.abs(off) < 0.25
        })
        if (!same) out.push(p)
        if (out.length >= max) break
    }
    return out
}

/** Is a lamp's pose (its world matrix) changed enough to re-cast? 1 mm of travel or ~0.06° of turn. */
export const poseChanged = (a, b) => {
    if (!a || !b) return true
    for (let i = 0; i < 16; i += 1) if (Math.abs(a[i] - b[i]) > 1e-3) return true
    return false
}

// --------------------------------------------------------------------------------------------------------------
// 2. The cast against the building.

const SCAN_MS = 1000
const perScene = new WeakMap()
// meshes that are steel (not the building): castFromLamp skips the lamp's own mount among them
const steelMeshes = new WeakSet()

// 'building' | 'steel' | null. The building wins when both tags are up the tree.
const solidKindOf = (object) => {
    if (!object.isMesh || object.userData?.svGhost || object.userData?.svEdge) return null
    if (object.userData?.beamPick || object.userData?.noBounds) return null
    if (object.userData?.svRole) return 'building'
    let steel = false
    for (let o = object.parent; o; o = o.parent) {
        if (o.userData?.svBuilding) return 'building'
        if (o.userData?.svSteel) steel = true
    }
    return steel ? 'steel' : null
}

/**
 * The building of a scene: { meshes, box (world, three Box3 or null), version }. Re-found at most once a
 * second (models load late, an edit swaps them); `version` moves when the set of meshes does, so a lamp knows
 * to re-cast. `onBox` gets the building's box when it changes (the haze's bounds).
 */
export const buildingOf = (scene, now = Date.now(), onBox = null) => {
    if (!scene) return { meshes: [], box: null, version: 0 }
    let state = perScene.get(scene)
    if (state && now - state.at < SCAN_MS) return state
    const meshes = []
    const steel = []
    scene.traverse((o) => {
        const kind = solidKindOf(o)
        if (kind === 'building') meshes.push(o)
        else if (kind === 'steel') steel.push(o)
    })
    const signature = [...meshes, ...steel].map((m) => `${m.uuid}:${m.geometry?.uuid}`).join('|')
    if (state && state.signature === signature) {
        state.at = now
        return state
    }
    let box = null
    for (const m of [...meshes, ...steel]) {
        if (!m.geometry) continue
        if (!m.geometry.boundsTree && !m.isInstancedMesh && !m.isSkinnedMesh) {
            try { computeBoundsTree.call(m.geometry) } catch { /* tiny or odd geometry: the plain raycast */ }
        }
        m.updateWorldMatrix(true, false)
    }
    // the haze box is the building's: steel never widens it
    for (const m of meshes) {
        if (!m.geometry) continue
        const b = new Box3().setFromObject(m)
        if (!b.isEmpty()) box = box ? box.union(b) : b
    }
    steel.forEach((m) => steelMeshes.add(m))
    state = { at: now, signature, meshes: [...meshes, ...steel], steel: steel.length, box, version: (state?.version || 0) + 1 }
    perScene.set(scene, state)
    onBox?.(box)
    return state
}

/** Drop a scene's cached building (tests; a scene swapped wholesale). */
export const forgetBuilding = (scene) => perScene.delete(scene)

const inverse = new Matrix4()
const localRay = new Ray()
const worldBox = new Box3()
const hitPoint = new Vector3()
const raycaster = new Raycaster()
const scratch = []

/**
 * The first building surface along a world ray. Both faces count (light stops at a wall seen from inside it,
 * whichever way its triangles were wound). Per mesh: its world box first (the pure slab test's three twin), then
 * its BVH (raycastFirst, local space), else three's raycast.
 * @returns {{ t: number, point: number[], normal: number[] }|null}
 */
export const castFirst = (meshes, origin, dir, far = Infinity) => {
    let best = null
    const ray = new Ray(new Vector3(...origin), new Vector3(...dir))
    for (const mesh of meshes) {
        const geometry = mesh.geometry
        if (!geometry) continue
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        worldBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
        const enter = ray.intersectBox(worldBox, hitPoint) ? ray.origin.distanceTo(hitPoint) : null
        const inside = worldBox.containsPoint(ray.origin)
        if (!inside && (enter == null || enter > Math.min(far, best ? best.t : Infinity))) continue
        let hit = null
        if (geometry.boundsTree && !mesh.isInstancedMesh && !mesh.isSkinnedMesh) {
            inverse.copy(mesh.matrixWorld).invert()
            localRay.copy(ray).applyMatrix4(inverse)
            const h = geometry.boundsTree.raycastFirst(localRay, DoubleSide)
            if (h) {
                hitPoint.copy(h.point).applyMatrix4(mesh.matrixWorld)
                const n = h.face ? h.face.normal.clone().transformDirection(mesh.matrixWorld) : null
                hit = { t: ray.origin.distanceTo(hitPoint), point: hitPoint.toArray(), normal: n ? n.toArray() : null }
            }
        } else {
            raycaster.ray.copy(ray)
            raycaster.near = 0
            raycaster.far = far
            scratch.length = 0
            // three honours material.side here: both faces for the cast, put back at once (synchronous)
            const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
            const sides = materials.map((m) => m.side)
            materials.forEach((m) => { m.side = DoubleSide })
            try { mesh.raycast(raycaster, scratch) } finally { materials.forEach((m, i) => { m.side = sides[i] }) }
            const h = scratch.sort((a, b) => a.distance - b.distance)[0]
            if (h) {
                const n = h.face ? h.face.normal.clone().transformDirection(mesh.matrixWorld) : null
                hit = { t: h.distance, point: h.point.toArray(), normal: n ? n.toArray() : null }
            }
        }
        if (hit && hit.t > MIN_REACH && hit.t <= far && (!best || hit.t < best.t)) best = hit
    }
    return best
}

// Is the lamp's lens inside a steel mesh's world box (grown by MOUNT_CLEARANCE)? Then that steel is its own mount.
const holdsLens = (mesh, point) => {
    const g = mesh.geometry
    if (!g) return false
    if (!g.boundingBox) g.computeBoundingBox()
    worldBox.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld).expandByScalar(MOUNT_CLEARANCE)
    return worldBox.containsPoint(point)
}

const o3 = new Vector3()
const d3 = new Vector3()
/**
 * Cast local directions (the lamp's frame) from a lamp's world matrix against the building.
 * @param {Matrix4} matrixWorld the lamp's
 * @param {number[][]} dirs unit vectors in the lamp's local frame
 * @returns {Array<{ t, point, normal }|null>}
 */
export const castFromLamp = (meshes, matrixWorld, dirs, far = Infinity) => {
    o3.setFromMatrixPosition(matrixWorld)
    const origin = o3.toArray()
    const solids = meshes.some((m) => steelMeshes.has(m)) ? meshes.filter((m) => !steelMeshes.has(m) || !holdsLens(m, o3)) : meshes
    return dirs.map((d) => {
        d3.set(d[0], d[1], d[2]).transformDirection(matrixWorld)
        return castFirst(solids, origin, d3.toArray(), far)
    })
}

/** Three.js clip planes (keep the side the lamp stands on) from hits. */
export const clipPlanesOf = (hits, lampWorld) => distinctPlanes(hits.filter((h) => h?.normal).map((h) => ({ normal: h.normal, point: h.point })))
    .map((p) => {
        const n = new Vector3(...p.normal)
        const at = new Vector3(...p.point)
        // three keeps what is on the plane's positive side: point the normal back toward the lamp
        if (n.dot(new Vector3(...lampWorld).sub(at)) < 0) n.negate()
        return new Plane().setFromNormalAndCoplanarPoint(n, at)
    })

/**
 * One lamp's re-cast rule (BeamReachProbe calls it every frame; tested without a renderer): cast when the lamp's world
 * pose, its directions (`key`) or the building (`building.version`) changed, never more than once per RECAST_MS — a
 * change inside that window is kept PENDING and cast on a later frame. A still lamp costs a compare and no cast.
 * step() returns { hits } after a cast whose lengths moved by more than 2 cm, 'pending', or null (nothing to do).
 */
export const createReachTracker = (cast = castFromLamp) => {
    const s = { pose: null, version: -1, key: '', at: -Infinity, pending: false, sent: null, casts: 0 }
    const tOf = (h) => (h ? h.t : -100)
    return {
        state: s,
        step({ matrixWorld, dirs, key = JSON.stringify(dirs), building, now }) {
            const pose = matrixWorld.elements
            if (!s.pending && !poseChanged(pose, s.pose) && s.version === building.version && s.key === key) return null
            if (now - s.at < RECAST_MS) {
                s.pending = true
                return 'pending'
            }
            s.pending = false
            s.at = now
            s.pose = pose.slice()
            s.version = building.version
            s.key = key
            s.casts += 1
            const hits = cast(building.meshes, matrixWorld, dirs)
            const sent = s.sent
            if (sent && sent.length === hits.length && hits.every((h, i) => Math.abs(tOf(h) - tOf(sent[i])) <= 0.02)) return null
            s.sent = hits
            return { hits, planes: clipPlanesOf(hits, [pose[12], pose[13], pose[14]]), version: building.version }
        }
    }
}
