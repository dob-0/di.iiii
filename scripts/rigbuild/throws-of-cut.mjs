// throws for the lamps that have none: walk each lamp's axis to the first thing it meets (footprints.mjs castRay: the hall's
// building model + its solids + the rig's own steel), floor included. Prints id, dir, hit, throw.
import fs from 'node:fs'
import { makeBuilding, hallSolids, rigSolids, castRay, eulerXYZ } from '/home/dob/work/di.iiii-moxir-one/scripts/rigbuild/footprints.mjs'
const hall = JSON.parse(fs.readFileSync('/mnt/data/footage/place-moxir-hall-v13-skin-2026-10-12/hall.json', 'utf8'))
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).document
const building = makeBuilding(hall); const solids = [...hallSolids(hall), ...rigSolids(doc.entities)]
for (const e of doc.entities) {
  if (e.type !== 'spotLight') continue
  const fx = e.components.fixture || {}; const pos = fx.position || ''
  if (!(process.env.MATCH ? new RegExp(process.env.MATCH).test(pos + ' ' + (fx.type || '')) : /cut/.test(pos))) continue
  const T = e.components.transform; const m = eulerXYZ(T.rotation); const dir = [-m[0][1], -m[1][1], -m[2][1]]   // the spot's own axis is -Y, as in moxir_render.py dir_of
  const h = castRay(T.position, dir, { building, solids, maxReach: 80 })
  let thr = h.throw, hit = h.hit
  if (thr == null && dir[1] < 0) { thr = T.position[1] / -dir[1]; hit = 'floor (y=0 plane)' }
  console.log(e.id.padEnd(30), 'dir', dir.map((v) => +v.toFixed(2)).join(','), 'now', e.components.beam?.length, '→', hit, h.detail || '', thr == null ? 'open air' : +thr.toFixed(2))
}
