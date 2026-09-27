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

const place = {
    'stage-back': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.deck + 0.4, ctx.stage.back + ctx.stage.into * 0.6] })),
    'stage-front': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1, ctx.stage.width / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.deck + 0.35, ctx.stage.front - ctx.stage.into * 0.5] })),
    'truss-header': (n, ctx) => spread(n, -ctx.stage.trussW / 2 + 1, ctx.stage.trussW / 2 - 1)
        .map((x) => ({ pos: [x, ctx.stage.trussH - ctx.stage.trussSection / 2 - 0.35, ctx.stage.trussZ] })),
    'truss-towers': (n, ctx) => spread(n, -ctx.stage.trussW / 2, ctx.stage.trussW / 2)
        .map((x) => ({ pos: [x, ctx.stage.trussH + ctx.stage.trussSection / 2 + 0.25, ctx.stage.trussZ] })),
    'column-bases': (n, ctx) => {
        const cols = audienceColumns(ctx.hall, ctx.stage)
        const perSide = { '-1': cols.filter((c) => c.side < 0), 1: cols.filter((c) => c.side > 0) }
        const left = Math.ceil(n / 2)
        const right = n - left
        return [
            ...pickEven(left, perSide['-1'].length).map((i) => perSide['-1'][i]),
            ...pickEven(right, perSide[1].length).map((i) => perSide[1][i])
        ].map((c) => ({ pos: [c.faceX - c.side * 0.7, 0.3, c.z], column: c }))
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
            pos: [c.faceX - c.side * 0.45, 0.2, c.z + (c.second ? -ctx.stage.into * 0.45 : 0)],
            column: c
        }))
    },
    'crane-bridge': (n, ctx) => {
        const g = ctx.hall.geometry
        const crane = craneNearestStage(ctx.hall, ctx.stage)
        const reach = g.crane_rail_x_m - 1.5
        return spread(n, -reach, reach).map((x, i) => ({
            pos: [x, crane.girder_bottom_m - 0.25, crane.z_m + (i % 2 ? 1.1 : -1.1)],
            girder: i % 2 ? 1 : -1
        }))
    },
    'stage-front-deck': (n, ctx) => spread(n, -ctx.stage.width / 2 + 0.8, ctx.stage.width / 2 - 0.8)
        .map((x) => ({ pos: [x, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 0.35] })),
    'stage-front-floor': (n, ctx) => spread(n, -ctx.stage.width / 2 + 1.5, ctx.stage.width / 2 - 1.5)
        .map((x) => ({ pos: [x, 0, ctx.stage.front + ctx.stage.into * 0.9] })),
    'nave-columns': (n, ctx) => {
        const cols = audienceColumns(ctx.hall, ctx.stage)
        return pickEven(n, cols.length).map((i) => cols[i])
            .map((c) => ({ pos: [c.faceX - c.side * 1.0, 0, c.z + ctx.stage.into * 1.2] }))
    }
}

const aim = {
    // Steep enough to clear a crane parked in front of the stage (checked below).
    'fan-into-roof': (slot, i, ctx) => [slot.pos[0] * 1.8, ctx.hall.geometry.truss_bottom_m, ctx.stage.front + ctx.stage.into * 6],
    'up-into-truss': (slot, i, ctx) => [slot.pos[0] * 0.55, ctx.hall.geometry.truss_top_centre_m, slot.pos[2] + ctx.stage.into * 2],
    'stage-floor-and-back-wall': (slot, i, ctx) => (i % 2 === 0
        ? [slot.pos[0] * 0.8, ctx.stage.deck, ctx.stage.front - ctx.stage.into * 1.5]
        : [slot.pos[0] * 1.1, 7, ctx.stage.wall]),
    'out-over-audience': (slot, i, ctx) => [slot.pos[0] * 2, 9, ctx.stage.front + ctx.stage.into * 14],
    'up-the-column': (slot, i, ctx) => [slot.column.faceX, ctx.hall.geometry.runway_bottom_m, slot.pos[2]],
    'down-from-crane': (slot, i, ctx) => [slot.pos[0] * 1.1, 0, slot.pos[2] + slot.girder * 4],
    'laser-into-roof': (slot, i, ctx) => [slot.pos[0] * 0.3, ctx.hall.geometry.truss_top_centre_m, ctx.stage.front + ctx.stage.into * 14]
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

/**
 * The whole rig as entities.
 *
 * @param {object} rig   the rig file
 * @param {object} hall  hall.json from hall.py
 * @param {{ mode?: 'budget'|'all'|'none' }} [options]
 * @returns {{ entities: object[], summary: object }}
 */
export const buildRig = (rig, hall, { mode = 'budget' } = {}) => {
    const stage = stageFrame(rig, hall)
    const ctx = { rig, hall, stage }
    const entities = []
    const summary = { fixtures: 0, real: 0, beamOnly: 0, byGroup: {}, effects: {}, refused: [], clashes: [] }

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
        const placer = place[group.mount]
        const aimer = aim[group.aim]
        if (!placer) throw new Error(`group ${group.id}: unknown mount "${group.mount}"`)
        if (!aimer) throw new Error(`group ${group.id}: unknown aim "${group.aim}"`)
        const slots = placer(group.count, ctx)
        if (slots.length !== group.count) {
            throw new Error(`group ${group.id}: asked for ${group.count}, the hall has room for ${slots.length} by the rule "${group.mount}"`)
        }
        const real = realIndices(group, slots.length, rig.budget, mode)
        const colour = group.colour || cls.colour
        const half = (cls.beamAngleDeg / 2) * DEG
        let groupReal = 0
        slots.forEach((slot, i) => {
            const target = aimer(slot, i, ctx)
            if (group.class === 'laser') {
                const why = checkLaser(slot.pos, target)
                if (why) {
                    summary.refused.push(`${group.id} #${i + 1}: ${why}`)
                    return
                }
            }
            const hit = group.mount === 'crane-bridge' ? null : beamHitsCrane(slot.pos, target, cls.reach_m, hall)
            if (hit !== null) {
                const where = `${group.id} #${i + 1}: beam runs into the crane parked at z ${hit} m`
                // A laser into a steel girder is a reflection hazard: refused.
                if (group.class === 'laser') {
                    summary.refused.push(where)
                    return
                }
                summary.clashes.push(where)
            }
            const { pan, tilt } = aimAt(slot.pos, target)
            const isReal = real.has(i)
            if (isReal) groupReal += 1
            entities.push({
                id: `${RIG_PREFIX}${group.id}-${String(i + 1).padStart(2, '0')}`,
                type: 'spotLight',
                name: `${cls.code} ${group.id} ${i + 1}${isReal ? '' : ' (beam only)'}`,
                components: {
                    transform: { position: slot.pos.map((v) => round(v)), rotation: rotationFromPanTilt({ pan, tilt }), scale: [1, 1, 1] },
                    appearance: { color: colour, opacity: 1 },
                    light: {
                        color: colour,
                        intensity: cls.intensity,
                        distance: cls.reach_m,
                        angle: round(half, 4),
                        penumbra: cls.penumbra,
                        decay: 2
                    },
                    beam: { visible: true, haze: group.haze ?? cls.haze, ...(isReal ? {} : { only: true }) },
                    animation: staticAnim
                }
            })
        })
        const placed = entities.filter((e) => e.id.startsWith(`${RIG_PREFIX}${group.id}-`)).length
        summary.byGroup[group.id] = { code: cls.code, placed, real: groupReal }
        summary.fixtures += placed
        summary.real += groupReal
    }
    summary.beamOnly = summary.fixtures - summary.real

    for (const fx of rig.effects || []) {
        const placer = place[fx.mount]
        if (!placer) throw new Error(`effect ${fx.id}: unknown mount "${fx.mount}"`)
        const slots = placer(fx.count, ctx)
        slots.forEach((slot, i) => {
            entities.push(box({
                id: `${RIG_PREFIX}fx-${fx.id}-${String(i + 1).padStart(2, '0')}`,
                name: `${fx.label} ${i + 1} (marker, no effect simulated)`,
                pos: slot.pos, size: fx.size_m, colour: fx.colour,
                emissive: fx.colour, emissiveIntensity: 0.35
            }))
        })
        summary.effects[fx.id] = slots.length
    }
    return { entities, summary, stage }
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
