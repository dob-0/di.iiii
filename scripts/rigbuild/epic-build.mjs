#!/usr/bin/env node
/**
 * epic-build.mjs — load MOXIR v1.0 (scripts/place/rigs/moxir-epic-2026-10-08.json, written by scripts/place/moxir_v1.py)
 * into a COPY of beta on a scratch stack, as ops, and make it playable: every look of v1.0 as a rig look (the room poses and
 * lights each unit by it), a cue list that plays the night by the wall clock, and the views (floor z 38, FOH z 47, the DJ, top).
 *
 *   node scripts/rigbuild/epic-build.mjs --api http://127.0.0.1:4323/serverXR --project moxir-v1-0 --token-file <dummy env> [--out <dir>] [--apply]
 *     [--hall <hall record>|none]  each lamp's beam.length = its first hit in that hall (hall-reach.mjs; default HALL_FILE)
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
 * --tag-steel-only (2026-10-14): the project's existing steel (matched to the rig file's solids; steelTagOps) gets `occluder {kind:'steel'}`
 * so a beam stops at it. updateComponent only, nothing created/moved/deleted; dry run unless --apply; new builds set the flag themselves.
 *
 * --laser-lines-only (2026-10-13, ledger N559): every laser beam the project ALREADY has (rig-laser-<id>, matched to the rig file)
 * gets `beam.laser` (laserComponentOf: its share of the unit's diodes in mW, the maker's beam diameter and divergence), so the room
 * draws it as a line source (laserLine.js, SpotLightObject LaserLines) and no longer as a narrow white cone. It sends ONLY
 * `updateComponent` merge patches `{ laser }` on component `beam`: no unit deleted or re-created, no aim, colour, level or other
 * field touched, so lamps moved by hand stay where they are. Refuses when a project beam is not in the rig file. Dry run unless
 * --apply; back the document up first. Undo: the backup, or the same patch with `laser: null`.
 *
 * --laser-frames (2026-10-13, ledger N562): the lasers in TIME (laser-frames.mjs). Every UP-LA40WF beam gets a MATRIX frame
 * (--matrix-n lines, default 9, on a grid inside its field) as its static `frame`; every LaserCube line gets a slow FAN SWEEP as
 * `frames` (--fan-deg ±, default 6, capped by the field; --fan-period s, default 24; --fan-steps, default 48), the room picking the
 * frame by the server's time (SpotLightObject LaserLines). Each sent as `updateComponent` beam `{ laser }` (laserComponentOf + the
 * frames), nothing else. With no --api it only prints the frames from the rig file. Fields ASSUMED (fixtures.json
 * scan_field_half_deg). Dry run unless --apply; back the document up first. Undo: --laser-lines-only (the static line again).
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
import { buildLook } from '../../src/shared/buildLook.js'
import { lookFrame, rigLooksOf, staleDeskLooks } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'
import { runnerList } from './show-loop.mjs'
import { atmosphereOfRig } from '../place/rig-lib.mjs'
import { laserColourFlux, driveOfHex, laserOf, CUBE_NM } from '../../src/objectComponents/laserLine.js'
import { laserFramesOf, MATRIX_N, FAN_DEG, FAN_PERIOD_S, FAN_STEPS } from './laser-frames.mjs'
import { HALL_FILE, hallDimsOf, lampFirstHit, shellOf } from './hall-reach.mjs'
import { MIN_REACH, MISS_REACH_CAP } from '../../src/objectComponents/beamReach.js'
import { isSteelEntity, OCCLUDER_COMPONENT, STEEL_KIND } from '../../src/objectComponents/steelOccluder.js'

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
/** How far the room draws a unit's beam until it has cast its own (the room re-casts every beam along its CURRENT aim against
 * the building at run time: src/objectComponents/beamReach.js). With the hall's dims: the first hall surface along the lamp's
 * rest axis (hall-reach.mjs), PHYSICS FIRST (owner 2026-10-13). Without: the rig file's own cast throw (`throw_m`, MOXIR v2
 * occlusion_sky.py), else the type's reach. Never more than MISS_REACH_CAP: the old 120 m for a lamp with no throw
 * (`throw_m: null`, "open to the far end") is what stood over the roof in the owner's screenshot. Pure. */
export const reachOf = (f, dims = null) => {
    const hit = dims ? lampFirstHit(f, dims) : null
    if (hit != null && hit > 0) return r3(Math.min(Math.max(hit, MIN_REACH), MISS_REACH_CAP))
    if (Number(f.throw_m) > 0) return r3(Math.min(Math.max(Number(f.throw_m), 1), MISS_REACH_CAP))
    return DIST[f.type] || 24
}
const PENUMBRA = { 'up-pl5403': 0.5, 'up-b380f': 0.1, 'up-hk1915': 0.5, 'up-250bsw': 0.3, 'ext-blinder': 0.6, 'ext-strobe': 0.6 }
const HAZE = { 'up-b380f': 1, 'ext-lc-ultra-mk2': 1, 'up-la40wf': 1 }
// A laser line, photometric (2026-10-08 fix: the old 1 004 000 at 0.0105 rad was 68x a cube's real flux into a cone 5x too
// wide: seen from the floor, near its axis, every line became a white blob of forward scatter + bloom, and side-on it was a
// dim smear). The beam's real luminous flux into a 2 mrad half-angle (a 4 mm aperture + ~1 mrad divergence + the 0.3 deg
// zone's wobble drawn as width, about one pixel at 30 m: the narrowest the room can draw without aliasing). I = flux / solid
// angle, x the rig's one exposure number.
// FLUX (2026-10-09, the owner's cubes are the 7.5 W Ultra MK2, ledger N449): read from fixtures.json
// lasercube.specs.variant_in_use (the maker's per-diode mW), turned into lumens by laserLine.js laserColourFlux (Km V(lambda) P,
// CIE 1931) at the unit's colour as its drive, x the beam's duty (the rig file's beam.duty, else the cube's laser.duty, else
// v1.0's scan duty 0.45: moxir_v1.py beam_vis) x the cube's room_flux_share, split over its beams that are on. Before, every
// line was a fixed 254 lm (ash) / 72 lm (ember): v1.0's 6 W cube split over 2 scanned beams; v1.1's aerial cubes run ONE
// static beam at duty 1.0, so that figure drew them ~5x too dim, and at 6 W.
export const LASER_ANGLE = 0.002
export const LASER_APERTURE = 0.002
export const FIXTURES_FILE = 'scripts/place/fixtures/fixtures.json'
export const cubeVariant = (file = path.join(REPO_ROOT, FIXTURES_FILE)) => JSON.parse(fs.readFileSync(file, 'utf8')).kinds.lasercube.specs.variant_in_use.value
const CUBE = cubeVariant()
// OPTICS (2026-10-13, ledger N559): a beam's width and spread, the maker's numbers as fixtures.json keeps them with their source —
// the cube's 4 mm / 1 mrad (Ultra MK2 Guide v1.2 pp. 11-12, printed for the 6 W and 10 W; the 7.5 W Manual v1.0 prints no optics
// line: taken as the same, and 1/e vs 1/e2, full vs half angle is not stated), the UP-LA40WF's < 1.3 mrad (Blue Sea BLLO-RGB40, the
// equivalent unit; no beam diameter published, so none is written and the renderer's 4 mm default draws it — laserLine.js laserOf).
const opticsOf = (kind) => {
    const s = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, FIXTURES_FILE), 'utf8')).kinds[kind].specs
    const out = {}
    if (Number(s.beam_diameter_mm?.value) > 0) out.diameter_mm = Number(s.beam_diameter_mm.value)
    if (Number(s.divergence_mrad?.value) > 0) out.divergence_mrad = Number(s.divergence_mrad.value)
    return out
}
/** Lumens in one laser beam of a cube unit (see FLUX above). Pure given the variant. */
/** The laser types a rig may carry: the cubes (mW per line from the variant in use) and the UPlight UP-LA40WF (fixtures.json kind
 * 'laser': R 10 W 638 nm, G 15 W 520 nm, B 16 W 445 nm — mapped onto the cube's nearest lines; owner 2026-10-12 05:2x: "we take also
 * 2 lasers from Sevan", the rental units that ran at the Sevan festival). */
export const LASER_TYPES = {
    'ext-lc-ultra-mk2': { name: (f) => `LaserCube ${f.id.slice(-1)}`, mW: () => CUBE, optics: opticsOf('lasercube'),
        source: `LaserCube Ultra MK2 ${CUBE.name || ''}: diodes per the maker's Manual v1.0 p. 11 (fixtures.json variant_in_use); 4 mm / 1 mrad per the Guide v1.2 pp. 11-12 (printed for 6 W and 10 W, taken for this variant)` },
    'up-la40wf': { name: (f) => `UP-LA40WF ${f.id.slice(-1)}`, mW: () => ({ '445nm': 16000, '455nm': 16000, '520nm': 15000, '525nm': 15000, '638nm': 10000 }), optics: opticsOf('laser'),
        source: 'UP-LA40WF: R 10 W 638 / G 15 W 520 / B 16 W 445 nm (fixtures.json kind laser) on the cube lines 638/525/455 nm; < 1.3 mrad (Blue Sea BLLO-RGB40, equivalent); no diameter published (renderer default 4 mm)' }
}
export const isLaserType = (type) => Object.prototype.hasOwnProperty.call(LASER_TYPES, type)
/** The share of a laser unit's diodes that ONE of its beams carries: the beam's duty x the unit's room_flux_share, over its beams
 * that are on (see FLUX above) — the one split, for the beam's lumens (its light) and its diodes (its drawn line). */
export const laserBeamShare = (f, b) => {
    const on = (f.laser?.beams || []).filter((x) => !x.off).length || 1
    const duty = b?.duty ?? f.laser?.duty ?? 0.45
    return (duty * (f.laser?.room_flux_share ?? 1)) / on
}
export const laserBeamLumens = (f, b, variant = (LASER_TYPES[f.type] || LASER_TYPES['ext-lc-ultra-mk2']).mW()) => {
    const mW = CUBE_NM.map((nm) => Number(variant[`${nm}nm`]) || 0)
    const { lumens } = laserColourFlux({ mW, drive: driveOfHex(f.colour) })
    return lumens * laserBeamShare(f, b)
}
/** A laser beam's `beam.laser` (laserLine.js laserOf, ledger N559): the beam's share of its unit's diodes in mW at the cube lines
 * (the 40 W's lines mapped onto them, as LASER_TYPES does), the maker's optics, the rig's ONE exposure number (SCALE: every lamp's
 * three.js intensity is candela x SCALE, so the line is drawn at the same scale; laserOf's own default), and no frame: one static
 * line down the entity's -Y, which is where the rig aims the beam. The look's colour is the drive (driveOfHex), at draw time. */
export const laserComponentOf = (f, b) => {
    const t = LASER_TYPES[f.type]
    const v = t.mW()
    const share = laserBeamShare(f, b)
    return {
        mW: CUBE_NM.map((nm) => r3((Number(v[`${nm}nm`]) || 0) * share)),
        nm: [...CUBE_NM],
        ...t.optics,
        sceneScale: SCALE,
        source: `${t.source}; this line x ${r3(share)} of the unit (duty x room share / lines on), epic-build.mjs laserComponentOf`.slice(0, 500)
    }
}
/** --laser-lines-only: a merge patch `{ laser }` on component `beam` of every rig-laser-* the project already has — nothing else.
 * `unmatched`: project beams the rig file does not know (they would stay cones); `absent`: rig beams the project does not have. */
export const laserLineOps = (doc, rig) => {
    const want = new Map(v1Entities(rig).filter((e) => e.id.startsWith('rig-laser-')).map((e) => [e.id, e.components.beam.laser]))
    const have = (Array.isArray(doc?.entities) ? doc.entities : []).filter((e) => String(e.id).startsWith('rig-laser-'))
    const ids = new Set(have.map((e) => e.id))
    return {
        ops: have.filter((e) => want.has(e.id)).map((e) => ({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch: { laser: want.get(e.id) } } })),
        unmatched: have.filter((e) => !want.has(e.id)).map((e) => e.id),
        absent: [...want.keys()].filter((id) => !ids.has(id))
    }
}
/** --laser-frames: `beam.laser` of every rig laser beam WITH its frames (laser-frames.mjs), as merge patches on the beams the
 * project has; `unmatched` / `absent` as laserLineOps. Pure but for fixtures.json. */
export const laserFrameOps = (doc, rig, opts = {}) => {
    const { byBeam, units } = laserFramesOf(rig, { dirOf: dirOfRotation, ...opts })
    const want = new Map(v1Entities(rig).filter((e) => byBeam.has(e.id)).map((e) => [e.id, { ...e.components.beam.laser, ...byBeam.get(e.id) }]))
    const have = (Array.isArray(doc?.entities) ? doc.entities : []).filter((e) => String(e.id).startsWith('rig-laser-'))
    const ids = new Set(have.map((e) => e.id))
    return {
        ops: have.filter((e) => want.has(e.id)).map((e) => ({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch: { laser: want.get(e.id) } } })),
        unmatched: have.filter((e) => !want.has(e.id)).map((e) => e.id),
        absent: [...want.keys()].filter((id) => !ids.has(id)),
        want,
        units
    }
}
/** The frames, printed (the dry run's record). */
export const describeLaserFrames = ({ units, want }) => {
    const lines = []
    for (const u of units) {
        const f = u.field
        if (u.picture === 'rig frames') { lines.push(`${u.unit} (${u.type}): RIG FRAMES, ${u.lines} lines, ${u.frames} frames over ${u.period} s; ${u.source}`); continue }
        lines.push(u.picture === 'matrix'
            ? `${u.unit} (${u.type}): MATRIX, ${u.lines} lines on a grid within ±${u.reachDeg.toFixed(2)} deg of its aim; field ±${f.halfDeg} deg ${f.basis}`
            : `${u.unit} (${u.type}): FAN SWEEP of its ${u.lines} lines, ±${u.amplitudeDeg.toFixed(2)} deg over ${u.period} s in ${u.steps} frames; lines span ±${u.widestDeg.toFixed(2)} deg (±${u.tallestDeg.toFixed(2)} up/down) around the cube's axis, so they reach ±${u.reachDeg.toFixed(2)} deg; field ±${f.halfDeg} deg ${f.basis}`)
    }
    for (const [id, l] of want) {
        if (l.frame) lines.push(`  ${id} frame (${l.frame.length} points, lit ${l.frame.filter((p) => p[2] || p[3] || p[4]).length}): ${JSON.stringify(l.frame.filter((p) => p[2] || p[3] || p[4]).map((p) => [p[0], p[1]]))}`)
        if (l.frames) lines.push(`  ${id} frames: period ${l.frames.period} s, ${l.frames.list.length} frames, x = ${JSON.stringify(l.frames.list.map((fr) => fr[0][0]).filter((_, k) => k % 6 === 0))} (every 6th)`)
    }
    return lines
}
export const laserIntensityOfLumens = (lm) => Math.round((lm / (2 * Math.PI * (1 - Math.cos(LASER_ANGLE)))) * SCALE)
/** v1.0's laser intensity by colour alone (2 scanned beams per cube, duty 0.45), now from the cube in use. */
export const laserIntensity = (colour) => laserIntensityOfLumens(laserBeamLumens({ colour, laser: { beams: [{}, {}], duty: 0.45 } }, null))

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

/** Is a rig-file solid structural steel — a beam of light stops on it (beamReach.js, steelOccluder.js)? By what it is: a
 * truss or tower KIND, an explicit `steel: true` in the file, or a structural word in its id (truss, girder, steel, tower,
 * crane, beam, pipe, scaffold) — the words say what the piece is, not whose production it is. A deck, a speaker, a barrier
 * and a hoist's chain are not. Pure. */
const STEEL_WORDS = new Set(['truss', 'girder', 'steel', 'tower', 'crane', 'beam', 'pipe', 'scaffold'])
export const isSteelSolid = (s) => Boolean(s) && (s.steel === true || s.kind === 'tower' || /^truss/.test(String(s.kind || '')) ||
    String(s.id || '').split('-').some((w) => STEEL_WORDS.has(w)))
const STEEL_FLAG = Object.freeze({ kind: STEEL_KIND })

/** --tag-steel-only: `updateComponent` occluder {kind:'steel'} on the entities a project ALREADY has that are steel and not yet
 * flagged (matched to the rig file's solids by id; catalogue truss/tower pieces need none). Nothing created, moved or deleted. Pure. */
export const steelTagOps = (doc, rig) => {
    const solids = new Map((rig.solids || []).filter(isSteelSolid).map((s) => [s.id, s]))
    const have = Array.isArray(doc.entities) ? doc.entities : []
    const ops = []
    const already = []
    for (const e of have) {
        if (!solids.has(e.id)) continue
        if (isSteelEntity(e)) { already.push(e.id); continue }
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: OCCLUDER_COMPONENT, patch: { ...STEEL_FLAG } } })
    }
    const absent = [...solids.keys()].filter((id) => !have.some((e) => e.id === id))
    return { ops, already, absent }
}

/** A rig unit's DMX patch as fixture fields: its `dmx` block (universe, address, footprint) when the rig gives one, else off
 * DMX (`dmx: false`: a LaserCube runs over the LAN; a laser or smoke machine with no planned address is run by hand). Pure. */
export const dmxOf = (f) => (f.dmx && Number.isInteger(f.dmx.universe) && Number.isInteger(f.dmx.address)
    ? { universe: f.dmx.universe, address: f.dmx.address, mode: f.dmx.mode || `${f.dmx.footprint}ch` }
    : { dmx: false })

/**
 * --patch-only (2026-10-15): the rig file's planned addresses into the document, nothing else — `updateComponent` fixture
 * {universe, address, mode} (+ `dmx: null`, which puts an off-DMX unit on DMX) for every entity whose rig unit has a `dmx`
 * block and whose document fixture differs. A laser unit's entities are its beams (`rig-laser-<beam id>`). Pure.
 */
export const patchOps = (doc, rig) => {
    const want = new Map()
    for (const f of rig.fixtures || []) {
        const d = dmxOf(f)
        if (d.dmx === false) continue
        if (isLaserType(f.type)) for (const b of f.laser?.beams || []) { if (!b.off) want.set(`rig-laser-${b.id}`, d) }
        else want.set(f.id, d)
    }
    const ops = []
    const absent = new Set(want.keys())
    for (const e of doc.entities || []) {
        const d = want.get(e.id)
        const fx = e.components?.fixture
        if (!d || !fx) continue
        absent.delete(e.id)
        const patch = {}
        for (const k of ['universe', 'address', 'mode']) if (fx[k] !== d[k]) patch[k] = d[k]
        if (fx.dmx === false) patch.dmx = null
        if (Object.keys(patch).length) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'fixture', patch } })
    }
    return { ops, absent: [...absent] }
}

/** v1.0's entities from the rig file. Pure. */
export const v1Entities = (rig, { hall = null } = {}) => {
    const out = []
    for (const f of rig.fixtures) {
        if (isLaserType(f.type)) {
            for (const b of f.laser.beams) {
                if (b.off) continue                                      // a cube that cannot pass the aerial rule (moxir_v1_1.py) draws no beam
                out.push({ id: `rig-laser-${b.id}`, type: 'spotLight', name: `${LASER_TYPES[f.type].name(f)} beam ${b.id} (${f.laser.colour}) — previs, never emitted from here`, parentId: null,
                    components: {
                        transform: { position: f.p, rotation: b.r, scale: [1, 1, 1] },
                        appearance: { color: f.colour, opacity: 1 },
                        light: { color: f.colour, intensity: laserIntensityOfLumens(laserBeamLumens(f, b)), distance: r3(b.length_m), angle: LASER_ANGLE, penumbra: 0, decay: 2 },
                        beam: { visible: true, haze: 1, aperture: LASER_APERTURE, laser: laserComponentOf(f, b) },
                        animation: { mode: 'static', speed: 1, amplitude: 1 },
                        fixture: { type: f.type, unit: Number(f.id.slice(-1)), circuit: f.circuit || '', position: `named v1 laser-${b.id}`, ...dmxOf(f) }
                    } })
            }
            continue
        }
        if (f.type === 'up-yz31p') {
            // the machine blows along its model's front (+Z) turned by its rotation (hazeField.js hazeMachinesOf): the rig
            // file's own `r` (MOXIR v2 true look, 2026-10-09: the fan's direction is part of the design), else +Z as before
            const r = Array.isArray(f.r) && f.r.length === 3 ? f.r.map(Number) : [0, 0, 0]
            out.push({ id: f.id, type: 'group', name: `UP-YZ31P smoke machine (${f.position})`.slice(0, 200), parentId: null,
                components: { transform: { position: f.p, rotation: r, scale: [1, 1, 1] }, fixture: { type: 'up-yz31p', unit: 1, circuit: f.circuit || '', position: 'floor', ...dmxOf(f) } } })
            continue
        }
        if (f.angle_rad == null) continue
        const fixture = { type: f.type, unit: 1, circuit: f.circuit || '', position: positionOf(f) }
        if (f.dmx) Object.assign(fixture, { universe: f.dmx.universe, address: f.dmx.address, mode: `${f.dmx.footprint}ch` })
        out.push({ id: f.id, type: 'spotLight', name: `${f.type.toUpperCase()} ${f.part} (${f.status})`, parentId: null,
            components: {
                transform: { position: f.p, rotation: f.r, scale: [1, 1, 1] },
                appearance: { color: f.colour || '#e8e4dc', opacity: 1 },
                // NO CUTOFF (sim-physics, 2026-10-09; rig-lib lightDistance): distance 0 is pure inverse square; the drawn beam
                // keeps its own length (beam.length), the cast throw to the first thing it meets (reachOf)
                light: { color: f.colour || '#e8e4dc', intensity: Math.round(candelaOf(f) * SCALE * 100) / 100, distance: 0, angle: f.angle_rad, penumbra: PENUMBRA[f.type] ?? 0.4, decay: 2 },
                beam: { visible: true, haze: HAZE[f.type] ?? 0.35, length: reachOf(f, hall) },
                animation: { mode: 'static', speed: 1, amplitude: 1 },
                fixture
            } })
    }
    const box = (id, name, p, s, color, opacity = 1, roughness = 0.9, steel = false) => ({ id, type: 'box', name, parentId: null,
        components: { transform: { position: p, rotation: [0, 0, 0], scale: s }, appearance: { color, opacity, textureAssetId: null, roughness, metalness: 0.05, emissive: '#000000', emissiveIntensity: 1 },
            primitive: { shape: 'box', size: [1, 1, 1] }, animation: { mode: 'static', speed: 1, amplitude: 1 }, ...(steel ? { [OCCLUDER_COMPONENT]: { ...STEEL_FLAG } } : {}) } })
    for (const s of rig.solids) {
        if (s.id === 'rig-crowd-barrier') continue
        const ghost = s.id.startsWith('rig-shell-')          // the building's ghost shell (outer walls, roof): seen through (owner 2026-10-12)
        const color = ghost ? '#9aa0a6' : s.id === 'rig-ash-wall' ? '#070707' : s.id.startsWith('rig-pa-') ? '#202226' : '#6f7378'
        const size = s.kind === 'tower' ? [0.29, r3(6 * s.s[1]), 0.29] : s.s
        out.push(box(s.id, s.name.slice(0, 200), s.p, size, color, ghost ? (s.opacity ?? 0.2) : 1, ghost ? 0.9 : s.id === 'rig-ash-wall' ? 0.98 : 0.85, !ghost && isSteelSolid(s)))   // box(…, opacity, roughness, steel)
    }
    return out
}

/** What a build takes out of the copy before it lays the rig file's units: every rig lamp, hazer and smoke machine, the PA
 * placeholders, FOH, the ash wall and cube 6's tower (all re-created from the file), and every solid an EARLIER rig file laid that
 * this one no longer lists (MOXIR v2 cranes, 2026-10-10: the #844 laser bar and v2 spread's two far-crane boxes stayed in a copy
 * of v2.0 once the cubes sat on the crane and hall v10 drew the free crane itself). Pure. */
export const RIG_FILE_SOLIDS = /^rig-(crane-bar|far-crane-|ash-wall$|tower-|shell-|out-)/   // + the v2.6 shell and outside boxes (2026-10-12)
export const oldEntities = (doc) => (Array.isArray(doc.entities) ? doc.entities : []).filter((e) => (e.type === 'spotLight' && (e.id.startsWith('rig-') || e.id.startsWith('new-'))) ||
    /^rig-(hazer|smoke)-/.test(e.id) || /^rig-pa-/.test(e.id) || /^rig-foh-/.test(e.id) || e.id === 'rig-ash-wall' || e.id === 'rig-tower-cube6' ||
    (e.type === 'box' && RIG_FILE_SOLIDS.test(e.id)))    // laid by a rig file: taken out, and laid again only if this file still lists it

/** Which units belong to which part: `rigParts` on the show entity {part: [unitId…]}, from fixtures[].part (a laser's beams are the part `laser`). Pure. */
export const v1RigParts = (rig, ents) => {
    const ids = new Set(ents.filter((e) => e.type === 'spotLight').map((e) => e.id))
    const out = {}
    for (const f of rig.fixtures) {
        if (isLaserType(f.type)) { for (const b of f.laser.beams) if (!b.off && ids.has(`rig-laser-${b.id}`)) (out.laser ||= []).push(`rig-laser-${b.id}`) }
        else if (f.part && ids.has(f.id)) (out[f.part] ||= []).push(f.id)
    }
    return out
}

/** The looks as rig looks: every unit its own named group, aimed at its own target. Pure. */
export const v1Looks = (rig, ents, ctx, rigFile = RIG_FILE) => {
    const units = ents.filter((e) => e.type === 'spotLight')
    const byPart = new Map()
    for (const f of rig.fixtures) {
        if (isLaserType(f.type)) {
            for (const b of f.laser.beams) if (!b.off) byPart.set(`rig-laser-${b.id}`, { part: 'laser', beam: b.id, colour: f.colour })
        } else byPart.set(f.id, { part: f.part, colour: f.colour, lean: f.angle_rad == null ? null : verticalLean(f) })
    }
    const aimOf = (e) => {
        const p = e.components.transform.position
        const d = dirOfRotation(e.components.transform.rotation)
        const T = [p[0] + d[0] * 10, p[1] + d[1] * 10, p[2] + d[2] * 10]
        return { rule: 'point', x: r3(T[0] - (ctx.axis ?? 0)), y: r3(T[1]), a: r3((T[2] - ctx.stage.front) / ctx.stage.into) }
    }
    // every unit once: its group key, its own colour, its own aim; the part it belongs to is `rigParts` (v1RigParts, which the project remembers)
    const rigParts = v1RigParts(rig, ents)
    const unitsOf = []
    for (const e of units) {
        const meta = byPart.get(e.id)
        if (!meta) continue
        const shared = meta.part !== 'laser' ? meta.lean : null
        const key = shared != null
            ? `${e.components.fixture.position.replace(/\s+/g, '-')}/${e.components.fixture.type}`
            : groupKey(meta.part === 'laser' ? `laser-${meta.beam}` : e.id, e.components.fixture.type)
        unitsOf.push({ id: e.id, key, colour: meta.colour, aim: shared != null ? { rule: 'vertical', in_deg: shared } : aimOf(e) })
    }
    const lookOf = (lk) => {
        // a laser keeps its cube's own colour; its LEVEL is the part's (a desk cap, MOXIR v2 spread 2026-10-09). A look that names the
        // lasers' colour (`laser_colour`, ledger N559) gives it to every line. The rule itself lives in src/shared/buildLook.js, the one
        // function the Studio's scene editor builds with too (2026-10-15).
        const { colours, levels, aims } = buildLook(lk.parts ? lk : { ...lk, parts: {} }, rigParts, unitsOf)
        // A look keeps its SOURCE (parts, desk_caps, laser_colour) next to what was built from it, so the Studio can edit it.
        // A MOVING look keeps its `motion` (MOXIR v2.9 scenes, 2026-10-13): the room plays it (src/rigbuild/lookMotion.js), the
        // schema bounds it (normalizeLookMotion). A look with `heads` (2026-10-15) keeps it the same way (normalizeLookHeads).
        return { id: lk.id.replace(/_/g, '-'), title: lk.title.slice(0, 60), intent: (lk.intent || '').slice(0, 480), ...(lk.act != null ? { act: lk.act } : {}), aims, colours, levels, ...(lk.parts ? { parts: lk.parts } : {}), ...(lk.laser_colour ? { laser_colour: lk.laser_colour } : {}), ...(lk.desk_caps ? { desk_caps: lk.desk_caps } : {}), ...(lk.motion ? { motion: lk.motion } : {}), ...(lk.heads ? { heads: lk.heads } : {}) }
    }
    const looks = rig.looks.some((l) => l.id === 'black') ? rig.looks : [{ id: 'black', title: 'The black', intent: 'Nothing lit; the smoke stays. 3-5 s before every laser moment and before the roof.', parts: {} }, ...rig.looks]
    return { source: rigFile === RIG_FILE ? `${RIG_FILE} (MOXIR v1.0, scripts/place/moxir_v1.py)` : `${rigFile} (${rig.version || 'MOXIR'})`, writtenAt: '2026-10-08', defaultLook: 'still-smoking', looks: looks.map(lookOf) }
}

/** A rig file's OWN cue list (MOXIR v2 layouts, 2026-10-09: rig.cues [{look, name, fade, hold}], one per look it carries), else
 * v1.0's night. Pure. */
export const cuesOf = (rig) => (Array.isArray(rig?.cues) && rig.cues.length
    ? rig.cues.map((c, i) => ({ id: `v2-${String(i + 1).padStart(2, '0')}-${c.look}`, name: String(c.name).slice(0, 80), key: '', fade: c.fade ?? 0, hold: c.hold ?? 20, lightLook: `rig-${c.look}`, surfaces: {} }))
    : v1Cues())

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
export const v1RenderOps = ({ sigma = V1_HAZE_SIGMA, ambient = V1_AMBIENT, atmosphere = null } = {}) => [
    // exposure.auto false: Full's camera adaptation (autoExposure.js, gain up to 3x) opened "the black" into a lit brown
    // hall (seen 10-08, Full, Floor z 38) — the old "flat brown" again. Full now draws at the room's one exposure, as Lite does.
    // A rig file that states its own `atmosphere` (MOXIR v2 B tuned, 2026-10-09: the ONE machine's two-zone haze) is drawn
    // with it; else v1.0's one uniform sigma.
    { type: 'setRenderSettings', payload: { patch: { atmosphere: atmosphere ? atmosphereOfRig(atmosphere) : { scattering: sigma, anisotropy: 0.7, haze: null }, exposure: { auto: false } } } },
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
    const frameOpts = { matrixN: Number(args['matrix-n'] ?? MATRIX_N), fanDeg: Number(args['fan-deg'] ?? FAN_DEG), period: Number(args['fan-period'] ?? FAN_PERIOD_S), steps: Number(args['fan-steps'] ?? FAN_STEPS) }
    if (args['laser-frames'] && !args.api) {
        const rigFile = String(args.rig || RIG_FILE)
        const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rigFile), 'utf8'))
        const plan = laserFrameOps({ entities: [] }, rig, frameOpts)
        say(`${rigFile}: laser frames for ${plan.want.size} beams of ${plan.units.length} units (no --api: printed only, nothing read or written)`)
        for (const line of describeLaserFrames(plan)) say(line)
        return
    }
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('epic-build.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(args.project || die('needs --project <the copy>'))
    const client = makeClient(api, args['token-file'] ? readToken(String(args['token-file'])) : null)
    const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, String(args.rig || RIG_FILE)), 'utf8'))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const doc = got.body.document
    if (args['render-only']) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: v1RenderOps({ ambient: Number(args.ambient ?? V1_AMBIENT), atmosphere: rig.atmosphere || null }).map((op, j) => ({ ...op, opId: `epic-render-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`render ops: ${out.status} ${out.text.slice(0, 300)}`)
        say(`render: haze ${rig.atmosphere ? `the rig's own (${rig.atmosphere.haze?.model || 'uniform'})` : `sigma ${V1_HAZE_SIGMA}/m uniform`}, ambient ${Number(args.ambient ?? V1_AMBIENT)} → version ${out.body.newVersion}`)
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
    if (args['tag-steel-only']) {
        // 2026-10-14: the steel flag on a project that was built before it (beams stop at the rig's steel, steelOccluder.js).
        // updateComponent only, on entities the project already has: nothing created, moved or deleted. Dry run unless --apply.
        const { ops, already, absent } = steelTagOps(doc, rig)
        say(`${project} @ v${got.body.version}: tag steel only — ${ops.length} entities get occluder {kind:'steel'}; already steel: ${already.length}; ` +
            `steel in the rig file, not in the project: ${absent.length}${absent.length ? ` (${absent.slice(0, 5).join(', ')})` : ''}`)
        for (const op of ops.slice(0, 8)) say(`  ${op.payload.entityId}`)
        if (args.out) {
            fs.mkdirSync(String(args.out), { recursive: true })
            fs.writeFileSync(path.join(String(args.out), `tag-steel-${project}-before.json`), JSON.stringify(got.body))
            fs.writeFileSync(path.join(String(args.out), `tag-steel-${project}-ops.json`), JSON.stringify(ops, null, 1))
        }
        if (!args.apply) { say('dry run: nothing written (--apply to write; back the document up first; undo: the backup, or the same ops with occluder null)'); return }
        if (!ops.length) { say('nothing to tag'); return }
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `epic-tag-steel-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`tag steel ops: ${out.status} ${out.text.slice(0, 300)}`)
        const back = await client.get(`/api/projects/${project}/document`)
        if (!back.ok) die(`read back: ${back.status}`)
        const tagged = ops.filter((op) => isSteelEntity(back.body.document.entities.find((e) => e.id === op.payload.entityId))).length
        say(`written, version ${out.body.newVersion}; read back v${back.body.version}: ${tagged}/${ops.length} flagged, ${back.body.document.entities.length} entities (before ${doc.entities.length})`)
        if (tagged !== ops.length || back.body.document.entities.length !== doc.entities.length) die('read back: not every steel entity carries the flag, or the entity count moved')
        return
    }
    if (args['laser-lines-only']) {
        const { ops, unmatched, absent } = laserLineOps(doc, rig)
        say(`${project} @ v${got.body.version}: laser lines only — ${ops.length} beams get beam.laser (updateComponent beam {laser}); ` +
            `in the project, not in the rig file: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 5).join(', ')})` : ''}; in the rig file, not in the project: ${absent.length}`)
        if (ops.length) say(`  e.g. ${ops[0].payload.entityId}: ${JSON.stringify(ops[0].payload.patch.laser).slice(0, 400)}`)
        if (args.out) {
            fs.mkdirSync(String(args.out), { recursive: true })
            fs.writeFileSync(path.join(String(args.out), `laser-lines-${project}-before.json`), JSON.stringify(got.body))
            fs.writeFileSync(path.join(String(args.out), `laser-lines-${project}-ops.json`), JSON.stringify(ops, null, 1))
        }
        if (unmatched.length || !ops.length) die(`${project}: its laser beams do not match the rig file (${args.rig || RIG_FILE}): nothing written`)
        if (!args.apply) { say('dry run: nothing written (--apply to write)'); return }
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `epic-laser-lines-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`laser line ops: ${out.status} ${out.text.slice(0, 300)}`)
        const back = await client.get(`/api/projects/${project}/document`)
        if (!back.ok) die(`read back: ${back.status}`)
        const d2 = back.body.document
        const lz = d2.entities.filter((e) => e.id.startsWith('rig-laser-'))
        const drawn = lz.filter((e) => laserOf(e.components?.beam)).length
        // every other field of every entity as it was read (a beam's own laser aside): what else changed meanwhile (a hand edit)
        const bare = (e) => JSON.stringify(e.id.startsWith('rig-laser-') ? { ...e, components: { ...e.components, beam: { ...e.components?.beam, laser: undefined } } } : e)
        const before = new Map(doc.entities.map((e) => [e.id, bare(e)]))
        const changed = d2.entities.filter((e) => before.get(e.id) !== bare(e)).map((e) => e.id)
        if (args.out) fs.writeFileSync(path.join(String(args.out), `laser-lines-${project}-after.json`), JSON.stringify(back.body))
        say(`written, version ${out.body.newVersion}; read back v${back.body.version}: ${d2.entities.length} entities (before ${doc.entities.length}), ` +
            `${drawn}/${lz.length} laser beams carry beam.laser; other fields changed since the read: ${changed.length}${changed.length ? ` (${changed.slice(0, 5).join(', ')})` : ''}`)
        if (d2.entities.length !== doc.entities.length || drawn !== lz.length) die('read back: not every laser beam carries beam.laser, or the entity count moved')
        return
    }
    if (args['patch-only']) {
        const { ops, absent } = patchOps(doc, rig)
        say(`${project} @ v${got.body.version}: patch — ${ops.length} units get the rig file's address (updateComponent fixture); in the rig file, not in the project: ${absent.length}${absent.length ? ` (${absent.join(', ')})` : ''}`)
        for (const op of ops) say(`  ${op.payload.entityId}: ${JSON.stringify(op.payload.patch)}`)
        if (!args.apply || !ops.length) { say(ops.length ? 'dry run: nothing written (--apply to write)' : 'nothing to write'); return }
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `epic-patch-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`patch ops: ${out.status} ${out.text.slice(0, 300)}`)
        const back = await client.get(`/api/projects/${project}/document`)
        if (!back.ok) die(`read back: ${back.status}`)
        const left = patchOps(back.body.document, rig).ops.length
        say(`written, version ${out.body.newVersion}; read back v${back.body.version}: ${ops.length - left}/${ops.length} units at the rig file's address`)
        if (left) die('read back: not every unit is at its address')
        return
    }
    if (args['laser-frames']) {
        const plan = laserFrameOps(doc, rig, frameOpts)
        const { ops, unmatched, absent } = plan
        say(`${project} @ v${got.body.version}: laser frames — ${ops.length} beams get beam.laser with frames (updateComponent beam {laser}); ` +
            `in the project, not in the rig file: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 5).join(', ')})` : ''}; in the rig file, not in the project: ${absent.length}`)
        for (const line of describeLaserFrames(plan)) say(line)
        if (args.out) {
            fs.mkdirSync(String(args.out), { recursive: true })
            fs.writeFileSync(path.join(String(args.out), `laser-frames-${project}-before.json`), JSON.stringify(got.body))
            fs.writeFileSync(path.join(String(args.out), `laser-frames-${project}-ops.json`), JSON.stringify(ops, null, 1))
        }
        if (unmatched.length || !ops.length) die(`${project}: its laser beams do not match the rig file (${args.rig || RIG_FILE}): nothing written`)
        if (!args.apply) { say('dry run: nothing written (--apply to write)'); return }
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `epic-laser-frames-${Date.now()}-${j}`, clientId: 'epic-build' })) })
        if (!out.ok) die(`laser frame ops: ${out.status} ${out.text.slice(0, 300)}`)
        const back = await client.get(`/api/projects/${project}/document`)
        if (!back.ok) die(`read back: ${back.status}`)
        const lz = back.body.document.entities.filter((e) => plan.want.has(e.id))
        const timed = lz.filter((e) => { const l = laserOf(e.components?.beam); return l && (l.frames || l.frame) }).length
        say(`written, version ${out.body.newVersion}; read back v${back.body.version}: ${timed}/${lz.length} laser beams carry their frames`)
        if (timed !== lz.length) die('read back: not every laser beam carries its frames')
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
    const old = oldEntities(doc)
    // the hall a lamp's first hit is cast against (hall-reach.mjs): --hall <record>, default HALL_FILE; --hall none: the type's reach
    const hallArg = String(args.hall || HALL_FILE)
    const hall = hallArg === 'none' ? null : hallDimsOf(hallArg, REPO_ROOT)
    if (hallArg !== 'none' && !hall) die(`no hall record at ${hallArg} (--hall none to write the types' reaches)`)
    if (hall) { try { shellOf(hall) } catch (e) { die(`${hallArg}: ${e.message}`) } } // a hall without dims.shell is refused, never cast against copied planes
    const ents = v1Entities(rig, { hall })
    const looks = v1Looks(rig, ents, ctx, String(args.rig || RIG_FILE))
    const cues = cuesOf(rig)
    // --looks-only (2026-10-13): the looks and the cue list from the rig file, NOTHING else — no unit deleted or
    // re-created, so lamps the owner moved by hand in the Studio stay where he put them.
    const looksOnly = Boolean(args['looks-only'])
    const ops = looksOnly ? [] : [...booth.ops]
    if (!looksOnly) for (const e of old) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    if (!looksOnly) for (const e of ents) ops.push({ type: 'createEntity', payload: { entity: e } })
    const bar = looksOnly ? null : rig.solids.find((s) => s.id === 'rig-crowd-barrier')
    if (bar && doc.entities.some((e) => e.id === 'rig-crowd-barrier')) {
        ops.push({ type: 'updateComponent', payload: { entityId: 'rig-crowd-barrier', component: 'transform', patch: { position: bar.p, scale: bar.s } } })
        if (bar.name && doc.entities.find((e) => e.id === 'rig-crowd-barrier')?.name !== bar.name) ops.push({ type: 'updateEntity', payload: { entityId: 'rig-crowd-barrier', patch: { name: bar.name.slice(0, 200) } } })
    }
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigLooks', patch: looks } })
    ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigParts', patch: { parts: v1RigParts(rig, ents) } } })
    // No hazer (owner 10-08: "the haze is the 4 smoke machines"): the external hazers come off the rental list, so the cards
    // page stops asking to place 6 of them.
    const rental = looksOnly ? null : doc.entities.find((e) => e.id === 'rig-show')?.components?.rentalList
    if (rental?.items) {
        const items = v1RentalItems(rental, rig)
        if (JSON.stringify(items) !== JSON.stringify(rental.items)) ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rentalList', patch: { ...rental, items } } })
    }
    if (!looksOnly) ops.push({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigVariant', patch: rig.title
        ? { title: String(rig.title).slice(0, 120), summary: String(rig.what || '').slice(0, 300) }
        : rig.version && rig.version !== V1_TITLE
        ? { title: `${rig.version} — the stage at the press end, the epic lights moved to it`.slice(0, 120), summary: String(rig.what || '').slice(0, 300) }
        : { title: 'MOXIR v1.0 — the epic lights, all wash + all beam hung, used minimally', summary: 'v0.9 + the epic plot (owner 10-08): every wash and beam of the order hung, 6 cubes (12 lines onto one matte ash wall), haze = the 4 smoke machines; looks dark-first, 2 layers (3 at the peak), ash white + ember red. Plan A1.' } } })
    for (const c of doc.mappingState?.cues || []) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of cues) ops.push({ type: 'createMappingCue', payload: { cue: c } })
    // a rig file may say its show plays by its own clock (mappingState.showSource 'clock'): a desk that answers on the stack
    // (an empty scratch desk) then does not drive the room (showClock.js showDriver)
    ops.push({ type: 'setMappingState', payload: { patch: { loop: rig.loop !== false, showEpoch: Date.now(), ...(rig.showSource ? { showSource: rig.showSource } : {}) } } })
    if (!looksOnly) ops.push({ type: 'setPresentationState', payload: { patch: viewsOf(rig) } })
    if (!looksOnly) ops.push(...v1RenderOps({ ambient: Number(args.ambient ?? V1_AMBIENT), atmosphere: rig.atmosphere || null }))
    say(`${project} @ v${got.body.version}: ${looksOnly ? 'looks only — ' : `delete ${old.length}, create ${ents.length}, `}${looks.looks.length} looks, ${cues.length} cues; ${ops.length} ops`)
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
