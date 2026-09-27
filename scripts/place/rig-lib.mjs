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
 */
export const stageFrame = (rig, hall) => {
    const g = hall.geometry
    const s = rig.stage
    const far = (s.end || 'far') === 'far'
    const into = far ? 1 : -1
    const wall = far ? g.far_wall_z_m : g.door.z_m
    const back = wall + into * (s.back_gap_m ?? 1)
    const front = back + into * s.depth_m
    const truss = rig.truss
    return {
        into,
        wall,
        back,
        front,
        width: s.width_m,
        deck: s.deck_h_m,
        trussZ: back + into * truss.from_stage_back_m,
        trussW: truss.width_m,
        trussH: truss.header_h_m,
        trussSection: truss.section_m ?? 0.4
    }
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

/** Columns standing in the audience: between the stage front and the far end of the room from it. */
const audienceColumns = (hall, stage) => columnsByStage(hall, stage)
    .filter((c) => (c.z - stage.front) * stage.into > 1)

// ---------------------------------------------------------------------------
// WHERE a fixture stands. Each rule returns mountings: `pos` is the fixture's
// mounting face — the bottom of its base on a floor or a deck, the clamp face
// under a truss or a crane girder — `orient` is 'floor' or 'hung' (upside
// down, as clamped), and `face` is the room direction its base's front turns
// to (fixture-lib.mjs, mountMatrix). The lamp itself is then at the LENS,
// which depends on the aim.
// ---------------------------------------------------------------------------
const toAudience = (ctx) => [0, 0, ctx.stage.into]
const place = {
    'stage-back': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.deck, ctx.stage.back + ctx.stage.into * 0.6], orient: 'floor', face: toAudience(ctx) })),
    'stage-front': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 0.5], orient: 'floor', face: toAudience(ctx) })),
    // Clamped under the header's bottom chord, hanging.
    'truss-header': (n, ctx) => spread(n, -ctx.stage.trussW / 2 + 1, ctx.stage.trussW / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.trussH - ctx.stage.trussSection / 2, ctx.stage.trussZ], orient: 'hung', face: toAudience(ctx) })),
    // Standing on the top plate of each tower.
    'truss-towers': (n, ctx) => spread(n, -ctx.stage.trussW / 2, ctx.stage.trussW / 2)
        .map((x) => ({ pos: [x, ctx.stage.trussH + ctx.stage.trussSection / 2, ctx.stage.trussZ], orient: 'floor', face: toAudience(ctx) })),
    'column-bases': (n, ctx) => {
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
    'column-uplight': (n, ctx) => {
        // Every column once, nearest the stage first; then a second on the
        // columns nearest the stage until the count is used up. Fewer lamps than
        // columns: spread them evenly instead.
        const cols = columnsByStage(ctx.hall, ctx.stage)
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
        .map((x) => ({ pos: [x, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 0.35], orient: 'floor', face: toAudience(ctx) })),
    'stage-front-floor': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1.5, ctx.stage.width / 2 - 1.5)
        .map((x) => ({ pos: [x, 0, ctx.stage.front + ctx.stage.into * 0.9], orient: 'floor', face: toAudience(ctx) })),
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
const stagePoint = (ctx, x, y, a) => [x, y, ctx.stage.front + ctx.stage.into * a]
const sideOf = (slot) => (Math.abs(slot.pos[0]) < 0.05 ? 0 : Math.sign(slot.pos[0]))
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
    vertical: (slot, meta, ctx, p = {}) => ({ dir: leaned(ctx, slot, -sideOf(slot) * (p.in_deg ?? 0), p.lean_deg ?? 0) }),
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
    'mirror-point': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, sideOf(slot) * (p.x ?? 0), p.y ?? 8, p.a ?? 15) }),
    // Crossfire: each lamp to the OTHER side of the room at `y`, in line with
    // itself along the hall (plus `dz`); the two rows cross over the centre.
    cross: (slot, meta, ctx, p = {}) => ({
        target: [-sideOf(slot) * (p.x ?? 8), p.y ?? 9, slot.pos[2] + ctx.stage.into * (p.dz ?? 0)]
    }),
    // A line lamp's X-cross: stage-left lamps to stage-right and back, at a point in the air.
    'x-cross': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, -sideOf(slot) * (p.x ?? 8), p.y ?? 12, p.a ?? 10) }),
    // A PAR grazing up its own column to the crane runway.
    'up-the-column': (slot, meta, ctx) => ({ target: [slot.column.faceX, ctx.hall.geometry.runway_bottom_m, slot.pos[2]] }),
    // Truss spots: alternately a downstage area of the deck and the back wall,
    // counted in from both ends so the two halves mirror.
    'stage-wash': (slot, meta, ctx, p = {}) => (Math.min(meta.rank, meta.n - 1 - meta.rank) % 2 === 0
        ? { target: [slot.pos[0] * 0.8, ctx.stage.deck, ctx.stage.front - ctx.stage.into * (p.deck_a ?? 1.5)] }
        : { target: [slot.pos[0] * 1.1, p.wall_y ?? 7, ctx.stage.wall] }),
    // Hung lamps straight down onto the floor under the crane, splayed out.
    'down-from-crane': (slot, meta, ctx) => ({ target: [slot.pos[0] * 1.1, 0, slot.pos[2] + slot.girder * 4] }),
    // A laser up into the roof over the house — the only rule a laser may use
    // besides one that rises (checkLaser refuses anything else).
    'laser-into-roof': (slot, meta, ctx, p = {}) => ({ target: [slot.pos[0] * (p.x_scale ?? 0.3), ctx.hall.geometry.truss_top_centre_m, ctx.stage.front + ctx.stage.into * (p.a ?? 14)] })
}

/**
 * How far a beam travels before it meets the building: the floor, the roof
 * (a pitch from the eaves up to the truss tops at the centre, open into the
 * lantern), the nave walls above the aisle roofs, the aisle walls below them,
 * or an end wall. Sampled every 0.1 m along the axis. A real beam stops there;
 * the drawn cone is cut to the same length so it does not pierce the roof.
 */
export const surfaceHit = (from, dir, hall, maxReach = 80) => {
    const g = hall.geometry
    const eave = g.eave_top_m ?? g.truss_bottom_m ?? 12
    const top = g.truss_top_centre_m ?? eave
    const nave = g.nave_wall_x_m ?? g.column_inner_face_x_m ?? 12
    const outer = g.wall_inner_x_m ?? nave
    const aisleRoof = g.aisle_roof_m ?? 0
    const lanternHalf = (g.lantern_w_m ?? 0) / 2
    const ridge = top + (g.lantern_h_m ?? 0)
    const ends = [g.far_wall_z_m ?? -1e9, g.door?.z_m ?? 1e9].sort((a, b) => a - b)
    const len = Math.hypot(...dir) || 1
    const d = dir.map((c) => c / len)
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
export const buildRig = (rig, hall, { mode = 'budget', look: lookName, geometry = {}, manifest = null } = {}) => {
    const stage = stageFrame(rig, hall)
    const ctx = { rig, hall, stage }
    const entities = []
    const fixtures = []
    const summary = { fixtures: 0, real: 0, beamOnly: 0, byGroup: {}, effects: {}, refused: [], clashes: [], unreachable: [], look: null }
    const name = lookName || rig.defaultLook || null
    const look = name ? rig.looks?.[name] : null
    if (name && !look) throw new Error(`no look "${name}" in the rig (it has: ${Object.keys(rig.looks || {}).join(', ') || 'none'})`)
    summary.look = name
    const optics = classPhotometry(rig, manifest)
    summary.photometry = optics

    // The stage and its truss: production, not building, so they are the rig's.
    const mid = (stage.back + stage.front) / 2
    entities.push(box({
        id: `${RIG_PREFIX}stage-deck`, name: `Stage deck ${stage.width} x ${rig.stage.depth_m} m @ ${stage.deck} m (ASSUMED)`,
        pos: [0, 0, mid], size: [stage.width, stage.deck, rig.stage.depth_m], colour: '#141416', roughness: 0.9
    }))
    const t = stage.trussSection
    for (const side of [-1, 1]) {
        entities.push(box({
            id: `${RIG_PREFIX}truss-tower-${side < 0 ? 'l' : 'r'}`, name: `Truss tower ${side < 0 ? 'left' : 'right'} (ASSUMED)`,
            pos: [side * stage.trussW / 2, 0, stage.trussZ], size: [t, stage.trussH + t / 2, t], colour: '#9aa0a6', metalness: 0.8, roughness: 0.4
        }))
    }
    entities.push(box({
        id: `${RIG_PREFIX}truss-header`, name: `Truss header ${stage.trussW} m @ ${stage.trussH} m (ASSUMED)`,
        pos: [0, stage.trussH - t / 2, stage.trussZ], size: [stage.trussW + t, t, t], colour: '#9aa0a6', metalness: 0.8, roughness: 0.4
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
        const slots = placer(group.count, ctx)
        if (slots.length !== group.count) {
            throw new Error(`group ${group.id}: asked for ${group.count}, the hall has room for ${slots.length} by the rule "${group.mount}"`)
        }
        const byX = slots.map((s, i) => [s.pos[0], i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
        const real = realIndices(group, slots.length, rig.budget, mode)
        const colour = look?.colours?.[group.id] || group.colour || cls.colour
        const op = optics[group.class]
        const half = (op.angleDeg / 2) * DEG
        let groupReal = 0
        slots.forEach((slot, i) => {
            const aimed = rule(slot, { i, n: slots.length, rank: byX.indexOf(i) }, ctx, spec)
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
            const { pan, tilt } = aimAt(from, to)
            const isReal = real.has(i)
            if (isReal) groupReal += 1
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
                        intensity: op.intensity,
                        distance: round(reach, 2),
                        angle: round(half, 4),
                        penumbra: cls.penumbra,
                        decay: 2
                    },
                    beam: { visible: true, haze: group.haze ?? op.haze ?? cls.haze, ...(isReal ? {} : { only: true }) },
                    animation: staticAnim
                }
            })
        })
        const placed = entities.filter((e) => e.id.startsWith(`${RIG_PREFIX}${group.id}-`)).length
        summary.byGroup[group.id] = { code: cls.code, placed, real: groupReal, rule: spec.rule }
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
        const slots = placer(fx.count, ctx)
        slots.forEach((slot, i) => {
            const posed = aimFixture(geo, slot, { dir: [0, 1, 0] })
            fixtures.push({ kind: fx.fixture, parts: posed.parts, colour: fx.colour, id: `${fx.id}-${i + 1}` })
        })
        summary.effects[fx.id] = slots.length
    }
    return { entities, fixtures, summary, stage }
}

// Each shadow-casting spot light takes a texture unit in every lit material's
// fragment shader. WebGL guarantees 16 (phones sit there; SwiftShader and
// desktop GPUs give 32), and the material needs some for itself, so past this
// many real lamps shadows are switched off rather than let every surface fail
// to compile — which turns the whole room black (seen 2026-09-27).
export const SHADOW_SAFE_REAL_LIGHTS = 12

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
