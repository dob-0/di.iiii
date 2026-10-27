import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MadeWithBadge from '../../components/MadeWithBadge.jsx'
import SpaceContentsBadge from '../../components/SpaceContentsBadge.jsx'
import SurfaceBar from '../../components/SurfaceBar.jsx'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { spaceTabTitle } from '../../utils/oneNamePerSpace.js'
import useLocalInstall from '../../hooks/useLocalInstall.js'
import useSpaceContentsCount from '../../hooks/useSpaceContentsCount.js'
import useRoomSound, { useVisitorSoundGate } from '../../hooks/useRoomSound.js'
import { roomHasSound } from '../../utils/roomSound.js'
import RoomTextLayer from './RoomTextLayer.jsx'
import './roomTextLayer.css'
import LoadingScreen from '../../components/LoadingScreen.jsx'
import { crowdedTabsLine, useAnswerTabPings, useCrowdedTabs } from '../../utils/siblingTabs.js'
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
    PREVIEW_HOST_MESSAGE_TYPE,
    PREVIEW_PAINT_CONFIRMED_KIND
} from '../../utils/presentationPreviewDocument.js'
import { bundleCodeFiles } from '../../utils/codeFilesBundle.js'
import { overlayButtonStyle, overlayCardStyle, quietPreviewFallbackStyle } from './publicViewerStyles.js'
import { consumeArriveWalking } from '../../components/arriveWalking.js'
import { buildAppSpacePath, buildSpaceContentsPath } from '../../utils/spaceRouting.js'
import { isEmbedRequest } from '../../utils/previewMode.js'
import { hasRig } from '../../rigbuild/hasRigLamps.js'
import RigVersionSwitch from '../../rigbuild/RigVersionSwitch.jsx'
import SceneBar, { EditInStudio, barButtonStyle } from '../../rigbuild/SceneBar.jsx'
import { VIEW_LAYER_IDS, VIEW_LAYER_LABELS, parseLayersParam } from '../viewport/smartView/smartViewGeometry.js'
import { rigVariantOf } from '../../rigbuild/rigVariant.js'
import { rigChromeTops, rigRowMaxWidth, rigVersionPlacement } from '../../rigbuild/rigVersionLayout.js'
import { useViewportMode } from '../../hooks/useViewportMode.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import { isSpaceInSessionScope } from '../../utils/sessionScope.js'
import { visitorChromeOf, canEditSession } from '../../shared/visitorChrome.js'
import DisplayChip from '../../rigbuild/DisplayChip.jsx'
import useOutputMode from '../viewport/useOutputMode.js'
import { renderPlan } from '../../shared/renderPlan.js'
import useRenderMode from '../viewport/useRenderMode.js'
import { useGraphMakesRoom } from './graphRoom.js'

// A code-mode published page is an <iframe srcDoc> and nothing else -- it never
// mounts a canvas. Everything that touches three (both scene renderers, the XR
// store, the camera framing math) lives behind this one lazy boundary, because
// a single static import of any of them -- even one only used to render a scene
// -- makes the code-mode page fetch and evaluate the whole three/fiber/drei/xr
// chunk (~1.6MB raw, measured against first paint on /br_id_ge).
const PublicProjectSceneSurface = lazyWithReload(() => import('./PublicProjectSceneSurface.jsx'), 'public-scene-surface')

// The rig's steps row in the room (src/rigbuild/RoomRigSteps.jsx): loaded only when the
// room holds a rig, so a space with none pays nothing for the rig code.
const RoomRigSteps = lazyWithReload(() => import('../../rigbuild/RoomRigSteps.jsx'), 'room-rig-steps')
// The room posed by the desk's live look (src/rigbuild/RoomLookFollower.jsx), same rule.
const RoomLookFollower = lazyWithReload(() => import('../../rigbuild/RoomLookFollower.jsx'), 'room-look-follower')
// How the view moves (speed, turning): the small Move control in the corner. Lazy because its speed reading comes with three.
const MoveControl = lazyWithReload(() => import('./MoveControl.jsx'), 'move-control')

// di.iiii's one loading screen — black, one spinner, no drawn words
// (LoadingScreen.jsx). The published face used to show its own lit text pill
// here, the last per-surface loading look left.
const loadingOverlay = <LoadingScreen label="Loading live experience" />
const crowdedOverlay = <LoadingScreen label="Loading live experience" slowText={crowdedTabsLine} slowAfterMs={0} />

// The ring, asking after the stall whether other tabs hold the connections. Used for BOTH waits: the document/stream
// and the lazy scene code — a starved tab can get its document and then hang on the scene chunk (seen 2026-10-20,
// 6 tabs over http: the ring that stayed was the Suspense fallback, which never asked).
function LiveStallRing({ waiting = true }) {
    return useCrowdedTabs(waiting) ? crowdedOverlay : loadingOverlay
}

// deviceAccess (owner opt-in in presentationState) adds allow-same-origin so the
// page has a real security origin — getUserMedia is impossible in an opaque one
const PAGE_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals'

// How long a code-mode preview thumbnail waits for a sign of life before
// falling back to a quiet stand-in, if it never gets even that — see the
// comment at `canConfirmPaint` below for what counts as one and why it can
// only ever be a backstop, not a real "finished loading" signal.
const CODE_PREVIEW_PAINT_TIMEOUT_MS = 10000

export default function PublicProjectViewer({ spaceId, projectId, spaceLabel = '', spaceAddress = null, spaceRecordId = null, initialCameraView = null, showProjectSwitcher = false, showProjectInTitle = false }) {
    const [state, setState] = useState({
        status: 'loading',
        document: null,
        error: ''
    })
    const [viewMode, setViewMode] = useState(null)
    const [streamOpen, setStreamOpen] = useState(false)
    // Stalled on the ring with no stream: is it the browser's per-host ceiling?
    useAnswerTabPings()
    // 'scene' entry view only -- fixed-camera and code/iframe presentations
    // are a deliberate per-project choice and stay exactly as authored.
    const [navMode, setNavMode] = useState('orbit')
    // Auto fly (viewport/autoFly.js): the drone flight through the room. ?fly=1 starts it on open, for showing the work.
    const [flying, setFlying] = useState(() => typeof window !== 'undefined' && /[?&]fly=1(&|$)/.test(window.location.search))
    // "Inside": keep the camera inside the building (SmartView). On by default where there is a building,
    // remembered per browser; a preset whose camera stands outside the building (Top, Side) pauses it.
    const [lockInside, setLockInside] = useState(() => {
        try { return window.localStorage.getItem('di.view.lockInside') !== '0' } catch { return true }
    })
    const [hasBuilding, setHasBuilding] = useState(false)
    const [lockPaused, setLockPaused] = useState(false)
    const onBuilding = useCallback((on) => setHasBuilding(Boolean(on)), [])
    const onLockPaused = useCallback((on) => setLockPaused(Boolean(on)), [])
    // The layers (SceneBar: Roof · Walls · Machines · Outside, owner 2026-10-12 "we need all 3"): all shown unless the
    // link says otherwise (?layers=walls,machines — the layers shown), and every toggle writes the link back.
    // The room page is the showcase link: the building stands whole (Cut off) unless the address names the layers
    // (owner 2026-10-15 N730). The cutaway is a work reading (Studio / Tech), switched on from the Display menu.
    const [layers, setLayers] = useState(() => {
        const search = typeof window !== 'undefined' ? window.location.search : ''
        const parsed = parseLayersParam(search)
        let named = false
        try { named = new URLSearchParams(search).get('layers') !== null } catch { named = false }
        return named ? parsed : { ...parsed, cut: false }
    })
    const toggleLayer = useCallback((id) => {
        setLayers((prev) => {
            const next = { ...prev, [id]: prev[id] === false }
            try {
                const url = new URL(window.location.href)
                // the default here is the whole building (Cut off): that state needs no parameter, every other state is named in full
                const wholeBuilding = next.cut === false && VIEW_LAYER_IDS.every((lid) => lid === 'cut' || next[lid] !== false)
                const value = wholeBuilding ? null : (VIEW_LAYER_IDS.filter((lid) => next[lid] !== false).join(',') || 'none')
                if (value === null) url.searchParams.delete('layers')
                else url.searchParams.set('layers', value)
                window.history.replaceState(window.history.state, '', url)
            } catch { /* no history (tests) */ }
            return next
        })
    }, [])
    const toggleLockInside = useCallback(() => {
        setLockInside((on) => {
            try { window.localStorage.setItem('di.view.lockInside', on ? '0' : '1') } catch { /* private window */ }
            return !on
        })
    }, [])
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
    const [isEmbed] = useState(() => isEmbedRequest())
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
    // The in-flight snapshot load, so the SSE catch-up can wait for the version
    // it is supposed to catch up FROM. See onReady below.
    const documentLoadRef = useRef(null)

    useEffect(() => {
        documentRef.current = state.document
    }, [state.document])

    const resolvedRouteSpaceId = spaceId || DEFAULT_PROJECT_SPACE_ID
    // Standing in a room, the only way out was one badge to the whole Spaces
    // grid — and inside `main` not even that, because the badge assumes `/`
    // already IS this room. True for a visitor to diiii.xyz, false on an
    // install, where `/` is the Spaces list. So: on a machine that is running
    // di.iiii, the room carries the bar and the space you are in stays named.
    const localInstall = useLocalInstall()
    // How many things are on show in this space — the number that decides
    // whether there is a rest of the space to offer at all. 0 or 1 means this
    // room IS the space, and both the corner link and the reader's door list
    // stay silent. Never asked for in a preview or an embedded window: a
    // thumbnail and somebody else's page are not places to leave from.
    const spaceContentsCount = useSpaceContentsCount(
        !isPreview && !isEmbed ? resolvedRouteSpaceId : null
    )

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
                error: error.message || 'Could not load the live project.',
                // 404: the address names a project this space does not hold — the page
                // says which, and offers the way back (MissingProjectCard below).
                missing: error?.status === 404
            })
        }
    }, [applyIncomingDocument, projectId])

    useEffect(() => {
        documentLoadRef.current = reloadDocument()
    }, [reloadDocument])

    const document = state.document
    // A room with a rig carries the rig's steps under the bar (owner, 2026-09-28: "make
    // buttons in space that we can easy move in the workflow"). Where the bar is — a
    // di.iiii on your own machine, where the rig is made and the desk runs — never on a
    // published page a stranger opens (the owner's 2026-08-07 call: tool chrome clashed
    // with published designs), a thumbnail or somebody else's page.
    const roomHasRig = useMemo(() => hasRig(document?.entities || []), [document?.entities])
    const showRigSteps = state.status === 'ready' && roomHasRig && localInstall.isLocal && !isPreview && !isEmbed
    // What the room's own corner controls clear at the top: the bar, and the steps row.
    const topClear = `calc(1rem${localInstall.isLocal ? ' + var(--sbar-h, 36px)' : ''}${showRigSteps ? ' + var(--sbar-h, 36px)' : ''})`
    // The same clearance without the 1rem gutter, for a header that pads itself.
    const chromeClear = `calc(0px${localInstall.isLocal ? ' + var(--sbar-h, 36px)' : ''}${showRigSteps ? ' + var(--sbar-h, 36px)' : ''})`

    // While the desk plays one of the room's looks, the scene draws the lamps as the look
    // poses them (RoomLookFollower); the document itself is never written.
    // WHAT VISITORS SEE (Studio: Project > What visitors see): the author's switches for this page's own controls, and
    // Edit in Studio only for a session that can edit here. Everything allowed still starts closed (rememberedOpen.js).
    const chrome = useMemo(() => visitorChromeOf(document), [document])
    const session = useAuthSession()
    const canEdit = canEditSession(session, spaceId || DEFAULT_PROJECT_SPACE_ID, isSpaceInSessionScope)
    const [lookEntities, setLookEntities] = useState(null)
    // The rig's version row (RigVersionSwitch) shows in orbit on a project that is one of
    // a set; the show chip sits under it then, else where the row would be.
    const rigVersionsShown = state.status === 'ready' && navMode === 'orbit' && !isPreview && !isEmbed && chrome.versions && Boolean(rigVariantOf(document?.entities || []))
    // Output mode (viewport/outputMode.js): everyone but the work machine sees a copy of the
    // room drawn light enough for a phone; the document itself is never written.
    const [outputMode, setOutputMode] = useOutputMode()
    // What the room is drawn FOR (src/shared/renderPlan.js): Show for everyone, Tech for the crew in the live show
    // (Display → Tech, ?render=tech). Render first, then quality; a copy, never the document.
    const [renderMode, setRenderMode] = useRenderMode()
    const plan = useMemo(() => renderPlan(document, { mode: renderMode, quality: outputMode ? 'low' : 'high' }), [document, renderMode, outputMode])
    const viewDocument = plan.document
    // Tech turns the machines and the outside off, over the viewer's own layer switches
    const drawnLayers = useMemo(() => (plan.layers ? { ...(layers || {}), ...plan.layers } : layers), [plan.layers, layers])
    const sceneDocument = useMemo(() => (viewDocument && lookEntities ? { ...viewDocument, entities: lookEntities } : viewDocument), [viewDocument, lookEntities])
    // A visitor is standing here, not authoring. Arming the gate is what makes
    // an `audio` entity silent until asked — see src/utils/roomSound.js. The
    // editor never arms it, so an author still hears what they place.
    useVisitorSoundGate()
    const { isPhoneCompact } = useViewportMode()
    const { soundOn, locked: soundLocked, toggleSound } = useRoomSound()
    const hasSound = useMemo(() => roomHasSound(document?.entities), [document?.entities])
    const publishState = document?.publishState || {}
    const presentationState = document?.presentationState || {}
    const entryView = viewMode || presentationState.entryView || 'scene'
    const showCodeView = entryView === 'code'
    // Work in the node lane. The renderer that can show it is not the one walk
    // mode uses — see the Walk / Fly control below. Only a graph that draws in the room counts (graphRoom.js): a VJ
    // Deck alone is not a node room, and hid the Fly button on MOXIR v2-11.
    const hasGraph = useGraphMakesRoom(document?.nodes) === true
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
    // The one gate walk mode has: shared by the Walk / Fly button and the
    // arrive-walking effect below.
    const walkGateOpen = isSpatialEntry && (!hasGraph || hasWalkableEntities) && !isPreview && !isEmbed
    // The author may take Walk / Fly (and Inside, Quality) off the page; the gate above still decides arriving walking.
    const walkButtons = walkGateOpen && chrome.walk
    // The version row and the show chip: on a portrait phone the row gets its own line
    // under Walk / Fly / Sound instead of running under them (rigbuild/rigVersionLayout.js).
    const { rowTop: rigRowTop, chipTop: rigChipTop } = rigChromeTops(topClear, {
        rowShown: rigVersionsShown,
        compact: isPhoneCompact,
        rightControls: (navMode === 'orbit' && walkButtons) || (state.status === 'ready' && hasSound && !soundLocked && !isPreview),
        // Walk / Fly, then Inside / Free (a room with a building), then Low / High, then Move, then Auto fly, each one 56 px line, all top-right
        rightLines: state.status === 'ready' && navMode === 'orbit' && walkButtons ? (hasBuilding ? 5 : 4) : null
    })
    // In walk mode the row is one collapsed button under the room's header (rigVersionPlacement),
    // so a visitor switches version without Esc; the show chip is an orbit thing and stays put.
    const rigPlacement = rigVersionPlacement(topClear, {
        isRigSet: state.status === 'ready' && !isPreview && !isEmbed && chrome.versions && Boolean(rigVariantOf(document?.entities || [])),
        navMode,
        rowTop: rigRowTop
    })
    // The row stops before Walk / Fly and Sound instead of running under them.
    const rigRowMaxW = rigRowMaxWidth({
        compact: isPhoneCompact,
        walk: navMode === 'orbit' && walkButtons,
        sound: state.status === 'ready' && hasSound && !soundLocked && !isPreview
    })
    // ONE bar at the top of a rig scene in orbit (rigbuild/SceneBar.jsx): versions, Edit in Studio, the SHOW chip on the
    // left, the room's own controls (Sound, Walk / Fly, Free, Low / High) and the dev-copy chip on the right.
    const sceneBar = state.status === 'ready' && !isPreview && !isEmbed && roomHasRig
    const [showSlot, setShowSlot] = useState(null)
    // The bar's measured height: in walk mode the room's own header (exit, title) sits under it, never behind it.
    const [barH, setBarH] = useState(0)
    const btnBase = sceneBar ? barButtonStyle : overlayButtonStyle
    const abs = (o) => (sceneBar ? {} : { position: 'absolute', zIndex: 20, ...o })
    const hasFiles = Array.isArray(presentationState.codeFiles) && presentationState.codeFiles.length > 0
    const rawHtml = hasFiles ? bundleCodeFiles(presentationState.codeFiles) : (presentationState.codeHtml || '')
    // the shell's query belongs to the page it is showing — a published page
    // hands over to a sibling with ?param=…, and srcdoc would otherwise drop it
    const previewDocument = buildPresentationPreviewDocument(
        rawHtml,
        typeof window !== 'undefined' ? window.location.search : '',
        typeof window !== 'undefined' ? window.location.origin : '',
        typeof window !== 'undefined' ? window.location.hash : ''
    )
    const xrDefaultMode = publishState.xrDefaultMode || 'none'
    const codeUrl = presentationState.codeSourceType === 'url' ? presentationState.codeUrl?.trim() : ''
    // Most published code-mode pages are ordinary DOM/CSS content, or a scene
    // that paints in a couple of seconds — measured against real spaces
    // (br_id_ge, network, platform-recordar, azd) every one painted inside
    // 2-5s even under software rendering. A card thumbnail should keep
    // showing that live picture, not a stand-in. See CODE_PREVIEW_PAINT_TIMEOUT_MS
    // below for the rare piece that never gets there.
    //
    // Only `rawHtml` (an `<iframe srcDoc>` this app itself wraps via
    // buildPresentationPreviewDocument) can ever tell us it is alive — its
    // bootstrap script posts PREVIEW_PAINT_CONFIRMED_KIND the first time the
    // page shows any sign of life (see that file for what "sign of life"
    // means and why silence is not proof either way). A `codeUrl` page is
    // someone else's whole site at `src=`, truly cross-origin: nothing can be
    // injected into it, so there is no confirmation to wait for and no honest
    // way to time it out either — it stays live unconditionally, exactly as
    // it did before this fix existed.
    const canConfirmPaint = showCodeView && Boolean(rawHtml)
    const codePreviewPaintedRef = useRef(false)
    const [codePreviewStalled, setCodePreviewStalled] = useState(false)

    useEffect(() => {
        setViewMode(null)
        setNavMode('orbit')
    }, [presentationState.entryView])

    useEffect(() => {
        if (!isPreview || !canConfirmPaint) return undefined
        codePreviewPaintedRef.current = false
        setCodePreviewStalled(false)
        const timer = window.setTimeout(() => {
            if (!codePreviewPaintedRef.current) setCodePreviewStalled(true)
        }, CODE_PREVIEW_PAINT_TIMEOUT_MS)
        return () => window.clearTimeout(timer)
    }, [isPreview, canConfirmPaint, rawHtml])

    // A visitor who WALKED through a portal arrives walking — the flag is set
    // by the walker's portal jump (see arriveWalking.js) and honoured only when
    // this room passes the same gate the Walk / Fly button uses; consumed
    // unconditionally so it can never leak into an unrelated navigation.
    // Declared AFTER the entryView reset above on purpose: the reset fires on
    // the same document-ready commit (entryView undefined → authored value),
    // and effects run in declaration order — above it, the walk this sets was
    // stomped straight back to orbit before it ever painted.
    useEffect(() => {
        if (state.status !== 'ready') return
        if (consumeArriveWalking() && walkGateOpen) setNavMode('walk')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.status, projectId])

    useEffect(() => {
        if (!showCodeView) return undefined
        const handleMessage = (event) => {
            if (event.source !== iframeRef.current?.contentWindow) return
            if (event.data?.type !== PREVIEW_HOST_MESSAGE_TYPE) return
            if (event.data?.kind === PREVIEW_PAINT_CONFIRMED_KIND) {
                // Cancel, don't just ignore: this can arrive AFTER the
                // timeout already flipped codePreviewStalled (a slow but
                // real load) — a late sign of life should still put the
                // live picture back, not leave the quiet stand-in up as if
                // nothing changed.
                codePreviewPaintedRef.current = true
                setCodePreviewStalled(false)
                return
            }
            if (event.data?.kind !== PREVIEW_ENTER_EXHIBITION_KIND) return
            setViewMode('scene')
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [showCodeView])

    useEffect(() => {
        if (!projectId) return undefined
        // A thumbnail does NOT hold a live stream open. An SSE connection is a
        // socket that never closes, and a browser gives one origin six of them
        // over HTTP/1.1: twelve space cards each opening one exhausted the
        // connection pool, and every card after the sixth could not fetch a
        // single module — it sat on the black loading screen forever no matter
        // how long anyone waited. That is the second half of the same bug the
        // boot queue was written for, and the one that made "wait longer" not
        // work. A card is a picture of the space as published; it re-reads the
        // document when it remounts (scrolling away and back), and clicking it
        // opens the real live surface, stream and all.
        if (isPreview) return undefined

        const syncService = syncServiceRef.current
        syncService.connect({
            eventsUrl: buildProjectEventsUrl(projectId),
            onOpen: () => setStreamOpen(true),
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
                    // Wait for the snapshot before asking what changed since
                    // it. The stream is usually ready first, and versionRef is
                    // still 0 until the document GET resolves -- so this asked
                    // ?since=0, which is not a catch-up but a full replay of
                    // the retained log. Every PUT /document appends a
                    // replaceDocument op carrying a COMPLETE copy of the
                    // document, so a page shipped itself once as the document
                    // and again per retained op: measured 2026-08-27 on
                    // staging, the-yard was 1.98 MB of document plus 3.97 MB
                    // of ops, 67% of it discarded on arrival. The server
                    // filters `version > since` and both endpoints advance the
                    // same documentVersion counter, so the snapshot's own
                    // version is exactly the right floor.
                    await documentLoadRef.current
                    // A failed snapshot leaves no document for ops to apply to
                    // (applyIncomingOps no-ops without one); retry the snapshot
                    // rather than pull the whole log to throw it away.
                    if (!documentRef.current) {
                        void reloadDocument()
                        return
                    }
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
    }, [applyIncomingOps, isPreview, projectId, reloadDocument])

    // The name this surface gives itself in di.iiii's own furniture: the room's
    // heading for a screen reader and a crawler, the walk-mode header, the
    // iframe's accessible name. Naming rule (docs/ai/vocabulary.md, "One name
    // per space"): the SPACE's name, unless the URL named the project. It used
    // to be the project's title everywhere, so /dilijan announced itself as
    // "Welcome", /network as "who makes di.iiii" and /br-id-ge as "the landing —
    // the door" while its tab, card and list all said the space's name.
    const viewerTitle = useMemo(() => {
        const spaceName = spaceLabel || spaceAddress || resolvedRouteSpaceId
        if (showProjectInTitle && document?.projectMeta?.title) return document.projectMeta.title
        return spaceName || document?.projectMeta?.title || ''
    }, [document?.projectMeta?.title, resolvedRouteSpaceId, showProjectInTitle, spaceAddress, spaceLabel])

    // The tab title. Naming rule (docs/ai/vocabulary.md): a space's own name is what a visitor sees for it; a project's
    // name shows only when the URL named that project. The platform's own space gets none — it is named di.iiii, so
    // index.html's default title already says the right thing (the same 'own' fossil ogRoutes.js carries for the preview
    // card). The name decides, not the word that was typed: this page is handed /di-iiii as often as /main
    // (utils/oneNamePerSpace.js). Held back until the document is ready so a loading project never flashes an empty or
    // stale title, and skipped for a thumbnail/embed — neither is a destination whose tab this page owns.
    useDocumentTitle(
        isPreview || isEmbed || state.status !== 'ready'
            ? null
            : spaceTabTitle({
                // the record's id, asked of the space (/di-iiii is the same space as /main); the typed word while unknown
                spaceId: spaceRecordId || resolvedRouteSpaceId,
                label: spaceLabel,
                address: spaceAddress,
                projectTitle: showProjectInTitle ? document?.projectMeta?.title : ''
            })
    )

    // Inside / Free and Low / High: drawn in the page's corner column, or (in the scene bar) behind its Display chip.
    const insideButton = state.status === 'ready' && navMode === 'orbit' && walkButtons && hasBuilding ? (
                    <button
                        type="button"
                        aria-pressed={lockInside && !lockPaused}
                        title={lockPaused ? 'This view stands outside the building, so the camera is free here' : 'Keep the camera inside the building'}
                        style={{
                            ...btnBase,
                            ...abs({ top: `calc(${topClear} + 3.4rem)`, right: '1rem', minWidth: 104 }),
                            minHeight: 44,
                            background: lockInside && !lockPaused ? 'var(--di-cyan-dim, rgba(77, 249, 255, 0.1))' : btnBase.background,
                            border: `1px solid ${lockInside && !lockPaused ? 'var(--di-cyan, #4df9ff)' : 'var(--di-cyan-border, rgba(77, 249, 255, 0.3))'}`,
                            color: lockInside && !lockPaused ? 'var(--di-cyan, #4df9ff)' : btnBase.color
                        }}
                        onClick={toggleLockInside}
                    >
                        {lockInside && !lockPaused ? 'Inside' : 'Free'}
                    </button>
                ) : null

    const liteButton = state.status === 'ready' && navMode === 'orbit' && walkButtons ? (
                    <button
                        type="button"
                        aria-pressed={!outputMode}
                        title={outputMode
                            ? 'Quality Low: beams and haze, light enough for a phone. Tap for High, the full renderer (shadows, bloom, every lamp a real light)'
                            : 'Quality High: the work renderer. Tap for Low, light enough for a phone'}
                        style={{
                            ...btnBase,
                            ...abs({ top: `calc(${topClear} + ${hasBuilding ? '6.8rem' : '3.4rem'})`, right: '1rem', minWidth: 104 }),
                            minHeight: 44
                        }}
                        onClick={() => setOutputMode(!outputMode)}
                    >
                        {outputMode ? 'Low' : 'High'}
                    </button>
                ) : null

    // Tech | Show (src/shared/renderPlan.js, decision 2026-10-15-studio-tech-show-render.md): what the room is drawn FOR.
    // Show = the room as the audience sees it (the default); Tech = the crew's schematic, only the show's things.
    const renderButtons = state.status === 'ready' && navMode === 'orbit' && walkButtons ? (
                    <div role="group" aria-label="render" data-testid="render-switch" style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--di-space-1, 3px)' }}>
                        {[['tech', 'Tech', 'Tech: the rig as plain shapes for the crew in the live show — no air, no glow, no other objects'],
                            ['show', 'Show', 'Show: the room as the audience sees it, with its air and glow']].map(([id, label, title]) => (
                            <button
                                key={id}
                                type="button"
                                data-testid={`render-${id}`}
                                aria-pressed={renderMode === id}
                                title={title}
                                onClick={() => setRenderMode(id)}
                                style={{
                                    ...barButtonStyle,
                                    color: renderMode === id ? 'var(--di-text, #fff)' : 'var(--di-text-muted, rgba(255,255,255,0.5))'
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                ) : null

    // Under Low / High: how the view moves (speed, turning) — one small button that opens a card, the visitor's own setting on
    // this device, the same one the Studio's Scene window sets (the standard move, 2026-10-13). With the scene bar it sits in
    // DISPLAY with the other rarely-needed switches (the view page starts clear, 2026-10-13 20:21).
    const moveButton = state.status === 'ready' && navMode === 'orbit' && walkButtons ? (
                    <Suspense fallback={null}>
                        <MoveControl
                            buttonStyle={btnBase}
                            wrapStyle={sceneBar
                                ? { display: 'flex', flex: '0 0 auto' }
                                : abs({ top: `calc(${topClear} + ${hasBuilding ? '10.2rem' : '6.8rem'})`, right: '1rem' })}
                        />
                    </Suspense>
                ) : null

    // Auto fly: next to Walk / Fly (the scene bar's row) or the last line of the corner column. The flight is SmartView's;
    // any input ends it, so this button is marked data-autofly and toggles itself.
    // Only where the smart view runs: a room with a node graph is drawn by PublicGraphSurface, which has no flight yet (owed).
    const flyButton = state.status === 'ready' && navMode === 'orbit' && walkButtons && !hasGraph ? (
                    <button
                        type="button"
                        data-autofly
                        data-testid="auto-fly"
                        aria-pressed={flying}
                        title="Auto fly — a flight through the room (a drone lap, or a tour of its doors); touch anything to take the controls (Esc stops)"
                        style={{
                            ...btnBase,
                            ...abs({ top: `calc(${topClear} + ${hasBuilding ? '13.6rem' : '10.2rem'})`, right: '1rem', minWidth: 104 }),
                            minHeight: 44,
                            color: flying ? 'var(--di-cyan)' : btnBase.color,
                            borderColor: flying ? 'var(--di-cyan)' : btnBase.borderColor
                        }}
                        onClick={() => setFlying((on) => !on)}
                    >
                        Auto fly
                    </button>
                ) : null

    const barControls = (
        <>
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
            {/* Only where there is something to hear. A sound switch on a
                silent room promises a sound that is not there — and every room
                would have carried one. Sits above Walk / Fly rather than beside
                it so the pair reads as one column of room controls at any
                width, including a phone. */}
            {state.status === 'ready' && hasSound && !soundLocked && !isPreview ? (
                <button
                    type="button"
                    aria-pressed={soundOn}
                    style={{
                        ...btnBase,
                        ...abs({ top: topClear, right: navMode === 'orbit' && walkButtons ? '9.5rem' : '1rem' }),
                        color: soundOn ? 'var(--di-cyan)' : undefined,
                        borderColor: soundOn ? 'var(--di-cyan)' : undefined,
                    }}
                    onClick={toggleSound}
                >
                    Sound
                </button>
            ) : null}

            {state.status === 'ready' && navMode === 'orbit' && walkButtons ? (
                <button
                    type="button"
                    style={{
                        ...btnBase,
                        ...abs({ top: topClear, right: '1rem' }),
                    }}
                    onClick={() => setNavMode('walk')}
                >
                    Walk / Fly
                </button>
            ) : null}
            {flyButton}

            {sceneBar ? null : insideButton}
            {sceneBar ? null : liteButton}
            {sceneBar ? null : moveButton}
        </>
    )

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
                isPreview && canConfirmPaint && codePreviewStalled ? (
                    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
                        <div style={quietPreviewFallbackStyle}>{viewerTitle || 'Custom page'}</div>
                    </div>
                ) : codeUrl ? (
                    <iframe
                        title={viewerTitle}
                        src={codeUrl}
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
                <Suspense fallback={<LiveStallRing />}>
                    <PublicProjectSceneSurface
                        key={renderMode}
                        projectId={projectId}
                        spaceId={resolvedRouteSpaceId}
                        document={sceneDocument}
                        posedEntities={lookEntities}
                        outputMode={outputMode}
                        title={viewerTitle}
                        entryView={entryView}
                        navMode={navMode}
                        walkLook="drag"
                        onNavModeChange={setNavMode}
                        topClear={sceneBar && navMode === 'walk' && barH ? `calc(${topClear} + ${barH + 6}px - 1rem)` : chromeClear}
                        isPreview={isPreview}
                        initialCameraView={initialCameraView}
                        xrDefaultMode={xrDefaultMode}
                        lockInside={lockInside}
                        onBuilding={onBuilding}
                        onLockPaused={onLockPaused}
                        layers={drawnLayers}
                        viewsBar={chrome.views}
                        flyOn={flying}
                        onFlyChange={setFlying}
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

            {sceneBar ? (
                <SceneBar
                    top={topClear}
                    onHeight={setBarH}
                    slotRef={setShowSlot}
                    left={<>
                        {chrome.versions && rigVariantOf(document?.entities || []) ? (
                            <RigVersionSwitch
                                spaceId={resolvedRouteSpaceId}
                                projectId={projectId}
                                entities={document?.entities || []}
                                mode="row"
                                bare
                            />
                        ) : null}
                        {canEdit ? <EditInStudio spaceId={resolvedRouteSpaceId} projectId={projectId} /> : null}
                    </>}
                    right={<>
                        {/* Layers, Inside / Free and Low / High: one Display chip, closed until a viewer opens it */}
                        {(navMode === 'orbit' && hasBuilding && chrome.layers) || (insideButton || liteButton || renderButtons) ? (
                            <DisplayChip>
                                {navMode === 'orbit' && hasBuilding && chrome.layers ? (
                                    <div role="group" aria-label="layers" data-testid="scene-layers" style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--di-space-1, 3px)', flexWrap: 'wrap' }}>
                                        {VIEW_LAYER_IDS.map((id) => (
                                            <button
                                                key={id}
                                                type="button"
                                                data-testid={`layer-${id}`}
                                                aria-pressed={layers[id] !== false}
                                                title={id === 'cut' ? 'Cut away the roof and the walls facing you from outside' : `${layers[id] !== false ? 'Hide' : 'Show'} the ${VIEW_LAYER_LABELS[id].toLowerCase()}`}
                                                onClick={() => toggleLayer(id)}
                                                style={{
                                                    ...barButtonStyle,
                                                    color: layers[id] !== false ? 'var(--di-text, #fff)' : 'var(--di-text-muted, rgba(255,255,255,0.5))',
                                                    textDecoration: layers[id] !== false ? 'none' : 'line-through'
                                                }}
                                            >
                                                {VIEW_LAYER_LABELS[id]}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                {renderButtons}
                                {insideButton}
                                {liteButton}
                                {moveButton}
                            </DisplayChip>
                        ) : null}
                        {barControls}
                    </>}
                />
            ) : barControls}

            {roomHasRig && document && !showCodeView ? (
                <Suspense fallback={null}>
                    <RoomLookFollower
                        document={viewDocument}
                        onEntities={setLookEntities}
                        showChip={!isPreview && !isEmbed && chrome.show}
                        scenes={!isPreview && !isEmbed && chrome.scenes}
                        top={rigChipTop}
                        bare={sceneBar}
                        slot={showSlot}
                        spaceId={resolvedRouteSpaceId}
                        projectId={projectId}
                    />
                </Suspense>
            ) : null}


            {/* A rig with versions (RIG_BUILD.md §15): a row of links to its siblings. Shown
                only on a project that says it is one of a set — every other room is untouched. */}
            {rigPlacement.mode && !sceneBar ? (
                <RigVersionSwitch
                    spaceId={resolvedRouteSpaceId}
                    projectId={projectId}
                    entities={document?.entities || []}
                    top={rigPlacement.top}
                    mode={rigPlacement.mode}
                    maxWidth={rigRowMaxW}
                    bare={sceneBar}
                />
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

            {/* What a reader gets where a canvas gives them nothing: the room's
                name, its lines and its doors as real links. Same document the
                scene draws from, so it can never drift from what is on screen.
                The last door in the list is the rest of the space: this layer is
                the one part of a published page a crawler and a screen reader
                actually read, and it named only the doors the author had placed. */}
            {state.status === 'ready' && !isEmbed ? (
                <RoomTextLayer
                    title={viewerTitle}
                    spaceId={resolvedRouteSpaceId}
                    entities={document?.entities || []}
                    contentsHref={spaceContentsCount > 1 ? buildSpaceContentsPath(spaceAddress || resolvedRouteSpaceId) : null}
                />
            ) : null}

            {/* walk mode shows the badge in the LiveProjectScene chrome header */}
            {/* the host page carries its own badge; a second one inside the
                window reads as chrome belonging to the work itself */}
            {state.status === 'ready' && navMode === 'orbit' && !isPreview && !isEmbed ? (
                <>
                    <MadeWithBadge
                        variant="floating"
                        spaceId={resolvedRouteSpaceId}
                        homeIsThisRoom={!localInstall.isLocal}
                    />
                    <SpaceContentsBadge spaceId={spaceAddress || resolvedRouteSpaceId} count={spaceContentsCount} />
                </>
            ) : null}

            {localInstall.isLocal && !isPreview && !isEmbed ? (
                <SurfaceBar
                    float
                    space={resolvedRouteSpaceId}
                    spaceLabel={spaceLabel}
                    spaceAddress={spaceAddress || resolvedRouteSpaceId}
                    isLocalInstall
                />
            ) : null}

            {showRigSteps ? (
                <Suspense fallback={null}>
                    <RoomRigSteps
                        document={document}
                        spaceId={resolvedRouteSpaceId}
                        projectId={projectId}
                        projectLabel={document?.projectMeta?.title || null}
                        isLocalInstall={localInstall.isLocal}
                        underBar={localInstall.isLocal}
                    />
                </Suspense>
            ) : null}

            {/* the loading screen is deliberately black and full-bleed, which is
                the exact box embed mode exists to remove — inside a window it
                would flash one on every open. The host's own page is what the
                visitor waits on. */}
            {state.status === 'loading' && !isEmbed ? <LiveStallRing waiting={!streamOpen} /> : null}

            {state.status === 'error' ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '2rem' }}>
                    <div style={overlayCardStyle}>
                        {state.missing ? (
                            <MissingProjectCard spaceId={resolvedRouteSpaceId} projectId={projectId} />
                        ) : (
                            <strong>{state.error}</strong>
                        )}
                    </div>
                </div>
            ) : null}
        </main>
    )
}

// A project the address names and the space does not hold (owner, rigbuilder.7: the version
// switch's "Full" opened /moxir/p/moxir-hall-full → a bare "Project not found."). Which one,
// where, and the way back: the space as it opens (its published project) and everything in it.
export function MissingProjectCard({ spaceId, projectId }) {
    const linkStyle = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px', display: 'inline-flex', alignItems: 'center', minHeight: '44px', marginRight: '1.25rem' }

    return (
        <div role="alert">
            <strong>There is no project “{projectId}” in {spaceId}.</strong>
            <p style={{ margin: '0.6rem 0 0.2rem', opacity: 0.8 }}>It may not have been made yet, or it was moved or deleted.</p>
            <nav aria-label="the way back">
                <a href={buildAppSpacePath(spaceId)} style={linkStyle}>Open {spaceId}</a>
                <a href={buildSpaceContentsPath(spaceId)} style={linkStyle}>Everything in {spaceId}</a>
            </nav>
        </div>
    )
}
