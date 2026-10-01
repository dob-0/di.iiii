// LOOKS — the rig's designed looks as data, evaluated on the lamps the cards dealt.
// docs/architecture/RIG_BUILD.md §11.4. Pure.
//
// `components.rigLooks` on the show's entity (RIG_SHOW_ID) holds each look as the rig
// file wrote it — a rule and its numbers per group, a colour per group — with the group
// named by WHERE it hangs and WHAT it is: `${position}/${type}` ("column-bases/up-b380f",
// "truss/up-250bsw"). scripts/rigbuild/looks.mjs writes it from the rig file.
//
// A look lands in three places, one meaning each:
//   the DESK    a look of the desk's own model (serverXR/src/lighting/looks.js), id
//               `rig-<look>`, over this room's patched fixtures — what a cue fires and
//               the engineers' console sees on its cue layer. Its per-fixture DMX
//               values need each type's channel list (which channel is pan, tilt,
//               colour); for MOXIR every list is OWED, so the desk look carries the
//               fixtures and no values, and says so.
//   the ROOM    each lamp posed by the rule (pan, tilt) and lit in the look's colour —
//               a view while the look is live on the desk, never written;
//   the PLOT    unchanged: focus is a look's, not the plot's (§10.4) — unless someone
//               asks to rest the room on a look (restOps), which writes it as ops.

import { rotationFromPanTilt } from '../project/viewport/spotLightAim.js'
import { lensFromMount } from './lampGeometry.js'
import { typeById } from './fixtureTypes.js'
import { plotData } from './sheet.js'
import { piecesOf } from './plotGeometry.js'
import { venueOf } from './venuePlan.js'
import { fillOf, positionsOf, stageFrameOf } from './positions.js'
import { positionOfWords } from './mountPosition.js'
import { AIM_RULES, aimDirection, panTiltOfDirection } from './lookRules.js'

export const DESK_LOOK_PREFIX = 'rig-'
export const deskLookId = (lookId) => `${DESK_LOOK_PREFIX}${lookId}`.slice(0, 40)
export const lookIdOfDesk = (deskId) => (typeof deskId === 'string' && deskId.startsWith(DESK_LOOK_PREFIX) ? deskId.slice(DESK_LOOK_PREFIX.length) : null)

/** A position's key in a look: truss runs are all "truss"; the rest by their id. */
export const positionKey = (positionId) => (String(positionId).startsWith('truss:') ? 'truss' : String(positionId).startsWith('truss-top:') ? 'truss-top' : String(positionId))

export const rigLooksOf = (entities = []) => {
    const entity = entities.find((e) => Array.isArray(e?.components?.rigLooks?.looks)) || null
    return entity ? entity.components.rigLooks : null
}

/** The frame the rules need, from the document: the riser, the backdrop, the roof. */
export const lookFrame = (entities = []) => {
    const pieces = piecesOf(entities)
    const { plan } = venueOf(entities)
    const stage = stageFrameOf({ pieces, plan })
    if (!stage) return null
    const behind = (plan?.solids || []).filter((s) => {
        const [x0, z0, x1, z1] = s.rect
        const near = stage.into > 0 ? z1 <= stage.back + 0.01 && z1 >= stage.back - 4 : z0 >= stage.back - 0.01 && z0 <= stage.back + 4
        return near && x1 > stage.rect[0] - 6 && x0 < stage.rect[2] + 10
    })
    const boxes = behind.map((s) => ({ id: s.id, x_m: [s.rect[0], s.rect[2]], z_m: [s.rect[1], s.rect[3]], y_m: [0, s.top || 0] }))
    const under = boxes.filter((b) => b.x_m[1] > stage.rect[0] && b.x_m[0] < stage.rect[2])
    const face = boxes.length ? (stage.into > 0 ? Math.max(...boxes.map((b) => b.z_m[1])) : Math.min(...boxes.map((b) => b.z_m[0]))) : null
    const wall = under.length ? (stage.into > 0 ? Math.max(...under.map((b) => b.z_m[1])) : Math.min(...under.map((b) => b.z_m[0]))) : (face ?? stage.back - stage.into)
    const runway = (plan?.overhead || []).find((o) => /runway/.test(o.id))?.bottom
    const roof = (plan?.overhead || []).find((o) => /lantern/.test(o.id))?.bottom
    // The crane bridge nearest the stage (the plan's overhead `crane-*` lines): the rule
    // 'bridge-underside' grazes it.
    const cranes = (plan?.overhead || []).filter((o) => /^crane-/.test(o.id) && Array.isArray(o.line))
        .map((o) => ({ z_m: o.line[0][1], girder_bottom_m: o.bottom }))
    const crane = cranes.length ? cranes.sort((a, b) => Math.abs(a.z_m - stage.front) - Math.abs(b.z_m - stage.front))[0] : null
    return {
        axis: stage.axis,
        crane,
        stage: { ...stage, wall, backdrop: boxes.length ? { face, boxes } : null },
        hall: { geometry: { runway_bottom_m: runway || 6, truss_top_centre_m: roof || 12 } }
    }
}

const nearestFace = (slot) => {
    const c = slot.column
    if (!c) return null
    const [x, , w = 0.8] = c
    const faces = [x - w / 2, x + w / 2]
    return faces.reduce((a, b) => (Math.abs(b - slot.pos[0]) < Math.abs(a - slot.pos[0]) ? b : a))
}

/**
 * Every lamp's pose in a look: Map(entityId → { position (the lens), rotation, color,
 * pan, tilt, rule }). Lamps not on a position, or on a group the look does not name,
 * are left out (they keep their own).
 */
// The positions a rig names for itself (scripts/rigbuild/moxir.mjs writes "halo <group id in
// words>"; looks.mjs keys the same group "halo-<group id>").
export const namedPositionKey = (fixture) => {
    const p = typeof fixture?.position === 'string' ? fixture.position.trim() : ''
    return /^halo /.test(p) ? p.replace(/\s+/g, '-') : null
}

export const lookPoses = ({ entities = [], library, lookId, rigLooks = null }) => {
    const looks = rigLooks || rigLooksOf(entities)
    const look = looks?.looks?.find((l) => l.id === lookId)
    const ctx = lookFrame(entities)
    const out = new Map()
    if (!look || !ctx) return out
    const lamps = plotData({ entities, library }).lamps
    const positions = positionsOf(entities, lamps)
    const fill = fillOf(positions, lamps)
    const byEntity = new Map(entities.map((e) => [e.id, e]))
    const lampById = new Map(lamps.map((l) => [l.id, l]))
    const groups = new Map()
    // A lamp the rig NAMED a position for (`fixture.position` "halo <group>", RIG_BUILD.md §15.8:
    // the halo's corners and sides are no derived slot) is grouped by that name, wherever the
    // derived positions would put it.
    const named = new Set()
    for (const l of lamps) {
        const e = byEntity.get(l.id)
        const key = namedPositionKey(e?.components?.fixture)
        if (!key) continue
        named.add(l.id)
        const k = `${key}/${e.components.fixture.type}`
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push({ id: l.id, slot: { pos: l.mount } })
    }
    const placed = new Set(named)
    for (const p of positions) {
        for (const s of p.slots) {
            const id = fill.get(`${p.id}/${s.id}`)
            if (!id || named.has(id)) continue
            const type = byEntity.get(id)?.components?.fixture?.type
            const key = `${positionKey(p.id)}/${type}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push({ id, slot: s })
            placed.add(id)
        }
    }
    // A lamp no derived slot holds — a mover standing near, not on, a column base or behind the
    // press — is placed by the mount its `fixture.position` names, the same table the looks were
    // keyed by (mountPosition.js). Without this it was in no look at all: every beam that stands
    // off a derived slot stayed dark in every look, on the desk and in the room (MOXIR 2026-10-01).
    for (const l of lamps) {
        if (placed.has(l.id)) continue
        const fixture = byEntity.get(l.id)?.components?.fixture
        const where = positionOfWords(fixture?.position)
        if (!where || !fixture?.type) continue
        const key = `${where}/${fixture.type}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ id: l.id, slot: { pos: l.mount } })
    }
    for (const [key, members] of groups) {
        const aim = look.aims?.[key]
        const rule = aim && AIM_RULES[aim.rule]
        if (!rule) continue
        members.sort((a, b) => a.slot.pos[0] - b.slot.pos[0] || a.slot.pos[2] - b.slot.pos[2] || a.slot.pos[1] - b.slot.pos[1])
        members.forEach(({ id, slot }, rank) => {
            const lamp = lampById.get(id)
            const entity = byEntity.get(id)
            const type = typeById(library, entity.components.fixture.type)
            const hung = lamp.hung
            const tiltY = Number(type?.model3d?.tiltY) || 0
            const from = [lamp.mount[0], lamp.mount[1] + (hung ? -tiltY : tiltY), lamp.mount[2]]
            // `rest_up: 1` with a solo: the dark lamps stand straight up (rig-lib.mjs, the same)
            const answer = aim.rest_up === 1 && !soloKeeps(aim, rank)
                ? { dir: [0, hung ? -1 : 1, 0] }
                : rule({ pos: lamp.mount, orient: hung ? 'hung' : 'floor', column: { faceX: nearestFace(slot) } }, { rank, n: members.length }, ctx, aim)
            const dir = aimDirection(answer, from)
            if (!dir) return
            const { pan, tilt } = panTiltOfDirection(dir)
            out.set(id, {
                position: lensFromMount({ mount: lamp.mount, hung, beam: dir, type }).map((v) => Math.round(v * 1000) / 1000),
                rotation: rotationFromPanTilt({ pan, tilt }),
                color: look.colours?.[key] || null,
                // `solo`: only the lamp of that rank keeps the level (rig-lib.mjs, the same rank).
                level: soloKeeps(aim, rank) ? levelOfKey(look, key) : 0,
                pan: Math.round(pan * 10) / 10,
                tilt: Math.round(tilt * 10) / 10,
                rule: aim.rule
            })
        })
    }
    return out
}

/**
 * Does the lamp of this rank keep its group's level in this aim (rig-lib.mjs `soloKeeps`, the same
 * rule): `solo` one rank, `solo_mask` several (bit r = rank r — a number, since the schema keeps only
 * numeric aim parameters), neither every lamp.
 */
export const soloKeeps = (aim, rank) => {
    if (Number.isInteger(aim?.solo_mask)) return rank >= 0 && rank < 31 && ((aim.solo_mask >> rank) & 1) === 1
    if (Number.isInteger(aim?.solo)) return rank === aim.solo
    return true
}

/** A look's level for a group key, 0..1 (RIG_BUILD.md §15); a group it does not name is at full. */
export const levelOfKey = (look, key) => {
    const v = Number(look?.levels?.[key])
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

// A lamp at a look's level: its light and the haze of its cone scaled. The cone is kept
// (at haze 0 it is unseen): a beam-only lamp whose beam were hidden would become a REAL
// light (spotBeam.js beamCastsLight).
const HAZE_DEFAULT = 0.4 // spotBeam.js DEFAULT_HAZE — what an unset haze draws as
const atLevel = (components, level) => {
    if (level === 1 || level == null) return {}
    const out = {}
    if (components.light) out.light = { ...components.light, intensity: Math.round((Number(components.light.intensity) || 0) * level * 100) / 100 }
    if (components.beam) out.beam = { ...components.beam, haze: Math.round((Number.isFinite(components.beam.haze) ? components.beam.haze : HAZE_DEFAULT) * level * 1000) / 1000 }
    return out
}

/** The entities as the room should draw them in a look (the document is not touched). */
export const posedEntities = (entities, poses) => {
    if (!poses?.size) return entities
    return entities.map((e) => {
        const p = poses.get(e.id)
        if (!p || e.type !== 'spotLight') return e
        const t = e.components.transform || {}
        const lit = p.color && e.components.light ? { ...e.components, light: { ...e.components.light, color: p.color } } : e.components
        return {
            ...e,
            components: {
                ...lit,
                transform: { ...t, position: p.position, rotation: p.rotation },
                ...atLevel(lit, p.level),
                // A view-only note for the lamp's body (rigBodyLamps): how lit its lens is.
                rigShown: { level: p.level ?? 1 }
            }
        }
    })
}

// ---- FADES: the room between two looks (RIG_BUILD.md §15.6) -------------------------
// A cue fires with a fade; the desk says which look it came from and when (GET
// /light/api/dmx `from`, `since`, `fadeMs`). The room draws every lamp part-way: its
// lens position, its aim, its colour, its light and its haze, mixed by t in 0..1. Pure.

const lerp = (a, b, t) => a + (b - a) * t
const hexRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
export const mixColour = (a, b, t) => {
    const x = hexRgb(a)
    const y = hexRgb(b)
    if (!x || !y) return t < 0.5 ? a : b
    return rgbHex(x.map((v, i) => lerp(v, y[i], t)))
}
// An angle the short way round, so a head does not spin 350° to turn 10°.
const lerpAngle = (a, b, t) => {
    let d = (b - a) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return a + d * t
}
const mixVec = (a, b, t, angle = false) => (Array.isArray(a) && Array.isArray(b) && a.length === b.length
    ? a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? (angle ? lerpAngle(v, b[i], t) : lerp(v, b[i], t)) : (t < 0.5 ? v : b[i])))
    : (t < 0.5 ? a : b))
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** Two drawings of the same room (`from`, `to`: entity lists, same order), t of the way from one to the other. */
export const blendEntities = (from, to, t) => {
    if (!(t < 1)) return to
    if (!(t > 0)) return from
    const byId = new Map(from.map((e) => [e.id, e]))
    return to.map((b) => {
        const a = byId.get(b.id)
        if (!a || a === b || b.type !== 'spotLight') return b
        const ca = a.components
        const cb = b.components
        const out = { ...cb }
        if (ca.transform && cb.transform) {
            out.transform = {
                ...cb.transform,
                position: mixVec(ca.transform.position, cb.transform.position, t),
                rotation: mixVec(ca.transform.rotation, cb.transform.rotation, t, true)
            }
        }
        if (ca.light && cb.light) {
            out.light = { ...cb.light, intensity: lerp(num(ca.light.intensity), num(cb.light.intensity), t), color: mixColour(ca.light.color, cb.light.color, t) }
        }
        if (ca.beam && cb.beam) out.beam = { ...cb.beam, haze: lerp(num(ca.beam.haze, HAZE_DEFAULT), num(cb.beam.haze, HAZE_DEFAULT), t) }
        if (ca.rigShown || cb.rigShown) out.rigShown = { ...(cb.rigShown || {}), level: lerp(num(ca.rigShown?.level, 1), num(cb.rigShown?.level, 1), t) }
        if (ca.appearance && cb.appearance) out.appearance = { ...cb.appearance, opacity: lerp(num(ca.appearance.opacity, 1), num(cb.appearance.opacity, 1), t) }
        return { ...b, components: out }
    })
}

// ---- THE BAKED WASH follows the look (RIG_BUILD.md §15.6) -----------------------------
// The PARs that are not real lights put their light on the columns and the press as ONE
// baked mesh (`rig-wash`, wash-glb.mjs), baked for one look. While a look plays, the
// room draws that mesh at the look's level for the washing groups (the PARs on the
// column faces and at the press) — out in a look that has them out, so a dark look does
// not keep lit columns. The bake's colour is the baked look's: a look that washes in
// ANOTHER colour would need its own bake (owed; MOXIR's looks wash in red or not at all).
export const WASH_ENTITY_ID = 'rig-wash'
const WASH_POSITIONS = new Set(['column-faces', 'outer-columns', 'backdrop', 'dance-columns'])
// Only the lamps whose light the bake paints — the PARs — steer its level. A moving head standing
// at a washing position (the ground versions' column-base and backdrop movers) is its own beam and
// not part of the wash: counting it kept the columns glowing in scenes whose PARs were out
// (measured on the ground versions' scenes, 2026-09-30). A key with no type keeps the old rule.
const WASH_TYPES = new Set(['up-pl5403'])
export const washLevelOf = (look) => {
    if (!look) return 1
    const keys = Object.keys(look.aims || {}).filter((k) => {
        const [position, type] = k.split('/')
        return WASH_POSITIONS.has(position) && (type === undefined || WASH_TYPES.has(type))
    })
    if (!keys.length) return 1
    return Math.max(...keys.map((k) => levelOfKey(look, k)))
}
export const withWashLevel = (entities, level) => {
    if (!(level < 1)) return entities
    return entities.map((e) => (e.id !== WASH_ENTITY_ID ? e : {
        ...e,
        components: {
            ...e.components,
            appearance: { ...(e.components.appearance || {}), opacity: Math.max(0, level) },
            ...(level <= 0 ? { runtime: { ...(e.components.runtime || {}), visible: false } } : {})
        }
    }))
}

// ---- ONE WASH PER LOOK (RIG_BUILD.md §15.13) ------------------------------------------
// The single `rig-wash` is baked for ONE look: every other scene showed that look's lamps in
// that look's colour, or nothing. `rig.mjs --wash-per-look` bakes one mesh PER LOOK instead,
// entity `rig-wash:<lookId>`, written hidden (runtime.visible false). While a look plays the
// room shows that look's wash at full — the bake already holds the look's levels and colours,
// so no level multiplies it — and over a cue's fade cross-fades the previous look's out
// (opacity 1 − t) as the new one comes in (opacity t). Where a playing look has no wash of
// its own, the single `rig-wash` (at the look's PAR level, withWashLevel) is the fallback;
// where a project has no per-look wash at all, nothing here changes: the single wash is
// drawn exactly as before. Pure.
export const WASH_ENTITY_PREFIX = `${WASH_ENTITY_ID}:`
export const washEntityId = (lookId) => `${WASH_ENTITY_PREFIX}${lookId}`
export const lookIdOfWash = (id) => (typeof id === 'string' && id.startsWith(WASH_ENTITY_PREFIX) && id.length > WASH_ENTITY_PREFIX.length ? id.slice(WASH_ENTITY_PREFIX.length) : null)
/** Any baked wash: the single one or a per-look one. */
export const isWashEntityId = (id) => id === WASH_ENTITY_ID || lookIdOfWash(id) !== null
// Every project's wash bytes together (every `rig-wash*` asset) stop here: 11 looks × ~115 KB is
// ~1.3 MB, and a room that loads 2 MB of decals before it draws is a room that opens late.
export const WASH_BYTES_CAP = 2 * 1024 * 1024

/** Map(lookId → wash entity) of the per-look washes a document carries. */
export const perLookWashesOf = (entities = []) => {
    const out = new Map()
    for (const e of entities) {
        const lookId = lookIdOfWash(e?.id)
        if (lookId) out.set(lookId, e)
    }
    return out
}

// A wash entity whose asset the document does not hold draws nothing (an uploaded model the
// asset list does not name: §15.6's second trap) — treated as missing, so the fallback shows.
const washHeld = (entity, assetIds) => {
    if (!assetIds) return true
    const assetId = entity?.components?.media?.assetId
    return Boolean(assetId) && assetIds.has(assetId)
}

const washAt = (e, opacity) => ({
    ...e,
    components: {
        ...e.components,
        appearance: { ...(e.components.appearance || {}), opacity: Math.max(0, Math.min(1, opacity)) },
        runtime: { ...(e.components.runtime || {}), visible: opacity > 0 }
    }
})

/**
 * The washes as the room draws them between two looks: the wash of `toLookId` at t, the wash
 * of `fromLookId` at 1 − t, every other per-look wash hidden. `assets` (the document's asset
 * list, optional) says which washes are really there. Returns the same array when there is
 * nothing to do (no per-look wash, or no look playing), so a memo sees no change.
 */
export const withLookWash = (entities, { fromLookId = '', toLookId = '', t = 1, assets = null } = {}) => {
    const perLook = perLookWashesOf(entities)
    if (!perLook.size || !toLookId) return entities
    const held = Array.isArray(assets) ? new Set(assets.map((a) => a?.id).filter(Boolean)) : null
    const has = (lookId) => Boolean(lookId) && perLook.has(lookId) && washHeld(perLook.get(lookId), held)
    const tt = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1
    const fading = tt < 1 && fromLookId && fromLookId !== toLookId
    const toHas = has(toLookId)
    const fromHas = fading && has(fromLookId)
    return entities.map((e) => {
        const lookId = lookIdOfWash(e.id)
        if (lookId) {
            if (toHas && lookId === toLookId) return washAt(e, fading ? tt : 1)
            if (fromHas && lookId === fromLookId) return washAt(e, 1 - tt)
            return washAt(e, 0)
        }
        // The single wash: hidden while a per-look wash carries the look, and — the fallback —
        // left as withWashLevel drew it while the playing look has none of its own. Over a
        // fade between a look with its own wash and one without, it is the other half of the
        // cross-fade (1 − t into a look with its own, t out of one), so the columns never lose
        // the wash for a frame; its own level (withWashLevel) scales it.
        if (e.id === WASH_ENTITY_ID) {
            if (fading && toHas !== fromHas) {
                const own = Number.isFinite(Number(e.components?.appearance?.opacity)) ? Number(e.components.appearance.opacity) : 1
                return washAt(e, own * (toHas ? 1 - tt : tt))
            }
            return toHas ? washAt(e, 0) : e
        }
        return e
    })
}

// ---- STROBES AND BLINDERS read as a FLASH, not a cone (RIG_BUILD.md §15.6) ------------
// A strobe is a white flash of a few milliseconds and a blinder a warm face: neither
// throws a beam you can see standing in the haze. Drawn as the other lamps are, a 60°
// strobe became a huge flat grey cone and (as a real light at planning candela) a white
// floor. In the room they draw NO cone and NO light of their own: the beam is kept
// `only` at haze 0 (spotBeam.js: no light; SpotLightObject: no cone at opacity 0), and
// RigFlashes.jsx draws the face and the pulse from `rigFlash`. A view; never written.
export const FLASH_CATEGORIES = new Set(['strobe', 'blinder'])
export const flashKindOf = (library, typeId) => {
    const c = typeById(library, typeId)?.category
    return FLASH_CATEGORIES.has(c) ? c : null
}
export const flashEntities = (entities, library) => {
    let changed = false
    const out = entities.map((e) => {
        if (e.type !== 'spotLight') return e
        const kind = flashKindOf(library, e.components?.fixture?.type)
        if (!kind) return e
        changed = true
        // A strobe fires only when a LOOK puts it on (posedEntities' rigShown): at rest —
        // no look playing — it is dark, as a real one is until the desk says otherwise.
        const level = e.components.rigShown ? num(e.components.rigShown.level, 1) : 0
        return {
            ...e,
            components: {
                ...e.components,
                beam: { ...(e.components.beam || {}), visible: true, only: true, haze: 0 },
                rigFlash: { kind, level: num(e.components.light?.intensity) > 0 ? level : 0 }
            }
        }
    })
    return changed ? out : entities
}

/** Rest the room on a look: its aims and colours written into the document, as ops. */
export const restOps = (entities, poses) => {
    const ops = []
    for (const e of entities) {
        const p = poses.get(e.id)
        if (!p || e.type !== 'spotLight') continue
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: { position: p.position, rotation: p.rotation } } })
        // Aims and colours only. A look's LEVEL is not rested: the document holds no lamp's
        // nominal intensity to come back to, so writing 0 would be a one-way door (the desk
        // holds levels; the room shows them while the look plays).
        if (p.color && e.components.light) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'light', patch: { color: p.color } } })
    }
    return ops
}

/**
 * The desk's looks for this room: one per designed look, over the room's patched
 * fixtures (GET /light/api/rig), in the desk's own model. Values: none — the channel
 * lists that say which DMX channel is pan, tilt or colour are owed (RIG_BUILD.md §9).
 */
export const deskLooks = (rigLooks, deskFixtures = []) => (rigLooks?.looks || []).map((l) => ({
    id: deskLookId(l.id),
    name: l.title || l.id,
    kind: 'all',
    fixtures: deskFixtures.map((f) => f.id).filter(Boolean),
    steps: [{ values: {} }]
}))
