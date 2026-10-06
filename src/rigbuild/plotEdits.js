// THE PLOT'S WRITES — every change view B makes, as ops. Pure: the document in,
// ops out; the surface applies them through the op log like the Studio does, so
// the Studio, the patch sheet and the room see the same thing.
// docs/architecture/RIG_BUILD.md §10.

import { catalogueHeightOf, pieceHeightOf, pieceKindOf, pieceOf } from './pieces.js'
import { layRun, lampTransform, piecesOf, ridersOf } from './plotGeometry.js'
import { plotData } from './sheet.js'
import { rotateY } from './snap.js'
import { EFFECT_CATEGORIES } from './plotSymbols.js'

const r3 = (v) => Math.round(v * 1000) / 1000
const byIdOf = (entities) => new Map(entities.map((e) => [e.id, e]))

// A browser cannot run more than a handful of real spot lights (RIG_BUILD.md, the
// MOXIR note: 90 real = 1 fps, 8 real + 82 beam-only = 240 fps on an RTX 3080), so
// a lamp placed past this many real ones draws its beam and casts no light.
export const REAL_LIGHT_BUDGET = 8

export const PIECE_COLOUR = '#8a8f98'

/** A piece entity (its body is the catalogue GLB, uploaded as `assetId`). */
export const pieceEntity = ({ id, kind, position, yaw = 0, height = null, name = '', assetId = null }) => {
    const base = catalogueHeightOf(kind)
    const sy = base && height ? r3(height / base) : 1
    return {
        id,
        type: 'model',
        // A tower or deck built to its own height is not the catalogue's "6 m": name it plainly.
        name: name || (pieceOf(kind).category === 'truss' ? 'truss' : pieceOf(kind).category),
        components: {
            transform: { position: position.map(r3), rotation: [0, yaw, 0], scale: [1, sy, 1] },
            media: { assetId },
            appearance: { color: PIECE_COLOUR, opacity: 1 },
            piece: { kind }
        }
    }
}

const realLights = (entities) => entities.filter((e) => e.type === 'spotLight' && e.components?.beam?.only !== true).length

/** Light settings for a new lamp: a lamp of the same type in the room lends its own; else from the type. */
const lightFor = (entities, type) => {
    const twin = entities.find((e) => e.type === 'spotLight' && e.components?.fixture?.type === type.id && e.components?.light)
    const beamDeg = Number(type.optics?.beam_deg) || 20
    const light = twin
        ? { ...twin.components.light }
        : { color: '#ffffff', intensity: 400, distance: 30, angle: r3(Math.max(0.01, (beamDeg * Math.PI) / 360)), penumbra: 0.2, decay: 2 }
    const only = realLights(entities) >= REAL_LIGHT_BUDGET
    return { light, beam: { visible: true, haze: twin?.components?.beam?.haze ?? 0.6, ...(only ? { only: true } : {}) } }
}

/**
 * A new lamp: a spotLight carrying the plot's fixture record. Its entity position is
 * the LENS (lampGeometry.js), derived from the mount the plot placed.
 */
export const lampEntity = ({ id, type, mount, hung = false, position = '', unit = null, entities = [], mode = null }) => {
    const effect = !type.optics?.beam_deg && EFFECT_CATEGORIES.has(type.category)
    const fixture = { type: type.id, ...(mode || type.defaultMode ? { mode: mode || type.defaultMode } : {}), ...(position ? { position } : {}), ...(unit ? { unit } : {}), ...(hung ? { hung: true } : {}) }
    const transform = lampTransform({ mount, hung, type })
    if (effect) {
        // An effect is a DMX device with a body and no beam (moxir.mjs does the same).
        return { id, type: 'group', name: `${type.code} ${position || ''} ${unit || ''}`.replace(/\s+/g, ' ').trim(), components: { transform, fixture } }
    }
    return {
        id,
        type: 'spotLight',
        name: `${type.code} ${position || ''} ${unit || ''}`.replace(/\s+/g, ' ').trim(),
        components: { transform, appearance: { color: '#ffffff', opacity: 1 }, ...lightFor(entities, type), fixture }
    }
}

export const createOps = (entities) => entities.map((entity) => ({ type: 'createEntity', payload: { entity } }))

const setTransform = (entity, patch) => ({ type: 'updateComponent', payload: { entityId: entity.id, component: 'transform', patch } })

/** The lamps riding on the given pieces (hung at their slots, standing on their tops). */
export const ridersOfIds = (entities, ids, library) => {
    const lamps = plotData({ entities, library }).lamps
    const pieces = piecesOf(entities).filter((p) => ids.includes(p.id))
    const out = new Set()
    for (const p of pieces) for (const id of ridersOf(p, lamps)) out.add(id)
    for (const id of ids) out.delete(id)
    return [...out]
}

/**
 * Move entities by `delta` [dx, dy, dz] metres — pieces, lamps and anything with a
 * transform. Riders are the caller's to include (ridersOfIds).
 */
export const moveOps = (entities, ids, delta) => {
    const byId = byIdOf(entities)
    return ids.map((id) => byId.get(id)).filter(Boolean).map((e) => {
        const p = e.components?.transform?.position || [0, 0, 0]
        return setTransform(e, { position: [r3(p[0] + delta[0]), r3(p[1] + (delta[1] || 0)), r3(p[2] + delta[2])] })
    })
}

/** Put one entity at a pose (the result of snap()), with a new height for a tower/deck. */
export const placeOps = (entity, { position, yaw = null, height = null }) => {
    const t = entity.components?.transform || {}
    const patch = { position: position.map(r3) }
    if (yaw != null) patch.rotation = [t.rotation?.[0] || 0, yaw, t.rotation?.[2] || 0]
    const kind = pieceKindOf(entity)
    const base = kind ? catalogueHeightOf(kind) : null
    if (base && height != null) patch.scale = [t.scale?.[0] ?? 1, r3(height / base), t.scale?.[2] ?? 1]
    return [setTransform(entity, patch)]
}

/**
 * Turn entities about a centre [x, z] on the plan by `angle` radians (three.js yaw
 * sense). Pieces turn their heading too; a lamp's own aim is left as it was (a
 * focus is a look's, not the plot's).
 */
export const rotateOps = (entities, ids, angle, centre) => {
    const byId = byIdOf(entities)
    return ids.map((id) => byId.get(id)).filter(Boolean).map((e) => {
        const t = e.components.transform
        const p = t.position || [0, 0, 0]
        const r = rotateY([p[0] - centre[0], 0, p[2] - centre[1]], angle)
        const patch = { position: [r3(centre[0] + r[0]), p[1], r3(centre[1] + r[2])] }
        if (pieceKindOf(e)) patch.rotation = [t.rotation?.[0] || 0, Math.round(((t.rotation?.[1] || 0) + angle) * 1e9) / 1e9, t.rotation?.[2] || 0]
        return setTransform(e, patch)
    })
}

export const deleteOps = (ids) => ids.map((entityId) => ({ type: 'deleteEntity', payload: { entityId } }))

/**
 * A piece's height typed in the inspector: a truss is raised (its riders with it);
 * a tower or a deck is built to that height (its riders on its top go up with it).
 */
export const heightOps = (entities, id, height, library) => {
    const byId = byIdOf(entities)
    const e = byId.get(id)
    const kind = pieceKindOf(e)
    if (!kind || !(height > 0)) return []
    const riders = ridersOfIds(entities, [id], library)
    if (pieceOf(kind).category === 'truss') {
        const dy = r3(height - e.components.transform.position[1])
        return [...moveOps(entities, [id], [0, dy, 0]), ...moveOps(entities, riders, [0, dy, 0])]
    }
    const dy = r3(height - pieceHeightOf(e))
    return [...placeOps(e, { position: e.components.transform.position, height }), ...moveOps(entities, riders, [0, dy, 0])]
}

/**
 * A truss run typed to a new length: the run is laid again from its first end along
 * its heading in stock segments; its name, height and riders are kept (a rider past
 * the new end stays where it was, and the plot shows it off the truss).
 */
export const runLengthOps = ({ entities, run, length, newId, assetFor }) => {
    const byId = byIdOf(entities)
    const first = byId.get(run.ids[0])
    const dir = [run.to[0] - run.from[0], run.to[1] - run.from[1]]
    const l = Math.hypot(dir[0], dir[1]) || 1
    const to = [run.from[0] + (dir[0] / l) * length, run.from[1] + (dir[1] / l) * length]
    const segments = layRun({ from: run.from, to, y: run.height, length, angleStepDeg: 0 })
    const created = segments.map((s) => pieceEntity({ id: newId(), kind: s.kind, position: s.position, yaw: s.yaw, name: first?.name || run.name, assetId: assetFor(s.kind) }))
    return [...deleteOps(run.ids), ...createOps(created)]
}

/** Rename a position: the piece(s) carrying it and every lamp that names it. */
export const renamePositionOps = (entities, { pieceIds = [], from, to }) => {
    const ops = pieceIds.map((entityId) => ({ type: 'updateEntity', payload: { entityId, patch: { name: to } } }))
    if (from) {
        for (const e of entities) {
            if (e.components?.fixture?.position === from) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'fixture', patch: { position: to } } })
        }
    }
    return ops
}

export const fixtureOps = (ids, patch) => ids.map((entityId) => ({ type: 'updateComponent', payload: { entityId, component: 'fixture', patch } }))
