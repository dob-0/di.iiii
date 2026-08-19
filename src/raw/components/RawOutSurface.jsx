import { useEffect, useMemo } from 'react'
import RawViewport from './RawViewport.jsx'
import { useProjectStore } from '../../project/state/projectStore.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { readLocalWorkspaceDocument } from '../utils/localWorkspaceStorage.js'
import { resolveScopeWorldNode } from '../utils/viewportWorldState.js'

// The projector cable. /out renders ONE thing: a scope's room, seen as the
// audience sees it — no graph, no topbar, no palette, no cursors, no
// selection, and nothing here takes a click (RawViewport's handlers are
// simply not passed, so every pointer is a no-op by absence, not by guard).
//
// It follows the same live document the desk edits: the op-log sync for a
// project, and cross-window storage events for a space's local canvas (the
// desk writes localStorage on every change; the storage event is the one
// channel another window of the same browser gets for free). The ●-marked
// Camera of the scope frames the shot, because RawViewport already honours
// it — the desk is the control room, this is the house.
export default function RawOutSurface({ projectId = null, localStorageKey = '', scopeId = null }) {
    const initialStoreState = useMemo(() => {
        if (projectId || !localStorageKey) return undefined
        const saved = readLocalWorkspaceDocument(localStorageKey)
        return saved ? { document: saved, version: 0 } : undefined
    }, [projectId, localStorageKey])
    const store = useProjectStore(initialStoreState)
    const { state, dispatch } = store
    useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'raw-out-client',
        opIdPrefix: 'raw-out-op'
    })

    useEffect(() => {
        if (projectId || !localStorageKey || typeof window === 'undefined') return undefined
        const onStorage = (event) => {
            if (event.key !== localStorageKey) return
            const next = readLocalWorkspaceDocument(localStorageKey)
            if (next) dispatch({ type: 'replace-document', document: next })
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [projectId, localStorageKey, dispatch])

    // A show output must survive unattended: ask the screen to stay awake,
    // and re-ask whenever the tab becomes visible again (the lock is released
    // by the platform on every hide). Denial is fine — kiosk setups disable
    // sleep at the OS level anyway.
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined
        let lock = null
        let disposed = false
        const acquire = () => {
            navigator.wakeLock.request('screen')
                .then((next) => {
                    if (disposed) next?.release?.().catch(() => {})
                    else lock = next
                })
                .catch(() => {})
        }
        acquire()
        const onVisibility = () => {
            if (window.document.visibilityState === 'visible') acquire()
        }
        window.document.addEventListener('visibilitychange', onVisibility)
        return () => {
            disposed = true
            window.document.removeEventListener('visibilitychange', onVisibility)
            lock?.release?.().catch(() => {})
        }
    }, [])

    const doc = state.document
    const worldNode = useMemo(
        () => resolveScopeWorldNode(doc.nodes, scopeId, doc.workspaceState?.liveWorldNodeIdByScope),
        [doc.nodes, scopeId, doc.workspaceState?.liveWorldNodeIdByScope]
    )

    return (
        <div className="raw-out-surface">
            {state.loadError ? (
                <div className="raw-out-message">{state.loadError}</div>
            ) : (
                <RawViewport
                    topInset={0}
                    document={doc}
                    selectedEntityId={null}
                    selectedNodeId={null}
                    cursors={[]}
                    nodeScale={1}
                    showEmptyHint={false}
                    scopeId={scopeId || null}
                    worldNode={worldNode}
                    liveOutputs={null}
                />
            )}
        </div>
    )
}
