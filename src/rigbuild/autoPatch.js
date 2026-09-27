// AUTO-PATCH, the room's side. docs/architecture/RIG_BUILD.md §4.
//
// The room's lamps (entities with `components.fixture.type`) are sent to the desk's
// `POST /light/api/rig/patch`; the desk allocates with its own nextFreeAddress and
// answers; the answer comes back into the document as ordinary `updateComponent`
// ops (index, universe, address, and the mode when the type's default was used).
// Everything here but `autoPatch` itself is pure.
//
// Flags are never written into the document. They are recomputed wherever they are
// shown (the sheet, a view), from the document and — when a desk is here — its answer.

import { footprintOf, modeOf, typeById, typeFlags } from './fixtureTypes.js'

export const rigKeyOf = (projectId, entityId) => `${projectId}:${entityId}`

export const isLamp = (entity) => typeof entity?.components?.fixture?.type === 'string' && entity.components.fixture.type !== ''

/**
 * The lamps of a room, each with its type and mode resolved and its local flags.
 * @returns {{entity, fixture, type, mode, footprint, flags}[]}
 */
export const lampsOf = (entities = [], library) => entities.filter(isLamp).map((entity) => {
    const fixture = entity.components.fixture
    const type = typeById(library, fixture.type)
    const mode = type ? modeOf(type, fixture.mode) : null
    return {
        entity,
        fixture,
        type,
        mode,
        footprint: mode ? mode.footprint : null,
        flags: typeFlags({ ...fixture, mode: fixture.mode || type?.defaultMode || undefined }, library)
    }
})

// The group a lamp is patched with in "group" mode: its position, else its parent
// (a truss it hangs on, a group it was dealt into), else its type.
export const patchGroupOf = (lamp) => lamp.fixture.position || lamp.entity.parentId || lamp.fixture.type

/**
 * The request body for the desk. `moved` is the set of entity ids whose universe or
 * address was typed in the room since the last patch (they are sent with `move`).
 */
export const patchRequest = ({ projectId, entities, library, group = false, prune = true, repatch = false, moved = new Set(), only = null }) => {
    const lamps = lampsOf(entities, library).filter((lamp) => !only || only.has(lamp.entity.id))
    return {
        project: projectId,
        group,
        prune: prune && !only,
        repatch,
        lamps: lamps.map((lamp) => ({
            key: rigKeyOf(projectId, lamp.entity.id),
            name: lamp.entity.name || lamp.type?.code || lamp.fixture.type,
            code: lamp.type?.code || lamp.fixture.type,
            type: lamp.fixture.type,
            mode: lamp.mode?.name || null,
            footprint: lamp.footprint,
            channels: lamp.mode?.channels || null,
            universe: lamp.fixture.universe ?? null,
            address: lamp.fixture.address ?? null,
            index: lamp.fixture.index ?? null,
            group: patchGroupOf(lamp),
            ...(moved.has(lamp.entity.id) ? { move: true } : {})
        }))
    }
}

const WRITE_BACK = new Set(['created', 'copy', 'moved', 'mode-changed', 'kept'])

/**
 * The ops that make the room record what the desk decided. Nothing is written for a
 * lamp the desk flagged as differing (someone must choose), and a lamp that lost its
 * fixture (mode now unknown) loses its universe/address too — the room must not keep
 * claiming an address nothing is patched at.
 */
export const writeBackOps = ({ projectId, entities, library, result }) => {
    const byKey = new Map(entities.filter(isLamp).map((entity) => [rigKeyOf(projectId, entity.id), entity]))
    const ops = []
    for (const a of result?.assignments || []) {
        if (!WRITE_BACK.has(a.how)) continue
        const entity = byKey.get(a.key)
        if (!entity) continue
        const fixture = entity.components.fixture
        const patch = {}
        if (fixture.index !== a.index) patch.index = a.index
        if (fixture.universe !== a.universe) patch.universe = a.universe
        if (fixture.address !== a.address) patch.address = a.address
        if (!fixture.mode) {
            const type = typeById(library, fixture.type)
            if (type?.defaultMode && footprintOf(type, type.defaultMode) === a.footprint) patch.mode = type.defaultMode
        }
        if (Object.keys(patch).length) ops.push({ type: 'updateComponent', payload: { entityId: entity.id, component: 'fixture', patch } })
    }
    for (const key of result?.removed || []) {
        const entity = byKey.get(key)
        if (!entity) continue
        const fixture = entity.components.fixture
        if (fixture.universe != null || fixture.address != null) {
            ops.push({ type: 'updateComponent', payload: { entityId: entity.id, component: 'fixture', patch: { universe: null, address: null } } })
        }
    }
    return ops
}

/** A signature of everything auto-patch reacts to; a change means "patch again". */
export const lampSignature = (entities = []) => entities.filter(isLamp)
    .map((e) => {
        const f = e.components.fixture
        return `${e.id}|${f.type}|${f.mode || ''}|${f.universe ?? ''}|${f.address ?? ''}`
    })
    .sort()
    .join('\n')

/** Which lamps had their universe/address changed by hand since `known` was taken. */
export const typedMoves = (entities = [], known = new Map()) => {
    const moved = new Set()
    for (const e of entities.filter(isLamp)) {
        const was = known.get(e.id)
        const f = e.components.fixture
        const now = `${f.universe ?? ''}.${f.address ?? ''}`
        if (was != null && was !== now && f.universe != null && f.address != null) moved.add(e.id)
    }
    return moved
}

export const addressMap = (entities = []) => new Map(entities.filter(isLamp).map((e) => {
    const f = e.components.fixture
    return [e.id, `${f.universe ?? ''}.${f.address ?? ''}`]
}))

/**
 * Patch the room on the desk and write the answer back. Resolves with
 * { ok, ops, result, message } — never throws; a missing desk is a sentence.
 */
export async function autoPatch({ projectId, entities, library, post, applyOps, group = false, prune = true, repatch = false, moved, only = null }) {
    if (!projectId) return { ok: false, ops: [], result: null, message: 'no project' }
    const body = patchRequest({ projectId, entities, library, group, prune, repatch, moved, only })
    if (!body.lamps.length && !body.prune) return { ok: true, ops: [], result: null, message: 'no lamps' }
    let result
    try {
        const response = await post('api/rig/patch', body)
        if (!response?.ok) return { ok: false, ops: [], result: null, message: `the desk did not take it (${response?.status ?? 'no answer'})` }
        result = await response.json()
    } catch {
        return { ok: false, ops: [], result: null, message: 'the desk did not answer' }
    }
    const ops = writeBackOps({ projectId, entities, library, result })
    if (ops.length && typeof applyOps === 'function') applyOps(ops)
    const n = (result.assignments || []).filter((a) => a.how !== 'kept' && a.how !== 'differs').length
    const f = (result.flags || []).length
    return { ok: true, ops, result, message: `${n} patched${f ? `, ${f} flagged` : ''}` }
}
