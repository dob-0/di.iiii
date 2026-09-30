// THE SCENE DECK — undo, redo and "restore last good" (docs/architecture/RIG_BUILD.md §21).
//
// A pure reducer. Each step's result is in `state.out`: the ops the caller sends (an undo sends the inverse
// ops, a redo the ops again, a restore the ops back to the last good snapshot). The inverse of a change is
// the schema's own invertProjectOps, taken against the document the change was made on. Bounded: the oldest
// step falls off past `limit`. "Last good" is a snapshot of the cue list and the looks; restoring it is ONE
// batch of ops and is itself one undoable step. The sync's restore point (sync.js) is a markGood.
import { invertProjectOps } from '../../shared/projectSchema.js'
import { canonicalJson } from './hash.js'
import { looksOp, showEntityOf } from './model.js'

export const HISTORY_LIMIT = 50
const clone = (v) => JSON.parse(JSON.stringify(v))

export const createHistory = (limit = HISTORY_LIMIT) => ({ limit: Math.max(1, Math.floor(Number(limit) || HISTORY_LIMIT)), past: [], future: [], good: null, out: [] })

/** The show's cue list and looks, as they are now. */
export const snapshotOf = (document) => {
    const entity = showEntityOf(document)
    return { entityId: entity ? entity.id : null, looks: entity ? clone(entity.components.rigLooks.looks) : [], cues: clone(document?.mappingState?.cues || []) }
}

/** The ops that turn a document holding snapshot `from` into one holding `to`. Minimal: [] when they agree. */
export const snapshotOps = (from, to) => {
    const ops = []
    if (to.entityId && canonicalJson(from.looks) !== canonicalJson(to.looks)) ops.push(looksOp(to.entityId, clone(to.looks)))
    const was = new Map(from.cues.map((c) => [c.id, c]))
    const wanted = new Set(to.cues.map((c) => c.id))
    for (const c of from.cues) if (!wanted.has(c.id)) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of to.cues) {
        const old = was.get(c.id)
        if (!old) ops.push({ type: 'createMappingCue', payload: { cue: clone(c) } })
        else if (canonicalJson(old) !== canonicalJson(c)) {
            const { id: _id, ...patch } = clone(c)
            ops.push({ type: 'setMappingCue', payload: { cueId: c.id, patch: { lightLook: '', lightScene: '', ...patch } } })
        }
    }
    const order = to.cues.map((c) => c.id)
    const landed = [...from.cues.map((c) => c.id).filter((id) => wanted.has(id)), ...to.cues.filter((c) => !was.has(c.id)).map((c) => c.id)]
    if (order.join('\n') !== landed.join('\n')) ops.push({ type: 'reorderMappingCues', payload: { cueIds: order } })
    return ops
}

const push = (list, entry, limit) => [...list, entry].slice(-limit)

/**
 * Actions: { type: 'record', document, ops } (document = BEFORE the ops) · { type: 'undo' } · { type: 'redo' } ·
 * { type: 'markGood', document } · { type: 'restoreGood', document } (document = now).
 */
export const historyReducer = (state, action) => {
    const s = { ...state, out: [] }
    switch (action?.type) {
        case 'record': {
            if (!action.ops?.length) return s
            const inverse = invertProjectOps(action.document, action.ops)
            return { ...s, past: push(s.past, { ops: clone(action.ops), inverse }, s.limit), future: [] }
        }
        case 'undo': {
            const entry = s.past[s.past.length - 1]
            if (!entry) return s
            return { ...s, past: s.past.slice(0, -1), future: [...s.future, entry], out: entry.inverse }
        }
        case 'redo': {
            const entry = s.future[s.future.length - 1]
            if (!entry) return s
            return { ...s, past: push(s.past, entry, s.limit), future: s.future.slice(0, -1), out: entry.ops }
        }
        case 'markGood':
            return { ...s, good: snapshotOf(action.document) }
        case 'restoreGood': {
            if (!s.good) return s
            const now = snapshotOf(action.document)
            const ops = snapshotOps(now, s.good)
            if (!ops.length) return s
            return { ...s, past: push(s.past, { ops, inverse: snapshotOps(s.good, now) }, s.limit), future: [], out: ops }
        }
        default:
            return s
    }
}
