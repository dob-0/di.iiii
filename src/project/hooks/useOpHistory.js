import { useCallback, useEffect, useRef } from 'react'
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
        const keys = Object.keys(payload.patch || {}).sort().join(',')
        parts.push(`${op.type}:${target}:${payload.component || ''}:${keys}`)
    }
    return parts.join('|')
}

const stripOp = (op) => ({ type: op.type, payload: cloneValue(op.payload || {}) })

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
    // Tracks the document the *next* local batch will mutate. Re-synced from
    // the store on every render; advanced inline so that several ops applied
    // within one render tick invert against the right intermediate state.
    const trackedDocRef = useRef(document)
    useEffect(() => { trackedDocRef.current = document }, [document])

    useEffect(() => {
        undoStackRef.current = []
        redoStackRef.current = []
    }, [projectId])

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
                        { undoOps, redoOps: opsArray.map(stripOp), at: now, sig }
                    ]
                }
                redoStackRef.current = []
            }
        }
        return applyLocalOps(opsArray, options)
    }, [applyLocalOps])

    const replay = useCallback((entry, opsKey, activityMessage) => {
        trackedDocRef.current = applyProjectOps(trackedDocRef.current, entry[opsKey])
        applyLocalOps(entry[opsKey].map(stripOp), { activityMessage })
    }, [applyLocalOps])

    const undo = useCallback(() => {
        const entry = undoStackRef.current.at(-1)
        if (!entry) return false
        undoStackRef.current = undoStackRef.current.slice(0, -1)
        redoStackRef.current = [...redoStackRef.current.slice(-(HISTORY_LIMIT - 1)), entry]
        replay(entry, 'undoOps', 'Undo.')
        return true
    }, [replay])

    const redo = useCallback(() => {
        const entry = redoStackRef.current.at(-1)
        if (!entry) return false
        redoStackRef.current = redoStackRef.current.slice(0, -1)
        undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), entry]
        replay(entry, 'redoOps', 'Redo.')
        return true
    }, [replay])

    const canUndo = useCallback(() => undoStackRef.current.length > 0, [])
    const canRedo = useCallback(() => redoStackRef.current.length > 0, [])

    return { applyLocalOps: applyLocalOpsWithHistory, undo, redo, canUndo, canRedo }
}
