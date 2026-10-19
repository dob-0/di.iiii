import { die } from '../place/common.mjs'
// colour-check.mjs — every scene of a project: the colour each lit lamp is asked for vs the colour its real lamp shows from the
// desk DMX (decoded through the lamp type chart), CIELAB ΔE. Usage: PROJECT=<id> node scripts/rigbuild/colour-check.mjs [out.json]
// Every scene: the colour the scene asks for each lit lamp vs the colour the real lamp shows from the desk's DMX.
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'
import { rigLooksOf, lookPoses } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { runningMode } from '../../src/rigbuild/dmxPose.js'
import { decodeDmx } from '../../src/rigbuild/dmxDecode.js'
const PROJECT = process.env.PROJECT || process.argv[3] || die('PROJECT=<id>')
const c = makeClient('http://diiii.localhost/serverXR', readToken('/home/dob/.di/di.env'))
const doc = (await c.get(`/api/projects/${PROJECT}/document`)).body.document
const entities = doc.entities
let library = loadLibrary(); try { library = libraryWithShow(library, entities) || library } catch {}
const fixtures = (await (await fetch(`http://diiii.localhost/light/api/rig?project=${PROJECT}`)).json()).fixtures
const looks = rigLooksOf(entities)
const desk = deskLooksWithValues(looks, fixtures, { entities, library })
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lab = ([r, g, b]) => { const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92 }; const [R, G, B] = [f(r), f(g), f(b)]
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); X = g3(X); Y = g3(Y); Z = g3(Z); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)] }
const dE = (a, b) => { const A = lab(hex(a)), B = lab(hex(b)); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) }
const byEnt = new Map(entities.map((e) => [e.id, e]))
const rows = []
looks.looks.forEach((look, i) => {
  const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
  const vals = desk[i].steps?.[0]?.values || desk[i].values || {}
  for (const f of fixtures) {
    const id = f.key.split(':')[1]; const e = byEnt.get(id); const p = poses.get(id)
    if (!p || !(p.level > 0) || !p.color) continue
    const fx = e.components.fixture; const type = typeById(library, fx.type); const mode = runningMode(type, fx.mode, f.profile)
    const v = vals[f.id]; if (!mode || !v) continue
    const arr = mode.channels.map((ch) => v[ch.role] ?? 0)
    const d = decodeDmx(mode.channels, arr, type)
    if (!d.colour) continue
    rows.push({ look: look.name || look.label || look.id, kind: fx.type, id, asked: p.color, real: d.colour, dE: Math.round(dE(p.color, d.colour)) })
  }
})
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows))
const bad = rows.filter((r) => r.dE > 15)
const byKind = {}; for (const r of rows) { const k = r.kind; (byKind[k] ||= { n: 0, bad: 0 }); byKind[k].n++; if (r.dE > 15) byKind[k].bad++ }
console.log('lit lamp-scene pairs', rows.length, '; off by ΔE>15:', bad.length, JSON.stringify(byKind))
const agg = {}; for (const r of bad) { const k = `${r.kind} ${r.asked} → ${r.real}`; agg[k] = (agg[k] || new Set()).add(r.look) }
Object.entries(agg).sort((a, b) => b[1].size - a[1].size).slice(0, 18).forEach(([k, s]) => console.log(k, 'dE', rows.find((r) => `${r.kind} ${r.asked} → ${r.real}` === k).dE, '·', s.size, 'scenes:', [...s].slice(0, 4).join(', ')))
