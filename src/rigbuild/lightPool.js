// THE LIGHT POOL — the room's light follows the SCENE inside a fixed budget. Pure.
//
// WHY A POOL. A browser runs about eight real three.js SpotLights (rig-lib.mjs
// `budget.realLights`; 90 ran at 1 fps), and three.js compiles every lit material for
// the NUMBER of spot lights in the scene: a light added or removed at runtime is a shader
// recompile (a visible hitch), and SpotLightObject mounts the light only while the lamp
// casts (`beam.only` false). Today the 8 real lamps are a fixed per-version choice written
// into the document, whatever look plays — in the ground versions the movers that carry a
// scene are mostly beam-only, so the scenes light nothing. The pool keeps exactly N slot
// entities (`rig-pool-0..N-1`, stable ids, so the three.js SpotLight objects live on) and
// re-assigns their place, aim, colour, intensity and angle to the N lamps that matter most
// in the entities the room is about to draw. Every lamp of the rig itself is drawn
// beam-only (its cone stays); the count of real lights is N, always, so no recompile.
//
// THE SCORE — what a lamp puts into the room, in relative units:
//   score = I × Ω(angle) × window(d)
//   I        the entity's intensity (candela; already scaled by the look's level and the
//            desk's dimmer by looks.js atLevel / dmxPose.js) — level × candela
//   Ω(angle) = 2π(1 − cos angle), the cone's solid angle: the flux a lamp puts out is I·Ω
//   window(d)= saturate(1 − (d/cutoff)⁴)², three.js's cutoff window (lights_pars_begin,
//            getDistanceAttenuation, r155+ physical lights) at the distance d where the
//            beam axis meets the room's box (`bounds`); the 1/d² of illuminance is cancelled
//            by the footprint area ∝ d², so the landing flux is what counts. No bounds
//            given: window = 1 and the rank is by I·Ω alone.
//   Deterministic: ties break on the entity id (ascending).
//
// THE HAND-OVER RULE. A slot keeps its lamp for `minHoldMs` after it took it (no flicker
// between two lamps of near-equal score), unless the lamp went dark (score 0): then the
// slot is free at once. An unlocked incumbent is replaced only by a challenger whose score
// beats it by `margin` (hysteresis), and a slot changes lamp at most once per step. One
// slot cannot be in two places, so a swap is a DIP: over `handoverMs` the slot fades out
// at the old lamp (first half), then fades in at the new one (second half) — continuous
// in intensity, never a beam sweeping across the room. A slot freed by a dark lamp skips
// the fade-out. A slot with no lamp (fewer lamps than slots) stays mounted at intensity 0
// so the count never changes.

import { spotAimDirection } from '../project/viewport/spotLightAim.js'

export const POOL_ID_PREFIX = 'rig-pool-'
export const POOL_MAX_SLOTS = 12 // rig-lib.mjs SHADOW_SAFE_REAL_LIGHTS
export const DEFAULT_POOL_OPTIONS = Object.freeze({
    slots: 8, // rig-lib.mjs budget.realLights, the measured browser budget
    minHoldMs: 1500,
    handoverMs: 400,
    margin: 0.15,
    bounds: null
})

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const clamp01 = (v) => Math.min(1, Math.max(0, v))

export const solidAngle = (angle) => {
    const a = Math.min(Math.PI / 2, Math.max(0, num(angle)))
    return 2 * Math.PI * (1 - Math.cos(a))
}

/** three.js's cutoff window of a light's `distance` (decay-independent part). 1 with no cutoff. */
export const cutoffWindow = (d, cutoff) => {
    if (!(cutoff > 0) || !(d >= 0)) return 1
    const r = d / cutoff
    const s = clamp01(1 - r * r * r * r)
    return s * s
}

/** three.js getDistanceAttenuation (lights_pars_begin.glsl.js, physical lights). */
export const distanceAttenuation = (d, cutoff, decay = 2) => (1 / Math.max(Math.pow(d, decay), 0.01)) * cutoffWindow(d, cutoff)

/**
 * Where a ray from inside an axis-aligned box leaves it: the distance along `dir`, or null
 * when the origin is outside the box or the direction is zero.
 */
export const rayBoxExit = (origin, dir, bounds) => {
    if (!bounds?.min || !bounds?.max || !origin || !dir) return null
    let best = Infinity
    for (let i = 0; i < 3; i += 1) {
        const o = num(origin[i]); const d = num(dir[i])
        if (o < bounds.min[i] || o > bounds.max[i]) return null
        if (Math.abs(d) < 1e-9) continue
        const t = ((d > 0 ? bounds.max[i] : bounds.min[i]) - o) / d
        if (t >= 0 && t < best) best = t
    }
    return Number.isFinite(best) ? best : null
}

/** Is this entity a lamp the pool may take over? A rig lamp: a spot with a visible beam and a light, not a flash. */
export const poolable = (e) => e?.type === 'spotLight'
    && Boolean(e.components?.light)
    && e.components?.beam?.visible === true
    && !e.components?.rigFlash
    && !String(e.id).startsWith(POOL_ID_PREFIX)

/** A lamp's score (see the header). 0 for a lamp that is dark. */
export const lampScore = (e, { bounds = null } = {}) => {
    const light = e?.components?.light || {}
    const intensity = num(light.intensity)
    if (!(intensity > 0)) return 0
    const omega = solidAngle(num(light.angle, Math.PI / 6))
    let window = 1
    if (bounds) {
        const t = e.components?.transform || {}
        const d = rayBoxExit(t.position, spotAimDirection(t.rotation || [0, 0, 0]), bounds)
        if (d !== null) window = cutoffWindow(d, num(light.distance))
    }
    return intensity * omega * window
}

/** Candidates ranked: score desc, id asc. Pure. */
export const rankLamps = (entities, opts = {}) => entities
    .filter(poolable)
    .map((e) => ({ id: e.id, score: lampScore(e, opts) }))
    .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

export const emptyPool = (slots = DEFAULT_POOL_OPTIONS.slots) => ({
    slots: Array.from({ length: Math.max(0, Math.min(POOL_MAX_SLOTS, Math.floor(slots))) }, () => ({ lamp: null, since: -Infinity, from: null, fadeStart: -Infinity }))
})

/**
 * One step of the pool: which slot draws which lamp, now. Pure — returns a new state (the
 * same object when nothing changed).
 */
export const stepLightPool = (state, entities, now, options = {}) => {
    const opts = { ...DEFAULT_POOL_OPTIONS, ...options }
    const prev = state && state.slots?.length === opts.slots ? state : emptyPool(opts.slots)
    const ranked = rankLamps(entities, opts)
    const scoreOf = new Map(ranked.map((r) => [r.id, r.score]))
    const slots = prev.slots.map((s) => ({ ...s }))
    // 1. Incumbents that went dark or away release their slot at once (no fade-out).
    for (const s of slots) {
        if (s.lamp !== null && !(scoreOf.get(s.lamp) > 0)) {
            s.from = null; s.lamp = null; s.since = now; s.fadeStart = now - opts.handoverMs / 2
        }
    }
    const held = new Set(slots.map((s) => s.lamp).filter((l) => l !== null))
    const challengers = ranked.filter((r) => r.score > 0 && !held.has(r.id))
    // 2. Free slots take the best challengers.
    for (const s of slots) {
        if (s.lamp !== null || !challengers.length) continue
        const c = challengers.shift()
        s.lamp = c.id; s.since = now; s.from = null; s.fadeStart = now - opts.handoverMs / 2
        held.add(c.id)
    }
    // 3. Each remaining challenger may unseat the weakest UNLOCKED incumbent it beats by the margin.
    const changed = new Set()
    for (const c of challengers) {
        let weakest = null
        for (const s of slots) {
            if (s.lamp === null || changed.has(s) || now - s.since < opts.minHoldMs) continue
            if (!weakest || scoreOf.get(s.lamp) < scoreOf.get(weakest.lamp)) weakest = s
        }
        if (!weakest) break
        if (!(c.score > scoreOf.get(weakest.lamp) * (1 + opts.margin))) break
        weakest.from = weakest.lamp; weakest.lamp = c.id; weakest.since = now; weakest.fadeStart = now
        changed.add(weakest)
    }
    const same = slots.every((s, i) => {
        const p = prev.slots[i]
        return s.lamp === p.lamp && s.since === p.since && s.from === p.from && s.fadeStart === p.fadeStart
    })
    return same && prev === state ? state : { slots }
}

/**
 * What a slot draws at `now`: the lamp id and its envelope 0..1 (the dip). Before the
 * midpoint the slot is at `from`; after it, at `lamp`.
 */
export const slotDrawing = (slot, now, handoverMs = DEFAULT_POOL_OPTIONS.handoverMs) => {
    const u = handoverMs > 0 ? clamp01((now - slot.fadeStart) / handoverMs) : 1
    if (u < 0.5) return slot.from !== null ? { lamp: slot.from, envelope: 1 - 2 * u } : { lamp: slot.lamp, envelope: 0 }
    return { lamp: slot.lamp, envelope: slot.lamp === null ? 0 : 2 * u - 1 }
}

/** Is every hand-over finished? (The caller may stop ticking.) */
export const poolSettled = (state, now, handoverMs = DEFAULT_POOL_OPTIONS.handoverMs) => !state?.slots?.some((s) => now - s.fadeStart < handoverMs)

const PARKED = Object.freeze({ position: [0, -1000, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })

/**
 * The entities as the room draws them with the pool: every rig lamp beam-only (its cone
 * kept), plus N slot entities carrying the light of their lamps. Pure.
 */
export const applyLightPool = (entities, state, now, options = {}) => {
    const opts = { ...DEFAULT_POOL_OPTIONS, ...options }
    const byId = new Map(entities.map((e) => [e.id, e]))
    const out = entities
        .filter((e) => !String(e.id).startsWith(POOL_ID_PREFIX))
        .map((e) => (poolable(e) && e.components.beam.only !== true
            ? { ...e, components: { ...e.components, beam: { ...e.components.beam, only: true } } }
            : e))
    const slots = state?.slots || emptyPool(opts.slots).slots
    slots.forEach((slot, k) => {
        const { lamp, envelope } = slotDrawing(slot, now, opts.handoverMs)
        const src = lamp !== null ? byId.get(lamp) : null
        const light = src?.components?.light || { color: '#ffffff', intensity: 0, distance: 1, angle: 0.1, penumbra: 0, decay: 2 }
        const t = src?.components?.transform || PARKED
        out.push({
            id: `${POOL_ID_PREFIX}${k}`,
            type: 'spotLight',
            name: `light pool slot ${k}${src ? ` — ${src.name || src.id}` : ''}`,
            components: {
                transform: { position: t.position || PARKED.position, rotation: t.rotation || PARKED.rotation, scale: [1, 1, 1] },
                light: { ...light, intensity: Math.round(num(light.intensity) * envelope * 100) / 100 },
                beam: { visible: false },
                animation: { mode: 'static', speed: 1, amplitude: 1 },
                lightPool: { slot: k, lamp, envelope: Math.round(envelope * 1000) / 1000 }
            }
        })
    })
    return out
}

/** The flag: OFF unless the document asks (`mappingState.lightPool.enabled`) or the page's query says `lightPool=1`. */
export const lightPoolWanted = ({ mappingState, search = '' } = {}) => {
    if (mappingState?.lightPool?.enabled === true) return true
    const q = String(search || '')
    return /(?:^|[?&])lightPool=(?:1|on|true)(?:&|$)/i.test(q)
}

/** The pool's options from the document (`mappingState.lightPool`), clamped to the shadow-safe ceiling. */
export const lightPoolOptions = (mappingState) => {
    const p = mappingState?.lightPool || {}
    const slots = Math.max(1, Math.min(POOL_MAX_SLOTS, Math.floor(num(p.slots, DEFAULT_POOL_OPTIONS.slots))))
    return {
        ...DEFAULT_POOL_OPTIONS,
        slots,
        minHoldMs: Math.max(0, num(p.minHoldMs, DEFAULT_POOL_OPTIONS.minHoldMs)),
        handoverMs: Math.max(0, num(p.handoverMs, DEFAULT_POOL_OPTIONS.handoverMs)),
        margin: Math.max(0, num(p.margin, DEFAULT_POOL_OPTIONS.margin)),
        bounds: p.bounds?.min && p.bounds?.max ? p.bounds : null
    }
}
