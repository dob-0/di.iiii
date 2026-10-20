#!/usr/bin/env node
/**
 * aim-test.mjs — point real moving heads at one place in the room, the way di computes it, to check pan/tilt on the rig.
 *
 *   PROJECT=<id> node scripts/rigbuild/aim-test.mjs --lamps <entity id>,… --at x,y,z [--others dark] [--desk <base>]
 *   PROJECT=<id> node scripts/rigbuild/aim-test.mjs --lamps <entity id>,… --release
 *
 * For each lamp: the direction from its place in the document to the point, through di's own pan/tilt (dmxPose.js
 * panTiltOfBeam) and channel encoding (dmxDecode.js encodeDmx), held on the desk's manual channels (POST /api/raw),
 * full open white. A photo then shows whether the real beam lands where di thinks it does: if not, the lamp's pan
 * zero, direction or hung flag differs from the room. --others dark holds every other fixture of the universe dark.
 * --release lets the lamps (and the darkened ones) go back to the show.
 */
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { runningMode, panTiltOfBeam, fixturePanOf } from '../../src/rigbuild/dmxPose.js'
import { encodeDmx } from '../../src/rigbuild/dmxDecode.js'
import { withFixtureOverlay } from './fixture-overlay.mjs'

const args = parseArgs()
const project = process.env.PROJECT || args.project || die('PROJECT=<id> (or --project)')
const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
const desk = String(args.desk || `${new URL(api).origin}/light`).replace(/\/$/, '')
const ids = String(args.lamps || '').split(',').filter(Boolean)
if (!ids.length) die('--lamps <entity id>,…')
const c = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
const E = withFixtureOverlay((await c.get(`/api/projects/${project}/document`)).body.document.entities, args['fixture-overlay'] ? String(args['fixture-overlay']) : null)
const library = libraryWithShow(loadLibrary(), E)
const rig = (await (await fetch(`${desk}/api/rig?project=${encodeURIComponent(project)}`)).json()).fixtures
const state = await (await fetch(`${desk}/api/state`)).json()
const raw = (channels) => fetch(`${desk}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: 'aim-test', channels }) })
const lamps = ids.map((id) => {
    const f = rig.find((x) => x.key === `${project}:${id}`) || die(`${id} is not on the desk`)
    const e = E.find((x) => x.id === id); const fx = e.components.fixture
    const live = state.fixtures.find((x) => x.id === f.id)
    return { id, e, fx, f, live, mode: runningMode(typeById(library, fx.type), fx.mode, f.profile), type: typeById(library, fx.type) }
})
const universes = [...new Set(lamps.map((l) => l.live.universe))]
const darkCells = () => state.fixtures.filter((x) => universes.includes(x.universe) && !lamps.some((l) => l.live.id === x.id))
    .flatMap((x) => { const p = state.profiles[x.profile]; const roles = (p && (p.channels || p)) || []; const i = roles.indexOf('dimmer'); return i < 0 ? [] : [{ universe: x.universe, channel: x.address + i }] })
if (args.release) {
    const cells = lamps.flatMap((l) => l.mode.channels.map((ch, i) => ({ universe: l.live.universe, channel: l.live.address + i, value: -1 })))
    await raw([...cells, ...darkCells().map((d) => ({ ...d, value: -1 }))])
    say(`released ${lamps.length} lamps and the darkened fixtures of U${universes.map((u) => u + 1).join(', U')}`)
} else {
    const at = String(args.at || '').split(',').map(Number)
    if (at.length !== 3 || at.some((v) => !Number.isFinite(v))) die('--at x,y,z (metres, room coordinates)')
    const cells = []
    for (const l of lamps) {
        const p = l.e.components.transform.position
        const { pan, tilt } = panTiltOfBeam([at[0] - p[0], at[1] - p[1], at[2] - p[2]], l.fx.hung === true)
        const v = encodeDmx(l.mode.channels, { level: 1, colour: '#ffffff', pan: fixturePanOf(pan, l.fx), tilt }, l.type)
        l.mode.channels.forEach((ch, i) => { if (v[ch.role] != null) cells.push({ universe: l.live.universe, channel: l.live.address + i, value: v[ch.role] }) })
        say(`${l.id} U${l.live.universe + 1}.${String(l.live.address).padStart(3, '0')} at ${p.map((n) => n.toFixed(1)).join(',')}${l.fx.hung ? ' (hung)' : ''} → pan ${pan}° tilt ${tilt}° = DMX pan ${v.pan} tilt ${v.tilt}`)
    }
    if (args.others === 'dark') cells.push(...darkCells().map((d) => ({ ...d, value: 0 })))
    await raw(cells)
    say(`holding; --release gives them back to the show`)
}
