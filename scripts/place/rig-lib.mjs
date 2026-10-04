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
// `truss: { kind: 'crane-hung' }` — no towers: ONE line of box truss hangs on chain hoists
// from the bridge of the overhead crane parked over the DJ (owner, 2026-09-28 23:1x: "the
// yellow thing its move able … the metal chain conected thr the yellow crane"). The line
// runs parallel to the bridge, under its centre line, its bottom chord at `trim_m`.
// `x_offset_m` slides the line along itself so a clamp point (every 0.5 m, 0.25 m in from
// each end — src/rigbuild/pieces.js) falls on the centre line; the lamps stay mirrored.
export const isCraneHung = (rig) => rig?.truss?.kind === 'crane-hung' || rig?.truss?.kind === 'crane-x'
// A crane-hung line may SLOPE (`slope_deg`, + = its +x end higher): "the cut", owner's pick
// 2026-09-29 — one straight 12 m line in the vertical plane under the bridge, low house left,
// high over the press and the machines. `trim_m` is then its bottom chord at u = 0 (above the
// axis), measured vertically; `u` is metres ALONG the line from there (+ toward +x), and a
// group's `dx_m` on the line are u, mirrored. Flat (slope 0) is the 8 m line as it was.
export const trussSlopeOf = (rig) => (isCraneHung(rig) ? (Number(rig.truss.slope_deg) || 0) * DEG : 0)
/**
 * A point on the line (a crane-hung line, sloped or flat, or a goalpost header) `u` metres
 * along it from the axis: its centre line ('axis'), the top of its top chords ('top') or the
 * underside of its bottom chords ('bottom') — perpendicular to the line, as a clamp sits.
 */
export const linePoint = (stage, u, face = 'axis') => {
    const th = stage.trussSlope || 0
    const t = stage.trussSection
    const cx = stage.axis + u * Math.cos(th)
    const cy = stage.trussH - t / 2 + t / 2 / Math.cos(th) + u * Math.sin(th)
    const k = face === 'top' ? 1 : face === 'bottom' ? -1 : 0
    return [cx - k * (t / 2) * Math.sin(th), cy + k * (t / 2) * Math.cos(th), stage.trussZ]
}
/** The line's bottom chord height at `u`, measured vertically (what a clearance is read against). */
export const bottomChordAt = (stage, u) => stage.trussH - stage.trussSection / 2 + u * Math.sin(stage.trussSlope || 0)
// `truss: { kind: 'crane-hung', shape: 'triangle' }` — "halo" (owner's option 6, 2026-09-29): an
// equilateral triangle of box truss lying FLAT, its centroid under the bridge's centre line over
// the DJ, one corner (`apex`) toward the audience ('audience', default) or the backdrop, a chain
// hoist at every corner. `side_m` is the side on the truss's centre lines, corner node to corner
// node (a 60° corner block's legs + a stock straight: `corner_leg_m`, `straight_m`).
export const isHalo = (rig) => isCraneHung(rig) && rig.truss.shape === 'triangle'

/** The triangle's corners in plan ([x, z]), apex first, then the base's left (-x) and right (+x). Pure. */
export const haloGeometry = ({ side, centre, apexDir }) => {
    const R = side / Math.sqrt(3)
    const [cx, cz] = centre
    const apex = [cx, cz + apexDir * R]
    const left = [cx - side / 2, cz - (apexDir * R) / 2]
    const right = [cx + side / 2, cz - (apexDir * R) / 2]
    return { side, R, r: R / 2, height: (side * Math.sqrt(3)) / 2, centre: [cx, cz], apexDir, apex, left, right }
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
// `truss: { kind: 'crane-x' }` — the X lying down (owner's sketch "ten truss versions", option 2,
// 2026-09-29): two arms of `arm_m` crossing FLAT at a 4-way junction under the bridge's centre
// line, one arm along the bridge (x), one across it (z), the second pointing out over the crowd.
// Hung like the line (bottom chord at `trim_m`), on `rigging.picks`; RIG_BUILD.md §15.8.
export const isCraneX = (rig) => rig?.truss?.kind === 'crane-x'

export const stageFrame = (rig, hall) => {
    const g = hall.geometry
    const s = rig.stage
    // `truss: { kind: 'none' }` — a rig with no goalpost (a version that hangs nothing
    // overhead). The truss mounts then refuse, and no truss boxes are written.
    const truss = !hasTruss(rig) ? { width_m: 0, header_h_m: 0, section_m: 0, from_stage_back_m: 0 }
        // crane-hung: the header is the hung line — its top at trim + section
        : isCraneHung(rig) ? { ...rig.truss, ...(isCraneX(rig) ? { width_m: rig.truss.arm_m } : {}), header_h_m: rig.truss.trim_m + (rig.truss.section_m ?? 0.29) / 2 }
            : rig.truss
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
    // crane-hung: the line hangs under the bridge of the crane parked over the DJ — its z is
    // the bridge's centre line; a crane more than 1 m from the performer is refused (move it).
    let crane = null
    if (isCraneHung(rig)) {
        crane = craneNearestStage(hall, { front: s.kind === 'booth' ? back + into * (s.depth_m / 2) : front })
        const dj = s.kind === 'booth' ? back + into * (s.depth_m / 2 - 0.2) : (back + front) / 2
        if (!crane || Math.abs(crane.z_m - dj) > 1) throw new Error(`truss "crane-hung": no crane bridge within 1 m of the DJ (z ${dj.toFixed(2)}); the nearest is at z ${crane?.z_m} — park it over the DJ in the hall's dims (cranes_from_door_m)`)
        trussZ = crane.z_m
    }
    const halo = isHalo(rig)
        ? haloGeometry({ side: rig.truss.side_m, centre: [axis + (rig.truss.x_offset_m ?? 0), trussZ], apexDir: (rig.truss.apex || 'audience') === 'audience' ? into : -into })
        : null
    return {
        crane,
        halo,
        trussX: isCraneHung(rig) ? (rig.truss.x_offset_m ?? 0) : 0,
        trussSlope: trussSlopeOf(rig),
        // crane-x: the length of each arm and the junction's size across (null for a line)
        xArm: isCraneX(rig) ? { arm: rig.truss.arm_m, junction: rig.truss.junction?.across_m ?? 0 } : null,
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
        trussW: halo ? halo.side : truss.width_m,
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
    // `z_at` [..]: exactly these grid lines (alternate columns, say), instead of a range.
    const zs = [...new Set(g.column_grid_z_m)]
        .filter((z) => !range || (z >= range[0] - 1e-6 && z <= range[1] + 1e-6))
        .filter((z) => !spec.z_at || spec.z_at.some((a) => Math.abs(a - z) < 1e-6))
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
                // `omit` [{ z, face }]: those lamps left out on BOTH sides (the budget's pair, not a one-sided gap)
                if ((spec.omit || []).some((o) => o.face === face && Math.abs(o.z - z) < 1e-6)) continue
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
// A 0 in the list is ONE lamp on the axis, not two (-0 and 0).
const mirroredDx = (dx) => [...new Set([...dx.map((d) => (d === 0 ? 0 : -d)), ...dx])].sort((a, b) => a - b)
const xArmSlots = (n, ctx, group, mount) => {
    if (!ctx.stage.xArm) throw new Error(`mount ${mount} needs a truss of kind "crane-x"`)
    const at = []
    for (const [dx, dz] of group?.at_m || []) {
        if (dx !== 0 && dz !== 0) throw new Error(`mount ${mount}: [${dx}, ${dz}] is on neither arm`)
        if (Math.max(Math.abs(dx), Math.abs(dz)) > ctx.stage.xArm.arm / 2) throw new Error(`mount ${mount}: [${dx}, ${dz}] is past the arm's end`)
        for (const x of dx === 0 ? [0] : [-dx, dx]) at.push([x, dz])
    }
    const hung = mount === 'x-under' || group?.orient === 'hung'
    return at.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, n).map(([dx, dz]) => ({
        pos: [ctx.stage.axis + dx, hung ? ctx.stage.trussH - ctx.stage.trussSection / 2 : ctx.stage.trussH + ctx.stage.trussSection / 2, ctx.stage.trussZ + dz],
        orient: hung ? 'hung' : 'floor', face: toAudience(ctx)
    }))
}
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
        if (ctx.stage.crane) throw new Error('mount tower-ladder: a crane-hung line has no towers')
        const per = Math.ceil(n / 2)
        const hs = group?.h_m ? group.h_m.slice(0, per) : spread(per, group?.from_h_m ?? 1.8, ctx.stage.trussH - 1)
        return [-1, 1].flatMap((side) => hs.map((h) => ({
            pos: [ctx.stage.axis + side * ctx.stage.trussW / 2, h, ctx.stage.trussZ + ctx.stage.into * (ctx.stage.trussSection / 2 + 0.3)],
            orient: 'floor', face: toAudience(ctx)
        }))).slice(0, n)
    },
    // Clamped under the header's bottom chord, hanging.
    // `dx_m`: mirrored pairs along it (on the header's clamp points), instead of an even spread.
    // On a sloped crane line `dx_m` are metres ALONG the line (u), and the clamp sits under the
    // bottom chord where it is at that u (linePoint); flat, the same as before.
    'truss-header': (n, ctx, group) => (needsTruss(ctx, 'truss-header'), group?.dx_m ? mirroredDx(group.dx_m) : spread(n, -ctx.stage.trussW / 2 + 1, ctx.stage.trussW / 2 - 1))
        .map((u) => ({ pos: linePoint(ctx.stage, u, 'bottom'), orient: 'hung', face: toAudience(ctx) })),
    // Standing ON the truss's top chord (upright, clamped through the top chords), at `dx_m`
    // mirrored or spread along the line — how a moving-head beam is rigged to point at the
    // sky: hung under the truss its 270° tilt cannot reach straight up. View C's "truss top".
    'truss-top': (n, ctx, group) => (needsTruss(ctx, 'truss-top'), group?.dx_m ? mirroredDx(group.dx_m).slice(0, n) : spread(n, -ctx.stage.trussW / 2 + 0.75, ctx.stage.trussW / 2 - 0.75))
        .map((u) => ({ pos: linePoint(ctx.stage, u, 'top'), orient: 'floor', face: toAudience(ctx) })),
    // crane-x: standing ON (or `orient: 'hung'`, under) either arm of the X, at `at_m`
    // [[dx, dz], …] from the crossing — dx along the bridge (mirrored: ±dx), dz across it (+ = toward
    // the audience; on the axis, so never mirrored). Each point must be a clamp point of a half-arm
    // (every 0.5 m from 0.25 m in: pieces.js) so the room's derived slots find the lamp.
    'x-top': (n, ctx, group) => xArmSlots(n, ctx, group, 'x-top'),
    'x-under': (n, ctx, group) => xArmSlots(n, ctx, group, 'x-under'),
    // Standing on the top plate of each tower — or, on a crane-hung line (no towers), standing
    // on its top chord 0.4 m in from each end.
    'truss-towers': (n, ctx) => (needsTruss(ctx, 'truss-towers'), ctx.stage.crane
        ? spread(n, -ctx.stage.trussW / 2 + 0.4, ctx.stage.trussW / 2 - 0.4)
        : spread(n, -ctx.stage.trussW / 2, ctx.stage.trussW / 2))
        .map((x) => ({ pos: [ctx.stage.axis + x, ctx.stage.trussH + ctx.stage.trussSection / 2, ctx.stage.trussZ], orient: 'floor', face: toAudience(ctx) })),
    // On the halo (a flat triangle hung from the crane): `halo_at` lists where — 'apex', 'base-corners'
    // (the two base corners), { edge: 'sides', t: [..] } (both side edges at t from the apex:
    // mirrored by construction), { edge: 'base', dx: [..] } (the base edge, mirrored ±dx).
    // `orient` 'hung' (clamped under the bottom chord, default) or 'top' (standing on the top chord).
    halo: (n, ctx, group) => {
        const h = ctx.stage.halo
        if (!h) throw new Error('mount halo needs truss.shape "triangle" (a crane-hung halo)')
        const at = []
        for (const a of group?.halo_at || ['apex', 'base-corners']) {
            if (a === 'apex') at.push({ p: h.apex, where: 'apex' })
            else if (a === 'base-corners') at.push({ p: h.left, where: 'corner-left' }, { p: h.right, where: 'corner-right' })
            else if (a?.edge === 'sides') for (const t of a.t) at.push({ p: lerp2(h.apex, h.left, t), where: `side-left@${t}` }, { p: lerp2(h.apex, h.right, t), where: `side-right@${t}` })
            else if (a?.edge === 'base') for (const d of mirroredDx(a.dx)) at.push({ p: [h.centre[0] + d, h.left[1]], where: `base@${d}` })
            else throw new Error(`group ${group?.id}: unknown halo_at ${JSON.stringify(a)}`)
        }
        const t = ctx.stage.trussSection
        const bottom = ctx.stage.trussH - t / 2
        const top = group?.orient === 'top'
        return at.slice(0, n).map(({ p, where }) => ({ pos: [p[0], top ? bottom + t : bottom, p[1]], orient: top ? 'floor' : 'hung', face: toAudience(ctx), halo: where }))
    },
    'column-bases': (n, ctx, group) => {
        if (group?.columns) {
            // The columns a spec picks (columnsFor), one lamp at each base.
            // `off_m`: how far in front of the inner face (default 0.7) — further out where a
            // PAR uplights the same face, so the two bodies do not stand in each other.
            const cols = columnsFor(ctx.hall, ctx.stage, { faces: ['inner'], ...group.columns })
            const off = group.off_m ?? 0.7
            return cols.slice(0, n).map((c) => ({ pos: [c.faceX - c.side * off, 0, c.z], orient: 'floor', face: [-c.side, 0, 0], column: c }))
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
    'crane-bridge': (n, ctx, group) => {
        const g = ctx.hall.geometry
        const crane = craneNearestStage(ctx.hall, ctx.stage)
        const reach = g.crane_rail_x_m - 1.5
        // `dx_m`: mirrored pairs, every lamp on the audience-side girder (two groups on one
        // bridge must not share an even spread's end points).
        if (group?.dx_m) {
            return mirroredDx(group.dx_m).slice(0, n).map((x) => ({ pos: [ctx.stage.axis + x, crane.girder_bottom_m, crane.z_m + ctx.stage.into * 1.1], orient: 'hung', face: [0, 0, ctx.stage.into], girder: ctx.stage.into }))
        }
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
        // 1.2 m off the column toward the audience — unless that is past an end wall (the last column
        // pair stands 0.5 m from it: hazer and smoke 04 sat at z 55.2 outside the 54.5 m wall, audit
        // A-10, 2026-10-05); then on the column's stage side.
        const g = ctx.hall.geometry || {}
        const hi = (g.end_wall_inner_y_m ?? Infinity) - END_WALL_CLEAR_M
        const lo = (g.far_wall_z_m ?? -Infinity) + END_WALL_CLEAR_M
        const zOf = (c) => { const z = c.z + ctx.stage.into * 1.2; return z > hi || z < lo ? c.z - ctx.stage.into * 1.2 : z }
        return pickEven(n, cols.length).map((i) => cols[i])
            .map((c) => ({ pos: [c.faceX - c.side * 1.0, 0, zOf(c)], orient: 'floor', face: [-c.side, 0, 0] }))
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

const unit2 = (v, fallback) => {
    const l = Math.hypot(v[0], v[1])
    return l < 1e-6 ? fallback : [v[0] / l, v[1] / l]
}
/**
 * The DJ in plan: the middle of the performer's box (performerBox: from 0.1 m inside the
 * riser's back to the DJ table's front, `table.from_front_m` in from the riser's front) —
 * written from the stage alone so src/rigbuild/lookRules.js answers the same.
 */
export const djCentre = (ctx) => {
    const s = ctx.stage
    const fromFront = ctx.rig?.stage?.table?.from_front_m ?? 0.2
    return [s.axis ?? axisOf(ctx), (s.back + s.into * 0.1 + s.front - s.into * fromFront) / 2]
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
        // `deck_h`: focus height over the deck. 0 (the default) focuses on the deck
        // floor; a DJ booth focuses at the performer's chest (lighting practice: a
        // key is focused on the face, not the floor) so the beam does not pour
        // into the DJ table top — at 0 it blew the black table out white (2026-09-28).
        ? { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 0.8, ctx.stage.deck + (p.deck_h ?? 0), ctx.stage.front - ctx.stage.into * (p.deck_a ?? 1.5)] }
        : { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 1.1, p.wall_y ?? (ctx.stage.backdrop ? 3 : 7), ctx.stage.wall] }),
    // A PAR on the hung line grazing the underside of the crane bridge above it, outward along
    // the bridge: the bridge drawn as a frame of light over the DJ. `out` metres past the lamp
    // along x on its own side, on the audience-side girder's bottom flange (`girder` 1.1 m).
    'bridge-underside': (slot, meta, ctx, p = {}) => {
        const crane = ctx.stage.crane || craneNearestStage(ctx.hall, ctx.stage)
        return { target: [slot.pos[0] + sideOf(slot, ctx) * (p.out ?? 6), crane.girder_bottom_m, crane.z_m + ctx.stage.into * (p.girder ?? 1.1)] }
    },
    // THE HALO'S RULES (a triangle over the DJ; RIG_BUILD.md §15.8). `djCentre` is the middle of
    // the performer's box in plan. `ring`: each lamp to a point on a circle of radius `r` round
    // the DJ at height `y` (default the deck), on the lamp's own bearing from the DJ — a cone of
    // beams closing round the performer without passing through him (a narrow beam through the
    // DJ is a clash). `dj-point`: every lamp to one point over the DJ, `h` above the deck — two
    // lamps from opposite corners cross there in an X. `radial`: outward from the triangle's
    // centre, `elev_deg` above (+) or below (-) the horizon, bent `to_audience` (0..1) toward
    // the house — the halo opening out over the crowd.
    ring: (slot, meta, ctx, p = {}) => {
        const [cx, cz] = djCentre(ctx)
        const u = unit2([slot.pos[0] - cx, slot.pos[2] - cz], [0, ctx.stage.into])
        const r = p.r ?? 1.2
        return { target: [cx + u[0] * r, p.y ?? ctx.stage.deck, cz + u[1] * r] }
    },
    'dj-point': (slot, meta, ctx, p = {}) => {
        const [cx, cz] = djCentre(ctx)
        return { target: [cx + (p.x ?? 0), ctx.stage.deck + (p.h ?? 2.8), cz + ctx.stage.into * (p.dz ?? 0)] }
    },
    radial: (slot, meta, ctx, p = {}) => {
        // the halo's centroid: on the axis, under the crane bridge's centre line
        const crane = ctx.stage.crane || craneNearestStage(ctx.hall, ctx.stage)
        const c = [axisOf(ctx), crane.z_m]
        const out = unit2([slot.pos[0] - c[0], slot.pos[2] - c[1]], [0, ctx.stage.into])
        const k = p.to_audience ?? 0
        const u = unit2([out[0] * (1 - k), out[1] * (1 - k) + ctx.stage.into * k], [0, ctx.stage.into])
        const e = (p.elev_deg ?? -20) * DEG
        return { dir: [u[0] * Math.cos(e), Math.sin(e), u[1] * Math.cos(e)] }
    },
    // crane-x: out along the lamp's own arm, away from the crossing, rising `rise_deg` over the
    // horizon (a hung lamp: under it). The crossing is the bridge's centre line on the axis. A lamp
    // `end_m` or more from the crossing is an END; the others use `inner_rise_deg`, or stand
    // straight up with `inner: 'vertical'`. The 4 ends at 30–60°: four rays; at ~10°: the X traced.
    'along-arm': (slot, meta, ctx, p = {}) => {
        const crane = ctx.stage.crane || craneNearestStage(ctx.hall, ctx.stage)
        const h = [slot.pos[0] - axisOf(ctx), slot.pos[2] - crane.z_m]
        const d = Math.hypot(h[0], h[1])
        const up = upOf(slot)
        const end = d >= (p.end_m ?? 2)
        if (d < 0.05 || (!end && p.inner === 'vertical')) return { dir: [0, up, 0] }
        // `x_rise_deg`: the bridge arm's own (its rays run under the crane's cab and trolley)
        const onX = Math.abs(h[1]) < 0.05
        const r = (onX && p.x_rise_deg !== undefined ? p.x_rise_deg : end ? (p.rise_deg ?? 45) : (p.inner_rise_deg ?? p.rise_deg ?? 45)) * DEG
        return { dir: [(h[0] / d) * Math.cos(r), up * Math.sin(r), (h[1] / d) * Math.cos(r)] }
    },
    // Hung lamps straight down onto the floor under the crane, splayed out.
    'down-from-crane': (slot, meta, ctx) => ({ target: [slot.pos[0] * 1.1, 0, slot.pos[2] + slot.girder * 4] }),
    // A laser up into the roof over the house — the only rule a laser may use
    // besides one that rises (checkLaser refuses anything else).
    'laser-into-roof': (slot, meta, ctx, p = {}) => ({ target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * (p.x_scale ?? 0.3), ctx.hall.geometry.truss_top_centre_m, ctx.stage.front + ctx.stage.into * (p.a ?? 14)] }),
    // A laser up onto the SOLID roof deck just beside the lantern over the house, never into it: the
    // lantern is an opening glazed as a skylight, and a class-4 beam through it may leave the building
    // (audit A-03, 2026-10-05: laser-into-roof drew all six cubes to one point inside lantern 1). Each
    // beam goes to its own side of the lantern, fanned by its place on the line, short of the columns.
    'laser-beside-lantern': (slot, meta, ctx, p = {}) => {
        const g = ctx.hall.geometry
        const z = ctx.stage.front + ctx.stage.into * (p.a ?? 14)
        const ax = axisOf(ctx)
        const dx = slot.pos[0] - ax
        const side = dx < 0 ? -1 : 1
        const lantern = (g.lanterns || []).find((l) => z >= l.z_m[0] && z <= l.z_m[1] && ax >= l.x_m[0] && ax <= l.x_m[1])
        const edge = lantern ? (side < 0 ? lantern.x_m[0] : lantern.x_m[1]) : ax
        const inner = (g.column_inner_face_x_m ?? Infinity) - 0.5
        const x = edge + side * ((p.clear_m ?? 1.5) + Math.abs(dx) * (p.x_spread ?? 0.6))
        return { target: [Math.max(-inner, Math.min(inner, x)), g.deck_m ?? g.truss_top_centre_m, z] }
    }
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
// Every laser model, not only the rental `laser`: the LaserCube (2026-10-04) got its own model kind,
// and the laser rules — no beam downward, none under the minimum height, none into crane steel —
// silently stopped applying to it (audit follow-up, 2026-10-05).
export const LASER_FIXTURES = new Set(['laser', 'lasercube'])

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
export const craneSolids = (crane, g) => {
    // hall.py v3.1+ records the crane's real shape: two box girders with a gap between them,
    // the trolley on top, the cab hanging at one end. Older records: one block 2.9 m deep.
    if (!Array.isArray(crane.girders_dz_m)) {
        return [{ x: [-g.crane_rail_x_m, g.crane_rail_x_m], z: [crane.z_m - 1.45, crane.z_m + 1.45], y: [crane.girder_bottom_m, crane.girder_top_m] }]
    }
    const w = (crane.girder_w_m ?? 0.7) / 2
    const out = crane.girders_dz_m.map((dz) => ({ x: [-g.crane_rail_x_m, g.crane_rail_x_m], z: [crane.z_m + dz - w, crane.z_m + dz + w], y: [crane.girder_bottom_m, crane.girder_top_m] }))
    for (const part of [crane.trolley, crane.cab]) {
        if (part) out.push({ x: part.x_m, z: [crane.z_m + part.dz_m[0], crane.z_m + part.dz_m[1]], y: part.y_m })
    }
    return out
}
export const beamHitsCrane = (from, to, reach, hall) => {
    const g = hall.geometry
    const cranes = Array.isArray(g.cranes) ? g.cranes : []
    const solids = cranes.map((c) => ({ z: c.z_m, parts: craneSolids(c, g) }))
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const length = Math.hypot(...d) || 1
    const inside = (p, b) => p[0] >= b.x[0] && p[0] <= b.x[1] && p[1] >= b.y[0] && p[1] <= b.y[1] && p[2] >= b.z[0] && p[2] <= b.z[1]
    for (let t = 0.5; t <= reach; t += 0.1) {
        const p = [from[0] + (d[0] * t) / length, from[1] + (d[1] * t) / length, from[2] + (d[2] * t) / length]
        for (const crane of solids) {
            if (crane.parts.some((b) => inside(p, b))) return crane.z
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
/**
 * Does the lamp of this rank keep its group's level in this aim? `solo` (an integer): only that
 * rank; `solo_mask` (an integer, bit r = rank r): several — crane-x's four ends are 85 (ranks 0, 2,
 * 4, 6), its crossing pair 65 (0 and 6). A number, because the document's schema keeps only
 * numeric aim parameters (projectSchema normalizeRigLooks). Neither: every lamp keeps it.
 */
export const soloKeeps = (aim, rank) => {
    if (Number.isInteger(aim?.solo_mask)) return rank >= 0 && rank < 31 && ((aim.solo_mask >> rank) & 1) === 1
    if (Number.isInteger(aim?.solo)) return rank === aim.solo
    return true
}

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

// Rigging steel is drawn MATTE. The room has no environment map, so a metal surface (metalness 0.8-0.9) has
// nothing to reflect and renders almost black in a dark hall: the truss and its hangers vanished and "the
// truss is not from the crane" (owner, 2026-09-30, checked on his screen). Diffuse light shows the shape.
const STEEL_METALNESS = 0.3
const STEEL_ROUGHNESS = 0.55
// The thin rigging (bridle legs, steels, chains, clamps, hoists) is a few centimetres wide and hangs far above the
// fill light: it also carries a faint self-light so the hang READS at an orbit distance (drawn to be read, never
// an engineered design). It changes no size, no position and no rated number.
const RIGGING_EMISSIVE = '#3b4048'

const box = ({ id, name, pos, size, colour, emissive = '#000000', emissiveIntensity = 1, roughness = 0.8, metalness = 0, rotation = [0, 0, 0] }) => ({
    id,
    type: 'box',
    name,
    components: {
        // Primitives sit ON position.y (base-anchored) and are unit-sized, so
        // scale IS the size in metres. A rotation turns the box about that base point.
        transform: { position: pos.map((v) => round(v)), rotation: rotation.map((v) => round(v, 6)), scale: size.map((v) => round(v)) },
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
// A floor machine's centre stays this far inside an end wall (half a hazer's length and a hand's room).
const END_WALL_CLEAR_M = 0.6
const NAVE_MOUNTS = new Set(['column-bases', 'column-uplight', 'nave-columns', 'crane-bridge'])
export const groupAxis = (group, stage) => {
    const which = group.axis || (NAVE_MOUNTS.has(group.mount) ? 'nave' : 'booth')
    return which === 'nave' ? 0 : stage.axis ?? 0
}

// ---------------------------------------------------------------------------
// THE CUT (2026-09-29): a sloped line on 3 picks, each a two-leg BRIDLE from the two
// bridge girders, a chain hoist under its apex at the shortest drop the hoist allows, a
// secondary safety steel to a girder, and a tie-off from each end of the line to the
// nearest nave column, tensioned against each other. Numbers in the rig file (derived by
// versions.mjs from scripts/place/rigs/moxir-crane-cut-2026-09-29.json). Drawn so the hang
// can be read and checked — NOT an engineered design: rigging sign-off owed.
// ---------------------------------------------------------------------------
/** Where the bridle of each pick is: its two leg tops, its apex, the top chord under it. Pure. */
export const pickGeometry = (rig, stage) => {
    const r = rig.truss.rigging
    const b = r.bridle
    const crane = stage.crane
    const legTopY = crane.girder_bottom_m - b.clamp_drop_m
    const half = b.leg_spread_m / 2
    return r.picks_u_m.map((u, i) => {
        const chord = linePoint(stage, u, 'top')
        // the pick sits on the top chord's centre line, straight under the apex
        const apexY = chord[1] + r.drop_m
        const legV = legTopY - apexY
        return {
            i, u, x: chord[0], chordTop: chord[1], apexY, legTopY,
            legs: [-1, 1].map((sg) => [chord[0], legTopY, crane.z_m + sg * half]),
            included_deg: 2 * Math.atan2(half, legV) / DEG,
            // a V bridle stops the apex moving across the bridge (z); along the line (x) the
            // whole V swings from its leg tops — the tie-offs hold that
            pendulum_x_m: legTopY - chord[1],
            pendulum_z_m: r.drop_m
        }
    })
}

/** A thin steel or strap between two points, as a box turned onto the segment. */
const segment = ({ id, name, from, to, w, colour, metalness = STEEL_METALNESS, roughness = STEEL_ROUGHNESS, emissive = RIGGING_EMISSIVE }) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const len = Math.hypot(...d)
    const e = box({ id, name, pos: from, size: [w, len, w], colour, metalness, roughness, emissive })
    // base-anchored at `from`, its +Y turned onto d. three.js Euler 'XYZ' [a, 0, c] turns +Y
    // to (−sin c, cos c cos a, cos c sin a): c = asin(−dx), a = atan2(dz, dy).
    const u = d.map((v) => v / (len || 1))
    e.components.transform.rotation = [round(Math.atan2(u[2], u[1]), 9), 0, round(Math.asin(Math.max(-1, Math.min(1, -u[0]))), 9)]
    return e
}

// Bridle legs are drawn about twice as thick as the wire they stand for (14 mm), so they read from an orbit
// distance; the sizes in the rig file are the real ones. Owner, 2026-09-30: "the truss is not from the crane".
const RIG_STEEL_W = 0.05

export const slopedLineRigging = (rig, stage, hall) => {
    const r = rig.truss.rigging
    const t = stage.trussSection
    const out = []
    const mid = linePoint(stage, stage.trussX, 'bottom')
    const line = box({
        id: `${RIG_PREFIX}truss-header`,
        name: `Truss line ${stage.trussW} m (${(rig.truss.pieces_m || []).join(' + ')} m, 290 mm box), sloped ${rig.truss.slope_deg}° up to house right, hung from the crane bridge on ${r.picks_u_m.length} bridled picks — rigging sign-off owed`,
        pos: mid, size: [stage.trussW, t, t], colour: '#9aa0a6', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS
    })
    line.components.transform.rotation = [0, 0, round(stage.trussSlope, 9)]
    out.push(line)
    for (const p of pickGeometry(rig, stage)) {
        const tag = `pick ${p.i + 1}/${r.picks_u_m.length} (u ${p.u} m)`
        p.legs.forEach((top, k) => out.push(segment({
            id: `${RIG_PREFIX}hoist-${p.i + 1}-bridle-${k ? 'b' : 'a'}`, name: `Bridle leg, ${tag} (rigging: a beam clamp on the ${k ? 'audience-side' : 'back'} girder's bottom flange, steel to the apex — ${round(p.included_deg, 0)}° between the legs)`,
            from: [p.x, p.apexY, stage.trussZ], to: top, w: RIG_STEEL_W, colour: '#8a8d92'
        })))
        // The beam clamp each leg ends in grips the girder's bottom flange, so it fills the clamp drop between the
        // leg top and the girder underside. It was not drawn: the legs stopped `clamp_drop_m` short of the crane and
        // the truss read as floating (owner, 2026-09-30: "the truss is not from the crane").
        p.legs.forEach((top, k) => out.push(box({
            id: `${RIG_PREFIX}hoist-${p.i + 1}-clamp-${k ? 'b' : 'a'}`,
            name: `Beam clamp, ${tag} (rigging: on the ${k ? 'audience-side' : 'back'} girder's bottom flange, drawn to fill the ${r.bridle.clamp_drop_m} m clamp drop)`,
            pos: [top[0], top[1], top[2]], size: [0.12, r.bridle.clamp_drop_m, 0.14], colour: '#7a7e85', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE
        })))
        out.push(box({ id: `${RIG_PREFIX}hoist-${p.i + 1}`, name: `Chain hoist ${r.hoist}, ${tag} (rigging: under the bridle apex, at its shortest drop)`, pos: [p.x, p.apexY - 0.06 - 0.29, stage.trussZ], size: [0.25, 0.29, 0.2], colour: '#45484d', metalness: 0.4, roughness: 0.6, emissive: RIGGING_EMISSIVE }))
        out.push(box({ id: `${RIG_PREFIX}hoist-${p.i + 1}-chain`, name: `Hoist chain and round sling, ${tag} (rigging)`, pos: [p.x, p.chordTop, stage.trussZ], size: [0.03, round(p.apexY - 0.35 - p.chordTop, 3), 0.03], colour: '#8a8e95', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE }))
        out.push(segment({
            id: `${RIG_PREFIX}hoist-${p.i + 1}-steel`, name: `Safety steel, ${tag} (rigging: secondary, top chord to its own clamp on the back girder — independent of the bridle)`,
            from: [p.x + 0.12, p.chordTop, stage.trussZ], to: [p.x + 0.12, p.legTopY, stage.crane.z_m - r.bridle.leg_spread_m / 2], w: RIG_STEEL_W * 0.7, colour: '#b0b3b8'
        }))
        out.push(box({
            id: `${RIG_PREFIX}hoist-${p.i + 1}-steel-clamp`,
            name: `Safety steel clamp, ${tag} (rigging: its own clamp on the girder's bottom flange, drawn to fill the ${r.bridle.clamp_drop_m} m clamp drop)`,
            pos: [p.x + 0.12, p.legTopY, stage.crane.z_m - r.bridle.leg_spread_m / 2], size: [0.08, r.bridle.clamp_drop_m, 0.1], colour: '#8d9198', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE
        }))
    }
    for (const tie of r.tieoffs || []) {
        const end = linePoint(stage, tie.u_m, 'axis')
        out.push(segment({
            id: `${RIG_PREFIX}tieoff-${tie.id}`, name: `Tie-off ${tie.id}: ${tie.what} (rigging: tensioned against the other end — stops sway and sliding along the slope)`,
            from: end, to: tie.to_m, w: 0.025, colour: '#d8a21a', metalness: 0.1, roughness: 0.8
        }))
    }
    return out
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
    if (stage.halo) {
        entities.push(...haloEntities(rig, stage))
    } else if (stage.crane && stage.xArm) {
        entities.push(...craneXEntities(rig, stage))
    } else if (stage.crane) {
        // The line hung from the crane bridge: the truss, and at each pick point a spreader
        // across both girders, a chain hoist under it, its chain down to the top chord and a
        // safety steel beside it. Drawn so the hang can be read; NOT an engineered design —
        // rigging sign-off owed (the crane's rated load, lock-out, hoists + safety steels).
        const r = rig.truss.rigging || {}
        const lineX = ax + stage.trussX
        const trim = stage.trussH - t / 2
        const gb = stage.crane.girder_bottom_m
        if (r.picks_u_m) entities.push(...slopedLineRigging(rig, stage, hall))
        else entities.push(box({
            id: `${RIG_PREFIX}truss-header`, name: `Truss line ${stage.trussW} m (${(rig.truss.pieces_m || []).join(' + ')} m, 290 mm box) hung from the crane bridge, bottom chord ${round(trim, 2)} m — rigging sign-off owed`,
            pos: [lineX, trim, stage.trussZ], size: [stage.trussW, t, t], colour: '#9aa0a6', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS
        }))
        const hoistDx = r.hoist_dx_m ?? [stage.trussW / 2 - 1.25]
        const picks = r.picks_u_m ? [] : mirroredDx(hoistDx)
        picks.forEach((dx, i) => {
            const x = ax + dx
            const tag = `pick ${i + 1}/${picks.length}`
            entities.push(box({ id: `${RIG_PREFIX}hoist-${i + 1}-spreader`, name: `Spreader across both crane girders, ${tag} (rigging: beam clamps on the bottom flanges — sign-off owed)`, pos: [x, gb - 0.15, stage.trussZ], size: [0.15, 0.15, 2.9], colour: '#2a2b2e', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE }))
            entities.push(box({ id: `${RIG_PREFIX}hoist-${i + 1}`, name: `Chain hoist ${r.hoist || '500 kg–1 t, D8+'}, ${tag} (rigging)`, pos: [x, gb - 0.15 - 0.45, stage.trussZ], size: [0.3, 0.45, 0.25], colour: '#45484d', metalness: 0.4, roughness: 0.6, emissive: RIGGING_EMISSIVE }))
            const chainLen = gb - 0.6 - (trim + t)
            entities.push(box({ id: `${RIG_PREFIX}hoist-${i + 1}-chain`, name: `Hoist chain, ${tag} (rigging)`, pos: [x, trim + t, stage.trussZ], size: [0.03, round(chainLen, 3), 0.03], colour: '#8a8e95', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }))
            entities.push(box({ id: `${RIG_PREFIX}hoist-${i + 1}-steel`, name: `Safety steel, ${tag} (rigging: secondary, to the spreader)`, pos: [x + 0.12, trim + t, stage.trussZ], size: [0.012, round(gb - 0.15 - (trim + t), 3), 0.012], colour: '#8a8d92', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE }))
        })
    }
    for (const side of stage.truss && !stage.crane ? [-1, 1] : []) {
        entities.push(box({
            id: `${RIG_PREFIX}truss-tower-${side < 0 ? 'l' : 'r'}`, name: `Truss tower ${side < 0 ? 'left' : 'right'} ${trussTag}`,
            pos: [ax + side * stage.trussW / 2, 0, stage.trussZ], size: [t, stage.trussH + t / 2, t], colour: '#9aa0a6', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS
        }))
    }
    if (stage.truss && !stage.crane) entities.push(box({
        id: `${RIG_PREFIX}truss-header`, name: `Truss header ${stage.trussW} m @ ${stage.trussH} m ${trussTag}`,
        pos: [ax, stage.trussH - t / 2, stage.trussZ], size: [stage.trussW + t, t, t], colour: '#9aa0a6', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS
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
        // rank along x, then z, then y — the room's own order (src/rigbuild/looks.js lookPoses), so a
        // `solo` names the same lamp in both (lamps on the X's z arm share x = 0)
        const byX = slots.map((s, i) => [s.pos, i]).sort((a, b) => a[0][0] - b[0][0] || a[0][2] - b[0][2] || a[0][1] - b[0][1]).map(([, i]) => i)
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
            // `rest_up: 1` with a solo: the lamps left dark stand straight up (a rested head) instead
            // of taking the rule — a dark head asked to aim past its travel is no use to anyone
            const resting = spec.rest_up === 1 && !soloKeeps(spec, byX.indexOf(i))
            const aimed = resting ? { dir: [0, slot.orient === 'hung' ? -1 : 1, 0] } : rule(slot, { i, n: slots.length, rank: byX.indexOf(i) }, gctx, spec)
            const posed = aimFixture(geo, slot, aimed)
            const from = posed.lens
            const dir = posed.dir
            let reach = Math.min(cls.reach_m, surfaceHit(from, dir, hall, cls.reach_m))
            // A PAR grazing the bridge stops ON the bridge (surfaceHit knows the building, not the crane).
            if (spec.rule === 'bridge-underside' && aimed.target) reach = Math.min(reach, Math.hypot(...aimed.target.map((v, k) => v - from[k])))
            const to = from.map((v, k) => v + dir[k] * reach)
            const label = `${group.id} #${i + 1}`
            if (!posed.reachable) summary.unreachable.push(`${label}: tilt ${posed.tilt} deg is past the head's travel`)
            if (group.class === 'laser' || LASER_FIXTURES.has(cls.fixture)) {
                const why = checkLaser(from, to)
                if (why) {
                    summary.refused.push(`${label}: ${why}`)
                    return
                }
            }
            // The bridge is the TARGET of a PAR grazing it (and the mount of a lamp hung on it): not a clash.
            const hit = group.mount === 'crane-bridge' || spec.rule === 'bridge-underside' ? null : beamHitsCrane(from, to, reach, hall)
            if (hit !== null) {
                const where = `${label}: beam runs into the crane parked at z ${hit} m`
                // A laser into a steel girder is a reflection hazard: refused.
                if (LASER_FIXTURES.has(cls.fixture)) {
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
            const lampLevel = soloKeeps(spec, byX.indexOf(i)) ? level : 0
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

/** A thin box from `a` to `b` (room points): base-anchored at `a`, its +Y turned onto b - a (Euler XYZ = Rx·Rz here). */
const strut = ({ id, name, a, b, w = 0.02, colour = '#8a8d92', metalness = STEEL_METALNESS, roughness = STEEL_ROUGHNESS }) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const len = Math.hypot(...d) || 1e-6
    const [dx, dy, dz] = d.map((v) => v / len)
    const rz = Math.asin(Math.max(-1, Math.min(1, -dx)))
    const c = Math.cos(rz) || 1e-9
    const rx = Math.atan2(dz / c, dy / c)
    return box({ id, name, pos: a, size: [w, len, w], colour, metalness, roughness, rotation: [rx, 0, rz] })
}

/**
 * The halo's steel (truss.shape 'triangle'): three sides of box truss (a stock straight each,
 * `rig-halo-side-*`, which load-plot lays as pieces) with a 60° corner block at each node (drawn
 * as its two legs), and at each corner the hang: a two-leg bridle (a V) whose ring sits over the
 * corner, a chain hoist under the ring, its chain to the top chord, a safety steel from the
 * crane beside it. The base corners' bridles lie along the girder above them (they hold the
 * halo against moving along x); the apex, which lies beyond the bridge's audience-side girder,
 * hangs from an OUTRIGGER — a truss laid across both girders' bottom flanges and out past the
 * front one — with its bridle along the outrigger (holding the halo along z). Three V's in two
 * directions hold x, z and the turn about the vertical. Drawn so the hang can be read; NOT an
 * engineered design — rigging sign-off owed.
 */
export const haloEntities = (rig, stage) => {
    const h = stage.halo
    const t = stage.trussSection
    const r = rig.truss.rigging || {}
    const trim = stage.trussH - t / 2
    const gb = stage.crane.girder_bottom_m
    const into = stage.into
    const out = []
    const leg = rig.truss.corner_leg_m ?? 0.5
    const corners = [['apex', h.apex], ['left', h.left], ['right', h.right]]
    const sides = [[h.apex, h.left], [h.left, h.right], [h.right, h.apex]]
    const steel = { colour: '#9aa0a6', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }
    sides.forEach(([a, b], i) => {
        const dx = b[0] - a[0]
        const dz = b[1] - a[1]
        const len = Math.hypot(dx, dz)
        const yaw = Math.atan2(-dz, dx)
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const straight = len - 2 * leg
        out.push(box({ id: `${RIG_PREFIX}halo-side-${i + 1}`, name: `Halo side ${i + 1}: ${round(straight, 2)} m straight, 290 mm box (${rig.truss.section_class || 'F34 class'}), bottom chord ${round(trim, 2)} m — rigging sign-off owed`, pos: [mid[0], trim, mid[1]], size: [straight, t, t], rotation: [0, yaw, 0], ...steel }))
    })
    corners.forEach(([name, p]) => {
        // the corner block: its two legs along the two sides that meet here
        const others = corners.filter(([n]) => n !== name).map(([, q]) => q)
        others.forEach((q, k) => {
            const dx = q[0] - p[0]
            const dz = q[1] - p[1]
            const len = Math.hypot(dx, dz)
            const c = [p[0] + (dx / len) * (leg / 2), p[1] + (dz / len) * (leg / 2)]
            out.push(box({ id: `${RIG_PREFIX}halo-corner-${name}-${k + 1}`, name: `Halo corner ${name}: ${rig.truss.corner || '60° 2-way corner block'} (leg ${leg} m${rig.truss.corner_leg_assumed ? ', ASSUMED' : ''})`, pos: [c[0], trim, c[1]], size: [leg + t / 2, t, t], rotation: [0, Math.atan2(-dz, dx), 0], ...steel }))
        })
    })
    const girderZ = (sign) => stage.crane.z_m + sign * (Array.isArray(stage.crane.girders_dz_m) ? Math.abs(stage.crane.girders_dz_m[0]) : 1.1)
    const spread = r.bridle_spread_m ?? 0.75
    const drop = r.bridle_drop_m ?? 0.75
    const hoistH = r.hoist_body_m ?? 0.34
    const outrigger = r.outrigger || null
    corners.forEach(([name, p], i) => {
        const tag = `pick ${i + 1}/3 (${name})`
        const beyond = name === 'apex' && outrigger
        let ring
        if (beyond) {
            // the outrigger: a truss across both girders' bottom flanges, out past the front one
            const z0 = girderZ(-into) - into * 0.1
            const z1 = p[1] + into * (outrigger.past_apex_m ?? 0.5)
            const oy = gb - t
            const len = Math.abs(z1 - z0)
            out.push(box({ id: `${RIG_PREFIX}halo-outrigger`, name: `Outrigger: ${outrigger.what || `${round(len, 1)} m of 290 mm box truss`} on beam clamps under both crane girders, cantilevered ${round(Math.abs(p[1] - girderZ(into)), 2)} m past the audience-side girder to pick the apex — CANTILEVER: rigging/structural sign-off owed`, pos: [p[0], oy, (z0 + z1) / 2], size: [t, t, len], ...steel }))
            ring = [p[0], oy - drop, p[1]]
            for (const [k, dz] of [[1, -spread], [2, spread]]) {
                out.push(strut({ id: `${RIG_PREFIX}halo-bridle-${name}-${k}`, name: `Bridle leg ${k}/2, ${tag}: along the outrigger (a V in the z plane)`, a: ring, b: [p[0], oy, p[1] + dz] }))
            }
        } else {
            const zg = girderZ(Math.sign(p[1] - stage.crane.z_m) || -into)
            ring = [p[0], gb - drop, p[1]]
            for (const [k, dx] of [[1, -spread], [2, spread]]) {
                out.push(strut({ id: `${RIG_PREFIX}halo-bridle-${name}-${k}`, name: `Bridle leg ${k}/2, ${tag}: beam clamp on the girder's bottom flange (a V in the x plane)`, a: ring, b: [p[0] + dx, gb, zg] }))
            }
        }
        out.push(box({ id: `${RIG_PREFIX}halo-hoist-${name}`, name: `Chain hoist ${r.hoist || '500 kg D8+'}, ${tag}, hook-suspended under the bridle ring`, pos: [ring[0], ring[1] - 0.1 - hoistH, ring[2]], size: [0.2, hoistH, 0.34], colour: '#45484d', metalness: 0.4, roughness: 0.6, emissive: RIGGING_EMISSIVE }))
        const hookY = ring[1] - 0.1 - hoistH - 0.23
        out.push(box({ id: `${RIG_PREFIX}halo-chain-${name}`, name: `Hoist chain + round sling to the corner, ${tag}`, pos: [p[0], trim + t, p[1]], size: [0.03, round(Math.max(0.05, hookY + 0.23 - (trim + t)), 3), 0.03], colour: '#8a8e95', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }))
        out.push(strut({ id: `${RIG_PREFIX}halo-steel-${name}`, name: `Safety steel, ${tag}: the corner to the crane (secondary, independent of the hoist)`, a: [p[0] + 0.12, trim + t, p[1]], b: [p[0] + 0.12, beyond ? gb - t : gb, beyond ? p[1] : p[1]], w: 0.012 }))
    })
    return out
}

/** (the X's own; the halo's `strut` above differs only in its default width) A thin box from `a` up to `b` (a steel, a chain, a bridle leg): base-anchored at `a`, turned so its +Y runs to `b`. */
const xStrut = ({ id, name, a, b, w = 0.012, colour = '#8a8d92' }) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const len = Math.hypot(...d) || 1
    const u = d.map((v) => v / len)
    // three.js Euler XYZ with y-rotation 0 turns +Y to (-sin z, cos z cos x, cos z sin x)
    const rz = -Math.asin(Math.max(-1, Math.min(1, u[0])))
    const rx = Math.atan2(u[2], u[1])
    const e = box({ id, name, pos: a, size: [w, len, w], colour, metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS })
    e.components.transform.rotation = [round(rx, 6), 0, round(rz, 6)]
    return e
}

/**
 * crane-x — the X lying down, as it would be rigged (RIG_BUILD.md §15.8). Drawn so the hang can be
 * read; NOT an engineered design — rigging sign-off owed. The arms, the 4-way junction, and at each
 * pick a two-leg bridle (a V, 90° between the legs) from beam clamps on the girder flanges down to
 * the hook of a climbing chain hoist whose body sits on the top chord, a safety steel, and at each
 * arm end two restraint steels up to the girders (a V in plan) against the X turning or swinging.
 * Pure.
 */
export const craneXEntities = (rig, stage) => {
    const out = []
    const r = rig.truss.rigging || {}
    const t = stage.trussSection
    const ax = stage.axis ?? 0
    const z0 = stage.trussZ
    const trim = stage.trussH - t / 2
    const top = trim + t
    const arm = stage.xArm.arm
    const j = stage.xArm.junction
    const crane = stage.crane
    const gb = crane.girder_bottom_m
    const gdz = crane.girders_dz_m || [-1.1, 1.1]
    const steel = '#9aa0a6'
    const pieces = (rig.truss.pieces_m || []).join(' + ')
    out.push(box({ id: `${RIG_PREFIX}truss-header`, name: `X arm along the bridge ${arm} m (${pieces} m, 290 mm box) hung from the crane bridge, bottom chord ${round(trim, 2)} m — rigging sign-off owed`, pos: [ax, trim, z0], size: [arm, t, t], colour: steel, metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }))
    out.push(box({ id: `${RIG_PREFIX}truss-z-arm`, name: `X arm across the bridge, out over the crowd, ${arm} m (${pieces} m, 290 mm box), bottom chord ${round(trim, 2)} m — rigging sign-off owed`, pos: [ax, trim, z0], size: [t, t, arm], colour: steel, metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }))
    if (j) out.push(box({ id: `${RIG_PREFIX}truss-junction`, name: `4-way flat cross junction ${rig.truss.junction?.code || ''} (${j} m across)`.replace('  ', ' '), pos: [ax, trim - 0.005, z0], size: [j, t + 0.01, j], colour: '#80868c', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS }))
    const picks = []
    for (const pk of r.picks || []) for (const s of [-1, 1]) picks.push({ ...pk, s })
    picks.forEach((pk, i) => {
        const n = i + 1
        const tag = `pick ${n}/${picks.length}`
        const P = pk.arm === 'x' ? [ax + pk.s * pk.d_m, top, z0] : [ax, top, z0 + pk.s * pk.d_m]
        // the bridle's two anchors on the girders' bottom flanges, and its apex (90° between the legs)
        const anchors = pk.arm === 'x'
            ? gdz.map((dz) => [P[0], gb, z0 + dz])
            : [-1, 1].map((k) => [P[0] + k * (pk.legs_dx_m ?? 0.75), gb, P[2]])
        const half = Math.hypot(anchors[1][0] - anchors[0][0], anchors[1][2] - anchors[0][2]) / 2
        const apex = [P[0], gb - half, P[2]]
        for (const [k, A] of anchors.entries()) {
            out.push(box({ id: `${RIG_PREFIX}xpick-${n}-clamp-${k + 1}`, name: `Beam clamp on the girder flange, ${tag} (rigging)`, pos: [A[0], gb - 0.08, A[2]], size: [0.18, 0.08, 0.18], colour: '#2a2b2e', metalness: STEEL_METALNESS, roughness: STEEL_ROUGHNESS, emissive: RIGGING_EMISSIVE }))
            out.push(xStrut({ id: `${RIG_PREFIX}xpick-${n}-leg-${k + 1}`, name: `Bridle leg ${k + 1}/2 (steel wire rope, 90° between the legs), ${tag} (rigging)`, a: apex, b: A, w: 0.016 }))
        }
        // the climbing hoist: its body on the top chord, its chain up to the bridle's apex
        out.push(box({ id: `${RIG_PREFIX}xpick-${n}-hoist`, name: `Climbing chain hoist ${r.hoist || 'D8+ 500 kg'}, ${tag} (rigging)`, pos: [P[0], top + 0.08, P[2]], size: [0.2, 0.34, 0.2], colour: '#45484d', metalness: 0.4, roughness: 0.6, emissive: RIGGING_EMISSIVE }))
        out.push(xStrut({ id: `${RIG_PREFIX}xpick-${n}-chain`, name: `Hoist chain to the bridle, ${tag} (rigging)`, a: [P[0], top + 0.42, P[2]], b: apex, w: 0.03, colour: '#8a8e95' }))
        out.push(xStrut({ id: `${RIG_PREFIX}xpick-${n}-steel`, name: `Safety steel, ${tag} (rigging: secondary, truss to the girder)`, a: [P[0] + 0.1, top, P[2] + 0.1], b: anchors[0].map((v, k) => (k === 1 ? v : v + 0.1)) }))
    })
    // restraints: at each arm end two steels up to the girders, spread in plan, so the X can neither
    // turn about its pick points nor swing along either axis (the owner's concern, 2026-09-29)
    const ends = [[ax - arm / 2 + 0.1, z0, 'x'], [ax + arm / 2 - 0.1, z0, 'x'], [ax, z0 - arm / 2 + 0.1, 'z'], [ax, z0 + arm / 2 - 0.1, 'z']]
    const tieDx = r.tieoffs?.dx_m ?? 1.5
    ends.forEach(([x, z, a], i) => {
        const to = a === 'x'
            ? gdz.map((dz) => [x, gb, z0 + dz])
            : [-1, 1].map((k) => [x + k * tieDx, gb, z0 + (z > z0 ? Math.max(...gdz) : Math.min(...gdz))])
        to.forEach((b, k) => out.push(xStrut({ id: `${RIG_PREFIX}xtie-${i + 1}-${k + 1}`, name: `Restraint steel ${k + 1}/2 at the ${a === 'x' ? (x < ax ? 'left' : 'right') : (z > z0 ? 'crowd' : 'back')} end, to the crane girder (against sway and turning; rigging)`, a: [x, top, z], b, w: 0.01, colour: '#b8bcc2' })))
    })
    return out
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
        const patch = { origin: [x0, box.y_m[0] + 0.02, z], u: [x1 - x0, 0, 0], v: [0, box.y_m[1] - box.y_m[0] - 0.04, 0], normal: [0, 0, ctx.stage.into], kind: 'backdrop' }
        // A MODELLED machine (hall.py v3 `faces`): the light lands on its real
        // front faces — the press's housings, bed, ram and crown, each at its
        // own depth — clipped to the beam's footprint; never on one flat sheet
        // over the whole envelope (that read as a glowing block, 2026-09-28).
        if (Array.isArray(box.faces)) {
            const parts = (ctx.stage.backdrop.boxes || []).flatMap((m) => m.faces || [])
                .filter((f) => f.x_m[1] > x0 && f.x_m[0] < x1)
                .map((f) => {
                    const a = Math.max(f.x_m[0], x0)
                    const b = Math.min(f.x_m[1], x1)
                    return { origin: [a, f.y_m[0] + 0.02, f.z_m + ctx.stage.into * off], u: [b - a, 0, 0], v: [0, f.y_m[1] - f.y_m[0] - 0.04, 0], albedo: f.albedo }
                })
                .filter((f) => f.u[0] > 0.02)
            // the same face listed by two envelope items (the crown) is baked once
            const seen = new Set()
            const unique = parts.filter((f) => {
                const key = f.origin.concat(f.u, f.v).map((v) => v.toFixed(3)).join(',')
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            return unique.length ? { ...patch, parts: unique } : null
        }
        return patch
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
