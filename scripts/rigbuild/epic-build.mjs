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
 *
 * --desk (after --apply, or alone with --desk-only): where a light desk answers (a local stack's /light), the room is drawn
 * FROM THE DESK'S DMX for every patched lamp (useRigLook.js "DMX wins"), so the desk must carry each look WITH its values.
 * The cards page's "send looks" sends empty shells (2026-10-08: every lamp then sat at the desk's idle full white: the glare,
 * the flat brown hall, the black that was not black). This step does what show-loop.mjs does, for THIS project's patch on a
 * desk running the machine's own show: each look with its DMX (deskLookValues.js: every laser channel 0, the level path holds
 * the line), another room's rig looks taken off, the runner loaded with the v1.0 cue list and GO 1. It never touches OUTPUT.
 * Needs the project patched on the desk (patch.mjs --exact). Undo: show-loop.mjs --stop, or the desk's show.prev.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { lookFrame, rigLooksOf, staleDeskLooks } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'
import { runnerList } from './show-loop.mjs'

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
// A laser line, photometric (2026-10-08 fix: the old 1 004 000 at 0.0105 rad was 68x a cube's real flux into a cone 5x too
// wide: seen from the floor, near its axis, every line became a white blob of forward scatter + bloom, and side-on it was a
// dim smear). Now: the beam's real luminous flux, the 6 W unit (fixtures.json variants_mw, CIE 1924 V(lambda)), its power
// split between its 2 beams at the scan duty 0.45 (moxir_v1.py beam_vis): ash white 254 lm, ember red 72 lm per beam, into
// a 2 mrad half-angle (a 4 mm aperture + ~1 mrad divergence + the 0.3 deg zone's wobble drawn as width, about one pixel at
// 30 m: the narrowest the room can draw without aliasing). I = flux / solid angle, x the rig's one exposure number.
export const LASER_ANGLE = 0.002
export const LASER_APERTURE = 0.002
// share: the part of the cube's FULL-power flux one drawn beam carries. Full power at the 6 W unit: ash 1131 lm, ember 318 lm (moxir_v1.py
// colour_power: CIE 1924 V(lambda) over the cube's three diodes). v1.0 drew 254 / 72 lm = 0.225 of that: its 2 beams per cube at duty 0.45 and then
// halved AGAIN (a double count found 2026-10-09, kept for v1.0 so its look does not move). v1.1 draws ONE static beam per cube with the cube's whole
// power (owner 2026-10-09: "6 laser beams, not 12"): the rig file says `laser.room_flux_share` 1.
export const laserIntensity = (colour, share = null) => {
    const ember = String(colour).toLowerCase() === '#ff3a12'
    const lm = share === null ? (ember ? 72 : 254) : (ember ? 317.8 : 1131) * share        // v1.0's own figures when the rig file gives no share
    const omega = 2 * Math.PI * (1 - Math.cos(LASER_ANGLE))
    return Math.round((lm / omega) * SCALE)
}

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

// A look holds at most 100 groups (projectSchema RIG_GROUPS_CAP) and "all wash, all beam" hangs 96 lamps + 12 laser beams.
// Every lamp keeps its own group (its own aim, to 0.004 deg) EXCEPT the floor lamps of one part that stand straight up or
// lean straight in toward the stage axis by the same angle: those share one 'vertical' group (lookRules.js), which draws
// the very same directions. Pure.
export const verticalLean = (f) => {
    const d = dirOfRotation(f.r)
    if (Math.abs(d[2]) > 0.002 || d[1] < 0.9) return null
    const side = Math.abs(f.p[0] - AXIS) < 0.05 ? 0 : Math.sign(f.p[0] - AXIS)
    if (side === 0 && Math.abs(d[0]) > 0.002) return null
    const inDeg = side === 0 ? 0 : Math.round((Math.asin(Math.max(-1, Math.min(1, -d[0] * side))) * 180 / Math.PI) * 10) / 10
    return inDeg
}
const AXIS = 0.13          // the stage axis of the hall frame (the cut's centre line; lookFrame gives the same)
const sharedKey = (f, inDeg) => `${f.part.replace(/\s+/g, '-')}-in${inDeg}`
export const positionOf = (f) => {
    const lean = verticalLean(f)
    return lean == null ? `named v1 ${f.id}` : `named v1 ${sharedKey(f, lean)}`
}

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
                        light: { color: f.colour, intensity: laserIntensity(f.colour, f.laser.room_flux_share ?? null), distance: r3(b.length_m), angle: LASER_ANGLE, penumbra: 0, decay: 2 },
                        beam: { visible: true, haze: 1, aperture: LASER_APERTURE },
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
        const fixture = { type: f.type, unit: 1, circuit: f.circuit || '', position: positionOf(f) }
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
export const v1Looks = (rig, ents, ctx, rigFile = RIG_FILE) => {
    const units = ents.filter((e) => e.type === 'spotLight')
    const byPart = new Map()
    for (const f of rig.fixtures) {
        if (f.type === 'ext-lc-ultra-mk2') {
            for (const b of f.laser.beams) byPart.set(`rig-laser-${b.id}`, { part: 'laser', beam: b.id, colour: f.colour })
        } else byPart.set(f.id, { part: f.part, colour: f.colour, lean: f.angle_rad == null ? null : verticalLean(f) })
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
            const shared = meta.part !== 'laser' ? meta.lean : null
            const key = shared != null
                ? `${e.components.fixture.position.replace(/\s+/g, '-')}/${e.components.fixture.type}`
                : groupKey(meta.part === 'laser' ? `laser-${meta.beam}` : e.id, e.components.fixture.type)
            aims[key] = shared != null ? { rule: 'vertical', in_deg: shared } : aimOf(e)
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
    return { source: rigFile === RIG_FILE ? `${RIG_FILE} (MOXIR v1.0, scripts/place/moxir_v1.py)` : `${rigFile} (${rig.version || 'MOXIR'})`, writtenAt: '2026-10-08', defaultLook: 'still-smoking', looks: looks.map(lookOf) }
}

/** The night as a cue list (holds in seconds, a demo of the arc: the real night is busked by GO). Pure. */
export const v1Cues = () => [
    ['still-smoking', 'Act 1 · still smoking', 6, 20], ['one-line', 'Act 1 · one line', 4, 20], ['silhouette', 'Act 1 · the silhouette', 3, 16],
    ['columns-of-fire', 'Act 2 · columns of fire', 4, 16], ['black', 'the black', 0, 4], ['sparks', 'Act 2 · sparks from the depth', 0, 18],
    ['black', 'the black', 0, 4], ['the-roof', 'Act 2 · the roof, once an hour', 2, 12], ['black', 'the black', 0, 4],
    ['fire-returns', 'Act 3 · THE FIRE RETURNS', 0, 14], ['black', 'the black', 0, 4], ['ash-falling', 'Act 3 · ash falling', 1, 16],
    ['dawn', 'Act 4 · dawn: one line returns', 10, 20]
].map(([look, name, fade, hold], i) => ({ id: `v1-${String(i + 1).padStart(2, '0')}-${look}`, name, key: '', fade, hold, lightLook: `rig-${look}`, surfaces: {} }))

// The air and the camera (2026-10-08 fix): the room's haze field is worked out from its machines (hazeField.js), and a
// smoke machine's default level there is 0 (bursts) — with no hazer left (owner: the 4 smoke machines only) the field came
// out EMPTY (uFill 0): no beam, no laser line could be seen at all. v1.0 draws ONE uniform haze instead, at moxir_v1.py's
// own figure for the nave where the beams are: 4 UP-YZ31P in bursts, 1 air change an hour, sigma 0.0169/m (haze_plan(),
// ESTIMATE: yield and k_m assumed; the hall average is 0.0042/m). Measured on the night (card + lux meter) replaces it.
export const V1_TITLE = 'MOXIR v1.0'
export const V1_HAZE_SIGMA = 0.0169
// THE HALL STAYS READABLE (coordinator's check 10-08 14:30, after realism.mjs set the ambient to 0: "the hall is invisible
// ... dark is not black"): a hall during a show is never black — exit signs, the bar, FOH's desk lights, phones and the
// lamps' own spill. The room's bounce (rigBounce.js) carries the rig's return; this ambient is that HOUSE SPILL, ASSUMED,
// chosen by eye on the real GPU in Lite (0.04 read as black, 0.3 shows columns, roof steel and the truss at a low level
// while every look keeps its contrast). A measured lux reading on the night replaces it.
export const V1_AMBIENT = 0.3
export const v1RenderOps = ({ sigma = V1_HAZE_SIGMA, ambient = V1_AMBIENT } = {}) => [
    // exposure.auto false: Full's camera adaptation (autoExposure.js, gain up to 3x) opened "the black" into a lit brown
    // hall (seen 10-08, Full, Floor z 38) — the old "flat brown" again. Full now draws at the room's one exposure, as Lite does.
    { type: 'setRenderSettings', payload: { patch: { atmosphere: { scattering: sigma, anisotropy: 0.7, haze: null }, exposure: { auto: false } } } },
    { type: 'setWorldState', payload: { patch: { ambientLight: { color: '#a39c92', intensity: ambient } } } }
]

/** The room's views: the rig file's own (`views`, MOXIR v1.1 on: derived for its stage) or v1.0's. Pure. */
export const viewsOf = (rig) => (rig?.views ? { mode: 'fixed-camera', entryView: 'fixed-camera', ...rig.views } : v1Views())

/**
 * The DJ booth moved with the stage (MOXIR v1.1: the rig file's `stage.move_booth_by`, from `stage.booth_from` [x, z] to
 * `booth_to`): the decks and the table, by the same offset. Only from the booth's old place (a second run finds it moved
 * and writes nothing); anywhere else it refuses (someone placed it by hand). Pure. Returns { ops, entities } (entities = the
 * document's, with the moves applied, for the stage frame the looks are aimed in).
 */
export const boothMoveOps = (doc, rig) => {
    const mv = rig?.stage?.move_booth_by
    const entities = doc.entities
    if (!mv) return { ops: [], entities }
    const booth = entities.filter((e) => /^rig-deck-\d+$/.test(e.id) || e.id === 'rig-dj-table')
    const decks = booth.filter((e) => e.id.startsWith('rig-deck-'))
    if (!decks.length) throw new Error('no DJ riser (rig-deck-*) to move')
    const mid = [0, 2].map((k) => decks.reduce((sum, e) => sum + e.components.transform.position[k], 0) / decks.length)
    const at = (xz) => Math.abs(mid[0] - xz[0]) < 0.05 && Math.abs(mid[1] - xz[1]) < 0.05
    if (at(rig.stage.booth_to)) return { ops: [], entities }
    if (!at(rig.stage.booth_from)) throw new Error(`the booth stands at (${mid.map(r3)}), neither ${rig.stage.booth_from} nor ${rig.stage.booth_to} — refusing (moved by hand?)`)
    const moved = new Map(booth.map((e) => [e.id, e.components.transform.position.map((v, k) => r3(v + mv[k]))]))
    const ops = [...moved].map(([entityId, position]) => ({ type: 'updateComponent', payload: { entityId, component: 'transform', patch: { position } } }))
    const next = entities.map((e) => (moved.has(e.id) ? { ...e, components: { ...e.components, transform: { ...e.components.transform, position: moved.get(e.id) } } } : e))
    return { ops, entities: next }
}

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

/** Put v1.0's looks WITH their DMX on the desk and start its cue runner (see --desk above). */
export const deskStep = async ({ api, project, document, cues, loop }) => {
    const light = api.replace(/\/serverXR$/, '') + '/light'
    const desk = makeClient(light, null)
    const rig = await desk.get(`/api/rig?project=${encodeURIComponent(project)}`)
    if (!rig.ok) die(`no desk at ${light} (${rig.status})`)
    const fixtures = rig.body.fixtures || []
    if (!fixtures.length) die(`the desk at ${light} has no fixture patched for ${project}: patch it first (node scripts/rigbuild/patch.mjs --project ${project} --api ${api} --exact)`)
    const looks = rigLooksOf(document.entities)
    const library = libraryWithShow(loadLibrary(), document.entities)
    const deskSet = deskLooksWithValues(looks, fixtures, { entities: document.entities, library })
    for (const look of deskSet) {
        const put = await desk.post('/api/looks/add', { look })
        if (!put.ok) die(`the desk did not take ${look.id}: ${put.status} ${put.text.slice(0, 200)}`)
    }
    const onDesk = await desk.get('/api/looks')
    const stale = onDesk.ok ? staleDeskLooks(onDesk.body.looks, deskSet.map((l) => l.id)) : []
    for (const id of stale) await desk.post('/api/looks/remove', { id })
    const valued = new Set(deskSet.flatMap((l) => Object.keys(l.steps[0]?.values || {})))
    const loaded = await desk.post('/api/cues/load', { project, list: runnerList(cues), loop })
    if (!loaded.ok) die(`loading the desk's runner: ${loaded.status} ${loaded.text.slice(0, 200)}`)
    const go = await desk.post('/api/cues/go', { index: 0 })
    if (!go.ok) die(`GO: ${go.status} ${go.text.slice(0, 200)}`)
    const summary = await desk.get('/api/summary')
    say(`desk: ${deskSet.length} looks with DMX for ${valued.size} of ${fixtures.length} patched fixtures${stale.length ? `, ${stale.length} stale looks off` : ''}; runner ${go.body.cues.index + 1}/${go.body.cues.n} ${go.body.cues.name}, loop ${go.body.cues.loop ? 'on' : 'off'}${go.body.cues.missing?.length ? `, MISSING ${go.body.cues.missing.join(', ')}` : ''}; OUTPUT ${summary.body?.output?.enabled ? 'ON' : 'OFF'} (never changed here)`)
    return { looks: deskSet.length, valued: valued.size, fixtures: fixtures.length }
}

/**
 * The cards page's rental list for v1.0 (pure): the beta's lines WITHOUT the external hazers (owner 10-08: the haze is the 4
 * smoke machines), PLUS a line for every type v1.0 hangs that the beta's list never carried (the 250BSW, the HK1915, the
 * external strobes and blinders), at moxir_v1.py's order (rig.not_hung). Before, the cards said "112 of 78 placed": 28
 * units were placed against no line at all.
 */
export const v1RentalItems = (rental, rig) => {
    const items = (rental.items || []).filter((i) => i.type !== 'ext-hazer')
    const have = new Set(items.map((i) => i.code))
    for (const r of rig.not_hung || []) {
        if (have.has(r.code) || !(r.hung > 0)) continue
        const ext = r.code.startsWith('EXT-')
        items.push({ code: r.code, type: r.code.toLowerCase(), ordered: r.ordered, label: '', source: `${RIG_FILE} not_hung (moxir_v1.py: the v1.0 order, owner 10-08 "all wash, all beam")`, ...(ext ? { from: 'other', supplier: 'to choose', note: 'external: rate owed' } : {}) })
    }
    return items
}

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
    if (args['render-only']) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: v1RenderOps({ ambient: Number(args.ambient ?? V1_AMBIENT) }).map((op, j) => ({ ...op, opId: `epic-render-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`render ops: ${out.status} ${out.text.slice(0, 300)}`)
        say(`render: haze sigma ${V1_HAZE_SIGMA}/m uniform, ambient ${Number(args.ambient ?? V1_AMBIENT)} → version ${out.body.newVersion}`)
        return
    }
    if (args['lasers-only']) {
        const ops = v1Entities(rig).filter((e) => e.id.startsWith('rig-laser-') && doc.entities.some((d) => d.id === e.id))
            .flatMap((e) => ['light', 'beam'].map((component) => ({ type: 'updateComponent', payload: { entityId: e.id, component, patch: e.components[component] } })))
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `epic-lasers-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`laser ops: ${out.status} ${out.text.slice(0, 300)}`)
        say(`lasers: ${ops.length / 2} beams at ${laserIntensity('#e8e4dc')} (ash) / ${laserIntensity('#ff3a12')} (ember), half-angle ${LASER_ANGLE} rad → version ${out.body.newVersion}`)
        return
    }
    if (args['mark-only'] || args.apply) {
        // The version row's chip reads the production's VERSION LIST (`<set>-versions`), not this document: the copy's entry
        // was still titled with the beta's long name ("Known · full · the cut, movers on the ground · PONYO 10-04"). Its title
        // becomes "MOXIR v1.0"; its status is not changed (promoting a version is the owner's call).
        const variant = doc.entities.find((e) => e.id === 'rig-show')?.components?.rigVariant
        const listId = variant?.set ? `${variant.set}-versions` : null
        const list = listId ? await client.get(`/api/projects/${listId}/document`) : null
        const entry = list?.ok ? list.body.document.entities.find((e) => e.components?.productionVersion?.projectId === project) : null
        const title = rig.version || V1_TITLE
        if (entry && entry.components.productionVersion.title !== title) {
            const out = await client.post(`/api/projects/${listId}/ops`, { baseVersion: list.body.version, ops: [{ type: 'updateComponent', payload: { entityId: entry.id, component: 'productionVersion', patch: { title } }, opId: `epic-mark-${Date.now()}`, clientId: 'epic-build' }] })
            if (!out.ok) die(`the version list ${listId}: ${out.status} ${out.text.slice(0, 200)}`)
            say(`version list ${listId}: ${entry.id} titled "${title}" (was "${entry.components.productionVersion.title}")`)
        } else say(`version list: ${entry ? 'already titled' : 'no entry for ' + project}`)
        if (args['mark-only']) return
    }
    if (args['desk-only']) {
        await deskStep({ api, project, document: doc, cues: doc.mappingState?.cues || [], loop: doc.mappingState?.loop === true })
        return
    }
    let booth
    try { booth = boothMoveOps(doc, rig) } catch (e) { die(`${project}: ${e.message}`) }
    const ctx = lookFrame(booth.entities)
    if (!ctx) die(`${project}: no stage frame (riser + venue plan) to aim looks in`)
    const old = doc.entities.filter((e) => (e.type === 'spotLight' && (e.id.startsWith('rig-') || e.id.startsWith('new-'))) || /^rig-(hazer|smoke)-/.test(e.id) || /^rig-pa-/.test(e.id) || /^rig-foh-/.test(e.id) || e.id === 'rig-ash-wall' || e.id === 'rig-tower-cube6')
    const ents = v1Entities(rig)
    const looks = v1Looks(rig, ents, ctx, String(args.rig || RIG_FILE))
    const cues = v1Cues()
    const ops = [...booth.ops]
    for (const e of old) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    for (const e of ents) ops.push({ type: 'createEntity', payload: { entity: e } })
    const bar = rig.solids.find((s) => s.id === 'rig-crowd-barrier')
    if (bar && doc.entities.some((e) => e.id === 'rig-crowd-barrier')) {
        ops.push({ type: 'updateComponent', payload: { entityId: 'rig-crowd-barrier', component: 'transform', patch: { position: bar.p, scale: bar.s } } })
        if (bar.name && doc.entities.find((e) => e.id === 'rig-crowd-barrier')?.name !== bar.name) ops.push({ type: 'updateEntity', payload: { entityId: 'rig-crowd-barrier', patch: { name: bar.name.slice(0, 200) } } })
    }
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigLooks', patch: looks } })
    // No hazer (owner 10-08: "the haze is the 4 smoke machines"): the external hazers come off the rental list, so the cards
    // page stops asking to place 6 of them.
    const rental = doc.entities.find((e) => e.id === 'rig-show')?.components?.rentalList
    if (rental?.items) {
        const items = v1RentalItems(rental, rig)
        if (JSON.stringify(items) !== JSON.stringify(rental.items)) ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rentalList', patch: { ...rental, items } } })
    }
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigVariant', patch: rig.version && rig.version !== V1_TITLE
        ? { title: `${rig.version} — the stage at the press end, the epic lights moved to it`.slice(0, 120), summary: String(rig.what || '').slice(0, 300) }
        : { title: 'MOXIR v1.0 — the epic lights, all wash + all beam hung, used minimally', summary: 'v0.9 + the epic plot (owner 10-08): every wash and beam of the order hung, 6 cubes (12 lines onto one matte ash wall), haze = the 4 smoke machines; looks dark-first, 2 layers (3 at the peak), ash white + ember red. Plan A1.' } } })
    for (const c of doc.mappingState?.cues || []) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of cues) ops.push({ type: 'createMappingCue', payload: { cue: c } })
    ops.push({ type: 'setMappingState', payload: { patch: { loop: true, showEpoch: Date.now() } } })
    ops.push({ type: 'setPresentationState', payload: { patch: viewsOf(rig) } })
    ops.push(...v1RenderOps({ ambient: Number(args.ambient ?? V1_AMBIENT) }))
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
    const boothOff = booth.ops.filter((op) => have.get(op.payload.entityId)?.components?.transform?.position?.some((v, k) => Math.abs(v - op.payload.patch.position[k]) > 0.01)).map((op) => op.payload.entityId)
    if (boothOff.length) die(`read back: the booth did not move (${boothOff.join(', ')})`)
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
    if (args.desk) await deskStep({ api, project, document: d2, cues: d2.mappingState.cues, loop: d2.mappingState.loop === true })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
