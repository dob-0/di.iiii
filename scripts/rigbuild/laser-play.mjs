#!/usr/bin/env node
/**
 * laser-play.mjs — play a project's LaserCube lines on the real cubes, in time with the room page.
 *
 *   node scripts/rigbuild/laser-play.mjs --project <id> --api <base>/serverXR --token-file <f> \
 *       [--map <unit>=<serial>,…] [--fps 25] [--once]
 *
 * Every lamp whose fixture type is a LaserCube (ext-lc-*) and whose beam.laser carries `frames` is a LINE. Lines are
 * grouped by fixture.unit: one unit = one cube. Each tick, every cube gets the union of its lines' frame at show
 * time t — the SAME pick the room page draws (src/objectComponents/laserLine.js framePickAt:
 * list[floor(((t mod period) / period) · n)], t = the server's clock), so the cubes and the 3D page show one picture.
 * The frame goes to the laser server (POST <origin>/laser/api/frame), which owns every safety rule: nothing reaches a
 * cube until a person arms it with the sign-off phrase; the signal-loss and still-beam stops stay the server's. This
 * script never arms.
 *
 * --map   which cube serial plays which unit (e.g. 1=8cbfea06aa58,2=8cbfea06aa5c). Default: the units in order onto
 *         the cubes in the server's list order — said out loud, because only the person who hung them knows.
 * --once  send one tick and print what went where (a check, no loop).
 */
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'

/** The frame on at show time t (s) — the room page's pick (laserLine.js). Pure. */
export const frameAt = (frames, t) => {
    const n = frames?.list?.length || 0
    if (!n || !(frames.period > 0)) return null
    const phase = ((t % frames.period) + frames.period) % frames.period
    return frames.list[Math.min(n - 1, Math.floor((phase / frames.period) * n))]
}

/** The project's LaserCube lines grouped by unit: { unit: [frames, …] }. Pure. */
export const cubeLinesOf = (entities) => {
    const out = {}
    for (const e of entities || []) {
        const fx = e?.components?.fixture
        const frames = e?.components?.beam?.laser?.frames
        if (!fx || !/^ext-lc-/.test(String(fx.type || '')) || !frames) continue
        const unit = String(fx.unit ?? '?')
        ;(out[unit] ||= []).push(frames)
    }
    return out
}

/** One cube's points at t: every line's frame, joined. Pure. */
export const cubePointsAt = (lineFrames, t) => lineFrames.flatMap((f) => frameAt(f, t) || [])

/** unit → cube id, from --map (serials) or in order. Pure. */
export const unitMap = (units, cubes, mapArg) => {
    const out = {}
    if (mapArg) {
        for (const pair of String(mapArg).split(',')) {
            const [unit, serial] = pair.split('=').map((s) => s.trim())
            const cube = cubes.find((c) => c.serial === serial || c.id === serial)
            if (!cube) throw new Error(`--map ${pair}: no cube with that serial on the laser server`)
            out[unit] = cube.id
        }
        return out
    }
    units.forEach((u, i) => { if (cubes[i]) out[u] = cubes[i].id })
    return out
}

const main = async () => {
    const args = parseArgs()
    const project = args.project ? String(args.project) : die('laser-play.mjs needs --project <id>.')
    const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
    const laser = `${new URL(api).origin}/laser/api`
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const read = await client.get(`/api/projects/${project}/document`)
    if (!read.ok) die(`reading ${project} failed — HTTP ${read.status}`)
    const lines = cubeLinesOf(read.body.document?.entities)
    const units = Object.keys(lines).sort((a, b) => Number(a) - Number(b))
    if (!units.length) die(`${project}: no LaserCube line carries frames`)
    const state = await (await fetch(`${laser}/state`)).json()
    const map = unitMap(units, state.cubes || [], args.map)
    for (const u of units) say(`unit ${u}: ${lines[u].length} lines → ${map[u] ? `${map[u]} (${state.cubes.find((c) => c.id === map[u]).serial})` : 'NO CUBE'}`)
    if (!args.map) say('mapping by order (no --map): tell the script which serial hangs where with --map <unit>=<serial>,…')
    const post = (path, body) => fetch(`${laser}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const last = {}
    const tick = async () => {
        const t = Date.now() / 1000
        for (const u of units) {
            const cube = map[u]
            if (!cube) continue
            const points = cubePointsAt(lines[u], t)
            const key = JSON.stringify(points)
            const r = key === last[cube] ? await post('alive', { cube }) : await post('frame', { cube, points })
            if (!r.ok) say(`${cube}: ${r.status} ${(await r.text()).slice(0, 160)}`)
            last[cube] = key
        }
    }
    if (args.once) { await tick(); return say('one tick sent') }
    const ms = Math.round(1000 / Math.max(1, Math.min(25, Number(args.fps) || 25)))
    say(`playing ${units.length} cubes at ${Math.round(1000 / ms)} frames a second — Ctrl-C stops (the server blanks a cube 200 ms after the last frame)`)
    let busy = false
    setInterval(() => { if (busy) return; busy = true; tick().catch((e) => say(e.message)).finally(() => { busy = false }) }, ms)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => die(error.message))
