#!/usr/bin/env node
/**
 * look-roundtrip.mjs — every rig look, lamp by lamp: what the 3D draws from the DESK's values, against what the look intends.
 *
 *   PROJECT=<id> node scripts/rigbuild/look-roundtrip.mjs [--api <base>/serverXR] [--json out.json] [--look <id>]
 *
 * For each look and each lamp the desk would drive: the desk values (deskLookValues.js deskLooksWithValues, the same call
 * show-loop.mjs makes), filled with the profile's defaults the way the desk fills a channel a look leaves alone, decoded
 * the way the 3D reads the wire (dmxDecode.js decodeDmx; pan through dmxPose.js roomPanOf). Compared with the look's own
 * pose (looks.js lookPoses):
 *   level   |Δ| > 0.05
 *   colour  ΔE76 > 15 in CIELAB (only where the look lights the lamp)
 *   aim     the two beam directions more than 5° apart (moving heads only)
 * The look's LEVEL MOTION (look.motion) is listed apart: it is what the desk does not play (owner 2026-10-17: "in 3d beams
 * are strobe but in real not"). Read-only: nothing is sent to the desk or the document.
 */
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { rigLooksOf, lookPoses } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { runningMode, roomPanOf, beamOfPanTilt } from '../../src/rigbuild/dmxPose.js'
import { decodeDmx } from '../../src/rigbuild/dmxDecode.js'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const lab = ([r, g, b]) => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const [R, G, B] = [lin(r), lin(g), lin(b)]
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
    const [x, y, z] = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883]
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
/** ΔE76 between two hex colours, or null when either is missing. Pure. */
export const deltaE = (a, b) => { const p = hexRgb(a); const q = hexRgb(b); if (!p || !q) return null; const [l1, a1, b1] = lab(p); const [l2, a2, b2] = lab(q); return Math.hypot(l1 - l2, a1 - a2, b1 - b2) }
/** Degrees between two direction vectors. Pure. */
export const angleDeg = (u, v) => { const d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI }

const args = parseArgs()
const project = process.env.PROJECT || args.project || die('PROJECT=<id> (or --project)')
const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
const c = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
const entities = (await c.get(`/api/projects/${project}/document`)).body.document.entities
const library = libraryWithShow(loadLibrary(), entities)
const rig = (await (await fetch(`${new URL(api).origin}/light/api/rig?project=${encodeURIComponent(project)}`)).json()).fixtures
const looks = rigLooksOf(entities) || die(`${project} has no rig looks`)
const fresh = deskLooksWithValues(looks, rig, { entities, library })
const byId = new Map(entities.map((e) => [e.id, e]))
const out = { project, looks: [], totals: { lamps: 0, level: 0, colour: 0, aim: 0 }, motion: {} }
looks.looks.forEach((look, i) => {
    if (args.look && look.id !== args.look) return
    const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
    const values = fresh[i]?.steps?.[0]?.values || {}
    const row = { id: look.id, title: look.title || look.id, level: [], colour: [], aim: [] }
    for (const [fid, cell] of Object.entries(values)) {
        const f = rig.find((x) => x.id === fid); if (!f) continue
        const id = f.key.split(':').slice(1).join(':'); const e = byId.get(id); const fx = e?.components?.fixture; if (!fx) continue
        const type = typeById(library, fx.type); const mode = runningMode(type, fx.mode, f.profile); if (!mode) continue
        const d = decodeDmx(mode.channels, mode.channels.map((ch) => cell[ch.role] ?? ch.default ?? 0), type)
        const pose = poses.get(id); const want = type?.category === 'laser' ? 0 : (pose?.level ?? 0)
        out.totals.lamps++
        if (Math.abs((d.level ?? 0) - want) > 0.05) row.level.push(`${id} want ${want.toFixed(2)} 3D ${(d.level ?? 0).toFixed(2)}`)
        if (want > 0 && pose?.color && d.colour) { const dE = deltaE(pose.color, d.colour); if (dE > 15) row.colour.push(`${id} want ${pose.color} 3D ${d.colour} ΔE ${dE.toFixed(0)}`) }
        if (want > 0 && pose?.rotation && d.pan != null && d.tilt != null && Array.isArray(type?.pan_tilt_deg?.value)) {
            const a = angleDeg(spotAimDirection(pose.rotation), beamOfPanTilt(roomPanOf(d.pan, fx), d.tilt, fx.hung === true))
            if (a > 5) row.aim.push(`${id} ${a.toFixed(0)}° off`)
        }
    }
    for (const k of ['level', 'colour', 'aim']) out.totals[k] += row[k].length
    if (look.motion) { const m = look.motion; (out.motion[m.mode || '?'] ||= []).push(look.title || look.id) }
    out.looks.push(row)
})
const t = out.totals
say(`${project}: ${out.looks.length} looks, ${t.lamps} lamp-looks checked — level off ${t.level}, colour off ${t.colour}, aim off ${t.aim}`)
for (const r of out.looks.filter((x) => x.level.length + x.colour.length + x.aim.length).slice(0, 12)) say(`  ${r.title.padEnd(22)} level ${r.level.length} colour ${r.colour.length} aim ${r.aim.length}  ${[...r.colour, ...r.aim, ...r.level].slice(0, 2).join(' | ')}`)
say(`looks with level motion the desk does not play: ${Object.values(out.motion).flat().length} (${Object.entries(out.motion).map(([k, v]) => `${k} ${v.length}`).join(', ')})`)
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1))
