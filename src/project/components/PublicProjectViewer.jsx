import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MadeWithBadge from '../../components/MadeWithBadge.jsx'
import LoadingScreen from '../../components/LoadingScreen.jsx'
import lazyWithReload from '../../utils/lazyWithReload.js'
import ProjectSwitcher from './ProjectSwitcher.jsx'
import { createProjectSyncService } from '../services/projectSyncService.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    buildProjectEventsUrl,
    getProjectDocument,
    listProjectOps
} from '../services/projectsApi.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import {
    buildPresentationPreviewDocument,
    PREVIEW_ENTER_EXHIBITION_KIND,
    PREVIEW_HOST_MESSAGE_TYPE
} from '../../utils/presentationPreviewDocument.js'
import { bundleCodeFiles } from '../../utils/codeFilesBundle.js'
import { overlayButtonStyle, overlayCardStyle } from './publicViewerStyles.js'
import { consumeArriveWalking } from '../../components/arriveWalking.js'

// A code-mode published page is an <iframe srcDoc> and nothing else -- it never
// mounts a canvas. Everything that touches three (both scene renderers, the XR
// store, the camera framing math) lives behind this one lazy boundary, because
// a single static import of any of them -- even one only used to render a scene
// -- makes the code-mode page fetch and evaluate the whole three/fiber/drei/xr
// chunk (~1.6MB raw, measured against first paint on /br_id_ge).
const PublicProjectSceneSurface = lazyWithReload(() => import('./PublicProjectSceneSurface.jsx'), 'public-scene-surface')

// di.iiii's one loading screen — black, one spinner, no drawn words
// (LoadingScreen.jsx). The published face used to show its own lit text pill
// here, the last per-surface loading look left.
const loadingOverlay = <LoadingScreen label="Loading live experience" />

// deviceAccess (owner opt-in in presentationState) adds allow-same-origin so the
// page has a real security origin — getUserMedia is impossible in an opaque one
const PAGE_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals'

export default function PublicProjectViewer({ spaceId, projectId, spaceLabel = '', initialCameraView = null, showProjectSwitcher = false }) {
    const [state, setState] = useState({
        status: 'loading',
        document: null,
        error: ''
    })
    const [viewMode, setViewMode] = useState(null)
    // 'scene' entry view only -- fixed-camera and code/iframe presentations
    // are a deliberate per-project choice and stay exactly as authored.
    const [navMode, setNavMode] = useState('orbit')
    // ?preview=1 — embedded thumbnail mode (Studio space cards): static
    // authored camera, no navigation, no Walk/Fly or XR chrome. The document
    // still live-syncs, so the thumbnail follows what is actually published.
    const [isPreview] = useState(() => (
        typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('preview') === '1'
    ))
    // ?embed=1 — this page is a WINDOW inside somebody else's page, not a
    // destination. The viewer stops being a frame around the work and becomes
    // glass: no paper of its own, no badge, no Walk/Fly.
    //
    // br_id_ge's rite has passed &embed=1 since it started opening the field
    // inside its own ending, and asked for it the only other way available —
    // reaching into the iframe's contentDocument to restyle it. Published
    // pages are sandboxed WITHOUT allow-same-origin, so that reach always
    // threw, and the embedded field fell back to painting opaque paper. The
    // result on the live site was a rectangle pasted across the ending, with
    // the shared body and the visitor's own mark hidden behind it. A window
    // the host cannot see through is a box; only the viewer itself can open it.
    const [isEmbed] = useState(() => (
        typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('embed') === '1'
    ))
    // The DOCUMENT, not just this component's own shell: html/body/#root carry
    // --di-black from base.css, which sat under a "transparent" viewer and left
    // an embedded page a black box when viewed on its own. Toggled rather than
    // set, so routing away from an embedded page takes the ground back.
    //
    // `window.document`, deliberately: this component declares `const document =
    // state.document` below, which shadows the global for the WHOLE function
    // scope — a bare `document` here resolves to a project document object, not
    // the DOM, and the class would silently never be applied.
    useEffect(() => {
        if (!isEmbed || typeof window === 'undefined') return undefined
        const root = window.document.documentElement
        root.classList.add('dii-embed')
        return () => root.classList.remove('dii-embed')
    }, [isEmbed])

    const iframeRef = useRef(null)
    const syncServiceRef = useRef(createProjectSyncService())
    const versionRef = useRef(0)
    const documentRef = useRef(null)

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
        setState((current) => ({
            ...current,
            status: 'ready',
            document: normalized,
            error: ''
        }))
    }, [projectId, resolvedRouteSpaceId])

    const applyIncomingOps = useCallback((ops = [], version = null) => {
        setState((current) => {
            if (!current.document) {
                return current
            }
            const nextDocument = applyProjectOps(current.document, ops || [])
            documentRef.current = nextDocument
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
    // Work in the node lane. The renderer that can show it is not the one walk
    // mode uses — see the Walk / Fly control below.
    const hasGraph = (document?.nodes?.length || 0) > 0
    // What walk mode would actually have to show. `entities` is always an array
    // after normalization, so presence proves nothing — length does. Explicitly
    // hidden entities are dropped with their whole subtree by LiveProjectScene,
    // so a room whose entities are all hidden is empty in there.
    const hasWalkableEntities = (document?.entities || [])
        .some((entity) => entity?.components?.runtime?.visible !== false)
    // The two entry views that open onto a room. 'fixed-camera' only replaces
    // the auto-framed opening shot with the author's composed one — the room
    // behind it is the same room, so it is walkable. 'code' is the one entry
    // view where a Walk / Fly button means nothing: there is no room, only a
    // page in an iframe.
    const isSpatialEntry = entryView === 'scene' || entryView === 'fixed-camera'
    // A visitor who WALKED through a portal arrives walking — the flag is set
    // by the walker's portal jump (see arriveWalking.js) and honoured only when
    // this room passes the same gate the Walk / Fly button uses; consumed
    // unconditionally so it can never leak into an unrelated navigation.
    const walkGateOpen = isSpatialEntry && (!hasGraph || hasWalkableEntities) && !isPreview && !isEmbed
    useEffect(() => {
        if (state.status !== 'ready') return
        if (consumeArriveWalking() && walkGateOpen) setNavMode('walk')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.status, projectId])
    const hasFiles = Array.isArray(presentationState.codeFiles) && presentationState.codeFiles.length > 0
    const rawHtml = hasFiles ? bundleCodeFiles(presentationState.codeFiles) : (presentationState.codeHtml || '')
    // the shell's query belongs to the page it is showing — a published page
    // hands over to a sibling with ?param=…, and srcdoc would otherwise drop it
    const previewDocument = buildPresentationPreviewDocument(
        rawHtml,
        typeof window !== 'undefined' ? window.location.search : '',
        typeof window !== 'undefined' ? window.location.origin : ''
    )
    const xrDefaultMode = publishState.xrDefaultMode || 'none'

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
                // See LiveProjectScene: a swallowed catch-up failure lets the
                // stream apply later ops over the gap, silently diverging the
                // viewer until a full reload.
                try {
                    const catchUp = await listProjectOps(projectId, versionRef.current)
                    applyIncomingOps(catchUp.ops || [], Number(catchUp.latestVersion))
                } catch {
                    void reloadDocument()
                }
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
                // dvh = visible viewport (excludes mobile address bar). 100vh is
                // the large viewport, ~72px taller than the screen on mobile, which
                // pushes the bottom-anchored Walk/Fly + Enter AR controls off-screen.
                height: '100dvh',
                minHeight: '100dvh',
                position: 'relative',
                background: isEmbed ? 'transparent' : '#05070a',
                overflow: 'hidden'
            }}
        >
            {showCodeView && document ? (
                presentationState.codeSourceType === 'url' && presentationState.codeUrl?.trim() ? (
                    <iframe
                        title={viewerTitle}
                        src={presentationState.codeUrl.trim()}
                        loading="lazy"
                        sandbox={presentationState.deviceAccess ? `${PAGE_SANDBOX} allow-same-origin` : PAGE_SANDBOX}
                        allow="camera; microphone; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
                        referrerPolicy="strict-origin-when-cross-origin"
                        style={{
                            border: 0,
                            width: '100%',
                            height: '100dvh',
                            background: isEmbed ? 'transparent' : '#05070a'
                        }}
                    />
                ) : rawHtml ? (
                    <iframe
                        ref={iframeRef}
                        title={viewerTitle}
                        srcDoc={previewDocument}
                        sandbox={presentationState.deviceAccess ? `${PAGE_SANDBOX} allow-same-origin` : PAGE_SANDBOX}
                        allow="camera; microphone; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
                        style={{
                            border: 0,
                            width: '100%',
                            height: '100dvh',
                            background: isEmbed ? 'transparent' : '#05070a'
                        }}
                    />
                ) : (
                    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
                        <div style={overlayCardStyle}>
                            <strong>Code view is empty.</strong>
                        </div>
                    </div>
                )
            ) : document ? (
                <Suspense fallback={loadingOverlay}>
                    <PublicProjectSceneSurface
                        projectId={projectId}
                        document={document}
                        title={viewerTitle}
                        entryView={entryView}
                        navMode={navMode}
                        onNavModeChange={setNavMode}
                        isPreview={isPreview}
                        initialCameraView={initialCameraView}
                        xrDefaultMode={xrDefaultMode}
                        canOfferXrEntry={
                            state.status === 'ready'
                            && navMode === 'orbit'
                            && entryView === 'scene'
                            && !isPreview
                            && xrDefaultMode !== 'off'
                        }
                    />
                </Suspense>
            ) : null}

            {/* Walk mode enters LiveProjectScene, which renders `entities` and
                not `nodes`. Offering it on a room built out of nodes ALONE
                would walk the visitor into a version of it with the work
                missing — worse than not offering it, because they would read
                the emptiness as the room rather than as the mode.
                A graph on its own is no longer the test, because one document
                carries both lanes: wires, scene and light live in the node
                editor, and anything that must survive for a visitor is made as
                an entity. Such a room has a real entity body to walk into, and
                refusing it there also refused headset entry — Enter VR / Enter
                AR live inside LiveProjectScene, reachable only through walk.
                So: hidden only when the graph is all there is.
                It was also refused to every 'fixed-camera' room, which made an
                author choose between a composed opening shot and a room anyone
                could walk — two unrelated things. An authored camera is how the
                visit STARTS, not a promise they may never move. */}
            {state.status === 'ready' && navMode === 'orbit' && walkGateOpen ? (
                <button
                    type="button"
                    style={{ ...overlayButtonStyle, position: 'absolute', top: '1rem', right: '1rem', zIndex: 20 }}
                    onClick={() => setNavMode('walk')}
                >
                    Walk / Fly
                </button>
            ) : null}

            {/* no route passes showProjectSwitcher since 2026-08-07 (owner call:
                the chip clashed with published page designs) — kept for a future
                edit-context surface, not reachable from public links */}
            {showProjectSwitcher && state.status !== 'loading' && navMode === 'orbit' && !isPreview ? (
                <ProjectSwitcher
                    spaceId={resolvedRouteSpaceId}
                    currentProjectId={projectId}
                    spaceLabel={spaceLabel}
                />
            ) : null}

            {/* walk mode shows the badge in the LiveProjectScene chrome header */}
            {/* the host page carries its own badge; a second one inside the
                window reads as chrome belonging to the work itself */}
            {state.status === 'ready' && navMode === 'orbit' && !isPreview && !isEmbed ? (
                <MadeWithBadge variant="floating" />
            ) : null}

            {/* the loading screen is deliberately black and full-bleed, which is
                the exact box embed mode exists to remove — inside a window it
                would flash one on every open. The host's own page is what the
                visitor waits on. */}
            {state.status === 'loading' && !isEmbed ? loadingOverlay : null}

            {state.status === 'error' ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '2rem' }}>
                    <div style={overlayCardStyle}>
                        <strong>{state.error}</strong>
                    </div>
                </div>
            ) : null}
        </main>
    )
}
