// PROTOTYPE kept for the before/after record (design 2026-10-14 §4); the product bench is trace-bench.mjs.
// Bench for the design doc: geometry -> laser frame, in node, three.js from di.iiii's node_modules.
// Pipeline per frame: (cached) feature edges -> world matrix -> angular projection from a viewpoint
// -> chain segments into polylines -> nearest-neighbour order with reversal -> resample to a point budget.
import * as THREE from 'three'

const FIELD_HALF = (18.5 * Math.PI) / 180
const BUDGET = Number(process.argv[2] || 1000)
const PIECES = Number(process.argv[3] || 20)
const FRAMES = 300

const makers = [
  () => new THREE.BoxGeometry(1, 1, 1),
  () => new THREE.SphereGeometry(0.5, 16, 12),
  () => new THREE.CylinderGeometry(0.5, 0.5, 1.5, 24),
  () => new THREE.ConeGeometry(0.5, 1.5, 24),
  () => new THREE.TorusGeometry(0.5, 0.18, 12, 32),
]
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pieces = Array.from({ length: PIECES }, (_, i) => ({
  kind: i % makers.length,
  pos: new THREE.Vector3((rnd() - 0.5) * 4, (rnd() - 0.5) * 3, (rnd() - 0.5) * 2),
  rot: new THREE.Euler(rnd() * 6, rnd() * 6, 0),
}))

const edgeCache = new Map()
const edgesOf = (kind, cached) => {
  if (cached && edgeCache.has(kind)) return edgeCache.get(kind)
  const e = new THREE.EdgesGeometry(makers[kind](), 20).attributes.position.array
  if (cached) edgeCache.set(kind, e)
  return e
}

const view = new THREE.Matrix4().makeTranslation(0, 0, -6) // viewpoint at z=+6 looking down -z
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1)

const pathCache = new Map()
const objPaths = (kind) => {
  if (pathCache.has(kind)) return pathCache.get(kind)
  const e = edgesOf(kind, true), segs = []
  for (let i = 0; i < e.length; i += 6) segs.push([[e[i], e[i + 1], e[i + 2]], [e[i + 3], e[i + 4], e[i + 5]]])
  const paths = chain(segs, (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`)
  pathCache.set(kind, paths); return paths
}
function chain(segs, key) {
  const ends = new Map(), used = new Uint8Array(segs.length)
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); (ends.get(k) || ends.set(k, []).get(k)).push(i) } })
  const paths = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const path = [segs[i][0], segs[i][1]]
    for (;;) {
      const tail = path[path.length - 1]
      const next = (ends.get(key(tail)) || []).find((j) => !used[j])
      if (next === undefined) break
      used[next] = 1
      const s = segs[next]
      path.push(key(s[0]) === key(tail) ? s[1] : s[0])
    }
    paths.push(path)
  }
  return paths
}
function frame(t, cached) {
  const segs = []
  if (cached === 'chain') {
    const paths = []
    for (const p of pieces) {
      q.setFromEuler(new THREE.Euler(p.rot.x + t, p.rot.y + t * 0.7, 0))
      m.compose(p.pos, q, one).premultiply(view)
      for (const op of objPaths(p.kind)) {
        const out = []
        for (const w of op) { v.set(w[0], w[1], w[2]).applyMatrix4(m); if (v.z < -0.01) out.push([Math.atan2(v.x, -v.z) / FIELD_HALF, Math.atan2(v.y, -v.z) / FIELD_HALF]) }
        if (out.length > 1) paths.push(out)
      }
    }
    return finish(paths, 0)
  }
  for (const p of pieces) {
    q.setFromEuler(new THREE.Euler(p.rot.x + t, p.rot.y + t * 0.7, 0))
    m.compose(p.pos, q, one).premultiply(view)
    const e = edgesOf(p.kind, cached)
    for (let i = 0; i < e.length; i += 6) {
      const a = [], b = []
      for (const [out, o] of [[a, i], [b, i + 3]]) {
        v.set(e[o], e[o + 1], e[o + 2]).applyMatrix4(m)
        if (v.z >= -0.01) { out.length = 0; break }
        out.push(Math.atan2(v.x, -v.z) / FIELD_HALF, Math.atan2(v.y, -v.z) / FIELD_HALF)
      }
      if (a.length && b.length) segs.push([a, b])
    }
  }
  const paths = chain(segs, (p) => `${Math.round(p[0] * 4096)},${Math.round(p[1] * 4096)}`)
  return finish(paths, segs.length)
}
function finish(paths, nsegs) {
  const segs = { length: nsegs }
  // nearest-neighbour order with reversal
  const ordered = [], left = new Set(paths.map((_, i) => i))
  let at = [0, 0]
  while (left.size) {
    let best = -1, rev = false, bd = Infinity
    for (const i of left) {
      const p = paths[i], d0 = Math.hypot(p[0][0] - at[0], p[0][1] - at[1]), d1 = Math.hypot(p.at(-1)[0] - at[0], p.at(-1)[1] - at[1])
      if (d0 < bd) { bd = d0; best = i; rev = false }
      if (d1 < bd) { bd = d1; best = i; rev = true }
    }
    left.delete(best)
    const p = rev ? paths[best].slice().reverse() : paths[best]
    ordered.push(p); at = p.at(-1)
  }
  // resample to the budget by arc length (lit), one blank point per jump
  let total = 0
  for (const p of ordered) for (let i = 1; i < p.length; i++) total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  const lit = Math.max(1, BUDGET - ordered.length * 2), step = total / lit
  const pts = []
  for (const p of ordered) {
    pts.push([p[0][0], p[0][1], 0, 0, 0])
    let carry = 0
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
      for (let s = step - carry; s <= d; s += step) { const u = s / d; pts.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u, 0, 1, 0]) }
      carry = (carry + d) % step
    }
    pts.push([p.at(-1)[0], p.at(-1)[1], 0, 1, 0])
  }
  return { segs: segs.length, paths: paths.length, pts: pts.length, json: JSON.stringify(pts.map((p) => p.map((n) => +n.toFixed(4)))).length }
}

for (const cached of [false, true, 'chain']) {
  const times = []
  let info
  for (let f = 0; f < FRAMES; f++) { const t0 = performance.now(); info = frame(f / 25, cached); times.push(performance.now() - t0) }
  times.sort((a, b) => a - b)
  const med = times[FRAMES >> 1], p95 = times[Math.floor(FRAMES * 0.95)]
  console.log(`${cached === 'chain' ? 'chain cached  ' : cached ? 'edges cached  ' : 'edges per frame'} pieces=${PIECES} budget=${BUDGET}: median ${med.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms per trace; x6 cubes median ${(med * 6).toFixed(1)} ms | segs ${info.segs} paths ${info.paths} pts ${info.pts} json ${(info.json / 1024).toFixed(1)} KB`)
}
