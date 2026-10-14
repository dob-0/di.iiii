import { describe, expect, it } from 'vitest'
import { BackSide, BoxGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Scene, Vector3 } from 'three'
import {
    LIGHT_REACH_FACTOR, MISS_REACH_CAP, RECAST_MS, SURFACE_GAP, buildingOf, castFirst, castFromLamp, coneRays, coneReach,
    createReachTracker, distinctPlanes, firstHit, forgetBuilding, rayBox, rayPlane, reachFrom
} from './beamReach.js'
import { spotBeamShape } from './spotBeam.js'
import { hazeScatteringAt } from './hazeField.js'

// PHYSICS FIRST (owner, 2026-10-13): light stops at the first surface it meets. A test hall 40 × 12 × 30 m (x, y, z),
// floor at y 0, roof at y 12 — one closed box of triangles, its faces wound OUTWARD (a model's walls are seen from
// either side; the cast takes both).
const HALL = { min: [-20, 0, -15], max: [20, 12, 15] }
const hallScene = ({ side } = {}) => {
    const scene = new Scene()
    const hall = new Group()
    hall.userData.svBuilding = true
    const mesh = new Mesh(new BoxGeometry(40, 12, 30), new MeshBasicMaterial(side ? { side } : {}))
    mesh.position.set(0, 6, 0)
    hall.add(mesh)
    scene.add(hall)
    scene.updateMatrixWorld(true)
    return scene
}
const lampAt = (p, rotation) => new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1))

describe('the reach maths (pure: a ray against boxes and planes)', () => {
    it('a ray inside a box meets its far face; outside, its near face; past it, nothing', () => {
        expect(rayBox([0, 5, 0], [0, 1, 0], HALL)).toBeCloseTo(7, 9)            // up to the roof from inside
        expect(rayBox([0, 5, 0], [0, -1, 0], HALL)).toBeCloseTo(5, 9)           // down to the floor
        expect(rayBox([0, 20, 0], [0, -1, 0], HALL)).toBeCloseTo(8, 9)          // from above, onto the roof
        expect(rayBox([0, 20, 0], [0, 1, 0], HALL)).toBeNull()                  // away from it
        const d = [Math.SQRT1_2, Math.SQRT1_2, 0]
        expect(rayBox([10, 5, 0], d, HALL)).toBeCloseTo(Math.SQRT2 * 7, 9)     // the roof (y 12) before the wall (x 20)
    })
    it('a plane stops light from either side; parallel or behind, no hit', () => {
        const roof = { normal: [0, 1, 0], point: [0, 12, 0] }
        expect(rayPlane([0, 5, 0], [0, 1, 0], roof)).toBeCloseTo(7, 9)
        expect(rayPlane([0, 15, 0], [0, -1, 0], roof)).toBeCloseTo(3, 9)
        expect(rayPlane([0, 5, 0], [1, 0, 0], roof)).toBeNull()
        expect(rayPlane([0, 5, 0], [0, -1, 0], roof)).toBeNull()
    })
    it('the first of several surfaces wins', () => {
        const pillar = { min: [4, 0, -1], max: [6, 12, 1] }
        expect(firstHit([0, 5, 0], [1, 0, 0], [HALL, pillar, { normal: [1, 0, 0], point: [30, 0, 0] }])).toBeCloseTo(4, 9)
        expect(firstHit([0, 5, 0], [0, 0, 1], [pillar])).toBeNull()
    })
    it('a miss keeps the stored length, never past MISS_REACH_CAP (no 120 m beams)', () => {
        expect(reachFrom(null, 18)).toBe(18)
        expect(reachFrom(null, 120)).toBe(MISS_REACH_CAP)
        expect(reachFrom(null, 0)).toBe(MISS_REACH_CAP)
        expect(reachFrom(7.25, 120)).toBeCloseTo(7.25 - SURFACE_GAP, 9)   // just short of the surface: no cap on it
    })
    it('a cone reaches every surface point its rays meet, its light twice the farthest', () => {
        const half = 0.3
        const rays = coneRays(half, 8)
        expect(rays).toHaveLength(9)
        expect(rays[0]).toEqual([0, -1, 0])
        for (const r of rays.slice(1)) expect(-r[1]).toBeCloseTo(Math.cos(half), 9)
        // a rim ray meets a tilted wall at 10 m: the axis must run 10·cos(half) to reach it
        const plan = coneReach([{ t: 8 }, { t: 10 }, null], { half, stored: 120, distance: 0 })
        expect(plan.length).toBeCloseTo(Math.max(8, 10 * Math.cos(half)) - SURFACE_GAP, 9)
        expect(plan.distance).toBeCloseTo(10 * LIGHT_REACH_FACTOR, 9)
        expect(coneReach([{ t: 8 }], { stored: 50, distance: 12 }).distance).toBe(12)   // an authored cutoff nearer stays
        const miss = coneReach([null, null], { stored: 120, distance: 0 })
        expect(miss).toEqual({ length: MISS_REACH_CAP, distance: 0, hit: false })
    })
    it('merges hit planes that are the same surface', () => {
        const a = { normal: [0, 1, 0], point: [0, 12, 0] }
        const b = { normal: [0, -1, 0], point: [3, 12.1, 1] }
        const c = { normal: [1, 0, 0], point: [20, 4, 0] }
        expect(distinctPlanes([a, b, c, a])).toHaveLength(2)
    })
})

describe('the cast against a building\'s triangles', () => {
    it('finds the roof from inside, through outward-wound faces, with the BVH', () => {
        const scene = hallScene()
        const building = buildingOf(scene, 0)
        expect(building.meshes).toHaveLength(1)
        expect(building.meshes[0].geometry.boundsTree).toBeTruthy()
        expect(building.box.max.y).toBeCloseTo(12, 4)
        const up = castFirst(building.meshes, [0, 5, 0], [0, 1, 0])
        expect(up.t).toBeCloseTo(7, 6)
        expect(Math.abs(up.normal[1])).toBeCloseTo(1, 6)
    })
    it('finds it without a BVH too (three\'s own raycast, both faces), and leaves the material as it was', () => {
        const scene = hallScene({ side: BackSide })
        const mesh = buildingOf(scene, 0).meshes[0]
        mesh.geometry.boundsTree = null
        const hit = castFirst([mesh], [0, 5, 0], [1, 0, 0])
        expect(hit.t).toBeCloseTo(20, 6)
        expect(mesh.material.side).toBe(BackSide)
    })
    it('ignores what is not the building (a lamp body, a beam)', () => {
        const scene = hallScene()
        const body = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
        body.position.set(0, 8, 0)
        scene.add(body)
        scene.updateMatrixWorld(true)
        forgetBuilding(scene)
        expect(castFirst(buildingOf(scene, 0).meshes, [0, 5, 0], [0, 1, 0]).t).toBeCloseTo(7, 6)
    })
})

describe('a cone re-lengths when a look re-aims its lamp', () => {
    it('down: the floor; turned to the roof: the roof; a still lamp: no cast; a moving look: <= 15 Hz', () => {
        const scene = hallScene()
        const building = buildingOf(scene, 0)
        const tracker = createReachTracker()
        const half = 0.2
        const dirs = coneRays(half)
        const lamp = (rotation) => lampAt([0, 9, 0], rotation)
        let now = 0
        // rest aim: straight down (the spot's −Y), 9 m to the floor
        const first = tracker.step({ matrixWorld: lamp([0, 0, 0]), dirs, building, now })
        const down = coneReach(first.hits, { half, stored: 120 })
        expect(down.length).toBeCloseTo(9 - SURFACE_GAP, 4)
        expect(spotBeamShape({ distance: down.length, angle: half }).length).toBeCloseTo(9 - SURFACE_GAP, 4)
        // still: nothing to do, no cast
        now += 1000
        expect(tracker.step({ matrixWorld: lamp([0, 0, 0]), dirs, building, now })).toBeNull()
        expect(tracker.state.casts).toBe(1)
        // a look turns it upside down: the roof is 3 m above — the stored 120 m would have stood 108 m over it
        const turned = tracker.step({ matrixWorld: lamp([Math.PI, 0, 0]), dirs, building, now })
        const up = coneReach(turned.hits, { half, stored: 120 })
        expect(up.length).toBeCloseTo(3 - SURFACE_GAP, 4)
        expect(up.distance).toBeCloseTo((3 / Math.cos(half)) * LIGHT_REACH_FACTOR, 4)
        // moving again inside the 15 Hz window: kept pending, cast on the next frame after it
        now += RECAST_MS / 2
        expect(tracker.step({ matrixWorld: lamp([Math.PI / 2, 0, 0]), dirs, building, now })).toBe('pending')
        now += RECAST_MS
        const side = tracker.step({ matrixWorld: lamp([Math.PI / 2, 0, 0]), dirs, building, now })
        expect(coneReach(side.hits, { half, stored: 120 }).length).toBeCloseTo(15 * 1, 0)   // to the end wall, z 15
        expect(tracker.state.casts).toBe(3)
    })
    it('a laser line ends at the surface along its own direction', () => {
        const building = buildingOf(hallScene(), 0)
        const m = lampAt([0, 9, 0], [0, 0, 0])
        const dirs = [[0, -1, 0], [Math.sin(0.3), -Math.cos(0.3), 0]]
        const hits = castFromLamp(building.meshes, m, dirs)
        expect(hits[0].t).toBeCloseTo(9, 4)
        expect(hits[1].t).toBeCloseTo(9 / Math.cos(0.3), 4)
    })
})

describe('the haze is inside the building only', () => {
    it('no scattering outside the box (the shader\'s uHazeBox, its JS twin)', () => {
        const field = { fill: 0.03, patchiness: 0, drift: [0, 0, 0], jets: [], blobs: [], box: HALL }
        expect(hazeScatteringAt(field, [0, 5, 0])).toBeCloseTo(0.03, 9)
        expect(hazeScatteringAt(field, [0, 13, 0])).toBe(0)
        expect(hazeScatteringAt({ ...field, box: undefined }, [0, 13, 0])).toBeCloseTo(0.03, 9)
    })
})

// THE COST, measured (printed; the bound is loose so a slow CI box does not flake): per frame, a still lamp is a
// pose compare; a moving lamp re-casts 9 rays at most at 15 Hz. Hall of 12 triangles here — a real hall model is
// ~10⁵, where the BVH keeps a ray at O(log n).
describe('the cost per frame', () => {
    it('N lamps: still and all moving', () => {
        const building = buildingOf(hallScene(), 0)
        const dirs = coneRays(0.3)
        for (const N of [100]) {
            const trackers = Array.from({ length: N }, () => createReachTracker())
            const mats = Array.from({ length: N }, (_, i) => lampAt([-15 + (i % 30), 9, -10 + Math.floor(i / 30) * 5], [0.3, 0, 0.2]))
            trackers.forEach((t, i) => t.step({ matrixWorld: mats[i], dirs, building, now: 0 }))
            let t0 = performance.now()
            const frames = 200
            for (let f = 0; f < frames; f += 1) trackers.forEach((t, i) => t.step({ matrixWorld: mats[i], dirs, building, now: 1000 + f }))
            const still = (performance.now() - t0) / frames
            t0 = performance.now()
            const casts = 50
            for (let f = 0; f < casts; f += 1) {
                trackers.forEach((t, i) => {
                    const m = lampAt([-15 + (i % 30), 9, -10], [0.3 + f * 0.01, 0, 0.2])
                    t.step({ matrixWorld: m, dirs, building, now: 10000 + f * 1000 })
                })
            }
            const moving = (performance.now() - t0) / casts
            console.log(`[beamReach cost] ${N} lamps × ${dirs.length} rays: still ${still.toFixed(3)} ms/frame; every lamp re-cast ${moving.toFixed(2)} ms/cast frame (at most 15 of those a second)`)
            expect(still).toBeLessThan(5)
            expect(moving).toBeLessThan(200)
        }
    })
})

// STEEL (owner, 2026-10-14): "nothing passes through a wall, roof, floor - or steel". A crane bridge and a truss are
// separate entities, tagged svSteel by what they are (steelOccluder.js); they stop a beam like the building and are
// not the building (the haze box stays the hall's).
const steelBox = (scene, { p, size }) => {
    const g = new Group()
    g.userData.svSteel = true
    const m = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial())
    m.position.set(...p)
    g.add(m)
    scene.add(g)
    scene.updateMatrixWorld(true)
    return m
}
describe('solid steel stops a beam', () => {
    // a crane bridge across the hall: 30 m (x) × 0.7 × 1.0 m, at y 8, z 3.2
    const sceneWithBridge = () => {
        const scene = hallScene()
        steelBox(scene, { p: [0, 8, 3.2], size: [30, 0.7, 1.0] })
        forgetBuilding(scene)
        return scene
    }
    it('a beam aimed through the bridge stops at it; one beside it passes to the wall', () => {
        const building = buildingOf(sceneWithBridge(), 0)
        expect(building.steel).toBe(1)
        // a lamp at y 4, z 3.2 aimed straight up: the bridge underside is at y 7.65, the roof at 12
        const up = castFromLamp(building.meshes, lampAt([0, 4, 3.2], [Math.PI, 0, 0]), [[0, -1, 0]])
        expect(up[0].t).toBeCloseTo(3.65, 4)
        // the same lamp 2 m to the side (z 5.2, clear of the 1 m bridge): the roof
        const beside = castFromLamp(building.meshes, lampAt([0, 4, 5.2], [Math.PI, 0, 0]), [[0, -1, 0]])
        expect(beside[0].t).toBeCloseTo(8, 4)
        // and the reach drawn from it
        expect(coneReach(up, { half: 0, stored: 120 }).length).toBeCloseTo(3.65 - SURFACE_GAP, 4)
    })
    it('steel is not the building: the haze box is the hall\'s, the mesh list holds both', () => {
        const scene = hallScene()
        steelBox(scene, { p: [0, 30, 0], size: [2, 1, 2] })   // steel outside the hall
        forgetBuilding(scene)
        const building = buildingOf(scene, 0)
        expect(building.box.max.y).toBeCloseTo(12, 4)
        expect(building.meshes).toHaveLength(2)
    })
    it('a lamp hung on a truss is not stopped by that truss; the same truss stops a lamp not on it', () => {
        const scene = hallScene()
        // a truss run along x, 0.29 m section, at y 9 z 0
        steelBox(scene, { p: [0, 9, 0], size: [20, 0.29, 0.29] })
        forgetBuilding(scene)
        const building = buildingOf(scene, 0)
        // the lamp's lens 0.2 m under the truss centre: aimed up THROUGH its own mount, it meets the roof (12), not the truss
        const hung = castFromLamp(building.meshes, lampAt([0, 8.8, 0], [Math.PI, 0, 0]), [[0, -1, 0]])
        expect(hung[0].t).toBeCloseTo(3.2, 4)
        // aimed along the truss, from inside it: the end wall, not the truss it hangs on
        const along = castFromLamp(building.meshes, lampAt([0, 8.8, 0], [0, 0, -Math.PI / 2]), [[0, -1, 0]])
        expect(along[0].t).toBeCloseTo(20, 4)
        // a lamp 3 m under the truss, not on it: stopped by it
        const free = castFromLamp(building.meshes, lampAt([0, 6, 0], [Math.PI, 0, 0]), [[0, -1, 0]])
        expect(free[0].t).toBeCloseTo(2.855, 3)
    })
    it('a mesh not tagged stops nothing (a lamp body)', () => {
        const scene = hallScene()
        const body = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
        body.position.set(0, 8, 0)
        scene.add(body)
        scene.updateMatrixWorld(true)
        forgetBuilding(scene)
        const building = buildingOf(scene, 0)
        expect(castFromLamp(building.meshes, lampAt([0, 4, 0], [Math.PI, 0, 0]), [[0, -1, 0]])[0].t).toBeCloseTo(8, 4)
    })
})
