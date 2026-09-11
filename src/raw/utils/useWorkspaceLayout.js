import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { layoutScopeKey, mergeFrame, pruneLayout } from './workspaceLayout.js'
import { emptyLayout, readWorkspaceLayout, writeWorkspaceLayout } from './workspaceLayoutStorage.js'

// A drag emits a patch per pointer move. Writing localStorage on each one is
// a synchronous serialise of the whole layout inside the gesture; trailing by a
// beat costs nothing a person can perceive and keeps the gesture smooth.
const WRITE_DEBOUNCE_MS = 200

/**
 * The person's arrangement of this workspace, on this device.
 *
 * `frameOf(node)` is the one place anything should ask where a window is: it
 * answers with the local arrangement laid over the document's seed frame, so
 * every reader — the renderer, the mount cap, the hidden-windows list, the
 * z-order — agrees about a window without any of them knowing there are two
 * sources. See workspaceLayout.js for why the two exist.
 */
export default function useWorkspaceLayout({ spaceId = null, projectId = null, viewportWidth = null } = {}) {
    const scopeKey = layoutScopeKey({ spaceId, projectId, viewportWidth })
    const [layout, setLayout] = useState(emptyLayout)
    const writeTimer = useRef(null)
    const pending = useRef(null)

    // Scope changes when the project changes, and when the viewport crosses
    // the narrow/wide line — a phone rotated into a tablet width is a different
    // arrangement of the same room, not the same one stretched.
    useEffect(() => {
        setLayout(readWorkspaceLayout(scopeKey))
    }, [scopeKey])

    const flush = useCallback(() => {
        if (writeTimer.current) {
            clearTimeout(writeTimer.current)
            writeTimer.current = null
        }
        if (pending.current) {
            writeWorkspaceLayout(scopeKey, pending.current)
            pending.current = null
        }
    }, [scopeKey])

    // A layout the person arranged and never got written because they closed
    // the tab is the same as no layout at all.
    useEffect(() => flush, [flush])

    const schedule = useCallback((next) => {
        pending.current = next
        if (writeTimer.current) clearTimeout(writeTimer.current)
        writeTimer.current = setTimeout(() => {
            writeTimer.current = null
            if (pending.current) {
                writeWorkspaceLayout(scopeKey, pending.current)
                pending.current = null
            }
        }, WRITE_DEBOUNCE_MS)
    }, [scopeKey])

    const setLocalFrame = useCallback((nodeId, patch) => {
        if (!nodeId || !patch || typeof patch !== 'object') return
        setLayout((current) => {
            const frames = { ...current.frames, [nodeId]: { ...(current.frames[nodeId] || {}), ...patch } }
            const next = { ...current, frames }
            schedule(next)
            return next
        })
    }, [schedule])

    const forgetNodes = useCallback((liveNodeIds) => {
        setLayout((current) => {
            const frames = pruneLayout(current.frames, liveNodeIds)
            if (Object.keys(frames).length === Object.keys(current.frames).length) return current
            const next = { ...current, frames }
            schedule(next)
            return next
        })
    }, [schedule])

    const frames = layout.frames
    const frameOf = useCallback((node) => mergeFrame(node?.values?.frame, frames[node?.id]), [frames])

    return useMemo(
        () => ({ scopeKey, frames, frameOf, setLocalFrame, forgetNodes, flush }),
        [scopeKey, frames, frameOf, setLocalFrame, forgetNodes, flush]
    )
}
