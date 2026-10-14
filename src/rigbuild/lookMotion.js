// LOOK MOTION - a look that moves, in the room. Pure: no clock is read here, `now` is a parameter.
//
// The desk already has the effect vocabulary: serverXR/src/lighting/fx.js (14 modes, each a pure function of `now`,
// a level multiplier 0..255 per fixture, 40 Hz frame grid). A scene in the room must not invent a second vocabulary,
// so this file is a CLIENT PORT of fxLevel / fxPhase / fxApplyDepth (serverXR is CommonJS and cannot be imported by
// src/); lookMotion.test.js pins the two to within 1/255 for every mode at fixed `now` values. Change fx.js and the
// test says so.
//
// What a look says (components.rigLooks.looks[].motion, normalised by normalizeRigLooks):
//   { mode, bpm, depth, spatial, kinds, still }   mode = an fx.js mode; spatial = how it fans across the rig (fx.js
//   FX_SPATIAL); kinds = the fixture types that move (the rest of the look holds still); still = a lamp at or under
//   this level in the look holds still too: the look's readable floor (work-light layer) never flickers.
//
// Hard limits kept by construction, not by care:
//   - LEVEL ONLY. This module returns one multiplier per lamp. It has no way to say pan, tilt or position, so a
//     lamp on the truss cannot move (owner, 2026-10-09). Lasers are never in `kinds` of a favourite (the server
//     refuses laser scenes as favourites, shared/laserMoments.cjs) and their envelope is not touched.
//   - STROBE <= 3 Hz: the 'strobe' mode is ported with fx.js's own MAX_STROBE_HZ clamp (src/rigbuild/strobeCap.js).
//   - EVERY VIEWER, ONE BEAT: the beat is a function of the SERVER's time (`serverNowOf`) and of the moment the
//     scene was fired (`epoch`, also server time); a viewer's own clock never enters.

import { MAX_STROBE_HZ } from './strobeCap.js'

export const FX_MODES = ['none', 'strobe', 'chase', 'pulse', 'sine', 'sparkle', 'comet', 'bars', 'glitch', 'radar',
    'pump', 'breathe', 'pingpong', 'blocks']
export const FX_SPATIAL = ['patch', 'x', 'x-', 'y', 'y-', 'radial', 'radial-']
export const FRAME_MS = 25

const TAU = Math.PI * 2

const tri8 = (phase) => {
    const p = phase & 255
    return p < 128 ? p * 2 : (255 - p) * 2
}

// Depth is a floor under the effect: depth 0 leaves the look as it is, 255 swings to black.
const applyDepth = (level, depth) => {
    const d = Math.max(0, Math.min(255, depth | 0))
    return (255 - d) + Math.floor((level * d + 127) / 255)
}

const hash = (x) => {
    let h = x >>> 0
    h = (h ^ (h >>> 16)) >>> 0
    h = Math.imul(h, 0x7feb352d) >>> 0
    h = (h ^ (h >>> 15)) >>> 0
    h = Math.imul(h, 0x846ca68b) >>> 0
    h = (h ^ (h >>> 16)) >>> 0
    return h
}

const tailLevel = (dist) => (dist === 0 ? 255 : dist === 1 ? 190 : dist === 2 ? 110 : dist === 3 ? 52 : 0)

const lanePart = (i, n, lanes) => (n <= 1 ? 0 : Math.max(0, Math.min(lanes - 1, Math.floor((i * lanes) / n))))

/** Where a fixture sits in the effect, 0..1 (fx.js fxPhase). fixture.x / .y are the desk's world, -1..2. */
export const phaseOf = (fx, fixture, i, n) => {
    const raw = FX_SPATIAL.includes(fx.spatial) ? fx.spatial : 'patch'
    const rev = raw.endsWith('-')
    const mode = rev ? raw.slice(0, -1) : raw
    const flip = (p) => (rev ? 1 - p : p)
    if (mode === 'patch' || !fixture) return flip(n <= 1 ? 0 : i / (n - 1))
    const nx = ((+fixture.x || 0) + 1) / 3
    const ny = ((+fixture.y || 0) + 1) / 3
    if (mode === 'x') return flip(Math.max(0, Math.min(1, nx)))
    if (mode === 'y') return flip(Math.max(0, Math.min(1, ny)))
    const dx = nx - 0.5
    const dy = ny - 0.5
    return flip(Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.5)))
}

/** One fixture's multiplier, 0..255, at `now` (ms). 255 = leave it alone. Port of fx.js fxLevel; `enabled` is implied. */
export const motionLevel = (fx, fixture, i, n, now) => {
    if (!fx || !FX_MODES.includes(fx.mode) || fx.mode === 'none') return 255
    const depth = fx.depth == null ? 255 : fx.depth
    const bpm = Math.max(20, Math.min(300, (fx.bpm | 0) || 120))
    const beatMs = Math.max(1, Math.floor(60000 / bpm))
    const t = Math.floor(now)
    const tq = Math.floor(t / FRAME_MS) * FRAME_MS
    const lane16 = () => Math.min(15, Math.floor(phaseOf(fx, fixture, i, n) * 16))
    switch (fx.mode) {
        case 'strobe': {
            const slice = Math.max(Math.ceil(1000 / MAX_STROBE_HZ / FRAME_MS) * FRAME_MS, Math.floor(beatMs / 8 / FRAME_MS) * FRAME_MS)
            const on = (tq % slice) < Math.max(FRAME_MS, Math.floor(slice / 3 / FRAME_MS) * FRAME_MS)
            return applyDepth(on ? 255 : 0, depth)
        }
        case 'chase': {
            const lanes = 8
            const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) % lanes
            const lane = Math.min(lanes - 1, Math.floor(phaseOf(fx, fixture, i, n) * lanes))
            return applyDepth(tailLevel((lane + lanes - active) % lanes), depth)
        }
        case 'pulse': {
            const phase = Math.floor(((t % beatMs) * 255) / beatMs)
            const level = tri8(phase)
            return applyDepth((level * level + 255) >> 8, depth)
        }
        case 'sine': {
            const lane = lane16()
            const phase = (Math.floor(((t % beatMs) * 255) / beatMs) + lane * 16) & 255
            return applyDepth(tri8(phase), depth)
        }
        case 'sparkle': {
            const slot = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 16)))
            const r = hash((((i + 1) << 16) ^ slot) >>> 0) & 0x1f
            return applyDepth(r < 2 ? 255 : r < 5 ? 150 : r < 9 ? 58 : 0, depth)
        }
        case 'comet': {
            const lanes = 16
            const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 4))) % lanes
            return applyDepth(tailLevel((lane16() + lanes - active) % lanes), depth)
        }
        case 'bars': {
            const flip = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) & 1
            return applyDepth((lane16() & 1) === flip ? 255 : 18, depth)
        }
        case 'glitch': {
            const lane = lane16()
            const slot = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 20)))
            const r = hash((slot ^ Math.imul(lane, 0x45d9f3b)) >>> 0) & 0x0f
            return applyDepth(r < 3 ? 255 : r < 6 ? 0 : r < 9 ? 115 : 32, depth)
        }
        case 'radar': {
            const dx = (fixture && fixture.x != null ? +fixture.x : 0.5) - 0.5
            const dy = (fixture && fixture.y != null ? +fixture.y : 0.5) - 0.5
            let ang = Math.atan2(dy, dx)
            if (ang < 0) ang += TAU
            const sweep = ((t % beatMs) / beatMs) * TAU
            let diff = Math.abs(ang - sweep)
            if (diff > Math.PI) diff = TAU - diff
            const level = 1 - Math.min(1, diff / 0.28)
            return applyDepth(Math.min(255, Math.floor(level * 255)), depth)
        }
        case 'pump': {
            const p = (t % beatMs) / beatMs
            return applyDepth(Math.floor(255 * (1 - p) * (1 - p)), depth)
        }
        case 'breathe': {
            const period = beatMs * 4
            const p = (t % period) / period
            return applyDepth(Math.floor(((1 - Math.cos(p * TAU)) / 2) * 255), depth)
        }
        case 'pingpong': {
            const lanes = 16
            const period = beatMs * 2
            const p = (tq % period) / period
            const head = Math.round((p < 0.5 ? p * 2 : (1 - p) * 2) * (lanes - 1))
            return applyDepth(tailLevel(Math.abs(lane16() - head)), depth)
        }
        case 'blocks': {
            const groups = 5
            const g = lanePart(Math.floor(phaseOf(fx, fixture, i, n) * (n - 1 || 1)), n, groups)
            const slot = Math.floor(tq / Math.max(FRAME_MS * 2, beatMs))
            const on = (hash((((g + 1) << 20) ^ slot) >>> 0) & 3) < 2
            return applyDepth(on ? 255 : 24, depth)
        }
        default:
            return 255
    }
}

// ---- THE ROOM SIDE: which lamps move, where they sit in the effect, what each is multiplied by ----------------

/** A look's motion, or null (a look from before this has none). */
export const motionOf = (look) => {
    const m = look?.motion
    return m && FX_MODES.includes(m.mode) && m.mode !== 'none' ? m : null
}

/** The server's time at this viewer's `localNow`: the one clock every viewer shares (serverClock.js offset). */
export const serverNowOf = (localNow, offset) => localNow + (Number(offset) || 0)

const posOf = (e) => e.components?.transform?.position || [0, 0, 0]

/**
 * The lamps a look moves, once per look (memoise on the look and the entities, not on the frame): the lit lamps of
 * the motion's kinds, in patch order (universe, address, id: fx.js fxOrder), each with its place in the effect.
 * The desk keeps x / y as a stage plan; the room maps its own axes the same way: x = across the room, y = along the
 * hall, each spread over the moving lamps; 'radial' measures out from `centre` (the DJ), the farthest lamp at 1.
 * `levelOf(id)` is the look's level for the lamp (0 = out: it does not take part, so a chase steps over lit lamps only).
 */
export const motionPlan = ({ entities, look, levelOf = () => 1, centre = null }) => {
    const motion = motionOf(look)
    if (!motion) return null
    const kinds = new Set(motion.kinds || [])
    const still = Math.max(0, Number(motion.still) || 0)
    const lamps = entities.filter((e) => e.type === 'spotLight' && kinds.has(e.components?.fixture?.type) && levelOf(e.id) > still)
    if (!lamps.length) return null
    lamps.sort((a, b) => {
        const fa = a.components.fixture
        const fb = b.components.fixture
        return ((fa.universe || 0) - (fb.universe || 0)) || ((fa.address || 0) - (fb.address || 0)) || String(a.id).localeCompare(String(b.id))
    })
    const pts = lamps.map(posOf)
    const spread = (k) => {
        const v = pts.map((p) => p[k])
        const lo = Math.min(...v)
        const hi = Math.max(...v)
        return (x) => (hi > lo ? (x - lo) / (hi - lo) : 0.5)
    }
    const nx = spread(0)
    const nz = spread(2)
    const c = centre || [pts.reduce((s, p) => s + p[0], 0) / pts.length, 0, pts.reduce((s, p) => s + p[2], 0) / pts.length]
    const reach = Math.max(1e-6, ...pts.map((p) => Math.hypot(p[0] - c[0], p[2] - c[2])))
    const world = (u) => u * 3 - 1
    const placed = lamps.map((e, i) => {
        const p = pts[i]
        const radial = FX_SPATIAL.includes(motion.spatial) && motion.spatial.startsWith('radial')
        return radial
            ? { id: e.id, x: world(0.5 + (p[0] - c[0]) / (2 * reach)), y: world(0.5 + (p[2] - c[2]) / (2 * reach)) }
            : { id: e.id, x: world(nx(p[0])), y: world(nz(p[2])) }
    })
    return { motion, lamps: placed }
}

/** Map(lamp id -> multiplier 0..1) at server time `serverNow`; `epoch` = the server time the scene was fired (beat 0). */
export const motionFrame = (plan, serverNow, epoch = 0) => {
    const out = new Map()
    if (!plan) return out
    const now = serverNow - (Number(epoch) || 0)
    const n = plan.lamps.length
    plan.lamps.forEach((f, i) => out.set(f.id, motionLevel(plan.motion, f, i, n, now) / 255))
    return out
}

/** The entities with each moving lamp's light and haze scaled by its multiplier. Unmoved lamps keep their object. */
export const withMotion = (entities, frame) => {
    if (!frame?.size) return entities
    return entities.map((e) => {
        const m = frame.get(e.id)
        if (m == null || m >= 1) return e
        const c = e.components
        const out = { ...c }
        if (c.light) out.light = { ...c.light, intensity: Math.round((Number(c.light.intensity) || 0) * m * 100) / 100 }
        if (c.beam) out.beam = { ...c.beam, haze: Math.round((Number.isFinite(c.beam.haze) ? c.beam.haze : 0.4) * m * 1000) / 1000 }
        out.rigShown = { ...(c.rigShown || {}), level: (c.rigShown?.level ?? 1) * m }
        return { ...e, components: out }
    })
}
