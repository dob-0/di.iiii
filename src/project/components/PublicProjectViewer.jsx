import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createProjectSyncService } from '../services/projectSyncService.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    buildProjectEventsUrl,
    getProjectDocument,
    listProjectOps
} from '../services/projectsApi.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import useXrAr from '../../hooks/useXrAr.js'
import StudioViewport from '../../studio/components/StudioViewport.jsx'
import { buildPresentationPreviewDocument } from '../../utils/presentationPreviewDocument.js'

const overlayButtonStyle = {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    color: '#f5f7fa',
    borderRadius: '999px',
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    backdropFilter: 'blur(12px)'
}

const overlayCardStyle = {
    background: 'rgba(6, 9, 13, 0.78)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f7fa',
    borderRadius: '18px',
    padding: '1rem 1.1rem',
    maxWidth: '28rem',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)'
}

const resolveViewerCamera = (document) => {
    const entryView = document.presentationState?.entryView || 'scene'
    if (entryView === 'fixed-camera') {
        return document.presentationState?.fixedCamera || document.worldState?.savedView || null
    }
    return document.worldState?.savedView || null
}

export default function PublicProjectViewer({ spaceId, projectId, spaceLabel = '' }) {
    const [state, setState] = useState({
        status: 'loading',
        document: null,
        error: ''
    })
    const [cameraView, setCameraView] = useState(null)
    const controlsRef = useRef(null)
    const syncServiceRef = useRef(createProjectSyncService())
    const versionRef = useRef(0)
    const cameraViewRef = useRef(null)
    const documentRef = useRef(null)

    useEffect(() => {
        cameraViewRef.current = cameraView
    }, [cameraView])

    useEffect(() => {
        documentRef.current = state.document
    }, [state.document])

    const resolvedRouteSpaceId = spaceId || DEFAULT_PROJECT_SPACE_ID

    const applyIncomingDocument = useCallback((nextDocument) => {
        const normalized = normalizeProjectDocument({
            ...(nextDocument || {}),
            projectMeta: {
                ...(nextDocument?.projectMeta || {}),
                id: projectId || nextDocument?.projectMeta?.id || '',
                spaceId: resolvedRouteSpaceId || nextDocument?.projectMeta?.spaceId || DEFAULT_PROJECT_SPACE_ID
            }
        })
        const nextEntryView = normalized.presentationState?.entryView || 'scene'
        setState((current) => ({
            ...current,
            status: 'ready',
            document: normalized,
            error: ''
        }))
        setCameraView((currentCamera) => {
            if (!currentCamera || nextEntryView === 'fixed-camera' || nextEntryView === 'code') {
                return resolveViewerCamera(normalized)
            }
            return currentCamera
        })
    }, [projectId, resolvedRouteSpaceId])

    const applyIncomingOps = useCallback((ops = [], version = null) => {
        setState((current) => {
            if (!current.document) {
                return current
            }
            const nextDocument = applyProjectOps(current.document, ops || [])
            const previousEntryView = current.document.presentationState?.entryView || 'scene'
            const nextEntryView = nextDocument.presentationState?.entryView || 'scene'
            if (!cameraViewRef.current || previousEntryView !== nextEntryView || nextEntryView === 'fixed-camera' || nextEntryView === 'code') {
                setCameraView(resolveViewerCamera(nextDocument))
            }
            return {
                ...current,
                status: 'ready',
                document: nextDocument,
                error: ''
            }
        })
        if (Number.isFinite(version)) {
            versionRef.current = Number(version)
        }
    }, [])

    const reloadDocument = useCallback(async () => {
        if (!projectId) return
        setState((current) => ({
            status: 'loading',
            document: current.document?.projectMeta?.id === projectId ? current.document : null,
            error: ''
        }))
        try {
            const response = await getProjectDocument(projectId)
            versionRef.current = Number(response?.version) || 0
            applyIncomingDocument(response?.document || response || {})
        } catch (error) {
            setState({
                status: 'error',
                document: null,
                error: error.message || 'Could not load the live project.'
            })
        }
    }, [applyIncomingDocument, projectId])

    useEffect(() => {
        void reloadDocument()
    }, [reloadDocument])

    const document = state.document
    const publishState = document?.publishState || {}
    const presentationState = document?.presentationState || {}
    const entryView = presentationState.entryView || 'scene'
    const showCodeView = entryView === 'code'
    const previewDocument = buildPresentationPreviewDocument(presentationState.codeHtml || '')
    const xrDefaultMode = publishState.xrDefaultMode || 'none'
    const xr = useXrAr({
        default3DView: cameraView || resolveViewerCamera(document || {}),
        controlsRef,
        setCameraPosition: (position) => setCameraView((current) => ({ ...(current || {}), position })),
        setCameraTarget: (target) => setCameraView((current) => ({ ...(current || {}), target }))
    })

    useEffect(() => {
        if (!projectId) return undefined

        const syncService = syncServiceRef.current
        syncService.connect({
            eventsUrl: buildProjectEventsUrl(projectId),
            onProjectOp: ({ version, ops }) => {
                if (!documentRef.current) {
                    void reloadDocument()
                    return
                }
                applyIncomingOps(ops || [], Number(version))
            },
            onReady: async () => {
                const catchUp = await listProjectOps(projectId, versionRef.current)
                applyIncomingOps(catchUp.ops || [], Number(catchUp.latestVersion))
            },
            onError: () => {
                if (!documentRef.current) {
                    void reloadDocument()
                }
            }
        })

        return () => {
            syncService.disconnect()
        }
    }, [applyIncomingOps, projectId, reloadDocument])

    const viewerTitle = useMemo(() => {
        if (!document?.projectMeta?.title) return spaceLabel || resolvedRouteSpaceId
        return document.projectMeta.title
    }, [document?.projectMeta?.title, resolvedRouteSpaceId, spaceLabel])

    return (
        <main
            style={{
                width: '100%',
                height: '100vh',
                minHeight: '100vh',
                position: 'relative',
                background: '#05070a',
                overflow: 'hidden'
            }}
        >
            {showCodeView && document ? (
                document.presentationState?.codeHtml ? (
                    <iframe
                        title={viewerTitle}
                        srcDoc={previewDocument}
                        sandbox="allow-scripts allow-forms allow-popups allow-modals"
                        style={{
                            border: 0,
                            width: '100%',
                            height: '100vh',
                            background: '#05070a'
                        }}
                    />
                ) : (
                    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
                        <div style={overlayCardStyle}>
                            <strong>Code view is empty.</strong>
                        </div>
                    </div>
                )
            ) : document ? (
                <StudioViewport
                    document={document}
                    selectedEntityId={null}
                    onSelectEntity={null}
                    cursors={{}}
                    onCursorMove={null}
                    onCursorLeave={null}
                    cameraView={cameraView || resolveViewerCamera(document)}
                    controlsRef={controlsRef}
                    xrStore={xr.xrStore}
                    onCameraChange={(nextView) => {
                        if (entryView === 'fixed-camera') return
                        setCameraView(nextView)
                    }}
                    enableNavigation={entryView !== 'fixed-camera'}
                />
            ) : null}

            {state.status === 'loading' ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '2rem' }}>
                    <div style={overlayCardStyle}>
                        <strong>Loading live experience...</strong>
                    </div>
                </div>
            ) : null}

            {state.status === 'error' ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '2rem' }}>
                    <div style={overlayCardStyle}>
                        <strong>{state.error}</strong>
                    </div>
                </div>
            ) : null}

            {state.status === 'ready' && xrDefaultMode !== 'none' ? (
                <div
                    style={{
                        position: 'absolute',
                        right: '1rem',
                        bottom: '1rem',
                        display: 'flex',
                        gap: '0.75rem',
                        zIndex: 20
                    }}
                >
                    {xrDefaultMode === 'vr' ? (
                        <button
                            type="button"
                            style={overlayButtonStyle}
                            onClick={() => xr.handleEnterXrSession('vr')}
                            disabled={!xr.supportedXrModes.vr || xr.isXrPresenting}
                        >
                            Enter VR
                        </button>
                    ) : null}
                    {xrDefaultMode === 'ar' ? (
                        <button
                            type="button"
                            style={overlayButtonStyle}
                            onClick={() => xr.handleEnterXrSession('ar')}
                            disabled={!xr.supportedXrModes.ar || xr.isXrPresenting}
                        >
                            Enter AR
                        </button>
                    ) : null}
                    {xr.isXrPresenting ? (
                        <button
                            type="button"
                            style={overlayButtonStyle}
                            onClick={xr.handleExitXrSession}
                        >
                            Exit XR
                        </button>
                    ) : null}
                </div>
            ) : null}
        </main>
    )
}
