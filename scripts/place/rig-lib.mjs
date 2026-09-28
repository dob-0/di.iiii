/**
 * rig-lib.mjs — a lighting rig, from a rig file and a hall, as di.iiii entities.
 *
 * Pure: no network, no file system. rig.mjs reads the files and talks to the
 * server; everything that decides WHERE a lamp hangs and WHERE it points is
 * here, so it can be tested and so it follows the hall when the hall is
 * rebuilt with measured dimensions (every position is a rule against the
 * structural grid in hall.json, never a coordinate typed by hand).
 *
 * Frame (the one hall.py writes): metres, Y up, floor at y = 0, the door end at
 * +Z, the far end at -Z, the hall centred on x = 0.
 */
import { rotationFromPanTilt } from '../../src/project/viewport/spotLightAim.js'
import { aimFixture } from './fixture-lib.mjs'
import { DEFAULT_HAZE } from '../../src/objectComponents/spotBeam.js'

export const RIG_PREFIX = 'rig-'
// A lamp whose laser path dips under this, anywhere over the floor, is refused.
// 3 m is the vertical separation commonly required between an audience and a
// show laser's beams (e.g. the US FDA laser-light-show variance conditions);
// it is a floor for the picture, NOT a safety assessment.
export const LASER_MIN_HEIGHT_M = 3

const round = (n, places = 3) => Math.round(n * 10 ** places) / 10 ** places
const DEG = Math.PI / 180

/** Pan and tilt (degrees, spotLightAim.js's convention) that point from `from` at `to`. */
export const aimAt = (from, to) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const length = Math.hypot(...d) || 1
    const [x, y, z] = d.map((c) => c / length)
    const tilt = Math.acos(Math.min(1, Math.max(-1, -y))) / DEG
    const flat = Math.hypot(x, z)
    const pan = flat < 1e-9 ? 0 : Math.atan2(-x, -z) / DEG
    return { pan: round(pan, 4), tilt: round(tilt, 4) }
}

/** Evenly spread n values across [a, b]; one value sits in the middle. */
export const spread = (n, a, b) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)))

/** n indices picked evenly out of `total`. */
export const pickEven = (n, total) => {
    if (n <= 0 || total <= 0) return []
    if (n >= total) return Array.from({ length: total }, (_, i) => i)
    return spread(n, 0, total - 1).map((v) => Math.round(v))
}

/**
 * Where the stage is, in the hall's frame, from the rig's stage block.
 * `into` is the direction along Z from the stage toward the audience.
 *
 * Two ways to say where: `end: 'far' | 'door'` stands the stage against an
 * end wall (the v1 rig), and `zone: '<name>'` stands it in a zone of
 * hall.json (`geometry.zones`, the owner's marks): the deck's front edge on
 * the zone's audience-side edge, `faces: 'entry'` (default) or `'far'`. A
 * `backdrop` (ids in `geometry.massing`) is what stands behind the stage —
 * the "wall" the truss spots wash.
 */
export const hasTruss = (rig) => Boolean(rig.truss) && rig.truss.kind !== 'none'

export const stageFrame = (rig, hall) => {
    const g = hall.geometry
    const s = rig.stage
    // `truss: { kind: 'none' }` — a rig with no goalpost (a version that hangs nothing
    // overhead). The truss mounts then refuse, and no truss boxes are written.
    const truss = hasTruss(rig) ? rig.truss : { width_m: 0, header_h_m: 0, section_m: 0, from_stage_back_m: 0 }
    let into
    let wall
    let back
    let front
    let backdrop = null
    let axis = 0
    let trussZ = null
    const backdropOf = (dir) => {
        const boxes = (g.massing || []).filter((m) => (s.backdrop || []).includes(m.id))
        if (!boxes.length) return null
        const face = dir > 0 ? Math.max(...boxes.map((m) => Math.max(...m.z_m))) : Math.min(...boxes.map((m) => Math.min(...m.z_m)))
        return {
            ids: boxes.map((m) => m.id),
            x: [Math.min(...boxes.map((m) => Math.min(...m.x_m))), Math.max(...boxes.map((m) => Math.max(...m.x_m)))],
            face,
            boxes
        }
    }
    if (s.kind === 'booth') {
        // A DJ booth: a small riser centred on a machine (`centre_on`, massing
        // ids — or `x_m`), `gap_m` in front of the face of whatever of the
        // backdrop stands behind the riser, facing the audience. The riser's
        // own centre line is the axis the booth's lamps mirror about.
        into = (s.faces || 'entry') === 'far' ? -1 : 1
        const centre = (g.massing || []).filter((m) => (s.centre_on || []).includes(m.id))
        if (s.x_m === undefined && !centre.length) throw new Error(`stage.centre_on ${JSON.stringify(s.centre_on)} names no massing in hall.json`)
        axis = s.x_m ?? (Math.min(...centre.map((m) => m.x_m[0])) + Math.max(...centre.map((m) => m.x_m[1]))) / 2
        backdrop = backdropOf(into)
        const half = s.width_m / 2
        const behind = (backdrop?.boxes || []).filter((m) => m.x_m[1] > axis - half && m.x_m[0] < axis + half)
        wall = behind.length
            ? (into > 0 ? Math.max(...behind.map((m) => Math.max(...m.z_m))) : Math.min(...behind.map((m) => Math.min(...m.z_m))))
            : backdrop?.face ?? 0
        back = wall + into * (s.gap_m ?? 1)
        front = back + into * s.depth_m
        trussZ = back + into * (truss.from_stage_back_m ?? 0)
    } else if (s.zone) {
        const zone = g.zones?.[s.zone]
        const rect = zone?.used || zone?.marked
        if (!rect) throw new Error(`stage.zone "${s.zone}" is not in hall.json (geometry.zones has: ${Object.keys(g.zones || {}).join(', ') || 'none'})`)
        into = (s.faces || 'entry') === 'far' ? -1 : 1
        front = into > 0 ? Math.max(...rect.z_m) : Math.min(...rect.z_m)
        back = front - into * s.depth_m
        const zoneBack = into > 0 ? Math.min(...rect.z_m) : Math.max(...rect.z_m)
        const boxes = (g.massing || []).filter((m) => (s.backdrop || []).includes(m.id))
        if (boxes.length) {
            const face = into > 0 ? Math.max(...boxes.map((m) => Math.max(...m.z_m))) : Math.min(...boxes.map((m) => Math.min(...m.z_m)))
            backdrop = {
                ids: boxes.map((m) => m.id),
                x: [Math.min(...boxes.map((m) => Math.min(...m.x_m))), Math.max(...boxes.map((m) => Math.max(...m.x_m)))],
                face,
                boxes
            }
            wall = face
        } else {
            wall = zoneBack
        }
    } else {
        const far = (s.end || 'far') === 'far'
        into = far ? 1 : -1
        wall = far ? g.far_wall_z_m : g.door.z_m
        back = wall + into * (s.back_gap_m ?? 1)
        front = back + into * s.depth_m
    }
    return {
        into,
        wall,
        back,
        front,
        backdrop,
        width: s.width_m,
        depth: s.depth_m,
        deck: s.deck_h_m,
        axis,
        trussZ: trussZ ?? back + into * truss.from_stage_back_m,
        trussW: truss.width_m,
        trussH: truss.header_h_m,
        trussSection: truss.section_m ?? 0.4,
        truss: hasTruss(rig)
    }
}

/**
 * Columns picked for uplighting. `spec`: `rows` 'nave' (the two rows either
 * side of the nave, default) or 'next' (the rows one span further out),
 * `zones` (names in geometry.zones: columns from the nearest zone edge minus
 * half a pitch to the farthest plus half), or `z_m` [a, b]; `faces` 'inner'
 * (the face toward the nave) and/or 'back' (the face away from it).
 * Each: { side, z, faceX, toColumn } — toColumn is the +x/-x direction from
 * the lamp to the face. Ordered nearest the stage first, then left, then right.
 */
export const columnsFor = (hall, stage, spec = {}) => {
    const g = hall.geometry
    const inner = g.column_inner_face_x_m
    const [left, right] = g.column_row_x_m || [-inner, inner]
    const depth = 2 * (right - inner)
    const pitch = g.column_grid_z_m.length > 1 ? Math.abs(g.column_grid_z_m[0] - g.column_grid_z_m[1]) : 6
    let range = spec.z_m
    if (!range && spec.zones) {
        const rects = spec.zones.map((n) => g.zones?.[n]?.used || g.zones?.[n]?.marked).filter(Boolean)
        if (!rects.length) throw new Error(`no zones ${spec.zones.join(', ')} in hall.json`)
        range = [Math.min(...rects.map((r) => Math.min(...r.z_m))) - pitch / 2, Math.max(...rects.map((r) => Math.max(...r.z_m))) + pitch / 2]
    }
    const zs = [...new Set(g.column_grid_z_m)].filter((z) => !range || (z >= range[0] - 1e-6 && z <= range[1] + 1e-6))
    const axes = spec.rows === 'next'
        ? (g.rows_x_m || []).filter((x) => Math.abs(Math.abs(x) - (Math.abs(left) + (g.spans?.span_m || 24))) < 0.5)
        : [left, right]
    const faces = spec.faces || ['inner']
    const mid = (stage.front + stage.back) / 2
    const out = []
    for (const z of zs.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || b - a)) {
        for (const ax of [...axes].sort((a, b) => a - b)) {
            const side = Math.sign(ax)
            for (const face of faces) {
                // the inner face looks toward x = 0; the back face away from it
                const faceX = face === 'back' ? ax + side * depth / 2 : ax - side * depth / 2
                out.push({ side, z, faceX, face, toColumn: face === 'back' ? -side : side })
            }
        }
    }
    return out
}

/** The column bases, nearest the stage first, alternating sides. */
export const columnsByStage = (hall, stage) => {
    const g = hall.geometry
    const inner = g.column_inner_face_x_m
    const zs = [...g.column_grid_z_m].sort((a, b) => Math.abs(a - stage.back) - Math.abs(b - stage.back))
    const out = []
    for (const z of zs) {
        for (const side of [-1, 1]) out.push({ side, z, faceX: side * inner })
    }
    return out
}

/** The overhead crane parked nearest the stage (hall.json lists them all). */
export const craneNearestStage = (hall, stage) => {
    const g = hall.geometry
    const cranes = Array.isArray(g.cranes) && g.cranes.length
        ? g.cranes
        : [{ z_m: g.crane_bridge_z_m, girder_bottom_m: g.crane_girder_bottom_m }]
    return [...cranes].sort((a, b) => Math.abs(a.z_m - stage.front) - Math.abs(b.z_m - stage.front))[0]
}

/**
 * Columns standing in the audience: from the stage front line to the far end
 * of the room from it. The pair right at the front line (within 1 m either
 * way) counts as the house's: it flanks the stage lip.
 */
const audienceColumns = (hall, stage) => columnsByStage(hall, stage)
    .filter((c) => (c.z - stage.front) * stage.into > -1)

// ---------------------------------------------------------------------------
// WHERE a fixture stands. Each rule returns mountings: `pos` is the fixture's
// mounting face — the bottom of its base on a floor or a deck, the clamp face
// under a truss or a crane girder — `orient` is 'floor' or 'hung' (upside
// down, as clamped), and `face` is the room direction its base's front turns
// to (fixture-lib.mjs, mountMatrix). The lamp itself is then at the LENS,
// which depends on the aim.
// ---------------------------------------------------------------------------
const toAudience = (ctx) => [0, 0, ctx.stage.into]
const needsTruss = (ctx, mount) => {
    if (!ctx.stage.truss) throw new Error(`mount ${mount} needs a truss, and this rig has none (truss.kind "none")`)
}
// `dx_m` [a, b, ...]: mirrored pairs at ±a, ±b from the axis, instead of an even spread.
const mirroredDx = (dx) => [...dx.map((d) => -d), ...dx].sort((a, b) => a - b)
const place = {
    'stage-back': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.deck, ctx.stage.back + ctx.stage.into * 0.6], orient: 'floor', face: toAudience(ctx) })),
    'stage-front': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 0.5], orient: 'floor', face: toAudience(ctx) })),
    // A row across the back of a booth, `half_width_m` either side of its
    // axis, `back_inset_m` in from its back edge: on the riser where the
    // riser is, on the floor beside it.
    // `dx_m` [a, b, ...]: mirrored pairs at ±a, ±b instead of an even spread.
    'booth-back': (n, ctx, group) => (group?.dx_m ? mirroredDx(group.dx_m) : spread(n, -(group?.half_width_m ?? 1), group?.half_width_m ?? 1)).map((dx) => ({
        pos: [ctx.stage.axis + dx, group?.on_floor || Math.abs(dx) > ctx.stage.width / 2 - 0.25 ? 0 : ctx.stage.deck, ctx.stage.back + ctx.stage.into * (group?.back_inset_m ?? 0.35)],
        orient: 'floor', face: toAudience(ctx)
    })),
    // On the floor in the pit between the riser and the crowd barrier.
    'booth-pit': (n, ctx, group) => (group?.dx_m ? mirroredDx(group.dx_m) : spread(n, -(group?.half_width_m ?? 3), group?.half_width_m ?? 3))
        .map((dx) => ({ pos: [ctx.stage.axis + dx, 0, ctx.stage.front + ctx.stage.into * (group?.pit_m ?? 0.7)], orient: 'floor', face: toAudience(ctx) })),
    // On side arms up the audience face of each tower, half on each, from
    // `from_h_m` to a metre under the header.
    // `h_m` [..]: the arms' heights, instead of an even spread.
    'tower-ladder': (n, ctx, group) => {
        needsTruss(ctx, 'tower-ladder')
        const per = Math.ceil(n / 2)
        const hs = group?.h_m ? group.h_m.slice(0, per) : spread(per, group?.from_h_m ?? 1.8, ctx.stage.trussH - 1)
        return [-1, 1].flatMap((side) => hs.map((h) => ({
            pos: [ctx.stage.axis + side * ctx.stage.trussW / 2, h, ctx.stage.trussZ + ctx.stage.into * (ctx.stage.trussSection / 2 + 0.3)],
            orient: 'floor', face: toAudience(ctx)
        }))).slice(0, n)
    },
    // Clamped under the header's bottom chord, hanging.
    // `dx_m`: mirrored pairs along it (on the header's clamp points), instead of an even spread.
    'truss-header': (n, ctx, group) => (needsTruss(ctx, 'truss-header'), group?.dx_m ? mirroredDx(group.dx_m) : spread(n, -ctx.stage.trussW / 2 + 1, ctx.stage.trussW / 2 - 1))
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.trussH - ctx.stage.trussSection / 2, ctx.stage.trussZ], orient: 'hung', face: toAudience(ctx) })),
    // Standing on the top plate of each tower.
    'truss-towers': (n, ctx) => (needsTruss(ctx, 'truss-towers'), spread(n, -ctx.stage.trussW / 2, ctx.stage.trussW / 2))
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.trussH + ctx.stage.trussSection / 2, ctx.stage.trussZ], orient: 'floor', face: toAudience(ctx) })),
    'column-bases': (n, ctx, group) => {
        if (group?.columns) {
            // The columns a spec picks (columnsFor), one lamp at each base.
            const cols = columnsFor(ctx.hall, ctx.stage, { faces: ['inner'], ...group.columns })
            return cols.slice(0, n).map((c) => ({ pos: [c.faceX - c.side * 0.7, 0, c.z], orient: 'floor', face: [-c.side, 0, 0], column: c }))
        }
        // Mirrored pairs: the same columns on both sides, so the rows read as
        // a design and not a scatter.
        // Not the gable columns in the entry's end wall: a lamp there stands in
        // the doorway and fires into the crane parked by it.
        const entry = ctx.hall.geometry.door?.z_m ?? Infinity
        const cols = audienceColumns(ctx.hall, ctx.stage).filter((c) => Math.abs(c.z - entry) > 3)
        const perSide = { '-1': cols.filter((c) => c.side < 0), 1: cols.filter((c) => c.side > 0) }
        const left = Math.ceil(n / 2)
        const right = n - left
        return [
            ...pickEven(left, perSide['-1'].length).map((i) => perSide['-1'][i]),
            ...pickEven(right, perSide[1].length).map((i) => perSide[1][i])
        ].map((c) => ({ pos: [c.faceX - c.side * 0.7, 0, c.z], orient: 'floor', face: [-c.side, 0, 0], column: c }))
    },
    'column-uplight': (n, ctx, group) => {
        if (group?.columns) {
            // v2: exactly one lamp per (column, face) the spec picks.
            const cols = columnsFor(ctx.hall, ctx.stage, group.columns)
            return cols.slice(0, n).map((c) => ({
                pos: [c.faceX - c.toColumn * 0.45, 0, c.z],
                orient: 'floor',
                face: [c.toColumn, 0, 0],
                column: c
            }))
        }
        // Every column once, nearest the stage first; then a second on the
        // columns nearest the stage until the count is used up. Fewer lamps than
        // columns: spread them evenly instead.
        const cols = columnsByStage(ctx.hall, ctx.stage).map((c) => ({ ...c, toColumn: c.side }))
        let slots
        if (n <= cols.length) {
            slots = pickEven(n, cols.length).map((i) => ({ ...cols[i], second: false }))
        } else {
            slots = [...cols.map((c) => ({ ...c, second: false })),
                ...cols.slice(0, n - cols.length).map((c) => ({ ...c, second: true }))]
        }
        return slots.map((c) => ({
            // The second lamp stands beside the first, a hand's width round
            // the column toward the stage, so the pair reads as a double wash.
            pos: [c.faceX - c.side * 0.45, 0, c.z + (c.second ? -ctx.stage.into * 0.45 : 0)],
            orient: 'floor',
            face: [c.side, 0, 0],
            column: c
        }))
    },
    // On the floor in front of the backdrop (the press), spread across it,
    // `backdrop_gap_m` out from its face, turned to face it.
    'backdrop-floor': (n, ctx, group) => {
        const bd = ctx.stage.backdrop
        if (!bd) throw new Error('mount backdrop-floor needs stage.backdrop (massing ids in hall.json)')
        const reachX = ctx.hall.geometry.column_inner_face_x_m - 1.5
        const x0 = Math.max(-reachX, bd.x[0] + 0.3)
        const x1 = Math.min(reachX, bd.x[1] - 0.3)
        const gap = group?.backdrop_gap_m ?? 3
        // `x_m` [..]: stand exactly there (e.g. evenly across the press's own face)
        const xs = group?.x_m ? group.x_m.slice(0, n) : spread(n, x0, Math.min(x1, x0 + (group?.backdrop_span_m ?? x1 - x0)))
        return xs.map((x) => ({
            pos: [x, 0, bd.face + ctx.stage.into * gap], orient: 'floor', face: [0, 0, -ctx.stage.into]
        }))
    },
    'crane-bridge': (n, ctx) => {
        const g = ctx.hall.geometry
        const crane = craneNearestStage(ctx.hall, ctx.stage)
        const reach = g.crane_rail_x_m - 1.5
        return spread(n, -reach, reach).map((x, i) => {
            // Mirrored: lamp i and lamp n-1-i hang on the same girder.
            const girder = Math.min(i, n - 1 - i) % 2 ? 1 : -1
            return { pos: [x, crane.girder_bottom_m, crane.z_m + girder * 1.1], orient: 'hung', face: [0, 0, girder], girder }
        })
    },
    'stage-front-deck': (n, ctx) => spread(n, -ctx.stage.width / 2 + 0.8, ctx.stage.width / 2 - 0.8)
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 0.35], orient: 'floor', face: toAudience(ctx) })),
    'stage-front-floor': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1.5, ctx.stage.width / 2 - 1.5)
        .map((x) => ({ pos: [ctx.stage.axis + x, 0, ctx.stage.front + ctx.stage.into * 0.9], orient: 'floor', face: toAudience(ctx) })),
    'nave-columns': (n, ctx) => {
        const cols = audienceColumns(ctx.hall, ctx.stage)
        return pickEven(n, cols.length).map((i) => cols[i])
            .map((c) => ({ pos: [c.faceX - c.side * 1.0, 0, c.z + ctx.stage.into * 1.2], orient: 'floor', face: [-c.side, 0, 0] }))
    }
}

// ---------------------------------------------------------------------------
// WHERE it points. A look (rig.looks[name].aims[groupId]) names one of these
// rules and its numbers; a group without one in the look keeps its own `aim`.
// Every rule is written in the STAGE's frame so a look is symmetric by
// construction: `x` across the stage (+ = stage left seen from the house is
// NOT assumed — x is the hall's x), `y` up from the floor, `a` metres from the
// stage front toward the audience.
// Each returns { target } (a room point) or { dir } (a room direction).
// ---------------------------------------------------------------------------
/** The backdrop box nearest the audience at `x` (the face a lamp standing there sees). */
const frontBox = (ctx, x) => {
    const boxes = (ctx.stage.backdrop?.boxes || []).filter((m) => x >= m.x_m[0] - 1e-6 && x <= m.x_m[1] + 1e-6)
    if (!boxes.length) return null
    return boxes.reduce((a, b) => (ctx.stage.into * (b.z_m[1] - a.z_m[1]) > 0 ? b : a))
}
// `ctx.axis` is the line the group mirrors about: the booth's axis for the
// lamps hung on the booth and its truss, the nave's (x = 0) for the lamps on
// the building's columns. A look's x is measured from it.
const axisOf = (ctx) => ctx.axis ?? 0
const stagePoint = (ctx, x, y, a) => [axisOf(ctx) + x, y, ctx.stage.front + ctx.stage.into * a]
const sideOf = (slot, ctx) => {
    const dx = slot.pos[0] - axisOf(ctx)
    return Math.abs(dx) < 0.05 ? 0 : Math.sign(dx)
}
const upOf = (slot) => (slot.orient === 'hung' ? -1 : 1)
/** A direction leaned `side` degrees across (toward +x) and `lean` degrees toward the audience, from straight up (or down, hung). */
const leaned = (ctx, slot, sideDeg, leanDeg) => {
    const s = sideDeg * DEG
    const l = leanDeg * DEG
    const up = upOf(slot)
    return [Math.sin(s), up * Math.cos(s) * Math.cos(l), Math.cos(s) * Math.sin(l) * ctx.stage.into]
}

export const AIM_RULES = {
    // Straight up (a hung lamp: straight down), optionally leaned toward the
    // audience and in toward the centre line — "pillars of light".
    vertical: (slot, meta, ctx, p = {}) => ({ dir: leaned(ctx, slot, -sideOf(slot, ctx) * (p.in_deg ?? 0), p.lean_deg ?? 0) }),
    // All in one direction.
    parallel: (slot, meta, ctx, p = {}) => ({ dir: leaned(ctx, slot, p.side_deg ?? 0, p.lean_deg ?? 0) }),
    // A symmetric fan across the line: the outermost lamps spread_deg/2 out to
    // each side, the rest evenly between, all leaned lean_deg toward the house.
    fan: (slot, meta, ctx, p = {}) => {
        const spreadDeg = p.spread_deg ?? 60
        const k = meta.n <= 1 ? 0 : meta.rank / (meta.n - 1) - 0.5
        return { dir: leaned(ctx, slot, k * spreadDeg, p.lean_deg ?? 0) }
    },
    // Every lamp at one point — the "ballyhoo" focus above the crowd.
    point: (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, p.x ?? 0, p.y ?? 8, p.a ?? 15) }),
    // A point mirrored by the lamp's side (x is the distance out on the lamp's OWN side).
    'mirror-point': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, sideOf(slot, ctx) * (p.x ?? 0), p.y ?? 8, p.a ?? 15) }),
    // Crossfire: each lamp to the OTHER side of the room at `y`, in line with
    // itself along the hall (plus `dz`); the two rows cross over the centre.
    cross: (slot, meta, ctx, p = {}) => ({
        target: [axisOf(ctx) - sideOf(slot, ctx) * (p.x ?? 8), p.y ?? 9, slot.pos[2] + ctx.stage.into * (p.dz ?? 0)]
    }),
    // A line lamp's X-cross: stage-left lamps to stage-right and back, at a point in the air.
    'x-cross': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, -sideOf(slot, ctx) * (p.x ?? 8), p.y ?? 12, p.a ?? 10) }),
    // Side light onto the DJ: every lamp at the booth's axis, `h` above the
    // riser, over the middle of the riser (or `a` metres from its front).
    'booth-key': (slot, meta, ctx, p = {}) => ({
        target: [ctx.stage.axis, ctx.stage.deck + (p.h ?? 1.6), p.a === undefined ? (ctx.stage.front + ctx.stage.back) / 2 : ctx.stage.front + ctx.stage.into * p.a]
    }),
    // A PAR grazing up its own column to the crane runway.
    'up-the-column': (slot, meta, ctx) => ({ target: [slot.column.faceX, ctx.hall.geometry.runway_bottom_m, slot.pos[2]] }),
    // A lamp in front of the backdrop at the backdrop's face, at `h` of the
    // height of whatever stands there (the press, the machine line).
    backdrop: (slot, meta, ctx, p = {}) => {
        const box = frontBox(ctx, slot.pos[0])
        if (!box) return { target: [slot.pos[0], 3 * (p.h ?? 0.6), ctx.stage.backdrop.face] }
        const face = ctx.stage.into > 0 ? box.z_m[1] : box.z_m[0]
        return { target: [slot.pos[0], box.y_m[0] + (box.y_m[1] - box.y_m[0]) * (p.h ?? 0.6), face] }
    },
    // Truss spots: alternately a downstage area of the deck and the back wall,
    // counted in from both ends so the two halves mirror.
    'stage-wash': (slot, meta, ctx, p = {}) => (Math.min(meta.rank, meta.n - 1 - meta.rank) % 2 === 0
        ? { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 0.8, ctx.stage.deck, ctx.stage.front - ctx.stage.into * (p.deck_a ?? 1.5)] }
        : { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 1.1, p.wall_y ?? (ctx.stage.backdrop ? 3 : 7), ctx.stage.wall] }),
    // Hung lamps straight down onto the floor under the crane, splayed out.
    'down-from-crane': (slot, meta, ctx) => ({ target: [slot.pos[0] * 1.1, 0, slot.pos[2] + slot.girder * 4] }),
    // A laser up into the roof over the house — the only rule a laser may use
    // besides one that rises (checkLaser refuses anything else).
    'laser-into-roof': (slot, meta, ctx, p = {}) => ({ target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * (p.x_scale ?? 0.3), ctx.hall.geometry.truss_top_centre_m, ctx.stage.front + ctx.stage.into * (p.a ?? 14)] })
}

/**
 * How far a beam travels before it meets the building: the floor, the roof
 * (v2, `geometry.roof_flat`: the flat deck, open into the lanterns; v1: a
 * pitch from the eaves up to the truss tops, the nave and aisle walls), an
 * outer or end wall, or a machine. Sampled every 0.1 m along the axis. A real beam stops there;
 * the drawn cone is cut to the same length so it does not pierce the roof.
 */
export const surfaceHit = (from, dir, hall, maxReach = 80) => {
    const g = hall.geometry
    const len = Math.hypot(...dir) || 1
    const d = dir.map((c) => c / len)
    const ends = [g.far_wall_z_m ?? -1e9, g.door?.z_m ?? 1e9].sort((a, b) => a - b)
    if (g.roof_flat) {
        // v2: a flat deck on the space frame (a beam passes through the open
        // frame and lands on the deck), open up into the lanterns; outer walls
        // only at the building edge; machines (massing) stop a beam too.
        const deck = g.deck_m ?? g.truss_top_centre_m
        const lanterns = g.lanterns || []
        const lanternTop = (g.lantern_top_m ?? deck) - 0.3
        const [wl, wr] = g.walls_x_m || [-(g.wall_inner_x_m ?? 12), g.wall_inner_x_m ?? 12]
        const boxes = g.massing || []
        for (let t = 0.3; t <= maxReach; t += 0.1) {
            const x = from[0] + d[0] * t
            const y = from[1] + d[1] * t
            const z = from[2] + d[2] * t
            const open = lanterns.some((l) => x >= l.x_m[0] && x <= l.x_m[1] && z >= l.z_m[0] && z <= l.z_m[1])
            const roof = open ? lanternTop : deck
            if (y <= 0 || y >= roof || z <= ends[0] || z >= ends[1] || x <= wl || x >= wr) return round(t, 2)
            if (boxes.some((m) => x >= m.x_m[0] && x <= m.x_m[1] && y >= m.y_m[0] && y <= m.y_m[1] && z >= m.z_m[0] && z <= m.z_m[1])) return round(t, 2)
        }
        return maxReach
    }
    const eave = g.eave_top_m ?? g.truss_bottom_m ?? 12
    const top = g.truss_top_centre_m ?? eave
    const nave = g.nave_wall_x_m ?? g.column_inner_face_x_m ?? 12
    const outer = g.wall_inner_x_m ?? nave
    const aisleRoof = g.aisle_roof_m ?? 0
    const lanternHalf = (g.lantern_w_m ?? 0) / 2
    const ridge = top + (g.lantern_h_m ?? 0)
    for (let t = 0.3; t <= maxReach; t += 0.1) {
        const x = from[0] + d[0] * t
        const y = from[1] + d[1] * t
        const z = from[2] + d[2] * t
        const ax = Math.abs(x)
        const roof = ax < lanternHalf ? ridge : top - (top - eave) * Math.min(1, ax / nave)
        if (y <= 0 || y >= roof || z <= ends[0] || z >= ends[1]) return round(t, 2)
        if (ax >= outer) return round(t, 2)
        if (ax >= nave && y >= aisleRoof) return round(t, 2)
    }
    return maxReach
}

/**
 * Refuse a laser aim that could cross the audience plane: it must rise (or
 * stay level) from where it is hung, and be hung at least LASER_MIN_HEIGHT_M
 * up — so every point of its path over the floor is at least that high.
 */
export const checkLaser = (from, to) => {
    if (from[1] < LASER_MIN_HEIGHT_M) return `hung at ${from[1].toFixed(2)} m, under ${LASER_MIN_HEIGHT_M} m`
    if (to[1] < from[1]) return `aimed downward (${from[1].toFixed(2)} m -> ${to[1].toFixed(2)} m)`
    return null
}

/**
 * Does a lamp's beam run into a crane bridge? Samples the beam's axis every
 * 0.25 m out to its reach and tests it against each bridge's girders (a box:
 * rail to rail across, 2.9 m along the hall, girder bottom to top). A real beam
 * would stop there and light the crane; the drawn cone passes through it.
 * Returns the crane's position along the hall, or null.
 */
export const beamHitsCrane = (from, to, reach, hall) => {
    const g = hall.geometry
    const cranes = Array.isArray(g.cranes) ? g.cranes : []
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const length = Math.hypot(...d) || 1
    for (let t = 0.5; t <= reach; t += 0.25) {
        const p = [from[0] + (d[0] * t) / length, from[1] + (d[1] * t) / length, from[2] + (d[2] * t) / length]
        for (const crane of cranes) {
            if (Math.abs(p[0]) <= g.crane_rail_x_m && Math.abs(p[2] - crane.z_m) <= 1.45 &&
                p[1] >= crane.girder_bottom_m && p[1] <= crane.girder_top_m) return crane.z_m
        }
    }
    return null
}

/**
 * Where the performer stands on a booth: a box from the riser's back strip to
 * the DJ table, `half` either side of the axis, head height 2 m over the deck.
 * A narrow effect beam (a beam fixture, a bee-eye at its tightest, a laser)
 * must not pass through it — that blinds the DJ; a wash or a spot aimed AT the
 * DJ is light on him and is not checked.
 */
export const performerBox = (rig, stage) => {
    if (rig.stage?.kind !== 'booth') return null
    const tb = rig.stage.table || { d_m: 0.8, from_front_m: 0.2 }
    const tableBack = stage.front - stage.into * ((tb.from_front_m ?? 0.2) + tb.d_m)
    const z = [stage.back + stage.into * 0.1, tableBack + stage.into * tb.d_m]
    return { x: [stage.axis - 0.9, stage.axis + 0.9], y: [stage.deck, stage.deck + 2.0], z: [Math.min(...z), Math.max(...z)] }
}
export const NARROW_BEAM_DEG = 6
export const beamHitsBox = (from, to, reach, b) => {
    if (!b) return false
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const length = Math.hypot(...d) || 1
    for (let t = 0.3; t <= reach; t += 0.1) {
        const p = [from[0] + (d[0] * t) / length, from[1] + (d[1] * t) / length, from[2] + (d[2] * t) / length]
        if (p[0] >= b.x[0] && p[0] <= b.x[1] && p[1] >= b.y[0] && p[1] <= b.y[1] && p[2] >= b.z[0] && p[2] <= b.z[1]) return true
    }
    return false
}

/** A look's level for a group, 0..1; a group the look does not name is at full. */
export const levelOf = (look, groupId) => {
    const v = Number(look?.levels?.[groupId])
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

/** Which members of a group get a real light, by the rig's budget and the mode. */
export const realIndices = (group, count, budget, mode) => {
    if (mode === 'all') return new Set(Array.from({ length: count }, (_, i) => i))
    if (mode === 'none') return new Set()
    const entry = budget?.realLights?.[group.id]
    if (entry === undefined || entry === null) return new Set()
    const wanted = typeof entry === 'number' ? entry : Number(entry.count) || 0
    const pick = typeof entry === 'object' ? entry.pick : 'even'
    if (pick === 'nearest-stage' || pick === 'first') {
        return new Set(Array.from({ length: Math.min(wanted, count) }, (_, i) => i))
    }
    return new Set(pickEven(wanted, count))
}

const staticAnim = { mode: 'static', speed: 1, amplitude: 1 }

/** A real lamp's light distance (its cutoff) for a beam that stops at `reach`: see buildRig. */
export const lightDistance = (reach) => reach * 2

const box = ({ id, name, pos, size, colour, emissive = '#000000', emissiveIntensity = 1, roughness = 0.8, metalness = 0 }) => ({
    id,
    type: 'box',
    name,
    components: {
        // Primitives sit ON position.y (base-anchored) and are unit-sized, so
        // scale IS the size in metres.
        transform: { position: pos.map((v) => round(v)), rotation: [0, 0, 0], scale: size.map((v) => round(v)) },
        primitive: { shape: 'box', size: [1, 1, 1] },
        appearance: { color: colour, opacity: 1, roughness, metalness, emissive, emissiveIntensity },
        // Without this every box drifts and spins in walk mode (entityAnimation.js).
        animation: staticAnim
    }
})

// ---------------------------------------------------------------------------
// PHOTOMETRY: how bright each lamp is, relative to the others, from its
// datasheet. Written out in scripts/place/README.md ("Photometry").
//   - Luminous intensity I (candela) on the beam axis: from an illuminance
//     the maker measured, I = E * d^2 (inverse-square law, far field); or
//     from luminous flux, I = F / Omega with Omega = 2*pi*(1 - cos(theta/2))
//     the solid angle of the beam (a uniform-cone approximation).
//   - A zoom fixture used at another angle keeps its flux: I scales with
//     Omega(datasheet angle) / Omega(used angle).
//   - three.js (r155+) takes a SpotLight's intensity in candela; the rig
//     multiplies every lamp by ONE `sceneScale` (rig.photometry), so the
//     ratios between fixtures are the datasheets' and only the exposure is
//     a choice.
//   - The cone drawn in the air: the light a beam scatters toward the eye,
//     per unit length, goes as I * tan(theta/2) (illuminance I/r^2 through a
//     cross-section 2 r tan(theta/2) wide). It is scaled to the brightest
//     class in the rig and passed through Stevens' brightness exponent 1/3
//     (Stevens 1957/1975, brightness of a target in the dark) so the dim ones
//     read as dim rather than vanish; the result is the entity's `haze`.
// ---------------------------------------------------------------------------
const solidAngle = (deg) => 2 * Math.PI * (1 - Math.cos((deg * DEG) / 2))

/** The on-axis candela of a fixture used at `angleDeg`, from its manifest photometry. */
export const candelaAt = (photometry, angleDeg) => {
    if (!photometry) return null
    const ref = photometry.beam_deg
    let cd = null
    if (photometry.lux && photometry.at_m) cd = photometry.lux * photometry.at_m ** 2
    else if (photometry.candela) cd = photometry.candela
    else if (photometry.flux_lm && ref) cd = photometry.flux_lm / solidAngle(ref)
    if (cd === null) return null
    return ref && angleDeg ? cd * solidAngle(ref) / solidAngle(angleDeg) : cd
}

/** Per class: the angle it is used at, its candela, the scene intensity and the air brightness (haze). */
export const classPhotometry = (rig, manifest) => {
    const out = {}
    const scale = rig.photometry?.sceneScale ?? 1
    for (const [id, cls] of Object.entries(rig.classes)) {
        const kind = manifest?.kinds?.[cls.fixture]
        const angle = cls.angleDeg ?? kind?.photometry?.beam_deg ?? cls.beamAngleDeg
        const cd = candelaAt(kind?.photometry, angle)
        out[id] = {
            angleDeg: angle,
            candela: cd,
            intensity: cd === null ? cls.intensity : round(cd * scale, 2),
            air: cd === null ? null : cd * Math.tan((angle * DEG) / 2)
        }
    }
    // A laser's beam is millimetres wide and not a cone: it is given its air
    // brightness by hand (`airFixed`) and left out of the scale.
    const pool = Object.entries(out).filter(([id]) => rig.classes[id].airFixed === undefined).map(([, c]) => c.air || 0)
    const brightest = Math.max(0, ...pool)
    for (const [id, c] of Object.entries(out)) {
        const cls = rig.classes[id]
        const air = rig.photometry?.air ?? 1
        c.haze = cls.airFixed !== undefined
            ? cls.airFixed
            : c.air && brightest > 0 ? round(air * (c.air / brightest) ** (1 / 3), 3) : cls.haze
    }
    return out
}

/**
 * The whole rig as entities, plus the posed fixture bodies.
 *
 * @param {object} rig   the rig file
 * @param {object} hall  hall.json from hall.py
 * @param {object} options
 * @param {'budget'|'all'|'none'} [options.mode]
 * @param {string} [options.look]   a name in rig.looks (default rig.defaultLook)
 * @param {Record<string, object>} options.geometry  the built models' sidecars by kind (fixtures/glb/<kind>.json)
 * @param {object} [options.manifest] fixtures/fixtures.json (photometry)
 * @returns {{ entities: object[], fixtures: object[], summary: object, stage: object }}
 */
// Mounts on the building's columns mirror about the nave; everything else
// about the stage's (the booth's) axis. A group may say `axis: 'nave' | 'booth'`.
const NAVE_MOUNTS = new Set(['column-bases', 'column-uplight', 'nave-columns', 'crane-bridge'])
export const groupAxis = (group, stage) => {
    const which = group.axis || (NAVE_MOUNTS.has(group.mount) ? 'nave' : 'booth')
    return which === 'nave' ? 0 : stage.axis ?? 0
}

export const buildRig = (rig, hall, { mode = 'budget', look: lookName, geometry = {}, manifest = null } = {}) => {
    const stage = stageFrame(rig, hall)
    const ctx = { rig, hall, stage }
    const entities = []
    const fixtures = []
    const summary = { fixtures: 0, real: 0, beamOnly: 0, byGroup: {}, effects: {}, refused: [], clashes: [], unreachable: [], look: null }
    // Lamps that are not real lights but whose light on a surface is baked
    // (wash-glb.mjs): each with the surface patch it lands on.
    const washes = []
    const name = lookName || rig.defaultLook || null
    const look = name ? rig.looks?.[name] : null
    if (name && !look) throw new Error(`no look "${name}" in the rig (it has: ${Object.keys(rig.looks || {}).join(', ') || 'none'})`)
    summary.look = name
    const optics = classPhotometry(rig, manifest)
    summary.photometry = optics
    const performer = performerBox(rig, stage)
    summary.performer = performer

    // The stage and its truss: production, not building, so they are the rig's.
    const mid = (stage.back + stage.front) / 2
    const ax = stage.axis ?? 0
    const booth = rig.stage.kind === 'booth'
    const deckName = booth
        ? `DJ riser ${stage.width} x ${rig.stage.depth_m} m @ ${stage.deck} m (${rig.stage.decks || 'stage decks'}; owner's intent, metres ESTIMATED)`
        : `Stage deck ${stage.width} x ${rig.stage.depth_m} m @ ${stage.deck} m (ASSUMED)`
    entities.push(box({
        id: `${RIG_PREFIX}stage-deck`, name: deckName,
        pos: [ax, 0, mid], size: [stage.width, stage.deck, rig.stage.depth_m], colour: '#141416', roughness: 0.9
    }))
    if (booth) {
        const tb = rig.stage.table || { w_m: 1.8, d_m: 0.8, h_m: 0.95, from_front_m: 0.2 }
        const tz = stage.front - stage.into * ((tb.from_front_m ?? 0.2) + tb.d_m / 2)
        entities.push(box({
            id: `${RIG_PREFIX}dj-table`, name: `DJ table ${tb.w_m} x ${tb.d_m} m, ${tb.h_m} m high`,
            pos: [ax, stage.deck, tz], size: [tb.w_m, tb.h_m, tb.d_m], colour: '#1d1d20', roughness: 0.7
        }))
        // Treads up the side of the riser nearest the backstage.
        const st = rig.stage.stairs
        if (st) {
            const steps = Math.max(1, Math.round(stage.deck / (st.rise_m ?? 0.2)))
            const rise = stage.deck / steps
            const side = st.side === 'right' ? 1 : -1
            const x = ax + side * (stage.width / 2 + (st.w_m ?? 1) / 2)
            for (let k = 0; k < steps; k += 1) {
                const h = rise * (k + 1)
                // along the riser's side, the lowest tread nearest its front, the top
                // one landing beside its back half (a solid block per tread)
                const going = st.going_m ?? 0.25
                const z = stage.front - stage.into * (0.25 + going * k + going / 2)
                entities.push(box({
                    id: `${RIG_PREFIX}dj-stair-${k + 1}`, name: `Booth stair tread ${k + 1}/${steps}`,
                    pos: [x, 0, z], size: [st.w_m ?? 1, h, st.going_m ?? 0.25], colour: '#1a1a1c', roughness: 0.9
                }))
            }
        }
        const br = rig.stage.barrier
        if (br) {
            entities.push(box({
                id: `${RIG_PREFIX}crowd-barrier`, name: `Crowd barrier ${2 * br.half_width_m} m, ${br.pit_m} m pit`,
                pos: [ax, 0, stage.front + stage.into * br.pit_m], size: [2 * br.half_width_m, br.h_m ?? 1.2, 0.08], colour: '#6f7378', metalness: 0.6, roughness: 0.5
            }))
            // a steel frame, not a wall: drawn see-through so the riser reads behind it
            entities.at(-1).components.appearance.opacity = 0.35
        }
    }
    const t = stage.trussSection
    const trussTag = booth ? '(owner\'s intent, size ESTIMATED)' : '(ASSUMED)'
    for (const side of stage.truss ? [-1, 1] : []) {
        entities.push(box({
            id: `${RIG_PREFIX}truss-tower-${side < 0 ? 'l' : 'r'}`, name: `Truss tower ${side < 0 ? 'left' : 'right'} ${trussTag}`,
            pos: [ax + side * stage.trussW / 2, 0, stage.trussZ], size: [t, stage.trussH + t / 2, t], colour: '#9aa0a6', metalness: 0.8, roughness: 0.4
        }))
    }
    if (stage.truss) entities.push(box({
        id: `${RIG_PREFIX}truss-header`, name: `Truss header ${stage.trussW} m @ ${stage.trussH} m ${trussTag}`,
        pos: [ax, stage.trussH - t / 2, stage.trussZ], size: [stage.trussW + t, t, t], colour: '#9aa0a6', metalness: 0.8, roughness: 0.4
    }))

    for (const group of rig.groups) {
        const cls = rig.classes[group.class]
        if (!cls) throw new Error(`group ${group.id}: no class "${group.class}"`)
        const geo = geometry[cls.fixture]
        if (!geo) throw new Error(`group ${group.id}: no built model for fixture "${cls.fixture}" (fixtures/glb/${cls.fixture}.json)`)
        const placer = place[group.mount]
        if (!placer) throw new Error(`group ${group.id}: unknown mount "${group.mount}"`)
        const spec = look?.aims?.[group.id] || { rule: group.aim }
        const rule = AIM_RULES[spec.rule]
        if (!rule) throw new Error(`group ${group.id}: unknown aim rule "${spec.rule}"`)
        const gctx = { ...ctx, axis: groupAxis(group, stage) }
        const slots = placer(group.count, gctx, group)
        if (slots.length !== group.count) {
            throw new Error(`group ${group.id}: asked for ${group.count}, the hall has room for ${slots.length} by the rule "${group.mount}"`)
        }
        const byX = slots.map((s, i) => [s.pos[0], i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
        const real = realIndices(group, slots.length, rig.budget, mode)
        const colour = look?.colours?.[group.id] || group.colour || cls.colour
        // A look's LEVEL for the group, 0..1 (absent = full): its intensity on the desk.
        // 0 is the group out — no light, no beam in the air, nothing baked — which is how
        // a look says "darkness here" (blackout, a single beam, the strobe hit).
        const level = levelOf(look, group.id)
        const op = optics[group.class]
        const half = (op.angleDeg / 2) * DEG
        let groupReal = 0
        slots.forEach((slot, i) => {
            const aimed = rule(slot, { i, n: slots.length, rank: byX.indexOf(i) }, gctx, spec)
            const posed = aimFixture(geo, slot, aimed)
            const from = posed.lens
            const dir = posed.dir
            const reach = Math.min(cls.reach_m, surfaceHit(from, dir, hall, cls.reach_m))
            const to = from.map((v, k) => v + dir[k] * reach)
            const label = `${group.id} #${i + 1}`
            if (!posed.reachable) summary.unreachable.push(`${label}: tilt ${posed.tilt} deg is past the head's travel`)
            if (group.class === 'laser' || cls.fixture === 'laser') {
                const why = checkLaser(from, to)
                if (why) {
                    summary.refused.push(`${label}: ${why}`)
                    return
                }
            }
            const hit = group.mount === 'crane-bridge' ? null : beamHitsCrane(from, to, reach, hall)
            if (hit !== null) {
                const where = `${label}: beam runs into the crane parked at z ${hit} m`
                // A laser into a steel girder is a reflection hazard: refused.
                if (cls.fixture === 'laser') {
                    summary.refused.push(where)
                    return
                }
                summary.clashes.push(where)
            }
            if (performer && op.angleDeg <= NARROW_BEAM_DEG && beamHitsBox(from, to, reach, performer)) {
                summary.clashes.push(`${label}: a narrow beam passes through the DJ`)
            }
            const { pan, tilt } = aimAt(from, to)
            // `solo` (an aim parameter): only the lamp of that rank — counted from the
            // left along x, the rank the rules use — keeps the group's level; the rest are out.
            const lampLevel = Number.isInteger(spec.solo) && byX.indexOf(i) !== spec.solo ? 0 : level
            const isReal = real.has(i)
            if (isReal) groupReal += 1
            if (group.bake && !isReal && lampLevel > 0) {
                const surface = washSurface(slot, aimed, from, to, half, ctx)
                if (surface) {
                    washes.push({
                        id: `${group.id}-${i + 1}`, lens: from.map((v) => round(v)), dir: dir.map((v) => round(v, 6)),
                        candela: op.candela === null ? null : op.candela * lampLevel, intensity: round(op.intensity * lampLevel, 2), angle: half, penumbra: cls.penumbra, distance: reach, colour, surface
                    })
                }
            }
            fixtures.push({ kind: cls.fixture, parts: posed.parts, colour, id: `${group.id}-${i + 1}`, pan: posed.pan, tilt: posed.tilt })
            entities.push({
                id: `${RIG_PREFIX}${group.id}-${String(i + 1).padStart(2, '0')}`,
                type: 'spotLight',
                name: `${cls.code} ${group.id} ${i + 1}${isReal ? '' : ' (beam only)'}`,
                components: {
                    transform: { position: from.map((v) => round(v)), rotation: rotationFromPanTilt({ pan, tilt }), scale: [1, 1, 1] },
                    appearance: { color: colour, opacity: 1 },
                    light: {
                        color: colour,
                        intensity: round(op.intensity * lampLevel, 2),
                        // One field is both the drawn cone's length and the
                        // light's cutoff (three.js: (1 - (d/cutoff)^4)^2, zero AT
                        // the cutoff). A real lamp cut at the surface it is aimed at
                        // would put no light on it, so its cutoff is twice the
                        // throw (88 % of the light at the surface); the cone runs on
                        // behind that surface, where the surface hides it. A named
                        // workaround: a separate beam length is OWED in the platform.
                        distance: round(isReal ? lightDistance(reach) : reach, 2),
                        angle: round(half, 4),
                        penumbra: cls.penumbra,
                        decay: 2
                    },
                    // Level 0 keeps the cone (at haze 0, unseen) and `only`: a beam-only lamp
                    // whose beam were switched off would become a REAL light (beamCastsLight).
                    beam: { visible: true, haze: round((group.haze ?? op.haze ?? cls.haze ?? DEFAULT_HAZE) * lampLevel, 3), ...(isReal ? {} : { only: true }) },
                    animation: staticAnim
                }
            })
        })
        const placed = entities.filter((e) => e.id.startsWith(`${RIG_PREFIX}${group.id}-`)).length
        summary.byGroup[group.id] = { code: cls.code, placed, real: groupReal, rule: spec.rule, level }
        summary.fixtures += placed
        summary.real += groupReal
    }
    summary.beamOnly = summary.fixtures - summary.real

    // Effects: the machine standing where it stands (its model, no simulation
    // of what it does).
    for (const fx of rig.effects || []) {
        const placer = place[fx.mount]
        if (!placer) throw new Error(`effect ${fx.id}: unknown mount "${fx.mount}"`)
        const geo = geometry[fx.fixture]
        if (!geo) throw new Error(`effect ${fx.id}: no built model for fixture "${fx.fixture}"`)
        const slots = placer(fx.count, ctx, fx)
        slots.forEach((slot, i) => {
            const posed = aimFixture(geo, slot, { dir: [0, 1, 0] })
            fixtures.push({ kind: fx.fixture, parts: posed.parts, colour: fx.colour, id: `${fx.id}-${i + 1}` })
        })
        summary.effects[fx.id] = slots.length
    }
    summary.washes = washes.length
    return { entities, fixtures, summary, stage, washes }
}

/**
 * The patch of surface a lamp's light lands on, for the bake: a rectangle
 * { origin, u, v, normal } in room metres (origin a corner, u and v its two
 * edges), a hair off the surface toward the lamp. A PAR up a column: that
 * column face from the floor to where the head flares. A lamp on the
 * backdrop: the machine's front face, as wide as the beam's footprint.
 */
export const washSurface = (slot, aimed, from, to, half, ctx) => {
    const g = ctx.hall.geometry
    const off = 0.02
    if (slot.column) {
        const c = slot.column
        const w = ctx.hall.dims?.column_w_m ?? 0.5
        const top = g.column_head?.flare_start_m ?? g.runway_bottom_m ?? 6
        const x = c.faceX - c.toColumn * off
        return { origin: [x, 0.02, c.z - w / 2], u: [0, 0, w], v: [0, top - 0.02, 0], normal: [-c.toColumn, 0, 0], kind: 'column' }
    }
    if (ctx.stage.backdrop && aimed.target) {
        const t = aimed.target
        const box = frontBox(ctx, t[0])
        if (!box) return null
        const face = ctx.stage.into > 0 ? box.z_m[1] : box.z_m[0]
        const dist = Math.hypot(...t.map((v, k) => v - from[k]))
        const r = dist * Math.tan(half) * 1.6
        const x0 = Math.max(box.x_m[0], t[0] - r)
        const x1 = Math.min(box.x_m[1], t[0] + r)
        const z = face + ctx.stage.into * off
        return { origin: [x0, box.y_m[0] + 0.02, z], u: [x1 - x0, 0, 0], v: [0, box.y_m[1] - box.y_m[0] - 0.04, 0], normal: [0, 0, ctx.stage.into], kind: 'backdrop' }
    }
    return null
}

// Each shadow-casting spot light takes a texture unit in every lit material's
// fragment shader. WebGL guarantees 16 (phones sit there; SwiftShader and
// desktop GPUs give 32), and the material needs some for itself, so past this
// many real lamps shadows are switched off rather than let every surface fail
// to compile — which turns the whole room black (seen 2026-09-27).
export const SHADOW_SAFE_REAL_LIGHTS = 12

/**
 * The first screen: `rig.opening` = { a, h, target_h } — standing `a` metres
 * out from the stage front ON THE STAGE'S AXIS at eye height `h`, looking
 * straight at the backdrop face at `target_h`. The orbit view, the fixed
 * camera and the walker's spawn all start there, so the opening is symmetric.
 */
export const openingShot = (rig, stage) => {
    const o = rig.opening
    if (!o) return null
    const x = stage.axis ?? 0
    const z = stage.front + stage.into * o.a
    const position = [x, o.h ?? 1.6, z]
    const target = [x, o.target_h ?? 3.5, stage.wall]
    return { position, target, fov: o.fov ?? 60 }
}

export const openingOps = (rig, stage) => {
    const shot = openingShot(rig, stage)
    if (!shot) return []
    const camera = { projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, ...shot }
    const [dx, , dz] = shot.target.map((v, k) => v - shot.position[k])
    return [
        {
            type: 'setWorldState',
            payload: {
                patch: {
                    savedView: { mode: 'perspective', ...camera },
                    // the walker looks along (sin yaw, ·, cos yaw) — yaw 0 faces +z (fit-lib.mjs spawnFrom)
                    spawn: { x: shot.position[0], z: shot.position[2], yaw: Math.round(Math.atan2(dx, dz) * 1000) / 1000, pitch: 0, altY: shot.position[1] }
                }
            }
        },
        { type: 'setPresentationState', payload: { patch: { mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: camera } } }
    ]
}

/** The room at night: what rig.mjs writes beside the lamps. */
export const nightOps = (rig, { shadows, realLights = 0 } = {}) => {
    const night = rig.night || {}
    const wanted = shadows === undefined ? rig.budget?.shadowCasting === true : shadows
    const casting = wanted && realLights <= SHADOW_SAFE_REAL_LIGHTS
    return [
        {
            type: 'setWorldState',
            payload: {
                patch: {
                    backgroundColor: night.backgroundColor || '#040507',
                    ambientLight: night.ambient || { color: '#9fb4ff', intensity: 0.07 },
                    directionalLight: { ...(night.directional || { color: '#8fa6d8', intensity: 0.05 }), position: [-20, 30, 10] },
                    fog: { near: night.fog?.near ?? 30, far: night.fog?.far ?? 150, color: null, enabled: true }
                }
            }
        },
        {
            type: 'setRenderSettings',
            payload: { patch: { shadows: true, shadowCasting: { enabled: casting, mapSize: rig.budget?.shadowMapSize || 1024 } } }
        }
    ]
}
