#!/usr/bin/env node
/**
 * epic-build.mjs — load MOXIR v1.0 (scripts/place/rigs/moxir-epic-2026-10-08.json, written by scripts/place/moxir_v1.py)
 * into a COPY of beta on a scratch stack, as ops, and make it playable: every look of v1.0 as a rig look (the room poses and
 * lights each unit by it), a cue list that plays the night by the wall clock, and the views (floor z 38, FOH z 47, the DJ, top).
 *
 *   node scripts/rigbuild/epic-build.mjs --api http://127.0.0.1:4323/serverXR --project moxir-v1-0 --token-file <dummy env> [--out <dir>] [--apply]
 *
 * What it writes (and nothing else):
 *   - deletes the copy's old lamps (every rig- spotLight), its hazers and smoke machines (groups) and the PA placeholders;
 *   - creates v1.0's units: each lamp with its position, rotation, colour, cone, DMX and circuit; each laser BEAM as its own
 *     narrow spotLight from its cube's place to the ash wall (12); the 4 smoke machines; the ash wall (the beam-stop panel),
 *     the tower for laser 6, the PA by class (5 boxes); moves the crowd barrier to z 26.5;
 *   - on the show entity: `rigLooks` (each unit is its own named group, `fixture.position` "named v1 <id>", so every unit keeps
 *     its own aim in every look: rule `point` at its own target in the stage frame) and the version mark's title;
 *   - the cue list (mappingState.cues: one cue per look, `lightLook` rig-<look>) with holds, `loop` on and `showEpoch` now:
 *     the room plays the night by the wall clock (useRigLook hosted playback); the cards page's GO plays any cue by hand;
 *   - presentationState: the entry camera and the view buttons.
 * Lasers: the room draws a laser posed by a look (looks.js posedEntities); the DESK still writes every laser channel at 0
 * (deskLookValues.js laserHeld) and the lens never glows (rigBodyLamps.js): this is previs on a scratch stack with no output
 * and no cube connected, not an emission sign-off. `laserSignedOff` is NOT written.
 * Scratch only: refuses any host but localhost / 127.0.0.1. Reads the document right before writing and sends against its version.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { lookFrame } from '../../src/rigbuild/looks.js'

export const RIG_FILE = 'scripts/place/rigs/moxir-epic-2026-10-08.json'
const SCALE = 0.02          // the rig's one exposure number (moxir rig files photometry.sceneScale): three.js intensity = candela x 0.02
const r3 = (v) => Math.round(v * 1000) / 1000

/** Candela per unit at its zoom (fixtures.json photometry, the same as moxir_v1.py / epic_placement.py). */
export const candelaOf = (f) => {
    const half = f.angle_rad ?? 0.1
    const deg = (2 * half * 180) / Math.PI
    switch (f.type) {
        case 'up-pl5403': return 609.56 / SCALE                         // beta's own PAR figure
        case 'up-b380f': return 1004000 / SCALE
        case 'up-hk1915': return 350000 * (4 / deg) ** 2
        case 'up-250bsw': return 363925 * (13 / deg) ** 2
        case 'ext-blinder': return 24975 * 0.4                          // capped at 40 %
        case 'ext-strobe': return 213800
        default: return 1000
    }
}
const DIST = { 'up-pl5403': 24, 'up-b380f': 40, 'up-hk1915': 18, 'up-250bsw': 30, 'ext-blinder': 25, 'ext-strobe': 20 }
const PENUMBRA = { 'up-pl5403': 0.5, 'up-b380f': 0.1, 'up-hk1915': 0.5, 'up-250bsw': 0.3, 'ext-blinder': 0.6, 'ext-strobe': 0.6 }
const HAZE = { 'up-b380f': 1, 'ext-lc-ultra-mk2': 1 }
const LASER_INTENSITY = 1004000      // as bright as the brightest beam the room draws (the B380F): a line, not a glow
const LASER_ANGLE = 0.0105           // the narrowest the beta used; the room clamps beam cones (spotBeam.js)

/** The unit's beam direction from its stored rotation (three.js Euler XYZ, a spot's unrotated beam is -Y). Pure. */
export const dirOfRotation = ([rx, ry, rz]) => {
    const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)]
    // R = Rx * Ry * Rz (three.js 'XYZ'), applied to (0, -1, 0)
    const m01 = -cy * sz
    const m11 = cx * cz - sx * sy * sz
    const m21 = sx * cz + cx * sy * sz
    return [-m01, -m11, -m21]
}

const groupKey = (id, type) => `named-v1-${id}`.slice(0, 40) + `/${type}`

/** v1.0's entities from the rig file. Pure. */
export const v1Entities = (rig) => {
    const out = []
    for (const f of rig.fixtures) {
        if (f.type === 'ext-lc-ultra-mk2') {
            for (const b of f.laser.beams) {
                out.push({ id: `rig-laser-${b.id}`, type: 'spotLight', name: `LaserCube ${f.id.slice(-1)} beam ${b.id} (${f.laser.colour}) — previs, never emitted from here`, parentId: null,
                    components: {
                        transform: { position: f.p, rotation: b.r, scale: [1, 1, 1] },
                        appearance: { color: f.colour, opacity: 1 },
                        light: { color: f.colour, intensity: LASER_INTENSITY, distance: r3(b.length_m), angle: LASER_ANGLE, penumbra: 0, decay: 2 },
                        beam: { visible: true, haze: 1 },
                        animation: { mode: 'static', speed: 1, amplitude: 1 },
                        fixture: { type: 'ext-lc-ultra-mk2', unit: Number(f.id.slice(-1)), circuit: f.circuit || '', position: `named v1 laser-${b.id}`, dmx: false }
                    } })
            }
            continue
        }
        if (f.type === 'up-yz31p') {
            out.push({ id: f.id, type: 'group', name: `UP-YZ31P smoke machine (${f.position})`, parentId: null,
                components: { transform: { position: f.p, rotation: [0, 0, 0], scale: [1, 1, 1] }, fixture: { type: 'up-yz31p', unit: 1, circuit: f.circuit || '', position: 'floor', dmx: false } } })
            continue
        }
        if (f.angle_rad == null) continue
        const fixture = { type: f.type, unit: 1, circuit: f.circuit || '', position: `named v1 ${f.id}` }
        if (f.dmx) Object.assign(fixture, { universe: f.dmx.universe, address: f.dmx.address, mode: `${f.dmx.footprint}ch` })
        out.push({ id: f.id, type: 'spotLight', name: `${f.type.toUpperCase()} ${f.part} (${f.status})`, parentId: null,
            components: {
                transform: { position: f.p, rotation: f.r, scale: [1, 1, 1] },
                appearance: { color: f.colour || '#e8e4dc', opacity: 1 },
                light: { color: f.colour || '#e8e4dc', intensity: Math.round(candelaOf(f) * SCALE * 100) / 100, distance: DIST[f.type] || 24, angle: f.angle_rad, penumbra: PENUMBRA[f.type] ?? 0.4, decay: 2 },
                beam: { visible: true, haze: HAZE[f.type] ?? 0.35 },
                animation: { mode: 'static', speed: 1, amplitude: 1 },
                fixture
            } })
    }
    const box = (id, name, p, s, color, opacity = 1, roughness = 0.9) => ({ id, type: 'box', name, parentId: null,
        components: { transform: { position: p, rotation: [0, 0, 0], scale: s }, appearance: { color, opacity, textureAssetId: null, roughness, metalness: 0.05, emissive: '#000000', emissiveIntensity: 1 },
            primitive: { shape: 'box', size: [1, 1, 1] }, animation: { mode: 'static', speed: 1, amplitude: 1 } } })
    for (const s of rig.solids) {
        if (s.id === 'rig-crowd-barrier') continue
        const color = s.id === 'rig-ash-wall' ? '#070707' : s.id.startsWith('rig-pa-') ? '#202226' : '#6f7378'
        const size = s.kind === 'tower' ? [0.29, r3(6 * s.s[1]), 0.29] : s.s
        out.push(box(s.id, s.name.slice(0, 200), s.p, size, color, 1, s.id === 'rig-ash-wall' ? 0.98 : 0.85))
    }
    return out
}

/** The looks as rig looks: every unit its own named group, aimed at its own target. Pure. */
export const v1Looks = (rig, ents, ctx) => {
    const units = ents.filter((e) => e.type === 'spotLight')
    const byPart = new Map()
    for (const f of rig.fixtures) {
        if (f.type === 'ext-lc-ultra-mk2') {
            for (const b of f.laser.beams) byPart.set(`rig-laser-${b.id}`, { part: 'laser', beam: b.id, colour: f.colour })
        } else byPart.set(f.id, { part: f.part, colour: f.colour })
    }
    const aimOf = (e) => {
        const p = e.components.transform.position
        const d = dirOfRotation(e.components.transform.rotation)
        const T = [p[0] + d[0] * 10, p[1] + d[1] * 10, p[2] + d[2] * 10]
        return { rule: 'point', x: r3(T[0] - (ctx.axis ?? 0)), y: r3(T[1]), a: r3((T[2] - ctx.stage.front) / ctx.stage.into) }
    }
    const lookOf = (lk) => {
        const aims = {}
        const colours = {}
        const levels = {}
        for (const e of units) {
            const meta = byPart.get(e.id)
            if (!meta) continue
            const key = groupKey(meta.part === 'laser' ? `laser-${meta.beam}` : e.id, e.components.fixture.type)
            aims[key] = aimOf(e)
            let on = null
            if (lk.parts) {
                if (meta.part === 'laser') on = lk.parts.laser ? [null, 1] : (lk.parts.cube6a && meta.beam === '6a' ? [null, 1] : null)
                else on = lk.parts[meta.part] || null
            }
            colours[key] = ((on && on[0]) || meta.colour || '#e8e4dc').toLowerCase()
            levels[key] = on ? on[1] : 0
        }
        return { id: lk.id.replace(/_/g, '-'), title: lk.title.slice(0, 60), intent: (lk.intent || '').slice(0, 480), aims, colours, levels }
    }
    const looks = [{ id: 'black', title: 'The black', intent: 'Nothing lit; the smoke stays. 3-5 s before every laser moment and before the roof.', parts: {} }, ...rig.looks]
    return { source: `${RIG_FILE} (MOXIR v1.0, scripts/place/moxir_v1.py)`, writtenAt: '2026-10-08', defaultLook: 'still-smoking', looks: looks.map(lookOf) }
}

/** The night as a cue list (holds in seconds, a demo of the arc: the real night is busked by GO). Pure. */
export const v1Cues = () => [
    ['still-smoking', 'Act 1 · still smoking', 6, 20], ['one-line', 'Act 1 · one line', 4, 20], ['silhouette', 'Act 1 · the silhouette', 3, 16],
    ['columns-of-fire', 'Act 2 · columns of fire', 4, 16], ['black', 'the black', 0, 4], ['sparks', 'Act 2 · sparks from the depth', 0, 18],
    ['black', 'the black', 0, 4], ['the-roof', 'Act 2 · the roof, once an hour', 2, 12], ['black', 'the black', 0, 4],
    ['fire-returns', 'Act 3 · THE FIRE RETURNS', 0, 14], ['black', 'the black', 0, 4], ['ash-falling', 'Act 3 · ash falling', 1, 16],
    ['dawn', 'Act 4 · dawn: one line returns', 10, 20]
].map(([look, name, fade, hold], i) => ({ id: `v1-${String(i + 1).padStart(2, '0')}-${look}`, name, key: '', fade, hold, lightLook: `rig-${look}`, surfaces: {} }))

export const v1Views = () => ({
    mode: 'fixed-camera', entryView: 'fixed-camera',
    fixedCamera: { projection: 'perspective', position: [0, 1.6, 38], target: [0, 6.2, -20], fov: 64, zoom: 1, near: 0.05, far: 400, locked: false },
    viewPresets: [
        { id: 'floor', position: [0, 1.6, 38], target: [0, 6.2, -20], fov: 64, label: 'Floor z 38' },
        { id: 'foh', position: [0, 2.2, 47], target: [0, 6.0, -10], fov: 55, label: 'FOH z 47' },
        { id: 'dj', position: [0.13, 2.05, 23.6], target: [0, 1.6, 38], fov: 75, label: 'DJ' },
        { id: 'top', position: [0, 75, -2], target: [0, 0, -3], fov: 70, label: 'Top' }
    ]
})

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const api = String(args.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('epic-build.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(args.project || die('needs --project <the copy>'))
    const client = makeClient(api, args['token-file'] ? readToken(String(args['token-file'])) : null)
    const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, String(args.rig || RIG_FILE)), 'utf8'))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const doc = got.body.document
    const ctx = lookFrame(doc.entities)
    if (!ctx) die(`${project}: no stage frame (riser + venue plan) to aim looks in`)
    const old = doc.entities.filter((e) => (e.type === 'spotLight' && e.id.startsWith('rig-')) || /^rig-(hazer|smoke)-/.test(e.id) || /^rig-pa-/.test(e.id) || e.id === 'rig-ash-wall' || e.id === 'rig-tower-cube6')
    const ents = v1Entities(rig)
    const looks = v1Looks(rig, ents, ctx)
    const cues = v1Cues()
    const ops = []
    for (const e of old) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    for (const e of ents) ops.push({ type: 'createEntity', payload: { entity: e } })
    const bar = rig.solids.find((s) => s.id === 'rig-crowd-barrier')
    if (bar && doc.entities.some((e) => e.id === 'rig-crowd-barrier')) {
        ops.push({ type: 'updateComponent', payload: { entityId: 'rig-crowd-barrier', component: 'transform', patch: { position: bar.p, scale: bar.s } } })
    }
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigLooks', patch: looks } })
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigVariant', patch: { title: 'MOXIR v1.0 — the epic lights, elite + minimal', summary: 'v0.9 + the epic plot (owner 10-08): 6 signature moments over 4 acts, ash white + ember red, 2 layers (3 at the peak), 12 laser lines onto one matte ash wall, Plan A1 (both cranes moved). Tape numbers still ASSUMED.' } } })
    for (const c of doc.mappingState?.cues || []) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of cues) ops.push({ type: 'createMappingCue', payload: { cue: c } })
    ops.push({ type: 'setMappingState', payload: { patch: { loop: true, showEpoch: Date.now() } } })
    ops.push({ type: 'setPresentationState', payload: { patch: v1Views() } })
    say(`${project} @ v${got.body.version}: delete ${old.length}, create ${ents.length}, ${looks.looks.length} looks, ${cues.length} cues; ${ops.length} ops`)
    if (args.out) {
        fs.mkdirSync(String(args.out), { recursive: true })
        fs.writeFileSync(path.join(String(args.out), `epic-build-${project}-before.json`), JSON.stringify(got.body))
        fs.writeFileSync(path.join(String(args.out), `epic-build-${project}-ops.json`), JSON.stringify(ops, null, 1))
    }
    if (!args.apply) { say('dry run: nothing written (--apply to write)'); return }
    let version = got.body.version
    for (let i = 0; i < ops.length; i += 100) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops: ops.slice(i, i + 100).map((op, j) => ({ ...op, opId: `epic-build-${Date.now()}-${i + j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`ops ${i}…: ${out.status} ${out.text.slice(0, 300)}`)
        version = out.body.newVersion
    }
    // read back
    const back = await client.get(`/api/projects/${project}/document`)
    const d2 = back.body.document
    const have = new Map(d2.entities.map((e) => [e.id, e]))
    const missing = ents.filter((e) => !have.has(e.id)).map((e) => e.id)
    const stale = old.filter((e) => have.has(e.id) && !ents.some((n) => n.id === e.id)).map((e) => e.id)
    const rl = have.get('rig-show')?.components?.rigLooks
    const lasers = d2.entities.filter((e) => e.id.startsWith('rig-laser-')).length
    const nCues = (d2.mappingState?.cues || []).length
    if (missing.length || stale.length || !rl || rl.looks.length !== looks.looks.length || nCues !== cues.length) {
        die(`read back: missing ${missing.slice(0, 5).join(', ')}; stale ${stale.slice(0, 5).join(', ')}; looks ${rl?.looks?.length}/${looks.looks.length}; cues ${nCues}/${cues.length}`)
    }
    const groupsPerLook = Math.max(...rl.looks.map((l) => Object.keys(l.aims).length))
    if (args.out) fs.writeFileSync(path.join(String(args.out), `epic-build-${project}-after.json`), JSON.stringify(back.body))
    say(`written, version ${version}; read back: ${d2.entities.length} entities, ${lasers} laser beams, ${rl.looks.length} looks (up to ${groupsPerLook} groups each), ${nCues} cues, loop ${d2.mappingState.loop}, showEpoch ${d2.mappingState.showEpoch}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
