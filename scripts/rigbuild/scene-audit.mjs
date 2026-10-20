#!/usr/bin/env node
/**
 * scene-audit.mjs — every scene of a project: what the room draws that the real rig cannot show right now, and why.
 *
 *   PROJECT=<id> node scripts/rigbuild/scene-audit.mjs [--live 1,2] [--fixture-overlay <file>] [--json out.json]
 *
 * For each lamp a scene lights (looks.js lookPoses, level > 0), one finding per reason:
 *   unpatched       the lamp has no fixture on the desk — no DMX reaches it (and a lamp with none at all is drawn anyway)
 *   no-controller   its universe is not in --live (no node or widget carries it to the rig tonight)
 *   cube-off        a LaserCube line while the laser server is disarmed or the cube is not connected
 *   laser-held      a DMX laser the desk holds OUT until a look carries the laser safety sign-off (deskLookValues.js)
 *   aim-unverified  a moving head with no pan correction measured on the rig (fixture.panOffsetDeg / panInvert absent)
 *   desk-stale      the desk's look sends other values than di computes now (show-loop.mjs reloads it)
 * Prints totals, then each reason with its lamps and how many scenes they light in. Read-only.
 */
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { withFixtureOverlay } from './fixture-overlay.mjs'
import { rigLooksOf, lookPoses } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'

const args = parseArgs()
const project = process.env.PROJECT || args.project || die('PROJECT=<id> (or --project)')
const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
const origin = new URL(api).origin
const live = args.live ? new Set(String(args.live).split(',').map((u) => Number(u))) : null
const c = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
const doc = (await c.get(`/api/projects/${project}/document`)).body.document
const entities = withFixtureOverlay(doc.entities, args['fixture-overlay'] ? String(args['fixture-overlay']) : null)
const library = libraryWithShow(loadLibrary(), entities)
const rig = (await (await fetch(`${origin}/light/api/rig?project=${encodeURIComponent(project)}`)).json()).fixtures
const deskLooks = (await (await fetch(`${origin}/light/api/looks`)).json()).looks
let laser = null
try { laser = await (await fetch(`${origin}/laser/api/state`)).json() } catch { laser = null }
const looks = rigLooksOf(entities)
const fresh = deskLooksWithValues(looks, rig, { entities, library })
const byId = new Map(entities.map((e) => [e.id, e]))
const deskOf = new Map(rig.map((f) => [f.key.split(':').slice(1).join(':'), f]))
const findings = {}
const add = (reason, id, scene) => { const r = (findings[reason] ||= {}); (r[id] ||= new Set()).add(scene) }
looks.looks.forEach((look, i) => {
    const scene = look.title || look.name || look.id
    const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
    for (const [id, p] of poses) {
        if (!p || !(p.level > 0)) continue
        const e = byId.get(id); const fx = e?.components?.fixture; if (!fx?.type) continue
        const type = typeById(library, fx.type)
        const isCube = /^ext-lc-/.test(fx.type)
        const f = deskOf.get(id)
        if (isCube) {
            const cubesUp = laser && laser.armed && (laser.cubes || []).some((cu) => cu.connected)
            if (!cubesUp) add('cube-off', id, scene)
            continue
        }
        if (!f) { add('unpatched', id, scene); continue }
        if (live && !live.has(Number(f.universe))) add('no-controller', id, scene)
        if (type?.category === 'laser' && look.laserSignedOff !== true) add('laser-held', id, scene)
        if (Array.isArray(type?.pan_tilt_deg?.value) && fx.panOffsetDeg == null && fx.panInvert == null) add('aim-unverified', id, scene)
    }
    const want = fresh[i]?.steps?.[0]?.values || {}
    const onDesk = deskLooks.find((d) => d.name === fresh[i]?.name)?.steps?.[0]?.values || {}
    for (const [fid, cell] of Object.entries(want)) {
        const have = onDesk[fid] || {}
        if (Object.entries(cell).some(([role, v]) => (have[role] ?? null) !== v)) { const f = rig.find((x) => x.id === fid); add('desk-stale', f ? f.key.split(':').slice(1).join(':') : fid, scene) }
    }
})
const out = {}
for (const [reason, lamps] of Object.entries(findings)) out[reason] = Object.fromEntries(Object.entries(lamps).map(([id, s]) => [id, [...s]]))
say(`${project}: ${looks.looks.length} scenes; live universes ${live ? [...live].join(',') : 'all'}; laser server ${laser ? (laser.armed ? 'armed' : 'disarmed') : 'not reachable'}`)
for (const [reason, lamps] of Object.entries(out)) {
    const scenes = new Set(Object.values(lamps).flat())
    say(`${reason.padEnd(15)} ${String(Object.keys(lamps).length).padStart(3)} lamps in ${scenes.size} scenes: ${Object.entries(lamps).slice(0, 8).map(([id, s]) => `${id}(${s.length})`).join(' ')}${Object.keys(lamps).length > 8 ? ' …' : ''}`)
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1))
