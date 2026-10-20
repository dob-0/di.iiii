#!/usr/bin/env node
/**
 * all-colour.mjs — hold every lamp of the rig at ONE colour, encoded exactly as a scene encodes it, to compare the real
 * colour with the 3D colour lamp type by lamp type (the colour sync, owner 2026-10-17: "lets sync with all colors so make all red").
 *
 *   PROJECT=<id> node scripts/rigbuild/all-colour.mjs --colour '#ff0000' [--level 1] [--extra 2:up-b380f:16ch:1x6,2:up-pl5403:8ch:97x7]
 *   PROJECT=<id> node scripts/rigbuild/all-colour.mjs --colour <hex> --universe 1   (one universe only)
 *   PROJECT=<id> node scripts/rigbuild/all-colour.mjs --release
 *
 * Every lamp patched on the desk for the project, plus --extra lamps given by address (universe:type:mode:first x count, for
 * a cable set up before the document knows it), is encoded with dmxDecode.js encodeDmx — the same call a scene's look makes
 * (deskLookValues.js): RGBW lamps mix it, wheel lamps take the nearest slot. Held on the desk's manual channels (POST
 * /api/raw), which win over the show; pan/tilt are left to the show. Lasers and hazers are never lit. Prints what each type
 * got, so a photo can be read against it. --release lets every channel it held go back to the show.
 */
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { runningMode } from '../../src/rigbuild/dmxPose.js'
import { encodeDmx } from '../../src/rigbuild/dmxDecode.js'

const args = parseArgs()
const project = process.env.PROJECT || args.project || die('PROJECT=<id> (or --project)')
const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
const desk = `${new URL(api).origin}/light/api`
const heldFile = String(args['held-file'] || `${process.env.TMPDIR || '/tmp'}/all-colour-${project}.held.json`)
const post = (path, body) => fetch(`${desk}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

if (args.release) {
    const held = fs.existsSync(heldFile) ? JSON.parse(fs.readFileSync(heldFile, 'utf8')) : []
    await post('raw', { channels: held.map((c) => ({ ...c, value: -1 })) })
    fs.rmSync(heldFile, { force: true })
    say(`released ${held.length} channels — the show has the lamps again`)
    process.exit(0)
}
const colour = String(args.colour || '').trim()
if (!/^#[0-9a-f]{6}$/i.test(colour)) die("--colour '#rrggbb'")
const level = args.level != null ? Math.max(0, Math.min(1, Number(args.level))) : 1
const c = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
const E = (await c.get(`/api/projects/${project}/document`)).body.document.entities
const library = libraryWithShow(loadLibrary(), E)
const rig = (await (await fetch(`${desk}/rig?project=${encodeURIComponent(project)}`)).json()).fixtures
const state = await (await fetch(`${desk}/state`)).json()
const extraUniverses = new Set(String(args.extra || '').split(',').filter(Boolean).map((s) => Number(s.split(':')[0]) - 1))
const lamps = []
for (const f of rig) {
    const e = E.find((x) => x.id === f.key.split(':').slice(1).join(':')); const fx = e?.components?.fixture
    const live = state.fixtures.find((x) => x.id === f.id)
    if (!fx || !live || extraUniverses.has(live.universe)) continue   // a universe given by --extra is taken from the cable, not the old patch
    lamps.push({ label: e.id, type: typeById(library, fx.type), mode: runningMode(typeById(library, fx.type), fx.mode, f.profile), universe: live.universe, address: live.address })
}
for (const spec of String(args.extra || '').split(',').filter(Boolean)) {
    const [u, typeId, modeName, run] = spec.split(':'); const [first, count] = run.split('x').map(Number)
    const type = typeById(library, typeId); const mode = runningMode(type, modeName, null) || die(`--extra ${spec}: no mode ${modeName} for ${typeId}`)
    for (let i = 0; i < count; i++) lamps.push({ label: `U${u}.${first + i * mode.channels.length}`, type, mode, universe: Number(u) - 1, address: first + i * mode.channels.length })
}
// --universe N (as written, U1 = 1): only that universe's lamps — one cable checked at a time (owner 2026-10-17: "universe 1 … all in one color").
if (args.universe != null) { const u = Number(args.universe) - 1; lamps.splice(0, lamps.length, ...lamps.filter((l) => l.universe === u)) }
const held = []; const byType = {}
const taken = new Set(lamps.map((l) => `${l.universe}:${l.address}`))
for (const l of lamps) {
    if (!l.mode) continue
    const cat = l.type?.category
    const out = cat === 'laser' || cat === 'haze' || /haze|smoke|fog/i.test(l.type?.name || '') ? Object.fromEntries(l.mode.channels.map((ch) => [ch.role, 0])) : encodeDmx(l.mode.channels, { level, colour }, l.type)
    l.mode.channels.forEach((ch, i) => { if (out[ch.role] != null && !/^(pan|tilt|panFine|tiltFine)$/.test(ch.role)) held.push({ universe: l.universe, channel: l.address + i, value: out[ch.role] }) })
    const key = `${l.type?.id || '?'} ${l.mode.name || ''}`; (byType[key] ||= { n: 0, sample: out }).n++
}
await post('raw', { channels: held })
fs.writeFileSync(heldFile, JSON.stringify(held.map(({ universe, channel }) => ({ universe, channel }))))
say(`${colour} at ${Math.round(level * 100)} % on ${lamps.length} lamps (${taken.size} addresses), ${held.length} channels held`)
for (const [k, v] of Object.entries(byType)) say(`  ${k.padEnd(22)} ×${v.n}  ${JSON.stringify(v.sample)}`)
