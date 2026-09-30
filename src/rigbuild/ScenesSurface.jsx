import { useEffect, useMemo } from 'react'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useProjectStore } from '../project/state/projectStore.js'
import useLocalInstall from '../hooks/useLocalInstall.js'
import RigBar from './RigSteps.jsx'
import { NO_WRITE } from './rigToolAccess.js'
import ViewOnlyLine from './ViewOnlyLine.jsx'
import ScenesDeck from './ScenesDeck.jsx'
import './scenes.css'

// THE SCENE DECK — /{space}/scenes/{projectId}. docs/architecture/RIG_BUILD.md §22.
// The page around ScenesDeck: the project document from the store, written through the same op path the
// cards page uses (useProjectDocumentSync's applyLocalOps — the op log, so the plot, the cards and the room
// see the same show), the steps row on top. Read only (a visitor on a public space, rigToolAccess.js): the
// op path is NO_WRITE and every control is disabled.
export default function ScenesSurface({ spaceId, projectId, readOnly = false }) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps, syncState } = useProjectDocumentSync({ projectId, store, clientIdPrefix: 'scenes-client', opIdPrefix: 'scenes-op' })
    const applyOps = useMemo(() => (readOnly ? NO_WRITE : applyLocalOps), [readOnly, applyLocalOps])
    const title = state.document?.projectMeta?.title || projectId
    const localInstall = useLocalInstall()
    useEffect(() => {
        const prev = document.title
        document.title = `Scenes — ${title}`
        return () => { document.title = prev }
    }, [title])
    return (
        <div className="rigscenes-page">
            <RigBar spaceId={spaceId} projectId={projectId} projectLabel={title} here="scenes" isLocalInstall={localInstall.isLocal} layout="flow" />
            <div className="rigscenes-body">
                <h1>{title} · SCENES</h1>
                {readOnly ? <ViewOnlyLine /> : null}
            </div>
            {state.hasLoaded
                ? <ScenesDeck doc={state.document} applyOps={applyOps} projectId={projectId} readOnly={readOnly} syncError={readOnly ? null : syncState?.pendingSyncError} syncVersion={state.version} />
                : <p className="rigscenes-body">Reading the show…</p>}
        </div>
    )
}
