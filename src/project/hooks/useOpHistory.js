import { useCallback, useEffect, useRef, useState } from 'react'
import { applyProjectOps, cloneValue, invertProjectOps } from '../../shared/projectSchema.js'

const HISTORY_LIMIT = 50
// A continuous input stream (slider drag, color scrub, typing in the code
// editor, node drag) emits one op per tick; entries this close together with
// the same target signature collapse into a single undo frame.
const COALESCE_WINDOW_MS = 800

const COALESCIBLE_TYPES = new Set([
    'updateEntity', 'updateComponent', 'updateNode', 'updateEdge',
    'setWorldState', 'setRenderSettings', 'setXrState', 'setPresentationState',
    'setPublishState', 'setWindowState', 'setWorkspaceState', 'setProjectMeta'
])

const entrySignature = (ops) => {
    const parts = []
    for (const op of ops) {
        if (!COALESCIBLE_TYPES.has(op?.type)) return null
        const payload = op.payload || {}
        const target = payload.entityId || payload.nodeId || payload.edgeId || payload.windowId || ''
        let keys = Object.keys(payload.patch || {}).sort().join(',')
        // For node values the top-level patch key is ALWAYS just 'values', so
        // any two edits to one node coalesced — a window move and a chatId
        // write within 800ms would merge, and undo/redo destroyed one of them.
        // Descend one level so only same-field edits (drags, typing) coalesce.
        if (payload.patch?.values && typeof payload.patch.values === 'object') {
            keys += `(${Object.keys(payload.patch.values).sort().join(',')})`
        }
        parts.push(`${op.type}:${target}:${payload.component || ''}:${keys}`)
    }
    return parts.join('|')
}

const stripOp = (op) => ({ type: op.type, payload: cloneValue(op.payload || {}) })

const SETTINGS_OP_LABELS = {
    setWorldState: 'World settings',
    setRenderSettings: 'Render settings',
    setXrState: 'XR settings',
    setPresentationState: 'Presentation settings',
    setPublishState: 'Publish settings',
    setWindowState: 'Window layout',
    setWorkspaceState: 'Workspace',
    setProjectMeta: 'Project settings',
    replaceDocument: 'Replace document'
}

const entityName = (doc, entityId) => {
    const entity = (doc?.entities || []).find((e) => e.id === entityId)
    return entity?.name || entity?.type || 'entity'
}

const describeOp = (doc, op) => {
    const payload = op?.payload || {}
    switch (op?.type) {
        case 'createEntity': return `Create ${payload.entity?.type || 'entity'}`
        case 'updateEntity': return `Edit ${entityName(doc, payload.entityId)}`
        case 'updateComponent': {
            const name = entityName(doc, payload.entityId)
            return payload.component === 'transform' ? `Transform ${name}` : `Edit ${name} ${payload.component || 'component'}`
        }
        case 'deleteEntity': return `Delete ${entityName(doc, payload.entityId)}`
        case 'createNode': return `Create ${payload.node?.typeId || 'node'} node`
        case 'updateNode': return 'Edit node'
        case 'deleteNode': return 'Delete node'
        case 'createEdge': return 'Connect nodes'
        case 'updateEdge': return 'Edit connection'
        case 'deleteEdge': return 'Disconnect nodes'
        case 'upsertAsset': return `Update asset ${payload.asset?.name || ''}`.trim()
        case 'deleteAsset': return 'Delete asset'
        default: return SETTINGS_OP_LABELS[op?.type] || 'Edit'
    }
}

// Human label for a history step, resolved against the document the batch
// applied to (so "Delete box-3" can still name the entity it removed).
export const describeOps = (doc, ops = []) => {
    const first = ops[0]
    if (!first) return 'Edit'
    const label = describeOp(doc, first)
    return ops.length > 1 ? `${label} (+${ops.length - 1})` : label
}

let nextEntryId = 1

/**
 * Op-log undo/redo shared by the editor lanes. Every local op batch is
 * inverted against the document it applies to (invertProjectOps) and kept as
 * an { undoOps, redoOps } pair; undo/redo replay those through the normal
 * applyLocalOps → POST /ops path, so history stays granular, syncs to the
 * server, and never reverts collaborators' concurrent edits the way the old
 * whole-document replaceDocument undo did.
 */
export function useOpHistory({ projectId, document, applyLocalOps, ignoreTypes = [] }) {
    const undoStackRef = useRef([])
    const redoStackRef = useRef([])
    const ignoreTypesRef = useRef(new Set(ignoreTypes))
    // Stack mutations live in refs; this lets panels observe them (history()).
    const [, setHistoryVersion] = useState(0)
    const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), [])
    // Tracks the document the *next* local batch will mutate. Re-synced from
    // the store on every render; advanced inline so that several ops applied
    // within one render tick invert against the right intermediate state.
    const trackedDocRef = useRef(document)
    useEffect(() => { trackedDocRef.current = document }, [document])

    useEffect(() => {
        undoStackRef.current = []
        redoStackRef.current = []
        bumpHistory()
    }, [projectId, bumpHistory])

    const applyLocalOpsWithHistory = useCallback((ops, options = {}) => {
        const opsArray = (Array.isArray(ops) ? ops : [ops]).filter(Boolean)
        if (opsArray.length) {
            const base = trackedDocRef.current
            const recordable = opsArray.some((op) => !ignoreTypesRef.current.has(op?.type))
            const undoOps = recordable ? invertProjectOps(base, opsArray) : []
            trackedDocRef.current = applyProjectOps(base, opsArray)
            if (undoOps.length) {
                const sig = entrySignature(opsArray)
                const now = Date.now()
                const top = undoStackRef.current.at(-1)
                if (sig && top?.sig === sig && now - top.at < COALESCE_WINDOW_MS) {
                    top.redoOps = opsArray.map(stripOp)
                    top.at = now
                } else {
                    undoStackRef.current = [
                        ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
                        { id: nextEntryId++, label: describeOps(base, opsArray), undoOps, redoOps: opsArray.map(stripOp), at: now, sig }
                    ]
                }
                redoStackRef.current = []
                bumpHistory()
            }
        }
        return applyLocalOps(opsArray, options)
    }, [applyLocalOps, bumpHistory])

    const replayOps = useCallback((ops, activityMessage) => {
        trackedDocRef.current = applyProjectOps(trackedDocRef.current, ops)
        applyLocalOps(ops.map(stripOp), { activityMessage })
        bumpHistory()
    }, [applyLocalOps, bumpHistory])

    // Photoshop-style linear jump: make exactly the first `target` steps
    // applied. Entries between the cursor and the target replay as ONE op
    // batch (single network write, single activity line).
    const jumpTo = useCallback((target) => {
        const undoCount = undoStackRef.current.length
        const total = undoCount + redoStackRef.current.length
        const goal = Math.max(0, Math.min(total, Math.trunc(target)))
        if (goal < undoCount) {
            const moving = undoStackRef.current.slice(goal)
            undoStackRef.current = undoStackRef.current.slice(0, goal)
            const newestFirst = [...moving].reverse()
            // redo stack keeps the next redo (oldest undone step) last
            redoStackRef.current = [...redoStackRef.current, ...newestFirst].slice(-HISTORY_LIMIT)
            replayOps(newestFirst.flatMap((entry) => entry.undoOps), moving.length > 1 ? `Undo ${moving.length} steps.` : 'Undo.')
            return true
        }
        if (goal > undoCount) {
            const take = goal - undoCount
            // redo stack is undo-order (nearest step last); reverse to timeline order
            const nearestFirst = redoStackRef.current.slice(-take).reverse()
            redoStackRef.current = redoStackRef.current.slice(0, -take)
            undoStackRef.current = [...undoStackRef.current, ...nearestFirst].slice(-HISTORY_LIMIT)
            replayOps(nearestFirst.flatMap((entry) => entry.redoOps), take > 1 ? `Redo ${take} steps.` : 'Redo.')
            return true
        }
        return false
    }, [replayOps])

    const undo = useCallback(() => jumpTo(undoStackRef.current.length - 1), [jumpTo])
    const redo = useCallback(() => jumpTo(undoStackRef.current.length + 1), [jumpTo])

    const canUndo = useCallback(() => undoStackRef.current.length > 0, [])
    const canRedo = useCallback(() => redoStackRef.current.length > 0, [])

    // Snapshot for a history panel: steps in timeline order (applied first,
    // then undone), cursor = number of currently applied steps.
    const history = useCallback(() => ({
        steps: [
            ...undoStackRef.current.map(({ id, label, at }) => ({ id, label, at, applied: true })),
            ...[...redoStackRef.current].reverse().map(({ id, label, at }) => ({ id, label, at, applied: false }))
        ],
        cursor: undoStackRef.current.length
    }), [])

    return { applyLocalOps: applyLocalOpsWithHistory, undo, redo, canUndo, canRedo, history, jumpTo }
}
