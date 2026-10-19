// HEAD MOTION - a look that moves the moving heads, in the room. Pure: no clock is read here, `now` is a parameter.
//
// The desk plays the same look in DMX: serverXR/src/lighting/headMotion.js is the one definition (CommonJS, so src/
// cannot import it). This file is its CLIENT PORT - the pattern maths is copied line for line and
// src/rigbuild/headMotion.test.js pins the two to within 0.01 degree at fixed `now` values, as lookMotion.test.js does
// for the level effects. Change one and the test says so. The header of the server file is the specification
// (patterns, phases, the world-frame offsets); read it there.
//
// What a look says (components.rigLooks.looks[].heads, normalised by normalizeRigLooks):
//   { pattern, period_s, pan_deg, tilt_deg, spatial, kinds }   kinds = the fixture types that move; none named = every
//   fixture of the look that has pan/tilt (type.pan_tilt_deg). A lamp without pan/tilt never moves.
//
// How the room draws it: the look's REST aim is the lamp's rotation. Its fixture pan/tilt (degrees from home, the DMX
// frame, dmxDecode.js) plus the offset - the sign flipped for a hung lamp, headSigns - clamped to the type's range,
// is the new beam; from there the entity's lens and rotation are written the way dmxEntities writes a lamp the desk
// drives (mountFromLens / lensFromMount / rotationFromPanTilt). So the room and the DMX the desk writes are one
// arithmetic, and the test holds them to it. The composition is done in the pan/tilt frame, not on the stored euler
// matrix: tilt about the matrix's local x is not the yoke's axis once pan is not zero (measured in the test).
//
// Hard limits kept by construction: EVERY VIEWER, ONE BEAT - the offset is a function of the SERVER's time
// (`serverNowOf`, lookMotion.js) and of the moment the look was fired (`epoch`, also server time); a viewer's own clock
// never enters. A lamp the DESK moves (DMX decodes its pan/tilt) is left to the desk: the offsets are already in its DMX.

import { spotAimDirection, rotationFromPanTilt } from '../project/viewport/spotLightAim.js'
import { panTiltOfDirection } from './lookRules.js'
import { mountFromLens, lensFromMount } from './lampGeometry.js'
import { beamOfPanTilt } from './dmxPose.js'
import { typeById } from './fixtureTypes.js'

export const HEAD_PATTERNS = ['sweep', 'nod', 'circle', 'figure8', 'fan', 'wave', 'cross']
export const HEAD_SPATIAL = ['all', 'alternate', 'left-right', 'ripple']
export const HEAD_LIMITS = Object.freeze({ periodMin: 0.5, periodMax: 600, panMax: 270, tiltMax: 135, kindsMax: 8, unitsMax: 256 })
export const HEAD_DEFAULTS = Object.freeze({ period_s: 8, pan_deg: 30, tilt_deg: 20 })

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const fin = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round3 = (v) => Math.round(v * 1000) / 1000

/** Units in the order every player must use: x (house left to right), then z, then id. Never mutates. */
export const orderUnits = (units) => [...units].sort((a, b) => (fin(a.x, 0) - fin(b.x, 0)) || (fin(a.z, 0) - fin(b.z, 0)) || String(a.id).localeCompare(String(b.id)))

/** Port of headOffsets (serverXR/src/lighting/headMotion.js): Map(unit id -> { pan, tilt }) degrees at server time `now` (ms). */
export const headOffsets = (now, epoch, heads, units) => {
    const out = new Map()
    if (!heads || !HEAD_PATTERNS.includes(heads.pattern) || !Array.isArray(units) || !units.length) return out
    const pattern = heads.pattern
    const spatial = HEAD_SPATIAL.includes(heads.spatial) ? heads.spatial : 'all'
    const panDeg = fin(heads.pan_deg, 0)
    const tiltDeg = fin(heads.tilt_deg, 0)
    const period = Math.max(1e-3, fin(heads.period_s, HEAD_DEFAULTS.period_s))
    const th = (TAU * ((fin(now, 0) - fin(epoch, 0)) / 1000)) / period
    const ordered = orderUnits(units)
    const n = ordered.length
    ordered.forEach((u, i) => {
        const phiPattern = pattern === 'wave' ? (TAU * i) / n : pattern === 'cross' ? Math.PI * (i % 2) : 0
        const phiSpatial = spatial === 'alternate' ? Math.PI * (i % 2) : spatial === 'ripple' ? (TAU * i) / n : 0
        const a = th + phiPattern + phiSpatial
        let pan = 0
        let tilt = 0
        switch (pattern) {
            case 'sweep': case 'cross': pan = panDeg * Math.sin(a); break
            case 'nod': case 'wave': tilt = tiltDeg * Math.sin(a); break
            case 'circle': pan = panDeg * Math.sin(a); tilt = tiltDeg * Math.cos(a); break
            case 'figure8': pan = panDeg * Math.sin(a); tilt = tiltDeg * Math.sin(2 * a); break
            case 'fan': pan = n > 1 ? panDeg * ((2 * i) / (n - 1) - 1) : 0; break
            default: break
        }
        if (spatial === 'left-right' && fin(u.x, 0) < 0) pan = -pan
        out.set(u.id, { pan: pan + 0, tilt: tilt + 0 })
    })
    return out
}

/** The fastest the head turns, degrees per second, over the pattern (a check, not a clamp). Port of headPeakSpeed. */
export const headPeakSpeed = (heads) => {
    if (!heads || !HEAD_PATTERNS.includes(heads.pattern) || heads.pattern === 'fan') return 0
    const w = TAU / Math.max(1e-3, fin(heads.period_s, HEAD_DEFAULTS.period_s))
    const pan = fin(heads.pan_deg, 0)
    const tilt = fin(heads.tilt_deg, 0)
    const speed = { sweep: pan * w, cross: pan * w, nod: tilt * w, wave: tilt * w, circle: Math.hypot(pan * w, tilt * w), figure8: Math.hypot(pan * w, 2 * tilt * w) }
    return speed[heads.pattern] || 0
}

/** The sign that turns a WORLD offset into the fixture's own pan/tilt (derivation in the server file). */
export const headSigns = (hung) => (hung ? { pan: -1, tilt: 1 } : { pan: 1, tilt: -1 })

/** A look's heads, or null (a look from before this, or an unknown pattern, has none). */
export const headsOf = (look) => {
    const h = look?.heads
    return h && HEAD_PATTERNS.includes(h.pattern) ? h : null
}

/** [panRange, tiltRange] degrees of a type that has pan/tilt, else null (the same predicate deskLookValues.js uses). */
export const rangeOf = (type) => {
    const v = type?.pan_tilt_deg?.value
    return Array.isArray(v) && v.length >= 2 && Number(v[0]) > 0 && Number(v[1]) > 0 ? [Number(v[0]), Number(v[1])] : null
}

/**
 * The lamps a look moves, once per look (memoise on the look and the entities, not on the frame): the lit lamps of the
 * heads' kinds that have pan/tilt. `levelOf(entityId)` is the look's level for the lamp (0 = out: it takes no part, so
 * a fan or a ripple spreads over the lit heads only); `idOf(entity)` names the unit (the entity's id in the room, the
 * desk fixture id on the desk, null = not on the desk).
 */
export const headUnits = ({ entities, library, heads, levelOf = () => 1, idOf = (e) => e.id }) => {
    const kinds = new Set(heads?.kinds || [])
    const out = []
    for (const e of entities) {
        if (e?.type !== 'spotLight') continue
        const fx = e.components?.fixture
        if (!fx?.type || (kinds.size && !kinds.has(fx.type))) continue
        const range = rangeOf(typeById(library, fx.type))
        if (!range || !(levelOf(e.id) > 0)) continue
        const id = idOf(e)
        if (!id) continue
        const p = e.components?.transform?.position || [0, 0, 0]
        out.push({ id, x: round3(fin(p[0], 0)), z: round3(fin(p[2], 0)), hung: fx.hung === true, panRange: range[0], tiltRange: range[1] })
    }
    return out
}

/** The plan of a playing look: { heads, units } or null when it moves nothing. */
export const headPlan = ({ entities, library, look, levelOf }) => {
    const heads = headsOf(look)
    if (!heads) return null
    const units = headUnits({ entities, library, heads, levelOf })
    return units.length ? { heads, units } : null
}

/** Map(lamp id -> { pan, tilt } offsets, degrees) at server time `serverNow`; `epoch` = the server time the look was fired. */
export const headFrame = (plan, serverNow, epoch = 0) => (plan ? headOffsets(serverNow, epoch, plan.heads, plan.units) : new Map())

/** The desk look's heads: the config plus the units the desk needs (fixture ids, order keys, hung, ranges). Null when none move. */
export const deskHeadsOf = ({ entities, library, look, levelOf, idOf }) => {
    const heads = headsOf(look)
    if (!heads) return null
    const units = headUnits({ entities, library, heads, levelOf, idOf })
    return units.length ? { ...heads, units } : null
}

// A beam direction in the lamp's own pan/tilt, degrees from home, UNROUNDED (dmxPose.js panTiltOfBeam rounds to 0.01).
const fixturePanTilt = (dir, hung) => {
    const [x, y, z] = hung ? [-dir[0], -dir[1], dir[2]] : dir
    const len = Math.hypot(x, y, z) || 1
    const flat = Math.hypot(x, z)
    return { pan: flat < 1e-9 ? 0 : Math.atan2(x, z) / DEG, tilt: Math.acos(clamp(y / len, -1, 1)) / DEG }
}

/** The head's fixture pan/tilt (degrees from home) at a rest pose plus a world offset, clamped to the type's range. */
export const headPose = (rest, off, hung, range) => {
    const sign = headSigns(hung)
    return {
        pan: clamp(rest.pan + sign.pan * off.pan, -range[0] / 2, range[0] / 2),
        tilt: clamp(rest.tilt + sign.tilt * off.tilt, -range[1] / 2, range[1] / 2)
    }
}

const movedEntity = (e, off, library) => {
    if (!off || (off.pan === 0 && off.tilt === 0)) return e
    const fx = e.components?.fixture
    const type = typeById(library, fx?.type)
    const range = rangeOf(type)
    if (e.type !== 'spotLight' || !range) return e
    const t = e.components?.transform || {}
    const hung = fx.hung === true
    const restBeam = spotAimDirection(t.rotation || [0, 0, 0])
    const pose = headPose(fixturePanTilt(restBeam, hung), off, hung, range)
    const dir = beamOfPanTilt(pose.pan, pose.tilt, hung)
    const mount = mountFromLens({ lens: t.position || [0, 0, 0], hung, beam: restBeam, type })
    return {
        ...e,
        components: {
            ...e.components,
            transform: { ...t, position: lensFromMount({ mount, hung, beam: dir, type }).map(round3), rotation: rotationFromPanTilt(panTiltOfDirection(dir)) }
        }
    }
}

/**
 * The entities with each moving head turned by its offset. `skip` = ids the DESK moves (their DMX already holds the
 * offsets). Unmoved lamps keep their object, and a frame with nothing to turn returns the same array.
 */
export const withHeads = (entities, frame, { library, skip = null } = {}) => {
    if (!frame?.size) return entities
    let changed = false
    const out = entities.map((e) => {
        const off = frame.get(e.id)
        if (!off || (skip && skip.has(e.id))) return e
        const moved = movedEntity(e, off, library)
        if (moved !== e) changed = true
        return moved
    })
    return changed ? out : entities
}
