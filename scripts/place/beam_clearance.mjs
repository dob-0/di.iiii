// beam_clearance.mjs — does a lamp's beam reach the roof, or does the building's steel stop it on the way? (2026-10-14)
// Owner, on the moving heads put on a roof-frame line: "you put the beams with the line of the arc and will block — make a bit
// right or left". physics_check.py tests the hall record's dims.shell slabs (walls, deck, lanterns, glazing) and the floor; this casts against the hall's
// REAL model (the project's hall GLB: frame, girders, cranes, columns): each lamp's axis + 8 rim rays at its half-angle.
//
//   node scripts/place/beam_clearance.mjs --glb <hall.glb> --doc <document.json> [--type <fixture type>] [--ids a,b,c]
//        [--search-dz -3:3:0.25]   # move the --ids along z as one row: the shifts whose every ray clears, nearest first
//
// Prints per lamp: the axis' first hit (height @ mesh) and the lowest rim hit. Reads files only; writes nothing.
import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const buf = fs.readFileSync(arg('glb'))
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej))
gltf.scene.updateMatrixWorld(true)
const meshes = []
gltf.scene.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundsTree(); o.material.side = THREE.DoubleSide; meshes.push(o) } })
const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.far = 60
const nameOf = (o) => { for (let p = o; p; p = p.parent) if (p.name) return p.name; return '?' }
// the beam's own direction (the lamp's local -Y through its rotation), its axis and 8 rim rays at the half-angle
const castBeam = (p, rot, halfDeg) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'))
    const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(q).normalize()
    const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
    const v = new THREE.Vector3().crossVectors(axis, u)
    const t = Math.tan(halfDeg * Math.PI / 180)
    const dirs = [axis, ...[...Array(8)].map((_, k) => axis.clone().addScaledVector(u, t * Math.cos(k * Math.PI / 4)).addScaledVector(v, t * Math.sin(k * Math.PI / 4)).normalize())]
    return dirs.map((d) => { rc.set(new THREE.Vector3(...p), d); const h = rc.intersectObjects(meshes, false)[0]; return h ? { y: +h.point.y.toFixed(2), d: +h.distance.toFixed(2), mesh: nameOf(h.object) } : { y: null, d: null, mesh: 'none' } })
}
const doc = JSON.parse(fs.readFileSync(arg('doc'))); const ents = (doc.document || doc).entities
const ids = arg('ids') ? new Set(arg('ids').split(',')) : null
const lamps = ents.filter((e) => (ids ? ids.has(e.id) : (e.components.fixture || {}).type === arg('type')))
const half = (e) => (e.components.light?.angle ?? 0.035) * 180 / Math.PI
const lowest = (r) => r.reduce((a, b) => (b.y !== null && (a.y === null || b.y < a.y) ? b : a))
if (!arg('search-dz')) {
    for (const e of lamps) {
        const t = e.components.transform; const r = castBeam(t.position, t.rotation || [0, 0, 0], half(e)); const lo = lowest(r)
        console.log(`${e.id.padEnd(22)} ${JSON.stringify(t.position.map((x) => +x.toFixed(2))).padEnd(24)} axis ${r[0].y}@${r[0].mesh}  lowest ${lo.y}@${lo.mesh}`)
    }
} else {
    const [a, b, s] = arg('search-dz').split(':').map(Number)
    const rows = []
    for (let dz = a; dz <= b + 1e-9; dz += s) {
        const per = lamps.map((e) => { const t = e.components.transform; return lowest(castBeam([t.position[0], t.position[1], t.position[2] + dz], t.rotation || [0, 0, 0], half(e))).y ?? 99 })
        rows.push({ dz: +dz.toFixed(2), worst: Math.min(...per), per })
    }
    rows.sort((x, y) => y.worst - x.worst || Math.abs(x.dz) - Math.abs(y.dz))
    for (const r of rows.slice(0, 10)) console.log(`dz ${String(r.dz).padStart(6)}  worst ${r.worst}  per ${r.per.join(' ')}`)
}
