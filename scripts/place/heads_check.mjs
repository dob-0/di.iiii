#!/usr/bin/env node
// heads_check.mjs — how far each look's head move REALLY turns each beam, by the room's own arithmetic (2026-10-17).
// Physics first (owner's hard rule 2026-10-13): a move that turns nothing is illogical on screen. A pan turns a beam about the
// vertical, so a lamp aimed straight up (or down) does not move under a pan-only pattern (sweep, cross, fan). Found on MOXIR v6:
// all 18 beams rest straight up, so 24 scenes "moved" with sweep/cross/fan and nothing turned. This plays every look's `heads`
// through src/rigbuild/headMotion.js (headPlan, headFrame, withHeads: the code the room page runs) over one period (64 steps)
// and measures the angle between each lamp's rest beam and its moved beam (spotAimDirection).
//   node scripts/place/heads_check.mjs DOCUMENT.json [--min 3] [--json]     DOCUMENT = a saved GET /api/projects/<id>/document
//   exit 0 = every moving look turns its beams by >= --min degrees (median over its lamps), 1 = one or more do not, 2 = bad input
import fs from 'node:fs'
import { register } from 'node:module'
// The fixture library imports its JSON charts the way the web build does (no import attributes); this hook lets plain node load them.
register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.json')) { const { readFileSync } = await import('node:fs'); return { format: 'json', source: readFileSync(new URL(url), 'utf8'), shortCircuit: true } }
    return next(url, context)
}`))
const { headPlan, headFrame, withHeads } = await import('../../src/rigbuild/headMotion.js')
const { spotAimDirection } = await import('../../src/project/viewport/spotLightAim.js')
const { TYPE_LIBRARY } = await import('../../src/rigbuild/types/index.js')
const { libraryWithShow } = await import('../../src/rigbuild/rental.js')

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) { console.error('usage: heads_check.mjs DOCUMENT.json [--min DEG] [--json]'); process.exit(2) }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const doc = raw.document || raw
const iMin = args.indexOf('--min')
const MIN = iMin >= 0 ? Number(args[iMin + 1]) : 3
const entities = doc.entities || []
const library = libraryWithShow(TYPE_LIBRARY, entities)
function looksOf(o) {                                   // the stored looks: the first list of objects with `parts` or `heads`
    if (Array.isArray(o)) { if (o.length && o.every((x) => x && typeof x === 'object' && 'id' in x) && o.some((x) => x.parts || x.heads)) return o; for (const v of o) { const r = looksOf(v); if (r) return r } }
    else if (o && typeof o === 'object') for (const v of Object.values(o)) { const r = looksOf(v); if (r) return r }
    return null
}
const looks = looksOf(doc.components || doc) || looksOf(doc) || []
const dirOf = (e) => spotAimDirection(e.components?.transform?.rotation || [0, 0, 0])
const ang = (a, b) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI }
const vec = (d) => (Array.isArray(d) ? d : [d.x, d.y, d.z])
const rows = []
for (const look of looks) {
    if (!look.heads) continue
    const plan = headPlan({ entities, library, look, levelOf: () => 1 })
    if (!plan) { rows.push({ id: look.id, pattern: look.heads.pattern, units: 0, median: 0, min: 0, max: 0 }); continue }
    const ids = new Set(plan.units.map((u) => u.id))
    const rest = new Map(entities.filter((e) => ids.has(e.id)).map((e) => [e.id, vec(dirOf(e))]))
    const most = new Map([...rest.keys()].map((id) => [id, 0]))
    const period = Math.max(0.5, Number(look.heads.period_s) || 8)
    for (let k = 0; k < 64; k++) {
        const moved = withHeads(entities, headFrame(plan, (k / 64) * period * 1000, 0), { library })
        for (const e of moved) if (rest.has(e.id)) most.set(e.id, Math.max(most.get(e.id), ang(rest.get(e.id), vec(dirOf(e)))))
    }
    const v = [...most.values()].sort((a, b) => a - b)
    const r1 = (x) => Math.round(x * 10) / 10
    rows.push({ id: look.id, pattern: look.heads.pattern, units: v.length, median: r1(v[Math.floor(v.length / 2)] || 0), min: r1(v[0] || 0), max: r1(v[v.length - 1] || 0) })
}
const still = rows.filter((r) => r.median < MIN)
if (args.includes('--json')) console.log(JSON.stringify({ min: MIN, still: still.length, rows }))
else {
    for (const r of rows) console.log(`${r.median < MIN ? 'STILL' : 'moves'} ${String(r.median).padStart(5)} deg  ${r.id}  (${r.pattern}, ${r.units} lamps, ${r.min}..${r.max})`)
    console.log(`${rows.length} looks with heads, ${still.length} turn their beams less than ${MIN} deg`)
}
process.exit(still.length ? 1 : 0)
