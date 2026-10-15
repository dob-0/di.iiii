// The cost of beamReach.js per frame, measured (node, no GPU): N lamps in a hall of ~100k triangles (a BoxGeometry
// subdivided to the triangle count of a real hall model), each casting the axis + 8 rim rays. "still": every lamp's
// per-frame check with nothing moved; "moving": every lamp re-cast in one frame (a whole-rig look sweep; at most
// 15 such frames a second, RECAST_MS). Prints one line per N.
//   node scripts/rigbuild/beam-reach-cost.mjs
import { BoxGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Scene, Vector3 } from 'three'
import { buildingOf, coneRays, createReachTracker } from '../../src/objectComponents/beamReach.js'

const scene = new Scene()
const hall = new Group()
hall.userData.svBuilding = true
const seg = 75
const mesh = new Mesh(new BoxGeometry(96, 16, 107, seg, seg, seg), new MeshBasicMaterial())
mesh.position.set(12, 8, 0)
hall.add(mesh)
scene.add(hall)
scene.updateMatrixWorld(true)
let t0 = performance.now()
const building = buildingOf(scene, 0)
const bvhMs = performance.now() - t0
const tris = mesh.geometry.index.count / 3
const dirs = coneRays(0.3)
const lampAt = (i, tilt) => new Matrix4().compose(new Vector3(-30 + (i % 60), 9 + (i % 3), -40 + Math.floor(i / 60) * 6), new Quaternion().setFromEuler(new Euler(tilt + (i % 7) * 0.3, 0, (i % 5) * 0.4)), new Vector3(1, 1, 1))
console.log(`hall: ${tris} triangles, BVH built once in ${bvhMs.toFixed(0)} ms; ${dirs.length} rays a lamp`)
for (const N of [10, 50, 100, 200]) {
    const trackers = Array.from({ length: N }, () => createReachTracker())
    const still = Array.from({ length: N }, (_, i) => lampAt(i, 0.2))
    trackers.forEach((t, i) => t.step({ matrixWorld: still[i], dirs, building, now: 0 }))
    const frames = 300
    t0 = performance.now()
    for (let f = 0; f < frames; f += 1) trackers.forEach((t, i) => t.step({ matrixWorld: still[i], dirs, building, now: 1e4 + f }))
    const stillMs = (performance.now() - t0) / frames
    const sweeps = 30
    t0 = performance.now()
    for (let f = 0; f < sweeps; f += 1) trackers.forEach((t, i) => t.step({ matrixWorld: lampAt(i, 0.2 + (f + 1) * 0.05), dirs, building, now: 1e5 + f * 1000 }))
    const moveMs = (performance.now() - t0) / sweeps
    console.log(`N=${N}: still ${stillMs.toFixed(3)} ms/frame; all re-cast ${moveMs.toFixed(2)} ms/frame (≤15/s → ≤${(moveMs * 15 / 10).toFixed(1)} % of a second)`)
}
