#!/usr/bin/env node
/**
 * cue-wire-check.mjs — for each cue of a project's show on the light desk: does the WIRE play what the 3D plays?
 * Which lamps are lit, and which lamps whose level should move (strobe, pulse, chase, breathe…) really move.
 * (MOXIR, owner 2026-10-17: "in 3d beams are strobe but in real not".)
 *
 *   node scripts/rigbuild/cue-wire-check.mjs --project <id> [--api http://diiii.localhost/serverXR] [--token-file ~/.di/di.env]
 *        [--desk http://diiii.localhost/light/api] [--cues 0-49|14,41] [--seconds 3] [--hz 20] [--nodes ip,ip]
 *        [--json out.json] [--dry-run] [--no-restore] [--follow [--follow-minutes N]]
 *   --follow  measure each picked cue when the desk's own runner plays it (no GO, nothing posted): the show keeps playing for
 *             the people watching it; one loop of the show and two minutes by default.
 *
 * EXPECTED comes from the room's own maths, never re-derived here: the cue's look (desk `rig-<x>` = the document's look <x>), its
 * lit lamps (looks.js lookPoses level > 0) and its motion (lookMotion.js motionPlan / motionFrame, the room side the desk twin
 * serverXR/src/lighting/lookMotion.js is pinned to by lookMotion.test.js). MEASURED: GO the cue, wait its fade + 0.5 s, sample the
 * desk's GET /dmx and each node's GET /api/dmx. A lamp is "lit" when its dimmer reaches > 0, "moving" when its dimmer swings by more
 * than 20 in the window. Lasers, hazers, smoke and spark machines have no level motion (deskLookValues NO_MOTION) and a laser is dark
 * in every look: they are not measured.
 *
 * Wire keys, measured 2026-10-17 on the live desk: the desk's /dmx keys are the 0-based universe index (rig universe 1 = key "0").
 * A node's /api/dmx has ONE key "0" (its own port); which desk universe that is comes from the node's own GET /api/input
 * (config.universes[0].universe, 0-based). The node runs the same desk code standalone, listens to Art-Net on its own and its
 * /api/dmx is its own received buffer (merged HTP with its own empty desk), not a bridge to the main desk: `nodeKind` says how that is shown.
 *
 * Writes: POST /cues/go per cue (and the restore, at the end or on Ctrl-C). --dry-run does no POST and reads no wire.
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { rigLooksOf, lookPoses, posedEntities, deskLookId } from '../../src/rigbuild/looks.js'
import { motionOf, motionPlan, motionFrame, djCentre } from '../../src/rigbuild/lookMotion.js'
import { NO_MOTION } from '../../src/rigbuild/deskLookValues.js'

export const MOVE_THRESHOLD = 20   // a dimmer swing (0-255) above this is "moving", on the wire and in the expectation alike

/** "0-49", "14,41", "3-5,9" → sorted unique indices inside 0..total-1; null / '' = all. Throws on nonsense. */
export const parseCueRange = (spec, total) => {
    if (spec == null || spec === true || String(spec).trim() === '') return Array.from({ length: total }, (_, i) => i)
    const out = new Set()
    for (const part of String(spec).split(',')) {
        const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part)
        if (!m) throw new Error(`--cues: cannot read "${part.trim()}" (use 0-49 or 14,41)`)
        const a = Number(m[1])
        const b = m[2] == null ? a : Number(m[2])
        if (b < a) throw new Error(`--cues: "${part.trim()}" runs backwards`)
        for (let i = a; i <= b; i++) if (i < total) out.add(i)
    }
    return [...out].sort((x, y) => x - y)
}

/** Series of dimmer values → { min, max, lit, moving, changes, perSec }. A "change" = a step of more than `threshold`. */
export const statsOf = (series, { seconds = 1, threshold = MOVE_THRESHOLD } = {}) => {
    if (!series.length) return { n: 0, min: 0, max: 0, lit: false, moving: false, changes: 0, perSec: 0 }
    let min = Infinity
    let max = -Infinity
    let changes = 0
    series.forEach((v, i) => {
        if (v < min) min = v
        if (v > max) max = v
        if (i && Math.abs(v - series[i - 1]) > threshold) changes++
    })
    const moving = max - min > threshold
    return { n: series.length, min, max, lit: max > 0, moving, changes, perSec: moving && seconds > 0 ? Math.round((changes / seconds) * 10) / 10 : 0 }
}

/** The desk fixtures that have a dimmer, joined to their document lamp: { key, id, kind, universe(1-based), index (0-based buffer slot), entity }. */
export const lampsOf = ({ deskFixtures, profiles, entities, library }) => {
    const byEntity = new Map(entities.map((e) => [e.id, e]))
    const lamps = []
    const skipped = []
    for (const f of deskFixtures) {
        const entityId = String(f.key || '').split(':').slice(1).join(':')
        const entity = byEntity.get(entityId)
        const channels = profiles?.[f.profile]?.channels || []
        const offset = channels.indexOf('dimmer')
        const type = typeById(library, entity?.components?.fixture?.type)
        if (!entity) { skipped.push({ id: entityId, why: 'not in the document' }); continue }
        if (offset < 0) { skipped.push({ id: entityId, why: `no dimmer channel (${type?.category || f.profile})` }); continue }
        lamps.push({ key: f.key, deskId: f.id, entityId, kind: String(f.profile).replace(/ \d+ch.*$/, ''), category: type?.category || null, universe: f.universe, index: f.address - 1 + offset, entity })
    }
    return { lamps, skipped }
}

/** The look of a desk cue (`rig-<id>`, deskLookId clips it to 40 chars) in the document's rig looks. */
export const lookOfCue = (cue, rigLooks) => (rigLooks?.looks || []).find((l) => deskLookId(l.id) === cue?.lookId) || null

/**
 * What the room says the wire must do for one cue. Per lamp: lit, moving, the dimmer's expected range and changes/s over the window
 * [fade + 0.5 s, + seconds] sampled at `hz`, every time counted from the GO (the beat's epoch).
 */
export const expectationOf = ({ cue, look, lamps, entities, library, rigLooks = null, seconds = 3, hz = 20 }) => {
    if (!look) return { cue, look: null, motion: null, lamps: [], error: `no document look for desk look "${cue?.lookId}"` }
    const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: rigLooks || { looks: [look] } })
    const posed = posedEntities(entities, poses)
    const categoryOf = new Map(entities.map((e) => [e.id, typeById(library, e.components?.fixture?.type)?.category]))
    const levelOf = (id) => (NO_MOTION.has(categoryOf.get(id)) ? 0 : (poses.get(id)?.level ?? 0))
    const plan = motionPlan({ entities: posed, look, levelOf, centre: djCentre(entities) })
    const t0 = ((Number(cue?.fade) || 0) + 0.5) * 1000
    const times = Array.from({ length: Math.max(2, Math.round(seconds * hz)) }, (_, i) => t0 + (i * 1000) / hz)
    const frames = plan ? times.map((t) => motionFrame(plan, t, 0)) : []
    const out = []
    for (const l of lamps) {
        if (NO_MOTION.has(l.category)) continue   // a laser, hazer, smoke or spark machine is not a lamp here: no level motion, a laser is dark
        const pose = poses.get(l.entityId)
        const level = pose ? (pose.level ?? 1) : 0
        const mover = plan?.lamps.some((p) => p.id === l.entityId) || false
        const series = times.map((_, i) => Math.round(255 * level * (mover ? (frames[i].get(l.entityId) ?? 1) : 1)))
        const s = statsOf(series, { seconds })
        out.push({ entityId: l.entityId, kind: l.kind, universe: l.universe, index: l.index, level, lit: level > 0 && s.max > 0, moving: s.moving, perSec: s.perSec, range: [s.min, s.max] })
    }
    const m = motionOf(look)
    return { cue, look: look.id, motion: m ? { mode: m.mode, bpm: m.bpm ?? null, kinds: m.kinds || [], spatial: m.spatial || null, still: m.still ?? 0 } : null, lamps: out }
}

/** Measured side: per lamp, stats of its series (null series = not read). */
export const measureOf = (lamps, seriesOf, { seconds = 3 } = {}) => lamps.map((l) => {
    const series = seriesOf(l)
    return { entityId: l.entityId, ...(series ? statsOf(series, { seconds }) : { n: 0, lit: null, moving: null, perSec: 0, min: 0, max: 0 }) }
})

const count = (rows, k) => rows.filter((r) => r[k] === true).length

/** Compare expected with one wire's measure. A lamp the wire was not read for (lit === null) is left out and counted as `unread`. */
export const compareLamps = (expected, measured) => {
    const mismatches = []
    let unread = 0
    expected.forEach((e, i) => {
        const m = measured[i]
        if (!m || m.lit === null) { unread++; return }
        if (e.lit !== m.lit || e.moving !== m.moving) mismatches.push({ entityId: e.entityId, kind: e.kind, expected: { lit: e.lit, moving: e.moving, perSec: e.perSec }, measured: { lit: m.lit, moving: m.moving, perSec: m.perSec, range: [m.min, m.max] } })
    })
    return { read: expected.length - unread, unread, lit: count(measured.filter((m) => m.lit !== null), 'lit'), moving: count(measured.filter((m) => m.lit !== null), 'moving'), mismatches }
}

/** One cue's summary line, in the shape the owner reads. `wires` = { desk: result, node: result | undefined }. */
export const cueLine = (index, exp, wires = null) => {
    const name = exp.cue?.name || '?'
    const mo = exp.motion ? `${exp.motion.mode}${exp.motion.bpm ? ` ${exp.motion.bpm}bpm` : ''}` : 'still'
    const lit = count(exp.lamps, 'lit')
    const mv = count(exp.lamps, 'moving')
    let line = `${String(index).padStart(2)} ${name}  ${mo}  expect lit ${lit} move ${mv}`
    if (!wires) return line
    let ok = true
    for (const [label, w] of Object.entries(wires)) {
        if (!w) continue
        line += ` | ${label} lit ${w.lit} move ${w.moving}${w.unread ? ` (${w.unread} unread)` : ''}`
        if (w.mismatches.length || w.unread) ok = false
    }
    return `${line}  ${ok ? 'OK' : 'MISMATCH'}`
}

/** Which desk universe (0-based) a node's single buffer is, from the node's own GET /api/input. Null when it does not say. */
export const nodeUniverseOf = (inputBody) => {
    const u = inputBody?.config?.universes?.[0]?.universe
    return Number.isInteger(u) ? u : null
}

/**
 * Own buffer or a bridge to the desk? From GET reads only: a node that answers with fewer universes than the desk, whose own
 * /api/input names the universe it listens to and whose own state has its own fixtures list, is receiving Art-Net itself.
 */
export const nodeKindOf = ({ nodeDmxKeys, deskDmxKeys, input, state }) => {
    const universe = nodeUniverseOf(input)
    if (universe == null) return { kind: 'unknown', universe: null, why: 'no /api/input: cannot tell which desk universe it is' }
    const ownFixtures = Array.isArray(state?.fixtures) ? state.fixtures.length : null
    if (nodeDmxKeys.length >= deskDmxKeys.length && deskDmxKeys.length > 1) return { kind: 'bridge?', universe, why: 'answers every desk universe' }
    return { kind: 'own buffer', universe, why: `listens to Art-Net universe ${universe} (own /api/input), answers ${nodeDmxKeys.length} of the desk's ${deskDmxKeys.length} universes, own desk state with ${ownFixtures ?? '?'} fixtures` }
}

/** Minutes --follow waits for its cues: one loop of the show (every fade + hold) and two more, unless given. Pure. */
export const followMinutes = (cues, override) => {
    if (override != null && override !== true && Number.isFinite(Number(override))) return Number(override)
    return Math.ceil(cues.reduce((s, c) => s + (Number(c.fade) || 0) + (Number(c.hold) || 0), 0) / 60) + 2
}

/** --follow: the cue to measure next, and how long to wait for its fade to end (measured from when the desk fired it).
 *  null while the runner is stopped or plays a cue already measured or not picked. Pure. */
export const followNext = ({ runner, todo, cues, nowMs }) => {
    const i = runner?.index
    if (!runner?.running || !Number.isInteger(i) || !todo.has(i) || !cues[i]) return null
    const firedAt = Number.isFinite(runner.firedAt) ? runner.firedAt : nowMs
    return { index: i, waitMs: Math.max(0, firedAt + ((Number(cues[i].fade) || 0) + 0.5) * 1000 - nowMs) }
}

// ---- the live part ---------------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
const getJson = async (url, ms = 4000) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!r.ok) throw new Error(`${url} → ${r.status}`)
    return r.json()
}
const postJson = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`POST ${url} → ${r.status}`)
    return r.json()
}

export const main = async (argv = process.argv.slice(2)) => {
    const args = parseArgs(argv)
    const project = args.project || die('--project <id>')
    const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
    const desk = String(args.desk || `${new URL(api).origin}/light/api`).replace(/\/$/, '')
    const seconds = Number(args.seconds ?? 3)
    const hz = Number(args.hz ?? 20)
    const dry = args['dry-run'] === true
    const restore = args['no-restore'] !== true && args.follow !== true   // --follow never posts, so it has nothing to put back
    const follow = args.follow === true
    if (follow && args['dry-run']) die('--follow reads the wire while the show plays: drop --dry-run')
    const nodeIps = args.nodes === true || args.nodes === undefined ? null : String(args.nodes).split(',').map((s) => s.trim()).filter(Boolean)

    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const docRes = await client.get(`/api/projects/${encodeURIComponent(project)}/document`)
    if (!docRes.ok) die(`document of "${project}": HTTP ${docRes.status}`)
    const entities = docRes.body.document.entities
    const library = libraryWithShow(loadLibrary(), entities)
    const rigLooks = rigLooksOf(entities)
    const [state, rigBody, cuesBody] = await Promise.all([getJson(`${desk}/state`), getJson(`${desk}/rig?project=${encodeURIComponent(project)}`), getJson(`${desk}/cues`)])
    const cues = cuesBody.cues?.list || []
    const was = { index: cuesBody.cues?.index ?? -1, running: !!cuesBody.cues?.running, autoplay: !!cuesBody.cues?.autoplay }
    const picked = parseCueRange(args.cues, cues.length)
    const targets = nodeIps || state.output?.targets || []
    const { lamps, skipped } = lampsOf({ deskFixtures: rigBody.fixtures || [], profiles: state.profiles, entities, library })
    say(`project ${project}: ${cues.length} cues (checking ${picked.length}), ${lamps.length} lamps with a dimmer, ${skipped.length} not measured (${[...new Set(skipped.map((s) => s.why))].join('; ') || '-'})`)

    // wires: desk universe keys, nodes
    let nodes = []
    let deskKeys = []
    if (!dry) {
        deskKeys = Object.keys((await getJson(`${desk}/dmx`)).dmx || {})
        const bad = [...new Set(lamps.map((l) => l.universe))].filter((u) => !deskKeys.includes(String(u - 1)))
        if (bad.length) die(`desk /dmx keys ${deskKeys} do not hold rig universe(s) ${bad} (expected key = universe - 1)`)
        say(`desk wire: /dmx keys ${deskKeys.join(',')} = rig universes ${deskKeys.map((k) => Number(k) + 1).join(',')} (key = universe - 1)`)
        for (const ip of targets) {
            try {
                const [dmx, input, nstate] = await Promise.all([getJson(`http://${ip}/api/dmx`), getJson(`http://${ip}/api/input`).catch(() => null), getJson(`http://${ip}/api/state`).catch(() => null)])
                const k = nodeKindOf({ nodeDmxKeys: Object.keys(dmx.dmx || {}), deskDmxKeys: deskKeys, input, state: nstate })
                nodes.push({ ip, ...k })
                say(`node ${ip}: ${k.kind}${k.universe != null ? `, desk universe ${k.universe + 1}` : ''} — ${k.why}`)
                if (k.kind !== 'own buffer') say(`  (a node that is not clearly its own buffer proves nothing about the hall: its column is left out)`)
            } catch (e) {
                say(`node ${ip}: not reachable (${e.message}) — left out`)
            }
        }
        nodes = nodes.filter((n) => n.kind === 'own buffer')
    }

    let restored = false
    const restoreDesk = async () => {
        if (dry || !restore || restored) return
        restored = true
        try {
            if (was.index >= 0) await postJson(`${desk}/cues/go`, { index: was.index })
            else await postJson(`${desk}/cues/stop`, {})
            // a GO on a named cue turns play-in-order off on the desk: put it back when the show was playing by itself
            if (was.index >= 0 && was.autoplay) await postJson(`${desk}/cues/autoplay`, { autoplay: true })
            say(`restored: ${was.index >= 0 ? `GO cue ${was.index}${was.autoplay ? ', play in order on' : ''}` : 'stop (no cue was up)'}`)
        } catch (e) {
            say(`RESTORE FAILED (${e.message}): the desk was at cue ${was.index}, running ${was.running}`)
        }
    }
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => restoreDesk().finally(() => process.exit(130)))

    const results = []
    let okCount = 0
    // one cue, already up and past its fade: sample both wires and compare with the room's expectation
    const checkCue = async (i, exp) => {
            const cue = cues[i]
            const deskSeries = new Map(exp.lamps.map((l) => [l.entityId, []]))
            const nodeSeries = new Map(exp.lamps.map((l) => [l.entityId, []]))
            const t0 = Date.now()
            for (let tick = 0; Date.now() - t0 < seconds * 1000; tick++) {
                const [d, ...n] = await Promise.all([getJson(`${desk}/dmx`).catch(() => null), ...nodes.map((nd) => getJson(`http://${nd.ip}/api/dmx`).catch(() => null))])
                for (const l of exp.lamps) {
                    const buf = d?.dmx?.[String(l.universe - 1)]
                    if (buf) deskSeries.get(l.entityId).push(buf[l.index] ?? 0)
                    const ni = nodes.findIndex((nd) => nd.universe === l.universe - 1)
                    const nb = ni >= 0 ? Object.values(n[ni]?.dmx || {})[0] : null
                    if (nb) nodeSeries.get(l.entityId).push(nb[l.index] ?? 0)
                }
                await sleep(Math.max(0, t0 + ((tick + 1) * 1000) / hz - Date.now()))
            }
            const dm = measureOf(exp.lamps, (l) => (deskSeries.get(l.entityId).length ? deskSeries.get(l.entityId) : null), { seconds })
            const nm = nodes.length ? measureOf(exp.lamps, (l) => (nodeSeries.get(l.entityId).length ? nodeSeries.get(l.entityId) : null), { seconds }) : null
            // lamps on a universe no node carries were never read there: they stay "unread" and do not fail the cue
            const wires = { desk: compareLamps(exp.lamps, dm) }
            if (nm) wires.node = compareLamps(exp.lamps.filter((_, k) => nm[k].lit !== null), nm.filter((m) => m.lit !== null))
            const line = cueLine(i, exp, wires)
            say(line)
            const ok = line.endsWith(' OK')
            if (ok) okCount++
            for (const [label, w] of Object.entries(wires)) for (const m of w.mismatches.slice(0, 12)) say(`      ${label} ${m.entityId} (${m.kind}): expected lit ${m.expected.lit} move ${m.expected.moving} · measured lit ${m.measured.lit} move ${m.measured.moving} range ${m.measured.range.join('-')}`)
            results.push({ index: i, cue: { id: cue.id, name: cue.name, lookId: cue.lookId, fade: cue.fade }, motion: exp.motion, expected: exp.lamps, desk: { ...wires.desk, series: undefined }, node: wires.node || null, ok })
    }
    try {
        if (follow) {
            // FOLLOW: the desk's own runner plays the show; each picked cue is measured when it comes up, after its fade. No POST.
            const todo = new Set(picked.filter((i) => {
                const exp = expectationOf({ cue: cues[i], look: lookOfCue(cues[i], rigLooks), lamps, entities, library, rigLooks, seconds, hz })
                if (exp.error) { say(`${String(i).padStart(2)} ${cues[i].name}  ${exp.error}  MISMATCH`); results.push({ index: i, ...exp, ok: false }) }
                return !exp.error
            }))
            const deadline = Date.now() + followMinutes(cues, args['follow-minutes']) * 60000
            say(`following the desk's runner: ${todo.size} cues to catch, up to ${Math.round((deadline - Date.now()) / 60000)} min`)
            while (todo.size && Date.now() < deadline) {
                const next = followNext({ runner: (await getJson(`${desk}/cues`)).cues, todo, cues, nowMs: Date.now() })
                if (!next) { await sleep(500); continue }
                if (next.waitMs > 0) await sleep(next.waitMs)
                await checkCue(next.index, expectationOf({ cue: cues[next.index], look: lookOfCue(cues[next.index], rigLooks), lamps, entities, library, rigLooks, seconds, hz }))
                todo.delete(next.index)
            }
            if (todo.size) say(`not caught before the deadline: cues ${[...todo].join(',')}`)
        } else {
            for (const i of picked) {
                const cue = cues[i]
                const exp = expectationOf({ cue, look: lookOfCue(cue, rigLooks), lamps, entities, library, rigLooks, seconds, hz })
                if (exp.error) { say(`${String(i).padStart(2)} ${cue.name}  ${exp.error}  MISMATCH`); results.push({ index: i, ...exp, ok: false }); continue }
                if (dry) { say(cueLine(i, exp)); results.push({ index: i, ...exp }); continue }
                await postJson(`${desk}/cues/go`, { index: i })
                await sleep(((Number(cue.fade) || 0) + 0.5) * 1000)
                await checkCue(i, exp)
            }
        }
    } finally {
        await restoreDesk()
    }
    if (dry) say(`dry run: ${picked.length} cues expected, nothing sent, no wire read`)
    else say(`cues OK ${okCount}/${picked.length}`)
    if (args.json && args.json !== true) fs.writeFileSync(String(args.json), JSON.stringify({ project, desk, when: new Date().toISOString(), seconds, hz, dry, deskKeys, nodes, skipped, was, results }, null, 2))
    return okCount
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0), (e) => { console.error(e.stack || e.message); process.exit(1) })
