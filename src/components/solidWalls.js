// Solid walls -- walk mode that stops at the scene's own walls, tree trunks and other solid models.
//
// Before this, walk mode only clamped the walker to 2D floor rectangles (walkableAreas.js: "Walk mode has never
// had wall collision"), so a visitor strolled through every model. With `worldState.solidWalls = { enabled: true }`
// the walker is a CAPSULE swept against the meshes the scene is drawn with. It slides along a wall, never passes
// through one, and cannot get wedged in a corner. Without the flag nothing here runs: walkStep() with no walls
// is exactly confineToAreas() (tested).
//
// METHOD (cited, not invented):
//   - Capsule vs triangle soup with a bounding-volume hierarchy: three-mesh-bvh, `shapecast` + `closestPointToSegment`,
//     the pattern of its own example `examples/characterMovement.js` (M. Johnson, MIT; the "push the capsule out of
//     every triangle it overlaps" scheme). Package: three-mesh-bvh ^0.9.16 (already a dependency).
//   - Collide-and-slide by depenetration: the move is cut into steps of at most half the radius, and after each step
//     the capsule is pushed out along the contact direction. Position-based, so the tangential part of a move
//     survives (the slide) and nothing can freeze a walker in a corner (Fauerby, "Improved Collision detection and
//     Response", 2003, section on sliding planes, for the idea; the step cap is what rules out tunnelling).
//
// WHAT IT DOES NOT DO (this part), stated:
//   - FLOORS stay as today. The walker's eye is fixed at EYE_HEIGHT; there is no stairs, no ramps, no falling. Contacts
//     whose normal is mostly vertical (floors, ceilings, shallow ramps) never push sideways, and anything under
//     STEP_HEIGHT (a kerb, a floor slab, grass) never blocks. A real wall of that height cannot be crossed
//     by looking over it either: it is simply under the feet.
//   - The walls are the meshes at the moment of the (re)build. A model that finishes loading, or an object moved in
//     the editor, is picked up within about a second. A mesh that keeps moving (idle motion) is left out; skinned and
//     instanced meshes are left out (v1).
//   - Not applied while flying, nor to a headset's own locomotion (XrLocomotion).
//   - Phones: the triangle limit is a guess until a phone is measured (owed).
import { Box3, BufferAttribute, BufferGeometry, Line3, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { confineToAreas } from './walkableAreas.js'
import { EYE_HEIGHT } from './walkModeConfig.js'

// -- The capsule --
export const SOLID_WALLS_RADIUS = 0.3
// Nothing lower than this above the feet blocks: a kerb, a floor slab, a doorstep. (Floors are not followed in this part.)
export const SOLID_WALLS_STEP_HEIGHT = 0.3
// The capsule reaches this far above the eye.
export const SOLID_WALLS_HEAD_CLEARANCE = 0.1
// A contact whose direction is steeper than this (|y| / distance) is a floor or a ceiling, never a wall.
const FLOOR_LIKE = 0.7

// -- Safety --
// More triangles than this and the walls are not built (the visitor is told in the status text, never silently).
// 400k builds in the measured time on the desktop GPU machine (see the PR); phones are NOT measured (owed), so they get a quarter.
export const SOLID_WALLS_MAX_TRIANGLES = 400000
export const SOLID_WALLS_MAX_TRIANGLES_PHONE = 100000
const MAX_SUBSTEPS = 48
const MAX_PUSH_PASSES = 4
// A pass that pushes less than this (metres) has settled.
const SETTLE = 0.01

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// ---------------------------------------------------------------------------------------------------------------
// 1. Which meshes are walls

const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])

/**
 * A mesh is solid when it draws something real into the depth buffer. A halo, a beam, haze, a sky dome, a grid and a
 * wireframe draw no surface, so they are air. `userData.noSolid` on any object leaves out its whole subtree.
 * Ancestors' visibility is handled by collectSolidMeshes().
 */
export function isSolidMesh(mesh) {
    if (!mesh || !mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return false
    const position = mesh.geometry?.attributes?.position
    if (!position || position.itemSize < 3 || !position.count) return false
    return materialsOf(mesh).some((m) => m
        && m.visible !== false && m.depthWrite !== false && m.colorWrite !== false && m.wireframe !== true
        && !(m.transparent && m.opacity <= 0.01))
}

export function collectSolidMeshes(root, out = []) {
    const walk = (object) => {
        if (object.visible === false || object.userData?.noSolid) return
        if (object.isMesh && isSolidMesh(object)) out.push(object)
        for (const child of object.children) walk(child)
    }
    if (root) walk(root)
    return out
}

// ---------------------------------------------------------------------------------------------------------------
// 2. One triangle soup in world space, then one BVH

const triangleCountOf = (geometry) => {
    const index = geometry.index
    return Math.floor((index ? index.count : geometry.attributes.position.count) / 3)
}

/**
 * Bake the meshes' triangles into world space as one indexed geometry. A mesh with a non-finite vertex is broken:
 * it is skipped whole (counted), because one NaN turns every box of the BVH into NaN. Over `maxTriangles` nothing is
 * built (`tooMany`), and the caller says so.
 */
export function mergeWorldTriangles(meshes, { maxTriangles = SOLID_WALLS_MAX_TRIANGLES } = {}) {
    let triangles = 0
    let vertices = 0
    for (const mesh of meshes) {
        triangles += triangleCountOf(mesh.geometry)
        vertices += mesh.geometry.attributes.position.count
    }
    if (triangles > maxTriangles) return { tooMany: true, triangles, meshes: meshes.length, broken: 0, geometry: null }

    const positions = new Float32Array(vertices * 3)
    const indices = new Uint32Array(triangles * 3)
    let vOut = 0
    let iOut = 0
    let broken = 0
    let used = 0
    for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false)
        const e = mesh.matrixWorld.elements
        const src = mesh.geometry.attributes.position
        const count = src.count
        const base = vOut
        let finite = true
        for (let i = 0; i < count; i += 1) {
            const x = src.getX(i)
            const y = src.getY(i)
            const z = src.getZ(i)
            const wx = e[0] * x + e[4] * y + e[8] * z + e[12]
            const wy = e[1] * x + e[5] * y + e[9] * z + e[13]
            const wz = e[2] * x + e[6] * y + e[10] * z + e[14]
            if (!Number.isFinite(wx + wy + wz)) { finite = false; break }
            const o = (base + i) * 3
            positions[o] = wx
            positions[o + 1] = wy
            positions[o + 2] = wz
        }
        if (!finite) { broken += 1; continue }
        const index = mesh.geometry.index
        const n = index ? index.count : count
        const tri = n - (n % 3)
        let valid = true
        for (let i = 0; i < tri; i += 1) {
            const v = index ? index.getX(i) : i
            if (v >= count) { valid = false; break }
            indices[iOut + i] = base + v
        }
        if (!valid) { broken += 1; continue }
        iOut += tri
        vOut += count
        used += 1
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions.subarray(0, vOut * 3), 3))
    geometry.setIndex(new BufferAttribute(indices.subarray(0, iOut), 1))
    return { tooMany: false, triangles: iOut / 3, meshes: used, broken, geometry }
}

const kilo = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/**
 * Build the collider for these meshes. Never throws: a failure is `{ collider: null, text }` with the reason in words.
 * @returns {{ collider: object|null, text: string }}
 */
export function buildSolidWalls(meshes, {
    radius = SOLID_WALLS_RADIUS,
    stepHeight = SOLID_WALLS_STEP_HEIGHT,
    headClearance = SOLID_WALLS_HEAD_CLEARANCE,
    maxTriangles = SOLID_WALLS_MAX_TRIANGLES
} = {}) {
    const t0 = now()
    try {
        const merged = mergeWorldTriangles(meshes, { maxTriangles })
        if (merged.tooMany) {
            return { collider: null, text: `off: ${kilo(merged.triangles)} triangles is over the limit of ${kilo(maxTriangles)}, walls are not solid in this scene` }
        }
        const brokenNote = merged.broken ? `, ${merged.broken} broken ${merged.broken === 1 ? 'mesh' : 'meshes'} skipped` : ''
        if (!merged.triangles) return { collider: null, text: `on: no solid meshes yet${brokenNote}` }
        const t1 = now()
        const bvh = new MeshBVH(merged.geometry)
        const t2 = now()
        const collider = {
            bvh,
            geometry: merged.geometry,
            radius,
            // the capsule's axis: the lowest point of the capsule is stepHeight above the feet, the highest headClearance above the eye
            y0: stepHeight + radius, // feet are at world y = 0: the eye is at EYE_HEIGHT whenever the walker walks
            y1: Math.max(EYE_HEIGHT + headClearance - radius, stepHeight + radius),
            triangles: merged.triangles,
            meshes: merged.meshes,
            stats: { mergeMs: t1 - t0, buildMs: t2 - t1, calls: 0, totalMs: 0, maxMs: 0, x: 0, z: 0 },
            dispose() {
                merged.geometry.dispose()
                collider.bvh = null
            }
        }
        const text = `on: ${merged.meshes} solid meshes, ${kilo(merged.triangles)} triangles, built in ${(t2 - t0).toFixed(1)} ms${brokenNote}`
        return { collider, text }
    } catch (error) {
        return { collider: null, text: `off: could not build the walls (${error?.message || error})` }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. The sweep

const seg = new Line3()
const box = new Box3()
const triPt = new Vector3()
const segPt = new Vector3()
const faceNormal = new Vector3()

// One pass over the triangles near the capsule. Every overlap is first COLLECTED as a small constraint -- "move at
// least `push` metres along (nx, nz)" -- and only then applied, deepest first, each one counting what the earlier ones
// already moved. Applying them in the order the BVH meets them is wrong: a flat wall is two triangles, and the one
// the capsule only touches along its diagonal edge points sideways, so a walker pushing straight at the wall drifted
// along it (seen in the first test run: 0.4 m of sideways drift in 2 s). Deepest first, the real face moves the
// capsule out and the edge contact is already satisfied. In a corner the same rule satisfies both walls.
// Returns the biggest push actually made.
const MAX_CONTACTS = 48
const contactN = new Float64Array(MAX_CONTACTS * 2)
const contactPush = new Float64Array(MAX_CONTACTS)
const contactOrder = new Int32Array(MAX_CONTACTS)

function pushOut(collider, st, fromX, fromZ) {
    const { bvh, radius: r, y0, y1 } = collider
    seg.start.set(st.x, y0, st.z)
    seg.end.set(st.x, y1, st.z)
    box.min.set(st.x - r, y0 - r, st.z - r)
    box.max.set(st.x + r, y1 + r, st.z + r)
    let count = 0
    bvh.shapecast({
        intersectsBounds: (bounds) => bounds.intersectsBox(box),
        intersectsTriangle: (tri) => {
            const d = tri.closestPointToSegment(seg, triPt, segPt)
            if (d >= r) return false
            let nx
            let nz
            let push
            if (d > 1e-6) {
                // from the surface point to the capsule axis
                const ax = segPt.x - triPt.x
                const ay = segPt.y - triPt.y
                const az = segPt.z - triPt.z
                if (Math.abs(ay) > FLOOR_LIKE * d) return false // a floor or a ceiling, not a wall
                const h = Math.hypot(ax, az)
                if (h < 1e-6) return false
                // the sideways move that makes the 3-D distance the radius: (h + push)^2 + ay^2 = r^2
                push = Math.sqrt(Math.max(r * r - ay * ay, 0)) - h
                if (push <= 0) return false
                nx = ax / h
                nz = az / h
            } else {
                // the axis is inside the surface (a spawn in a trunk): out along the face's own sideways normal, back the way we came
                tri.getNormal(faceNormal)
                const h = Math.hypot(faceNormal.x, faceNormal.z)
                if (h < 1e-6) return false
                nx = faceNormal.x / h
                nz = faceNormal.z / h
                if (nx * (fromX - st.x) + nz * (fromZ - st.z) < 0) { nx = -nx; nz = -nz }
                push = r
            }
            let slot = count
            if (count < MAX_CONTACTS) {
                count += 1
            } else {
                // full (a very dense mesh): the shallowest contact makes room for a deeper one
                slot = 0
                for (let i = 1; i < MAX_CONTACTS; i += 1) if (contactPush[i] < contactPush[slot]) slot = i
                if (contactPush[slot] >= push) return false
            }
            contactN[slot * 2] = nx
            contactN[slot * 2 + 1] = nz
            contactPush[slot] = push
            return false
        }
    })
    if (!count) return 0

    // deepest first (insertion sort: a handful of contacts)
    for (let i = 0; i < count; i += 1) {
        let j = i
        while (j > 0 && contactPush[contactOrder[j - 1]] < contactPush[i]) { contactOrder[j] = contactOrder[j - 1]; j -= 1 }
        contactOrder[j] = i
    }
    let movedX = 0
    let movedZ = 0
    let worst = 0
    for (let k = 0; k < count; k += 1) {
        const i = contactOrder[k]
        const nx = contactN[i * 2]
        const nz = contactN[i * 2 + 1]
        const remaining = contactPush[i] - (movedX * nx + movedZ * nz)
        if (remaining <= 0) continue
        movedX += nx * remaining
        movedZ += nz * remaining
        if (remaining > worst) worst = remaining
    }
    st.x += movedX
    st.z += movedZ
    return worst
}

// Push out until settled. Returns how much the last pass still had to push (0 = clear).
function depenetrate(collider, st, fromX, fromZ) {
    let last = 0
    for (let pass = 0; pass < MAX_PUSH_PASSES; pass += 1) {
        last = pushOut(collider, st, fromX, fromZ)
        if (last <= SETTLE) return 0
    }
    return last
}

/**
 * Move the walker from (fromX, fromZ) toward (toX, toZ) without entering a wall. The result is where it ends up:
 * the full move in open air, the tangent part of it along a wall, nothing of it into a wall.
 * @returns {{ x: number, z: number, blocked: boolean }}
 */
export function slideCapsule(collider, fromX, fromZ, toX, toZ) {
    const t0 = now()
    // One call travels at most MAX_SUBSTEPS half-radius steps. After a long hitch (a background tab coming back) a
    // 50 m jump would otherwise skip every wall on the way, so it is cut to what can be checked (7.2 m): a slow
    // frame, never a tunnel.
    const maxTravel = MAX_SUBSTEPS * collider.radius * 0.5
    const asked = Math.hypot(toX - fromX, toZ - fromZ)
    const cut = asked > maxTravel ? maxTravel / asked : 1
    const dx = (toX - fromX) * cut
    const dz = (toZ - fromZ) * cut
    const dist = asked * cut
    const st = { x: fromX, z: fromZ }
    if (dist > 1e-9) {
        // a step is at most half the radius: the capsule is never more than half a radius inside anything, so the
        // push-out can always find its way back and a thin trunk cannot be jumped over, however long the frame
        const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dist / (collider.radius * 0.5))))
        const sx = dx / steps
        const sz = dz / steps
        for (let i = 0; i < steps; i += 1) {
            const px = st.x
            const pz = st.z
            st.x += sx
            st.z += sz
            if (depenetrate(collider, st, px, pz) > SETTLE * 5) {
                // wedged between surfaces that cannot be pushed apart (a crevice narrower than the capsule): stay, and
                // get clear of whatever is touching, so the next frame can still move away
                st.x = px
                st.z = pz
                depenetrate(collider, st, px, pz)
                break
            }
        }
    }
    const s = collider.stats
    const ms = now() - t0
    s.calls += 1
    s.totalMs += ms
    if (ms > s.maxMs) s.maxMs = ms
    s.x = st.x
    s.z = st.z
    return { x: st.x, z: st.z, blocked: Math.hypot(toX - st.x, toZ - st.z) > 1e-4 }
}

/**
 * One walker step: the floor rectangles first (as today), then the walls. With no walls this IS confineToAreas.
 * The push-out may carry the walker over the edge of a declared rectangle, and the floor plan still wins.
 */
export function walkStep(areas, walls, fromX, fromZ, toX, toZ) {
    const confined = confineToAreas(areas, fromX, fromZ, toX, toZ)
    if (!walls) return confined
    const slid = slideCapsule(walls, fromX, fromZ, confined.x, confined.z)
    if (!areas || !areas.length) return { x: slid.x, z: slid.z }
    return confineToAreas(areas, fromX, fromZ, slid.x, slid.z)
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Keeping the walls in step with the scene

// FNV-1a over the numbers that decide where a mesh's triangles are, to the centimetre.
function fingerprint(mesh) {
    let h = 2166136261
    const e = mesh.matrixWorld.elements
    const feed = (v) => { h = Math.imul(h ^ (v | 0), 16777619) }
    feed(mesh.geometry.attributes.position.count)
    feed(mesh.geometry.index ? mesh.geometry.index.count : 0)
    for (let i = 0; i < 16; i += 1) feed(Math.round(e[i] * 100))
    return h >>> 0
}

/**
 * Owns the collider of one scene. tick() is cheap and is called every frame; about twice a second it looks at the
 * scene and, when the set of solid meshes has changed and settled, rebuilds. A mesh whose place changes on three
 * checks in a row is moving, not a wall, and is left out for good. `onStatus(text, stats)` says what happened in
 * words, on every change, so a failure is never silent.
 */
export function createSolidWallsKeeper({
    root,
    maxTriangles = SOLID_WALLS_MAX_TRIANGLES,
    onStatus = null,
    intervalMs = 500,
    minRebuildMs = 2000,
    clock = now
}) {
    let collider = null
    let builtSignature = null
    let lastSignature = null
    let lastCheck = -Infinity
    let lastBuild = -Infinity
    let lastText = ''
    let builtText = ''
    const tracked = new Map()

    const say = (text, stats) => {
        if (text === lastText) return
        lastText = text
        if (text.startsWith('off')) console.warn(`[solid walls] ${text}`)
        if (onStatus) onStatus(text, stats)
    }

    // what the walls are doing, in words; a wall that keeps moving is not a wall, so say how many were left out
    const announce = (moving) => {
        if (!builtText) return
        const note = moving ? `, ${moving} left out because they keep moving (a wall needs animation mode static)` : ''
        say(builtText + note, collider ? collider.stats : null)
    }

    function tick() {
        const t = clock()
        if (t - lastCheck < intervalMs) return collider
        lastCheck = t
        root.updateMatrixWorld(true)
        const all = collectSolidMeshes(root)
        const still = []
        let signature = 2166136261
        let movingCount = 0
        for (const mesh of all) {
            const h = fingerprint(mesh)
            let track = tracked.get(mesh.id)
            if (!track) { track = { h, changes: 0, moving: false }; tracked.set(mesh.id, track) }
            else if (track.h !== h) { track.h = h; track.changes += 1; if (track.changes >= 3) track.moving = true }
            else track.changes = 0
            if (track.moving) { movingCount += 1; continue }
            still.push(mesh)
            signature = Math.imul(signature ^ mesh.id ^ h, 16777619) >>> 0
        }
        signature = `${still.length}:${signature}`
        if (signature === builtSignature) { lastSignature = signature; announce(movingCount); return collider }
        const first = builtSignature === null
        if (!first && (signature !== lastSignature || t - lastBuild < minRebuildMs)) { lastSignature = signature; announce(movingCount); return collider }
        lastSignature = signature
        builtSignature = signature
        lastBuild = t
        const built = buildSolidWalls(still, { maxTriangles })
        if (collider) collider.dispose()
        collider = built.collider
        builtText = built.text
        announce(movingCount)
        return collider
    }

    return {
        tick,
        get collider() { return collider },
        dispose() {
            if (collider) collider.dispose()
            collider = null
            tracked.clear()
        }
    }
}
