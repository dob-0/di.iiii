import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveProjectScene from '../../components/LiveProjectScene.jsx'
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
import {
    buildPresentationPreviewDocument,
    PREVIEW_ENTER_EXHIBITION_KIND,
    PREVIEW_HOST_MESSAGE_TYPE
} from '../../utils/presentationPreviewDocument.js'
import { bundleCodeFiles } from '../../utils/codeFilesBundle.js'
import { computeFramingCamera, getPointsBoundingSphere } from '../../utils/cameraFraming.js'

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

// A scene's saved camera can go stale (e.g. left pointed off into empty
// space mid-edit) — that's invisible to editors, who interactively orbit
// away from it, but it strands a fresh public viewer with nothing in view.
// Auto-frame from the actual entity positions instead of trusting it blindly,
// unless the project owner explicitly locked a presentation camera.
// Cap how far back the initial shot pulls: a scene can sprawl across a wide
// area (e.g. a gallery of many small image planes), and fitting the *entire*
// spread edge-to-edge shrinks individual content to unreadable specks. Start
// at a normal walk-around distance instead and let free navigation (already
// enabled outside fixed-camera mode) cover the rest.
const AUTO_FRAME_MAX_DISTANCE = 25

const computeAutoFrameCamera = (document) => {
    const points = (document.entities || [])
        .map((entity) => entity?.components?.transform?.position)
        .filter(Boolean)
    const sphere = getPointsBoundingSphere(points)
    if (!sphere) return null
    return computeFramingCamera(sphere, {
        fov: document.worldState?.savedView?.fov,
        maxDistance: AUTO_FRAME_MAX_DISTANCE
    })
}

const resolveViewerCamera = (document) => {
    const entryView = document.presentationState?.entryView || 'scene'
    const fixedCamera = document.presentationState?.fixedCamera
    if (entryView === 'fixed-camera' && fixedCamera?.locked) {
        return fixedCamera
    }
    if (entryView === 'fixed-camera') {
        return fixedCamera || document.worldState?.savedView || null
    }
    return computeAutoFrameCamera(document) || document.worldState?.savedView || null
}

export default function PublicProjectViewer({ spaceId, projectId, spaceLabel = '', initialCameraView = null }) {
    const [state, setState] = useState({
        status: 'loading',
        document: null,
        error: ''
    })
    // Seed the camera so the first paint can frame a custom entry view. For
    // 'scene' entryView this seed is preserved (the viewer only resets the
    // camera for fixed-camera/code modes or when none is set yet).
    const [cameraView, setCameraView] = useState(initialCameraView || null)
    const [viewMode, setViewMode] = useState(null)
    // 'scene' entry view only -- fixed-camera and code/iframe presentations
    // are a deliberate per-project choice and stay exactly as authored.
    const [navMode, setNavMode] = useState('orbit')
    const controlsRef = useRef(null)
    const iframeRef = useRef(null)
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
        documentRef.current = normalized
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
            documentRef.current = nextDocument
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
        setState((current) => {
            const nextDocument = current.document?.projectMeta?.id === projectId ? current.document : null
            documentRef.current = nextDocument
            return {
                status: 'loading',
                document: nextDocument,
                error: ''
            }
        })
        try {
            const response = await getProjectDocument(projectId)
            versionRef.current = Number(response?.version) || 0
            applyIncomingDocument(response?.document || response || {})
        } catch (error) {
            documentRef.current = null
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
    const entryView = viewMode || presentationState.entryView || 'scene'
    const showCodeView = entryView === 'code'
    const hasFiles = Array.isArray(presentationState.codeFiles) && presentationState.codeFiles.length > 0
    const rawHtml = hasFiles ? bundleCodeFiles(presentationState.codeFiles) : (presentationState.codeHtml || '')
    const previewDocument = buildPresentationPreviewDocument(rawHtml)
    const xrDefaultMode = publishState.xrDefaultMode || 'none'
    const xr = useXrAr({
        default3DView: cameraView || resolveViewerCamera(document || {}),
        controlsRef,
        setCameraPosition: (position) => setCameraView((current) => ({ ...(current || {}), position })),
        setCameraTarget: (target) => setCameraView((current) => ({ ...(current || {}), target }))
    })

    useEffect(() => {
        setViewMode(null)
        setNavMode('orbit')
    }, [presentationState.entryView])

    useEffect(() => {
        if (!showCodeView) return undefined
        const handleMessage = (event) => {
            if (event.source !== iframeRef.current?.contentWindow) return
            if (event.data?.type !== PREVIEW_HOST_MESSAGE_TYPE) return
            if (event.data?.kind !== PREVIEW_ENTER_EXHIBITION_KIND) return
            setViewMode('scene')
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [showCodeView])

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
                presentationState.codeSourceType === 'url' && presentationState.codeUrl?.trim() ? (
                    <iframe
                        title={viewerTitle}
                        src={presentationState.codeUrl.trim()}
                        loading="lazy"
                        sandbox="allow-scripts allow-forms allow-popups allow-modals"
                        referrerPolicy="strict-origin-when-cross-origin"
                        style={{
                            border: 0,
                            width: '100%',
                            height: '100vh',
                            background: '#05070a'
                        }}
                    />
                ) : rawHtml ? (
                    <iframe
                        ref={iframeRef}
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
            ) : document && navMode === 'walk' ? (
                <LiveProjectScene
                    projectId={projectId}
                    interactive
                    showChrome
                    title={viewerTitle}
                    onExit={() => setNavMode('orbit')}
                />
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

            {state.status === 'ready' && entryView === 'scene' && navMode === 'orbit' ? (
                <button
                    type="button"
                    style={{ ...overlayButtonStyle, position: 'absolute', top: '1rem', right: '1rem', zIndex: 20 }}
                    onClick={() => setNavMode('walk')}
                >
                    Walk / Fly
                </button>
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
