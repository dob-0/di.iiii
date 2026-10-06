#!/usr/bin/env node
/**
 * footprints.mjs — what every lamp of a rig version really lights: where its beam lands, how far it
 * throws, how wide the spot is and how bright it is at the centre. Owner, 2026-09-30: "simulate the
 * light sizes — how in it the devices — to see the real result."
 *
 *   node scripts/rigbuild/footprints.mjs                       # minimal-ground + full-ground, every look
 *   node scripts/rigbuild/footprints.mjs --version full-ground --look gs-one-shaft
 *   node scripts/rigbuild/footprints.mjs --rig <rig file> --out <dir> [--hall <hall.json>] [--words]
 *
 * Writes footprints-<id>.md and footprints-<id>.csv to ~/Downloads/moxir-devices (or --out). No network,
 * no browser, no rendering, nothing written into a running install: pure math over committed files.
 *
 * THE METHOD (established formulas, nothing invented; sources named):
 *   - Aim, position, reach: rig-lib.mjs `buildRig` for the look (the same aims and the same reach the room
 *     draws); the direction is `spotAimDirection` of the lamp entity's rotation. Not re-implemented here.
 *   - Throw: a ray from the lens along the aim against the hall's floor, roof deck (lantern openings up to
 *     `lantern_top_m` - 0.3), end and side walls, the massing boxes (press, machine line) — the same solids
 *     rig-lib's `surfaceHit` stops a beam at — and, because they are real steel, the columns (hall column
 *     grid), the cranes (`craneSolids`) and the rig's own deck, table and truss boxes. Planes are marched every
 *     0.1 m from 0.3 m like `surfaceHit` and refined by bisection; boxes are exact (slab method). Nothing within
 *     the class's `reach_m`: "open air".
 *   - Spot diameter D = 2 * d * tan(beam / 2) (cone geometry). On a slanted surface the spot is an ellipse whose
 *     long axis is D / cos(incidence) (the small-beam approximation the owner named); when incidence + beam/2 >=
 *     90 deg the cone's edge never meets the surface (an open conic) and no ellipse is claimed.
 *   - Illuminance at the spot's centre E = I * cos(incidence) / d^2 (the inverse-square and cosine laws, the
 *     point-by-point method of any lighting handbook, e.g. the IES Lighting Handbook). I = lux * at_m^2 from the
 *     type's `optics` (src/rigbuild/types/moxir.json), scaled by rig-lib `candelaAt` (flux conservation) when the
 *     class uses the lamp at another angle than `optics.beam_deg` (the zoom). No lux in the optics -> "no figure".
 *
 * WHAT IT IS NOT: direct light only (no bounce, no haze scattering: the room's beams-in-haze look is a rendering
 * effect, not a lux figure); the beam angle is taken as the full angle to 50 % of peak, the usual convention,
 * and the borrowed figures do not say which they are; the head's flare on the columns and a rig's rotated
 * steel other than the truss line are not modelled. EVERY UP-* photometric figure is borrowed from another
 * maker's product (`photometryBasis` EQUIVALENT, ASSUMED for the COB): each row carries its basis, and any basis
 * that is not EXACT is flagged. NOT seen on a screen.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, buildRig, candelaAt, craneSolids } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { loadLibrary } from './library.mjs'
import { VERSIONS_FILE, rigFileOf } from './versions.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const DEG = Math.PI / 180
/**
 * nearFieldM / nearFieldBeamDeg: a narrow lamp (under nearFieldBeamDeg) closer than nearFieldM is in its near field:
 * the front lens (centimetres to tens of centimetres, size NOT in types/moxir.json) is not a point, and I = lux x at_m^2
 * holds only beyond the photometric distance. CHOSEN, NOT MEASURED; the row says "near-field: figure not valid".
 */
export const THRESHOLDS = { wideM: 6, tightM: 0.5, dimLux: 1, nearFieldM: 3, nearFieldBeamDeg: 5 }
export const DEFAULT_VERSIONS = ['minimal-ground', 'full-ground']
/** rig-lib's surfaceHit starts 0.3 m out and steps 0.1 m: the same march here. */
const START_M = 0.3
const STEP_M = 0.1

// ---------------------------------------------------------------------------
// The formulas. Pure.
// ---------------------------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
}
const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** Spot diameter on a surface square to the beam: 2 * throw * tan(beam / 2). */
export const spotDiameter = (throwM, beamDeg) => 2 * throwM * Math.tan((beamDeg * DEG) / 2)
/** cos of the angle between the beam and the surface normal. */
export const cosIncidence = (dir, normal) => clamp01(Math.abs(dot(unit(dir), unit(normal))))
/**
 * Long axis of the spot on a slanted surface, exact for a cone on a plane: h (tan(t + a) - tan(t - a)), h = the
 * distance to the plane square to it (throw x cos t), t = incidence, a = half the beam; the throw is recovered from
 * the diameter (2 throw tan a). Null when the cone's edge never lands (open conic).
 */
export const ellipseMajor = (diameter, incidenceDeg, beamDeg) => {
    const a = (beamDeg / 2) * DEG
    const t = incidenceDeg * DEG
    if (incidenceDeg + beamDeg / 2 >= 90) return null
    const h = (diameter / (2 * Math.tan(a))) * Math.cos(t)
    return h * (Math.tan(t + a) - Math.tan(t - a))
}
/** E = I * cos(incidence) / d^2 (lux; I in candela, d in metres). */
export const illuminance = (candela, throwM, cosInc) => (candela / (throwM * throwM)) * cosInc

/**
 * The flags of a row. `lux` is the lux at the look's level; `borrowed` is every basis that is not EXACT
 * (a missing basis included). A lamp the look has out carries only 'out'.
 */
export const flagsOf = ({ lit = true, surface, spot = null, major = null, lux = null, hasFigure = true, basis = null, grazing = false, roomDiffers = false, nearField = false }) => {
    if (!lit) return ['out']
    const flags = []
    if (nearField) flags.push('near-field')
    if (surface === 'open air') flags.push('open-air')
    if (spot !== null && Math.max(spot, major ?? 0) > THRESHOLDS.wideM) flags.push('wide')
    if (spot !== null && grazing && major === null) flags.push('wide')
    if (spot !== null && spot < THRESHOLDS.tightM) flags.push('tight')
    if (lux !== null && lux < THRESHOLDS.dimLux) flags.push('dim')
    if (surface !== 'open air' && !hasFigure) flags.push('no-figure')
    if (grazing) flags.push('grazing')
    if (basis !== 'EXACT') flags.push('borrowed')
    if (roomDiffers) flags.push('room-differs')
    return [...new Set(flags)]
}

// ---------------------------------------------------------------------------
// The solids. A box is { x: [a, b], y: [a, b], z: [a, b] }.
// ---------------------------------------------------------------------------
/** Slab method. The nearest entry at or beyond `tMin` (the origin inside the box, or an entry nearer than tMin, is not a hit). */
export const rayBox = (from, dir, box, tMin = START_M) => {
    const lo = [box.x[0], box.y[0], box.z[0]]
    const hi = [box.x[1], box.y[1], box.z[1]]
    let near = -Infinity
    let far = Infinity
    let axis = -1
    for (let i = 0; i < 3; i += 1) {
        if (Math.abs(dir[i]) < 1e-12) {
            if (from[i] < lo[i] || from[i] > hi[i]) return null
            continue
        }
        const a = (lo[i] - from[i]) / dir[i]
        const b = (hi[i] - from[i]) / dir[i]
        const enter = Math.min(a, b)
        const exit = Math.max(a, b)
        if (enter > near) {
            near = enter
            axis = i
        }
        far = Math.min(far, exit)
    }
    if (axis < 0 || near > far || near < tMin) return null
    const normal = [0, 0, 0]
    normal[axis] = dir[axis] > 0 ? -1 : 1
    return { t: near, normal }
}

/** three.js Euler 'XYZ' (radians) as a matrix, R = Rx * Ry * Rz: the way rig-lib's `strut` turns a box about its base point. */
export const eulerXYZ = ([x, y, z]) => {
    const [a, b, c, d, e, f] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
    return [
        [c * e, -c * f, d],
        [a * f + b * e * d, a * e - b * f * d, -b * c],
        [b * f - a * e * d, b * e + a * f * d, a * c]
    ]
}
const mul = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)]
const transpose = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]

/** A rig box entity (base-anchored: `pos` is the middle of its base, `size` its extents) that may be rotated: the ray in its own frame. */
export const rayObb = (from, dir, { pos, size, rotation }, tMin = START_M) => {
    const r = eulerXYZ(rotation)
    const rt = transpose(r)
    const local = rayBox(mul(rt, [from[0] - pos[0], from[1] - pos[1], from[2] - pos[2]]), mul(rt, dir), { x: [-size[0] / 2, size[0] / 2], y: [0, size[1]], z: [-size[2] / 2, size[2] / 2] }, tMin)
    return local ? { t: local.t, normal: mul(r, local.normal) } : null
}

/**
 * The building's planes as rig-lib `surfaceHit` knows them for the flat-roof (v2) hall: the floor, the roof deck with
 * the lantern openings up to `lantern_top_m` - 0.3, the end walls and the side walls. `inside(p)` says whether a
 * point is in the building's skin; `describe(lo, hi)` names the surface a ray crossed between two points.
 */
export const makeBuilding = (hall) => {
    const g = hall.geometry
    if (!g.roof_flat) throw new Error('footprints.mjs models the flat-roof (v2) hall only; this hall has a pitched roof (rig-lib surfaceHit v1) — owed')
    const deck = g.deck_m ?? g.truss_top_centre_m
    const lanternTop = (g.lantern_top_m ?? deck) - 0.3
    const [wl, wr] = g.walls_x_m || [-(g.wall_inner_x_m ?? 12), g.wall_inner_x_m ?? 12]
    const ends = [g.far_wall_z_m ?? -1e9, g.door?.z_m ?? 1e9].sort((a, b) => a - b)
    const lanternAt = (x, z) => (g.lanterns || []).find((l) => x >= l.x_m[0] && x <= l.x_m[1] && z >= l.z_m[0] && z <= l.z_m[1]) || null
    const roofAt = (x, z) => (lanternAt(x, z) ? lanternTop : deck)
    const inside = (p) => p[1] <= 0 || p[1] >= roofAt(p[0], p[2]) || p[2] <= ends[0] || p[2] >= ends[1] || p[0] <= wl || p[0] >= wr
    const describe = (lo, hi) => {
        const [x, y, z] = hi
        const cand = [
            [-y, { cls: 'floor', detail: 'floor', normal: [0, 1, 0] }],
            [y - roofAt(x, z), { cls: 'roof', detail: lanternAt(x, z) ? 'lantern top' : 'roof deck', normal: [0, -1, 0] }],
            [ends[0] - z, { cls: 'wall', detail: 'end wall', normal: [0, 0, 1] }],
            [z - ends[1], { cls: 'wall', detail: 'end wall', normal: [0, 0, -1] }],
            [wl - x, { cls: 'wall', detail: 'side wall', normal: [1, 0, 0] }],
            [x - wr, { cls: 'wall', detail: 'side wall', normal: [-1, 0, 0] }]
        ]
        const best = cand.reduce((a, b) => (b[0] > a[0] ? b : a))[1]
        // a beam that rose through a lantern opening and left its footprint sideways met the lantern's side
        const opening = lanternAt(lo[0], lo[2])
        if (best.cls === 'roof' && opening && !lanternAt(x, z) && y > deck && y < lanternTop) {
            const across = x < opening.x_m[0] ? [1, 0, 0] : x > opening.x_m[1] ? [-1, 0, 0] : z < opening.z_m[0] ? [0, 0, 1] : [0, 0, -1]
            return { cls: 'roof', detail: 'lantern side', normal: across }
        }
        return best
    }
    return { inside, describe }
}

/** The hall's own solids beyond the skin: the massing boxes, the column grid, the cranes. */
export const hallSolids = (hall) => {
    const g = hall.geometry
    const solids = (g.massing || []).map((m) => ({ id: m.id, cls: 'machine', detail: m.id, box: { x: m.x_m, y: m.y_m, z: m.z_m } }))
    const inner = g.column_inner_face_x_m
    const [, right] = g.column_row_x_m || [-inner, inner]
    const depth = 2 * (right - inner)
    const w = hall.dims?.column_w_m ?? 0.5
    const top = g.column_head?.head_top_m ?? g.runway_bottom_m ?? 6
    const rows = g.rows_x_m || g.column_row_x_m || []
    for (const rowX of rows) {
        for (const z of [...new Set(g.column_grid_z_m || [])]) {
            solids.push({ id: `column x ${rowX} z ${z}`, cls: 'column', detail: `column x ${rowX} z ${z}`, box: { x: [rowX - depth / 2, rowX + depth / 2], y: [0, top], z: [z - w / 2, z + w / 2] } })
        }
    }
    for (const crane of g.cranes || []) {
        craneSolids(crane, g).forEach((b, i) => solids.push({ id: `crane z ${crane.z_m} part ${i + 1}`, cls: 'crane', detail: `crane at z ${crane.z_m}`, box: { x: b.x, y: b.y, z: b.z } }))
    }
    return solids
}

const RIG_STEEL = /^rig-(truss|stage-deck|dj-table|dj-stair)/
/** The rig's own boxes that a beam can land on: the deck, the DJ table, the stairs, the truss line (a rotated box is an OBB). */
export const rigSolids = (entities) => entities.filter((e) => e.type === 'box' && RIG_STEEL.test(e.id)).map((e) => {
    const t = e.components.transform
    const [sx, sy, sz] = t.scale
    const cls = e.id.startsWith('rig-truss') ? 'truss' : 'stage'
    if (t.rotation.some((v) => Math.abs(v) > 1e-9)) return { id: e.id, cls, detail: e.id, obb: { pos: t.position, size: [sx, sy, sz], rotation: t.rotation } }
    return { id: e.id, cls, detail: e.id, box: { x: [t.position[0] - sx / 2, t.position[0] + sx / 2], y: [t.position[1], t.position[1] + sy], z: [t.position[2] - sz / 2, t.position[2] + sz / 2] } }
})

/**
 * The first thing a ray meets within `maxReach`: { hit: class, detail, throw, normal, point } or { hit: 'open air' }.
 * Planes: marched from 0.3 m every 0.1 m (rig-lib `surfaceHit`), refined by bisection; boxes: exact.
 */
export const castRay = (from, dir, { building, solids = [], maxReach = 80 }) => {
    const d = unit(dir)
    const at = (t) => [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t]
    let best = null
    let lo = START_M - STEP_M
    for (let k = Math.round(START_M / STEP_M); k * STEP_M <= maxReach + 1e-9; k += 1) {
        const t = k * STEP_M
        if (building.inside(at(t))) {
            let a = lo
            let b = t
            for (let i = 0; i < 40; i += 1) {
                const m = (a + b) / 2
                if (building.inside(at(m))) b = m
                else a = m
            }
            best = { ...building.describe(at(a), at(b)), t: b }
            break
        }
        lo = t
    }
    for (const s of solids) {
        const h = s.obb ? rayObb(from, d, s.obb) : rayBox(from, d, s.box)
        if (h && h.t <= maxReach && (!best || h.t < best.t)) best = { cls: s.cls, detail: s.detail, normal: h.normal, t: h.t }
    }
    if (!best) return { hit: 'open air', detail: '', throw: null, normal: null, point: null }
    return { hit: best.cls, detail: best.detail, throw: best.t, normal: best.normal, point: at(best.t) }
}

/**
 * One lamp's footprint. `optics` is the type's `optics` (or null); `angleDeg` the beam angle used.
 * Returns the numbers and the flags; lux is at full output (a look's level is applied by the caller).
 */
export const footprint = ({ from, dir, maxReach, building, solids, angleDeg, optics, level = 1, roomCandela = null }) => {
    const d = unit(dir)
    const cast = castRay(from, d, { building, solids, maxReach })
    const cd = optics && angleDeg ? candelaAt(optics, angleDeg) : null
    const basis = optics?.photometryBasis || 'NONE'
    const base = { surface: cast.hit, detail: cast.detail, throwM: cast.throw, incidenceDeg: null, spotM: null, majorM: null, openConic: false, candela: cd, lux: null, luxAtLevel: null, basis, level }
    const roomDiffers = cd !== null && roomCandela !== null && Math.abs(roomCandela / cd - 1) > 0.01
    if (cast.hit === 'open air') return { ...base, flags: flagsOf({ lit: level > 0, surface: cast.hit, basis, hasFigure: cd !== null, roomDiffers }) }
    const cos = cosIncidence(d, cast.normal)
    const incidenceDeg = Math.acos(cos) / DEG
    const nearField = Boolean(angleDeg) && cast.throw < THRESHOLDS.nearFieldM && angleDeg < THRESHOLDS.nearFieldBeamDeg
    const spot = angleDeg && !nearField ? spotDiameter(cast.throw, angleDeg) : null
    const major = spot === null ? null : ellipseMajor(spot, incidenceDeg, angleDeg)
    const lux = cd === null || nearField ? null : illuminance(cd, cast.throw, cos)
    const luxAtLevel = lux === null ? null : lux * level
    const grazing = spot !== null && major === null
    return {
        ...base, incidenceDeg, spotM: spot, majorM: major, openConic: grazing, lux, luxAtLevel,
        flags: flagsOf({ lit: level > 0, surface: cast.hit, spot, major, lux: luxAtLevel, hasFigure: cd !== null, basis, grazing, roomDiffers, nearField })
    }
}

// ---------------------------------------------------------------------------
// A rig version, every look, every lamp.
// ---------------------------------------------------------------------------
const groupOfEntity = (rig, id) => {
    const owner = rig.groups
        .filter((g) => id.startsWith(`${RIG_PREFIX}${g.id}-`) && /^\d+$/.test(id.slice(`${RIG_PREFIX}${g.id}-`.length)))
        .sort((a, b) => b.id.length - a.id.length)[0]
    if (!owner) throw new Error(`no group owns the lamp ${id}`)
    return owner
}
const r = (v, dp) => (v === null || v === undefined ? null : Number(v.toFixed(dp)))

/** The angle a class uses and where it comes from — rig-lib `classPhotometry`'s order, with the type's `optics.beam_deg`. */
export const angleUsed = (cls, optics) => {
    if (cls.angleDeg !== undefined && cls.angleDeg !== null) return { deg: cls.angleDeg, source: 'rig class angleDeg' }
    if (optics?.beam_deg) return { deg: optics.beam_deg, source: 'types optics.beam_deg' }
    if (cls.beamAngleDeg) return { deg: cls.beamAngleDeg, source: 'rig class beamAngleDeg' }
    return { deg: null, source: 'none' }
}

/** Every lamp of one look. */
export const lookRows = ({ rig, hall, built, library, version, look }) => {
    const building = makeBuilding(hall)
    const solids = [...hallSolids(hall), ...rigSolids(built.entities)]
    return built.entities.filter((e) => e.type === 'spotLight').map((e) => {
        const group = groupOfEntity(rig, e.id)
        const cls = rig.classes[group.class]
        const type = typeById(library, typeIdOf(cls.code))
        const optics = type?.optics || null
        const angle = angleUsed(cls, optics)
        const room = built.summary.photometry?.[group.class]
        const full = room?.intensity
        const intensity = e.components.light.intensity
        const level = full > 0 ? Math.min(1, intensity / full) : intensity > 0 ? 1 : 0
        const from = e.components.transform.position
        const dir = unit(spotAimDirection(e.components.transform.rotation))
        const fp = footprint({ from, dir, maxReach: cls.reach_m, building, solids, angleDeg: angle.deg, optics, level, roomCandela: room?.candela ?? null })
        return {
            version, look, id: e.id.slice(RIG_PREFIX.length), group: group.id, code: cls.code, type: type?.id || typeIdOf(cls.code),
            x: r(from[0], 2), y: r(from[1], 2), z: r(from[2], 2), dx: r(dir[0], 4), dy: r(dir[1], 4), dz: r(dir[2], 4),
            reachM: cls.reach_m, level: r(level, 3), lit: level > 0,
            surface: fp.surface, detail: fp.detail, throwM: r(fp.throwM, 2), incidenceDeg: r(fp.incidenceDeg, 1),
            beamDeg: angle.deg, beamSource: angle.source, zoomDeg: optics?.zoom_deg || null, basis: fp.basis, basisSrc: optics?.photometrySrc || null,
            spotM: r(fp.spotM, 3), majorM: r(fp.majorM, 3), openConic: fp.openConic,
            candela: r(fp.candela, 0), roomCandela: r(room?.candela ?? null, 0), lux: r(fp.lux, 2), luxAtLevel: r(fp.luxAtLevel, 2),
            flags: fp.flags
        }
    })
}

/** The per-look summary of the lit lamps. */
export const summarise = (rows, built) => {
    const lit = rows.filter((x) => x.lit)
    const byClass = {}
    for (const x of lit) byClass[x.surface] = (byClass[x.surface] || 0) + 1
    // lit area: the sum of the spots' areas (pi/4 * short * long axis); overlaps counted twice, so an upper bound
    const area = lit.reduce((s, x) => (x.spotM === null ? s : s + (Math.PI / 4) * x.spotM * (x.majorM ?? x.spotM)), 0)
    const lux = lit.filter((x) => x.luxAtLevel !== null).sort((a, b) => a.luxAtLevel - b.luxAtLevel)
    const flags = {}
    for (const x of lit) for (const f of x.flags) flags[f] = (flags[f] || 0) + 1
    return {
        lamps: rows.length, lit: lit.length, out: rows.length - lit.length, byClass, areaM2: r(area, 1),
        brightest: lux.length ? { id: lux.at(-1).id, lux: lux.at(-1).luxAtLevel } : null,
        dimmest: lux.length ? { id: lux[0].id, lux: lux[0].luxAtLevel } : null,
        noFigure: lit.filter((x) => x.lux === null && x.surface !== 'open air' && !x.flags.includes('near-field')).length,
        flags, clashes: built?.summary?.clashes?.length ?? 0
    }
}

/** A rig version, every look (or the named ones). */
export const analyse = ({ rig, hall, manifest, geometry, library, version, looks }) => {
    const names = looks || Object.keys(rig.looks || {})
    const out = names.map((look) => {
        const built = buildRig(rig, hall, { geometry, manifest, look })
        const rows = lookRows({ rig, hall, built, library, version, look })
        return { id: look, title: rig.looks[look].title, intent: rig.looks[look].intent, rows, summary: summarise(rows, built) }
    })
    return { version, looks: out }
}

// ---------------------------------------------------------------------------
// Output: CSV, Markdown, the words.
// ---------------------------------------------------------------------------
const CSV_COLUMNS = [
    'version', 'look', 'lamp', 'group', 'type', 'lit', 'level', 'x_m', 'y_m', 'z_m', 'aim_x', 'aim_y', 'aim_z', 'reach_m', 'surface', 'surface_detail', 'throw_m', 'incidence_deg',
    'beam_deg', 'beam_source', 'zoom_deg', 'basis', 'basis_source', 'spot_m', 'ellipse_long_m', 'I_cd', 'I_room_cd', 'lux_full', 'lux_at_level', 'flags'
]
const csvCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows) => {
    const lines = [CSV_COLUMNS.join(',')]
    for (const x of rows) {
        const near = x.flags.includes('near-field')
        const luxText = (v) => (x.surface === 'open air' ? '' : near ? 'near-field' : v === null ? 'no figure' : v)
        lines.push([
            x.version, x.look, x.id, x.group, x.type, x.lit ? 1 : 0, x.level, x.x, x.y, x.z, x.dx, x.dy, x.dz, x.reachM, x.surface, x.detail, x.throwM, x.incidenceDeg,
            x.beamDeg, x.beamSource, x.zoomDeg ? x.zoomDeg.join('-') : '', x.basis, x.basisSrc, near ? 'near-field' : x.spotM, near ? 'near-field' : x.openConic ? 'open' : x.majorM, x.candela, x.roomCandela, luxText(x.lux), luxText(x.luxAtLevel), x.flags.join(' ')
        ].map(csvCell).join(','))
    }
    return `${lines.join('\n')}\n`
}

const group3 = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const fixed = (v, dp) => (v === null || v === undefined ? '—' : v.toFixed(dp))
const luxText = (v) => (v === null || v === undefined ? '—' : v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : group3(v))
const SURFACE_WORDS = { floor: 'the floor', roof: 'the roof', wall: 'a wall', column: 'the columns', truss: 'the truss', crane: 'the crane', machine: 'the machinery', stage: 'the DJ riser', 'open air': 'open air' }
const range = (values, dp = 1) => {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const places = lo < 0.1 ? Math.max(dp, 3) : lo < 1 ? Math.max(dp, 2) : dp
    const a = lo.toFixed(places)
    const b = hi.toFixed(places)
    return a === b ? a : `${a}-${b}`
}
const luxRange = (values) => {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    return lo === hi ? luxText(lo) : `${luxText(lo)}-${luxText(hi)}`
}

/** A look in plain words, from the numbers: one sentence per (group, surface), then the extremes and the flags. */
export const wordsFor = (look) => {
    const lit = look.rows.filter((x) => x.lit)
    if (!lit.length) return `${look.id} (${look.title}): every lamp is out.`
    const parts = []
    const keys = [...new Set(lit.map((x) => `${x.group}|${x.surface}`))]
    for (const key of keys) {
        const set = lit.filter((x) => `${x.group}|${x.surface}` === key)
        const [first] = set
        const kind = first.beamDeg === null ? 'beams' : first.beamDeg <= 6 ? 'shafts' : first.beamDeg <= 30 ? 'beams' : 'washes'
        const angle = first.beamDeg === null ? 'unknown-angle' : `${first.beamDeg} deg`
        const at = set.some((x) => x.level < 1) ? ` at ${Math.round(Math.min(...set.map((x) => x.level)) * 100)}%` : ''
        if (first.surface === 'open air') {
            parts.push(`the ${set.length} ${first.code} (${first.group})${at} fire ${angle} ${kind} into open air (nothing within their ${first.reachM} m reach)`)
            continue
        }
        const near = set.filter((x) => x.flags.includes('near-field'))
        const lux = set.filter((x) => x.luxAtLevel !== null).map((x) => x.luxAtLevel)
        const luxWords = lux.length ? `at ${luxRange(lux)} lux` : near.length === set.length ? '' : 'with no lux figure (no candela in the optics)'
        const spot = set.filter((x) => x.spotM !== null).map((x) => x.spotM)
        const spotWords = spot.length ? `a ${range(spot, spot.every((s) => s < 10) ? 1 : 0)} m spot` : near.length === set.length ? 'near-field: figure not valid (lens size unknown)' : 'a spot of unknown size'
        const nearWords = near.length && near.length < set.length ? ` (${near.length} of them near-field: figure not valid)` : ''
        parts.push(`the ${set.length} ${first.code} (${first.group})${at} throw ${angle} ${kind} ${range(set.map((x) => x.throwM))} m onto ${SURFACE_WORDS[first.surface] || first.surface}: ${spotWords} ${luxWords}${nearWords}`.replace(/ +$/, ''))
    }
    const s = look.summary
    const tail = [`brightest ${s.brightest ? `${s.brightest.id} at ${luxText(s.brightest.lux)} lux` : 'no lux figure'}`, `dimmest ${s.dimmest ? `${s.dimmest.id} at ${luxText(s.dimmest.lux)} lux` : 'no lux figure'}`]
    const flagged = ['wide', 'tight', 'dim', 'grazing', 'no-figure', 'near-field', 'borrowed'].filter((f) => s.flags[f]).map((f) => `${s.flags[f]} ${f}`)
    const sources = [...new Set(lit.filter((x) => x.basis !== 'EXACT').map((x) => x.basisSrc || 'no source'))]
    const borrowed = sources.length ? ` Figures borrowed from another product, not measured on the lamp (${sources.join('; ')}).` : ''
    return `**${look.id} — ${look.title}.** ${parts.join('; ')}. Lit spots sum to about ${s.areaM2} m2 (overlaps counted twice); ${tail.join(', ')}${flagged.length ? `; flagged: ${flagged.join(', ')}` : ''}.${borrowed}`
}

export const toMarkdown = ({ version, looks }, rig) => {
    const lines = [
        `# MOXIR ${version} — light footprints`,
        '',
        `Rig file: ${rig.rig || version}, written ${rig.writtenAt || 'undated'}. Generated by scripts/rigbuild/footprints.mjs (pure math over the committed rig, hall and type files; no date is written here so the file is reproducible).`,
        '',
        '## Read this first',
        '',
        '- DIRECT light only: no bounce off walls and roof, no haze scattering. The room\'s beams-in-haze look is a rendering effect, not a lux figure.',
        '- Every UP-* photometric number (beam angle and candela) is BORROWED from another maker\'s product (basis EQUIVALENT; the COB\'s is ASSUMED). Each row prints its basis; any basis that is not EXACT is flagged `borrowed`.',
        '- Lux is at the centre of the spot: E = I cos(incidence) / d^2, I = lux x at_m^2 from the type\'s optics (scaled by flux when the class uses another angle than the optics\'). "no figure" = the optics carry no lux (laser, COB): nothing is invented.',
        '- Spot = 2 d tan(beam/2); on a slanted surface the long axis is the exact cone-on-plane expression h (tan(i + a) - tan(i - a)), h the distance square to the surface, i the incidence, a half the beam; "open" = the cone\'s edge never lands (grazing).',
        `- near-field: a lamp with a beam under ${THRESHOLDS.nearFieldBeamDeg} deg and a throw under ${THRESHOLDS.nearFieldM} m. The lens size is not in the type files, so the spot and the lux (a point-source formula, I measured at a far distance) are NOT printed: "near-field: figure not valid".`,
        `- Flags: near-field, wide (spot over ${THRESHOLDS.wideM} m), tight (under ${THRESHOLDS.tightM} m), dim (under ${THRESHOLDS.dimLux} lux at the look's level: invisible without haze), borrowed, no-figure, open-air, grazing, room-differs (the room's candela differs from the optics' by more than 1 %), out (the look has the lamp out).`,
        '- Not seen on a screen. Lux at level assumes linear dimming.',
        ''
    ]
    for (const look of looks) {
        const s = look.summary
        lines.push(`## ${look.id} — ${look.title}`, '')
        if (look.intent) lines.push(`Intent: ${look.intent}`, '')
        lines.push(wordsFor(look), '')
        lines.push(`Lamps ${s.lamps}: ${s.lit} lit, ${s.out} out. Lit lamps by surface: ${Object.entries(s.byClass).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Lit area (sum of spots) about ${s.areaM2} m2. Brightest ${s.brightest ? `${s.brightest.id} ${luxText(s.brightest.lux)} lux` : 'no figure'}; dimmest ${s.dimmest ? `${s.dimmest.id} ${luxText(s.dimmest.lux)} lux` : 'no figure'}. Clashes reported by rig-lib: ${s.clashes}.`, '')
        lines.push('| lamp | type | pos x,y,z | aim | surface | throw m | inc deg | beam deg (from) | basis | spot m | long axis m | I cd | lux full | lux at level | level | flags |')
        lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
        for (const x of look.rows.filter((row) => row.lit)) {
            const open = x.surface === 'open air'
            const near = x.flags.includes('near-field')
            const lux = (v) => (open ? 'open air' : near ? 'near-field' : v === null ? 'no figure' : luxText(v))
            lines.push(`| ${x.id} | ${x.code} | ${x.x}, ${x.y}, ${x.z} | ${x.dx}, ${x.dy}, ${x.dz} | ${open ? 'open air' : `${x.surface}${x.detail && x.detail !== x.surface ? ` (${x.detail})` : ''}`} | ${open ? 'open air' : fixed(x.throwM, 2)} | ${fixed(x.incidenceDeg, 1)} | ${x.beamDeg ?? '—'} (${x.beamSource}${x.zoomDeg ? `; zoom ${x.zoomDeg.join('-')}` : ''}) | ${x.basis}${x.basisSrc ? ` (${x.basisSrc})` : ''} | ${open ? 'open air' : near ? 'near-field' : fixed(x.spotM, 2)} | ${open ? 'open air' : near ? 'near-field' : x.openConic ? 'open' : fixed(x.majorM, 2)} | ${x.candela === null ? 'no figure' : group3(x.candela)} | ${lux(x.lux)} | ${lux(x.luxAtLevel)} | ${x.level} | ${x.flags.join(' ')} |`)
        }
        lines.push('')
    }
    return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// The command.
// ---------------------------------------------------------------------------
const main = () => {
    const args = parseArgs()
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const manifest = readJson(path.join(REPO_ROOT, 'scripts/place/fixtures/fixtures.json'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const library = loadLibrary()
    const jobs = args.rig ? [{ id: null, file: path.resolve(String(args.rig)) }] : String(args.version || DEFAULT_VERSIONS.join(',')).split(',').map((s) => s.trim()).filter(Boolean).map((id) => ({ id, file: path.join(REPO_ROOT, rigFileOf(spec.set, id)) }))
    const outDir = path.resolve(String(args.out || path.join(os.homedir(), 'Downloads', 'moxir-devices')))
    if (!args.words) fs.mkdirSync(outDir, { recursive: true })
    for (const job of jobs) {
        if (!fs.existsSync(job.file)) die(`no rig file ${job.file}`)
        const rig = readJson(job.file)
        const version = job.id || rig.variant?.id || path.basename(job.file, '.json')
        const hall = readJson(args.hall ? path.resolve(String(args.hall)) : path.join(REPO_ROOT, rig.hall || spec.hall))
        const result = analyse({ rig, hall, manifest, geometry, library, version, looks: args.look ? [String(args.look)] : undefined })
        if (args.words) {
            say(`### ${version}\n`)
            for (const look of result.looks) say(`${wordsFor(look)}\n`)
            continue
        }
        const stem = path.join(outDir, `footprints-${version}`)
        fs.writeFileSync(`${stem}.md`, toMarkdown(result, rig))
        fs.writeFileSync(`${stem}.csv`, toCsv(result.looks.flatMap((l) => l.rows)))
        say(`${version}: ${result.looks.length} looks, ${result.looks.reduce((n, l) => n + l.rows.length, 0)} rows -> ${stem}.md / .csv`)
    }
}

if (isMainModule(import.meta.url)) {
    try { main() } catch (error) { die(error.stack || error.message) }
}
