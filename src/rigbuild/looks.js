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
import { AIM_RULES, aimDirection, panTiltOfDirection } from './lookRules.js'

export const DESK_LOOK_PREFIX = 'rig-'
export const deskLookId = (lookId) => `${DESK_LOOK_PREFIX}${lookId}`.slice(0, 40)
export const lookIdOfDesk = (deskId) => (typeof deskId === 'string' && deskId.startsWith(DESK_LOOK_PREFIX) ? deskId.slice(DESK_LOOK_PREFIX.length) : null)

/** A position's key in a look: truss runs are all "truss"; the rest by their id. */
export const positionKey = (positionId) => (String(positionId).startsWith('truss:') ? 'truss' : String(positionId))

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
    return {
        axis: stage.axis,
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
export const lookPoses = ({ entities = [], library, lookId, rigLooks = null }) => {
    const looks = rigLooks || rigLooksOf(entities)
    const look = looks?.looks?.find((l) => l.id === lookId)
    const ctx = lookFrame(entities)
    const out = new Map()
    if (!look || !ctx) return out
    const positions = positionsOf(entities)
    const lamps = plotData({ entities, library }).lamps
    const fill = fillOf(positions, lamps)
    const byEntity = new Map(entities.map((e) => [e.id, e]))
    const lampById = new Map(lamps.map((l) => [l.id, l]))
    const groups = new Map()
    for (const p of positions) {
        for (const s of p.slots) {
            const id = fill.get(`${p.id}/${s.id}`)
            if (!id) continue
            const type = byEntity.get(id)?.components?.fixture?.type
            const key = `${positionKey(p.id)}/${type}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push({ id, slot: s })
        }
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
            const answer = rule({ pos: lamp.mount, orient: hung ? 'hung' : 'floor', column: { faceX: nearestFace(slot) } }, { rank, n: members.length }, ctx, aim)
            const dir = aimDirection(answer, from)
            if (!dir) return
            const { pan, tilt } = panTiltOfDirection(dir)
            out.set(id, {
                position: lensFromMount({ mount: lamp.mount, hung, beam: dir, type }).map((v) => Math.round(v * 1000) / 1000),
                rotation: rotationFromPanTilt({ pan, tilt }),
                color: look.colours?.[key] || null,
                // `solo`: only the lamp of that rank keeps the level (rig-lib.mjs, the same rank).
                level: Number.isInteger(aim.solo) && rank !== aim.solo ? 0 : levelOfKey(look, key),
                pan: Math.round(pan * 10) / 10,
                tilt: Math.round(tilt * 10) / 10,
                rule: aim.rule
            })
        })
    }
    return out
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
                ...atLevel(lit, p.level)
            }
        }
    })
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
