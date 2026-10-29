import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import StudioInspector from './StudioInspector.jsx'
import StudioViewportLayout from './StudioViewportLayout.jsx'
import StudioFloatingPanel from './StudioFloatingPanel.jsx'
import StudioControlCluster from './StudioControlCluster.jsx'
import StudioSaveLine from './StudioSaveLine.jsx'
import StudioCueStrip from './StudioCueStrip.jsx'
import StudioProjectsPanel from './StudioProjectsPanel.jsx'
import StudioQuickInsert from './StudioQuickInsert.jsx'
import { useStudioPanelState, panelFromAddress } from '../hooks/useStudioPanelState.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import StudioCoachMarks from './StudioCoachMarks.jsx'
import RigMirrorHint from './RigMirrorHint.jsx'
import SurfaceBar, { layerReached } from '../../components/SurfaceBar.jsx'
import DeskPerformSwitch from '../../perform/DeskPerformSwitch.jsx'
import { hasRig } from '../../rigbuild/hasRigLamps.js'
import { rigEntryPath } from '../../rigbuild/rigTools.js'
import useLocalInstall from '../../hooks/useLocalInstall.js'
import { isEmbedRequest, isPreviewRequest } from '../../utils/previewMode.js'
import { loadStudioWorkspace, saveStudioWorkspace } from '../utils/studioWorkspaceStorage.js'
import '../styles/studio-mobile.css'
import { canPlaceInScene } from '../utils/assetFormats.js'
import { setViewportChoice, useViewportMode } from '../utils/viewportMode.js'
import { useViewportLayout } from '../hooks/useViewportLayout.js'
import { useRigMirrorSwitch } from '../hooks/useRigMirrorSwitch.js'
import { useSendRigPositions } from '../hooks/useSendRigPositions.js'
import { UI_TOGGLE_EVENT, requestWalk, useWalkMode } from '../navigation/useWalkNavigation.js'
import { isJamProject, loadJamAllTools, saveAllTools, saveJamAllTools, useAllTools } from '../utils/jamMode.js'
import { hallEntityIds, isLockedEntity, selectionCanMove } from '../utils/selectionTools.js'
import { JAM_PRIMITIVES } from '../../project/entityPalette.js'
import {
    AssetsPanel,
    FilesPanel,
    GeoSwitcher,
    HistoryPanel,
    JamEditPanel,
    LibraryPanel,
    ProjectPanel,
    PublishPanel,
    StructurePanel,
    TimelinePanel,
} from './StudioShellPanels.jsx'
import LoadingScreen from '../../components/LoadingScreen.jsx'

// Raycast a viewport double-click into the scene's ground plane (y=0) so a
// quick-inserted entity lands where the cursor pointed, not at a fixed default.
// Returns null when the camera/canvas isn't resolvable or the ray misses the
// plane (e.g. looking up at the horizon) — callers fall back to view placement.
// The five Studio windows, as a phone bottom nav (order = frequency of use).
const MOBILE_PANELS = [
    ['create', 'Create'],
    ['scene', 'Objects'],
    ['world', 'Scene'],
    ['publish', 'Share'],
    ['files', 'Code']
]

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const groundRaycaster = new Raycaster()
const computeGroundPoint = (event, controlsRef) => {
    const camera = controlsRef?.current?.camera
    const canvas = event.target?.closest?.('.studio-viewport-shell')?.querySelector('canvas')
    if (!camera || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    groundRaycaster.setFromCamera(ndc, camera)
    const hit = new Vector3()
    return groundRaycaster.ray.intersectPlane(GROUND_PLANE, hit) ? [hit.x, 0, hit.z] : null
}

const DEFAULT_POSITIONS = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const midY = Math.round(vh * 0.48)
    const rightX = Math.max(290, vw - 700)   // 20px left of cluster (cluster at vw-400, width≤280)
    return {
        create:  { x: 16,                    y: 90 },
        scene:   { x: rightX,                y: 90 },
        jamedit: { x: rightX,                y: 90 },
        world:   { x: rightX,                y: midY + 30 },
        publish: { x: Math.round(vw * 0.55), y: midY },
        files:   { x: Math.round(vw * 0.3),  y: 90 },
        projects:{ x: 16,                    y: midY },
    }
}

// Pre-consolidation ids from persisted workspaces map onto the five windows.
const PANEL_ID_MIGRATION = {
    library: 'create', assets: 'create',
    structure: 'scene', inspector: 'scene',
    activity: 'publish', present: 'publish',
}
const migratePanelIds = (ids) => (Array.isArray(ids) ? ids.map((id) => PANEL_ID_MIGRATION[id] || id) : ids)

export default function StudioShell({
    walkBuild = null,
    document,
    // What each layer of the project holds and which are open, from
    // src/project/useProjectLayers.js — null until the real document is here.
    layers = null,
    loading,
    loadError,
    displayName,
    onDisplayNameChange,
    selectedEntity,
    selectedEntityId,
    selectedEntityIds = [],
    entities,
    inspectorSections,
    inspectorValues,
    assetOptions,
    spaceOptions = [],
    surfaceOptions = [],
    libraryItems = [],
    onDeleteLibraryItem,
    presence,
    syncState,
    isDesktop,
    isMobile,
    cameraView,
    controlsRef,
    paneControlsRef,
    xrState,
    onCreateEntity,
    onCreateFromAsset,
    onAssetFilesSelected,
    onDriveImportUrl,
    onDriveImportSelection,
    onToggleAssetShared,
    onCommonsImport,
    onDeleteSelected,
    onGroupSelected,
    onUngroup,
    onRenameEntity,
    onToggleEntityVisible,
    onToggleEntityLocked,
    onSetEntitiesLocked,
    onLockHall,
    onUnlockAll,
    onSelectEntities,
    onReparentEntity,
    onViewportDropFiles,
    onDuplicateSelected,
    onSelectEntity,
    onInspectorChange,
    onWorldPatch,
    onRenderSettingsPatch,
    onProjectMetaPatch,
    onPresentationPatch,
    onPublishPatch,
    liveProjectState,
    onSetLiveProject,
    onClearLiveProject,
    onMakeSpacePublic,
    onSaveCurrentCamera,
    views,
    lightEnv,
    onCopyShareLink,
    onViewLive,
    previewUrl,
    onExportProject,
    exportStatus,
    onImportProjectFile,
    onEnterXr,
    onExitXr,
    onBackToHub,
    onOpenNodeEditor,
    onOpenProjection,
    onCameraViewChange,
    onTransformCommit,
    onToggleSelectEntity,
    transformOp = null,
    onStartTransform,
    onTransformCommitMany,
    onTransformCancel,
    editHistory = null,
    onHistoryJump,
    // Undo and Redo, the same calls as Ctrl+Z (useOpHistory's undo and redo, which replay inverse ops
    // through applyLocalOps). Null draws no buttons. The ends come from editHistory's cursor.
    onUndo = null,
    onRedo = null,
    // mappingState.cues, and the one way to fire one. The same cues the
    // projection tool lists; firing from here reaches the wall and the
    // lighting desk by exactly the same path.
    cues = [],
    liveCueId = null,
    onFireCue = null,
    // The scene editor's two doors (ScenePicker): changes as ops through the Studio's own history, and the desk's GO on a scene.
    onSceneOps = null,
    onPlayScene = null,
    // Nodes' things in the room, and which room Studio stands in — the whole
    // room, or the inside of a Geo (StudioEditor; null on the open jam).
    // geoSwitcher: { geos, currentGeoId, onOpenGeo, onNewGeo }
    graphRoom = null,
    geoSwitcher = null,
    // Inside a Geo, Create offers only what exists as a node.
    createPalette = null,
}) {
    const insideGeo = Boolean(geoSwitcher?.currentGeoId)
    const persistedWorkspace = useMemo(() => loadStudioWorkspace(), [])
    const { open, toggle, isOpen } = useStudioPanelState(migratePanelIds(persistedWorkspace?.open))
    const { layout: vpLayout, split: vpSplit, close: vpClose, setRatio: vpSetRatio } = useViewportLayout()
    const [uiHidden, setUiHidden] = useState(false)
    const [viewportEditMode, setViewportEditMode] = useState('navigate')
    // Blender's Select Box tool (owner 2026-10-12): in Edit, a left drag draws a box and
    // selects what is inside; the Tools row's "Select" button turns it on, Navigate off.
    const [viewportSelectTool, setViewportSelectTool] = useState(false)
    // Walk / Fly in the cluster (owner, 2026-10-13): the controller lives in the canvas, the buttons only ask it.
    const walkMode = useWalkMode()
    useEffect(() => {
        const toggle = () => setUiHidden((v) => !v)
        globalThis.document.addEventListener(UI_TOGGLE_EVENT, toggle)
        return () => globalThis.document.removeEventListener(UI_TOGGLE_EVENT, toggle)
    }, [])
    const setEditModeFromTools = useCallback((mode) => {
        if (mode === 'navigate') setViewportSelectTool(false)
        if (mode === 'select') {
            setViewportEditMode('edit')
            setViewportSelectTool((on) => !on)
            return
        }
        setViewportEditMode(mode)
    }, [])
    const [viewportGizmoMode, setViewportGizmoMode] = useState('translate')
    const [viewportGizmoSpace, setViewportGizmoSpace] = useState('world')
    const [viewportGizmoAxis, setViewportGizmoAxis] = useState(null)
    const [viewportGizmoVisible, setViewportGizmoVisible] = useState(true)
    const [quickInsert, setQuickInsert] = useState(null)
    const [positions, setPositions] = useState(() => ({ ...DEFAULT_POSITIONS(), ...(persistedWorkspace?.positions || {}) }))
    const [panelSizes, setPanelSizes] = useState(() => ({ ...(persistedWorkspace?.sizes || {}) }))
    const [collapsedPanels, setCollapsedPanels] = useState(() => new Set(persistedWorkspace?.collapsed || []))
    const [layoutKey, setLayoutKey] = useState(0)
    const [snapEdges, setSnapEdges] = useState(persistedWorkspace?.snapEdges ?? false)
    const rigMirror = useRigMirrorSwitch()
    const rigPositions = useSendRigPositions({ entities })

    // Remember the workspace across sessions — open panels, dragged positions,
    // resized dimensions, collapsed headers, snap preference. Arrange actions
    // (tile/stack/reset) flow through the same state, so they persist too.
    useEffect(() => {
        saveStudioWorkspace({ open, positions, sizes: panelSizes, collapsed: collapsedPanels, snapEdges })
    }, [open, positions, panelSizes, collapsedPanels, snapEdges])

    const recordPanelPosition = useCallback((id) => (pos) => {
        setPositions((prev) => ({ ...prev, [id]: pos }))
    }, [])

    const recordPanelSize = useCallback((id) => (size) => {
        setPanelSizes((prev) => ({ ...prev, [id]: size }))
    }, [])

    const recordPanelCollapsed = useCallback((id) => (isCollapsed) => {
        setCollapsedPanels((prev) => {
            const next = new Set(prev)
            if (isCollapsed) next.add(id)
            else next.delete(id)
            return next
        })
    }, [])

    // Everything a panel needs to restore and persist its own chrome. A saved
    // width wins over the call site's default; when none is saved the key is
    // omitted so the site-specific initialWidth stays in effect.
    const panelChrome = useCallback((id) => ({
        initialPosition: positions[id],
        ...(panelSizes[id]?.width ? { initialWidth: panelSizes[id].width } : {}),
        initialHeight: panelSizes[id]?.height ?? null,
        initialCollapsed: collapsedPanels.has(id),
        onPositionChange: recordPanelPosition(id),
        onSizeChange: recordPanelSize(id),
        onCollapsedChange: recordPanelCollapsed(id),
        snapEdges
    }), [positions, panelSizes, collapsedPanels, snapEdges, recordPanelPosition, recordPanelSize, recordPanelCollapsed])

    const openRefForPlacement = useRef(open)
    useEffect(() => { openRefForPlacement.current = open }, [open])

    // Opening a panel on top of an already-open one buries it; cascade the
    // newcomer to a free spot instead. Dragged spots and arrange actions are
    // untouched — this only affects the moment a panel opens.
    const handleTogglePanel = useCallback((id) => {
        if (!openRefForPlacement.current.has(id)) {
            setPositions((prev) => {
                const occupied = [...openRefForPlacement.current].map((key) => prev[key]).filter(Boolean)
                const collides = (p) => occupied.some((o) => Math.abs(o.x - p.x) < 24 && Math.abs(o.y - p.y) < 24)
                let pos = prev[id] || DEFAULT_POSITIONS()[id] || { x: 16, y: 90 }
                let guard = 0
                while (collides(pos) && guard < 30) {
                    pos = { x: pos.x + 28, y: pos.y + 28 }
                    guard += 1
                }
                if (pos === prev[id]) return prev
                return { ...prev, [id]: pos }
            })
        }
        toggle(id)
    }, [toggle])
    const [showHelp, setShowHelp] = useState(false)
    // `?open=files|create` (the plain project view's choices) opens that sheet on a phone, where the floating-panel set is not drawn.
    const [mobileSheet, setMobileSheet] = useState(() => (isMobile && typeof window !== 'undefined' ? panelFromAddress(window.location.search) : null))
    // How many times the person has picked something, for the first-run coach:
    // placing a thing already selects it, so "Tap it" is done by a tap, not by
    // there being a selection.
    const [selectTicks, setSelectTicks] = useState(0)
    const handleSelectEntity = useCallback((...args) => {
        setSelectTicks((ticks) => ticks + 1)
        onSelectEntity?.(...args)
    }, [onSelectEntity])
    const { type: authType } = useAuthSession()

    // Minimal jam mode (see utils/jamMode.js): at the communal open-jam
    // project, strip the editor down to the common tools — unless this device
    // opted back into the full editor via the "All tools" toggle.
    const isJam = isJamProject(document?.projectMeta?.id)
    // The door to the rig's steps from this project (RIG_BUILD.md §14): its plot.
    const rigSpaceId = liveProjectState?.spaceId
    const rigProjectId = document?.projectMeta?.id
    const projectHasRig = useMemo(() => hasRig(document?.entities || []), [document?.entities])
    const rigHref = projectHasRig && rigSpaceId && rigProjectId ? rigEntryPath(rigSpaceId, rigProjectId, 'plot') : null
    const [jamAllTools, setJamAllTools] = useState(loadJamAllTools)
    const jamMinimal = isJam && !jamAllTools
    const handleToggleJamTools = useCallback(() => {
        setJamAllTools((prev) => {
            const next = !prev
            saveJamAllTools(next)
            return next
        })
    }, [])
    // A NEW PROJECT OPENS BARE (the layers decision, 2026-09-23, unit 2): the
    // bar, the room, Create and the hint — nothing else — until the first thing
    // is placed; then the control cluster, the windows and the saved layout all
    // come back at once. Decided only once the project has loaded (a loading
    // project is neither bare nor full, it is today's screen), never for the
    // open jam (it has its own simple mode), and never under "⚒ All tools".
    // `held` stays true for the rest of this page once anything was placed, so
    // an undo of the first box does not take the tools away again. Nothing of
    // this is saved: the open windows in the browser's layout are left exactly
    // as they were, only not drawn while the project is bare.
    const allTools = useAllTools()
    const handleToggleAllTools = useCallback(() => saveAllTools(!allTools), [allTools])
    const bare = !isJam && !allTools && Boolean(layers?.loaded) && !layers.held
    // `?open=files` (the plain project view's "Write code"): the Code window is drawn even while the project is bare,
    // since that is the project the choice is offered on.
    const codeAskedFor = typeof window !== 'undefined' && panelFromAddress(window.location.search) === 'files'
    // A project that is a web page opens its page in the viewport (utils/viewportMode.js), and Create — primitives
    // and lights, 3D only — does not open by itself on top of it. Decided once the project has loaded. The person
    // can still open Create from the control cluster; the stored window layout is not changed.
    const viewportMode = useViewportMode(document)
    const codeFirst = viewportMode === 'code' && (layers ? layers.loaded : true)
    const [createAsked, setCreateAsked] = useState(false)
    // `?open=create` (the "Add pages or pictures" door) asked for Create by name: it is never held back then.
    const createAskedFor = typeof window !== 'undefined' && panelFromAddress(window.location.search) === 'create'
    const createHeldBack = codeFirst && !createAsked && !createAskedFor
    const shownOpen = useMemo(() => {
        if (!createHeldBack || !open.has('create')) return open
        const next = new Set(open)
        next.delete('create')
        return next
    }, [open, createHeldBack])
    const handleTogglePanelFor = useCallback((id) => {
        if (id === 'create' && createHeldBack) {
            setCreateAsked(true)
            if (!open.has('create')) handleTogglePanel('create')
            return
        }
        handleTogglePanel(id)
    }, [createHeldBack, open, handleTogglePanel])
    const isShown = (id) => shownOpen.has(id)
    // Studio's own jump buttons to Nodes and Projection (the control cluster, the phone
    // header) follow the bar: offered once the project has reached that tool's layer,
    // never before (2026-09-27 — the phone offered Projection before the first wire).
    const toolLayers = isJam || allTools ? null : layers?.open
    const offerNodes = layerReached('raw', toolLayers)
    const offerProjection = layerReached('map', toolLayers)

    // Jam phones get Create plus a tiny Edit tab (text/color/remove) — the
    // full Scene sheet stays hidden. A bare project's phone gets Create alone.
    const mobilePanels = jamMinimal
        ? [...MOBILE_PANELS.filter(([id]) => id === 'create'), ['jamedit', 'Edit']]
        : bare
            ? MOBILE_PANELS.filter(([id]) => id === 'create' || (id === 'files' && codeAskedFor))
            : MOBILE_PANELS

    // The one bar, carrying this project across to Nodes, Projection and Light.
    // Not in a window (?embed=1), a headset, Hide UI, or the jam's simple mode —
    // there the tools' own jumps are hidden too, and the bar is only more of them.
    const localInstall = useLocalInstall()
    // A preview (?preview=1, a Kit card's picture of Studio) hides the same
    // navigation an embedded window does.
    const [isEmbed] = useState(() => isEmbedRequest() || isPreviewRequest())
    const showBar = !uiHidden && !isEmbed && !xrState?.isXrPresenting && !jamMinimal

    // Guest first-run guidance is the action-completed coach pill
    // (StudioCoachMarks, rendered below) — the help dialog no longer
    // auto-opens over the scene; it stays behind ?.

    const selectGizmoMode = useCallback((mode) => {
        setViewportGizmoMode(mode)
        setViewportGizmoAxis(null)
        setViewportGizmoVisible(true)
    }, [])

    const openRef = useRef(open)
    useEffect(() => { openRef.current = open }, [open])

    // While the phone's bottom bar is drawn, tell the floating notices and
    // questions how much of the screen it takes (--di-bottom-offset, ui.css).
    const bottomBarDrawn = !uiHidden && Boolean(isMobile)
    useEffect(() => {
        if (!bottomBarDrawn) return undefined
        const root = window.document.documentElement
        root.classList.add('has-studio-bottom-bar')
        return () => root.classList.remove('has-studio-bottom-bar')
    }, [bottomBarDrawn])

    const resetLayout = useCallback(() => {
        setPositions(DEFAULT_POSITIONS())
        setPanelSizes({})
        setCollapsedPanels(new Set())
        setLayoutKey((k) => k + 1)
    }, [])

    const tileLayout = useCallback(() => {
        const vw = window.innerWidth
        const openIds = [...openRef.current]
        const panelW = 280
        const gap = 10
        const margin = 16
        const cols = Math.max(1, Math.min(4, Math.floor((vw - 360) / (panelW + gap))))
        const next = {}
        openIds.forEach((id, i) => {
            next[id] = {
                x: margin + (i % cols) * (panelW + gap),
                y: margin + Math.floor(i / cols) * 220,
            }
        })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

    const stackLeft = useCallback(() => {
        const openIds = [...openRef.current]
        const next = {}
        openIds.forEach((id, i) => { next[id] = { x: 16, y: 16 + i * 38 } })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

    const stackRight = useCallback(() => {
        const vw = window.innerWidth
        const openIds = [...openRef.current]
        const next = {}
        openIds.forEach((id, i) => { next[id] = { x: vw - 296, y: 16 + i * 38 } })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

    useEffect(() => {
        const handler = (e) => {
            const inInput = e.target.tagName === 'INPUT'
                || e.target.tagName === 'TEXTAREA'
                || e.target.isContentEditable
            if (inInput) return

            if (e.key === 'h' || e.key === 'H') {
                e.preventDefault()
                setUiHidden((v) => !v)
            }
            if (e.key === 'e' || e.key === 'E' || e.key === 'Tab') {
                e.preventDefault()
                setViewportEditMode((m) => (m === 'navigate' ? 'edit' : 'navigate'))
                setViewportSelectTool(false)
            }
            if (e.key === 'Escape' && quickInsert) {
                setQuickInsert(null)
            }
            if (e.key === 'Escape') {
                setShowHelp(false)
            }
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                setShowHelp((v) => !v)
            }
            // Delete/Backspace, Shift+D, and F/"." (frame selected) are owned by
            // StudioEditor's keydown handler (which also guards selection and
            // modal transforms) — binding them here too fired twice per keypress.
            // G/R/S: show the drag-handle gizmo in the matching mode.
            // X/Y/Z with a selection: arm the V1 modal pre-seeded with the current
            // gizmo mode + chosen axis (mouse delta moves on that axis immediately).
            // ModalTransform's capture listener owns X/Y/Z once a session is running.
            // T toggles gizmo visibility.
            // Alt+G/R/S are Clear Location/Rotation/Scale (StudioEditor) — never a grab.
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const modeForKey = (e.key === 'g' || e.key === 'G') ? 'translate'
                    : (e.key === 'r' || e.key === 'R') ? 'rotate'
                    : (e.key === 's' || e.key === 'S') ? 'scale'
                    : null
                if (modeForKey) {
                    e.preventDefault()
                    selectGizmoMode(modeForKey)
                    // Blender: G / R / S with a selection start the transform at once — the mouse moves it,
                    // X / Y / Z constrain, click or Enter confirm, Esc cancels (ModalTransform.jsx). No handle
                    // to find, so it works with the Select tool on (owner 2026-10-13: "in Select I can't move").
                    if (selectedEntityIds.length > 0 && onStartTransform && !transformOp) onStartTransform(modeForKey, null)
                } else if (['x', 'y', 'z'].includes(e.key.toLowerCase()) && !transformOp) {
                    e.preventDefault()
                    e.stopImmediatePropagation()
                    // Deliberately NOT 'a': this listener registers before
                    // StudioEditor's (StudioShell is its child, and child
                    // effects run first) and stopImmediatePropagation kills it
                    // on the same window target — so arming on bare 'a' made
                    // the documented "A — Select all" / "Alt+A — Deselect all"
                    // unreachable. All-axes stays available inside
                    // ModalTransform's own capture handler, where it belongs.
                    const axis = e.key.toLowerCase()
                    // Only a selection that can MOVE arms the modal: a locked selection
                    // never mounts the operator, and an op nobody cancels kills every
                    // shortcut (N581, 2026-10-15).
                    if (selectionCanMove(entities, selectedEntityIds) && onStartTransform) {
                        // Arm the V1 modal using the current gizmo mode + this axis
                        onStartTransform(viewportGizmoMode, axis)
                    } else {
                        // No selection: just constrain the drag-handle gizmo axis
                        setViewportGizmoAxis((current) => current === axis ? null : axis)
                        setViewportGizmoVisible(true)
                    }
                } else if (e.key === 't' || e.key === 'T') {
                    e.preventDefault()
                    setViewportGizmoVisible((v) => !v)
                }
            }
            // Arrangement hotkeys (Shift+A = tile, Shift+R = reset)
            if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault()
                tileLayout()
            }
            if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault()
                resetLayout()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [quickInsert, tileLayout, resetLayout, selectGizmoMode, viewportEditMode, selectedEntityIds, onStartTransform, transformOp, viewportGizmoMode, entities])

    const handleViewportDoubleClick = useCallback((e) => {
        if (e.target.closest('.sfp-shell, .scc-wrap, button, input, textarea, [role="button"]')) return
        // Navigate moves like Sketchfab (owner, 2026-10-12): a double-click focuses the camera on the surface under the pointer
        // (useCameraNavigation). Quick Insert on double-click stays the Edit tool's. Walked through 2026-10-12: with both, the
        // Quick Insert panel took the wheel and every scroll after a double-click did nothing.
        if (viewportEditMode === 'navigate') return
        setQuickInsert({ x: e.clientX, y: e.clientY, worldPos: computeGroundPoint(e, controlsRef) })
    }, [controlsRef, viewportEditMode])

    // Drop targets: OS files and Files-list items land in the scene at the
    // ground point under the cursor (same raycast as double-click Quick Insert).
    const handleViewportDragOver = useCallback((e) => {
        if (!e.target.closest?.('.studio-viewport-shell')) return
        const types = e.dataTransfer?.types || []
        if (types.includes('Files') || types.includes('application/x-dii-asset')) e.preventDefault()
    }, [])

    const handleViewportDrop = useCallback((e) => {
        if (!e.target.closest?.('.studio-viewport-shell')) return
        const worldPos = computeGroundPoint(e, controlsRef)
        const files = Array.from(e.dataTransfer?.files || [])
        if (files.length) {
            e.preventDefault()
            onViewportDropFiles?.(files, worldPos)
            return
        }
        const assetId = e.dataTransfer?.getData('application/x-dii-asset')
        if (!assetId) return
        e.preventDefault()
        const item = libraryItems.find((a) => a.id === assetId)
        if (item && canPlaceInScene(item)) onCreateFromAsset?.(item, worldPos)
    }, [controlsRef, libraryItems, onCreateFromAsset, onViewportDropFiles])

    const handleFullscreen = useCallback(() => {
        const doc = window.document
        if (!doc.fullscreenElement) {
            doc.documentElement.requestFullscreen?.()
        } else {
            doc.exitFullscreen?.()
        }
    }, [])

    // Lock (owner 2026-10-12: "a function where you can lock the objects, not only the
    // hall"): the toggle for the whole selection — any kind of object. Locked = not
    // picked by a click or a box, not moved by G/R/S or the gizmo (runtime.locked).
    const selectionLocked = useMemo(() => {
        const ids = new Set(selectedEntityIds.length ? selectedEntityIds : (selectedEntityId ? [selectedEntityId] : []))
        const picked = (entities || []).filter((entity) => ids.has(entity.id))
        return { ids: [...ids], all: picked.length > 0 && picked.every(isLockedEntity) }
    }, [entities, selectedEntityIds, selectedEntityId])
    const hallIds = useMemo(() => hallEntityIds(entities), [entities])
    const lockedCount = useMemo(() => (entities || []).filter(isLockedEntity).length, [entities])
    const lockToggle = onSetEntitiesLocked && selectionLocked.ids.length ? (
        <button
            type="button"
            className={`scc-btn insp-lock-btn${selectionLocked.all ? ' active' : ''}`}
            aria-pressed={selectionLocked.all}
            title={selectionLocked.all ? 'Unlock: it can be picked and moved again' : 'Lock: it can no longer be clicked, boxed or moved'}
            onClick={() => onSetEntitiesLocked(selectionLocked.ids, !selectionLocked.all)}
        >
            {selectionLocked.all ? 'Locked' : 'Lock'}
        </button>
    ) : null

    const inspectorFooter = (
        <button
            className="scc-btn spa-btn-wide insp-delete-btn"
            disabled={!selectedEntity}
            onClick={onDeleteSelected}
        >
            × Delete entity
        </button>
    )

    const viewportShared = {
        // a Try in the Light environment section draws the viewport with another version's light; nothing is written
        document: lightEnv?.previewDocument || document,
        selectedEntityId,
        selectedEntityIds,
        onSelectEntity: handleSelectEntity,
        onToggleSelectEntity,
        cursors: presence?.cursors,
        onCursorMove: presence?.emitCursor,
        onCursorLeave: presence?.clearCursor,
        xrStore: xrState?.xrStore,
        editMode: viewportEditMode,
        boxSelect: viewportSelectTool && viewportEditMode === 'edit',
        onSelectEntities,
        gizmoMode: viewportGizmoMode,
        gizmoSpace: viewportGizmoSpace,
        gizmoAxis: viewportGizmoAxis,
        gizmoVisible: viewportGizmoVisible,
        transformOp,
        onTransformCommit,
        onTransformCommitMany,
        onTransformCancel,
        paneControlsRef,
        initialCameraView: cameraView,
        showHelp,
        onShowHelp: () => setShowHelp(true),
        onCloseHelp: () => setShowHelp(false),
        rigMirror: rigMirror.on,
        graphRoom,
        onSceneOps,
        onPlayScene,
    }

    // One source of truth for each window's content, shared by the desktop
    // floating panels and the mobile bottom sheet (slice 7: Studio on phones).
    const panelBodies = {
        // Jam mode: upload + a few simple shapes only — no lights, no Drive/
        // Commons imports, no share/delete controls (all prop-gated away).
        create: jamMinimal ? (
            <>
                            <LibraryPanel onCreateEntity={onCreateEntity} primitives={JAM_PRIMITIVES} lights={[]} />
                            <AssetsPanel libraryItems={libraryItems} onAssetFilesSelected={onAssetFilesSelected} onCreateFromAsset={onCreateFromAsset} />
            </>
        ) : (
            <>
                            {geoSwitcher ? <GeoSwitcher {...geoSwitcher} /> : null}
                            <LibraryPanel onCreateEntity={onCreateEntity} {...(createPalette || {})} />
                            {/* Bare: the 15 things and Import files. Drive and Commons
                                are not handed until the first thing is placed, and the
                                Files list waits for its first file. */}
                            <AssetsPanel libraryItems={libraryItems} onAssetFilesSelected={onAssetFilesSelected} onCreateFromAsset={onCreateFromAsset} onDriveImportUrl={bare ? undefined : onDriveImportUrl} onDriveImportSelection={onDriveImportSelection} onToggleAssetShared={onToggleAssetShared} onCommonsImport={bare ? undefined : onCommonsImport} onDeleteLibraryItem={onDeleteLibraryItem} filesWaitForFirst={bare} />
            </>
        ),
        jamedit: (
            <JamEditPanel entity={selectedEntity} onInspectorChange={onInspectorChange} onDeleteSelected={selectedEntity ? onDeleteSelected : null} />
        ),
        scene: (
            <>
                            <StructurePanel
                                entities={entities}
                                selectedEntityId={selectedEntityId}
                                selectedEntityIds={selectedEntityIds}
                                onSelectEntity={handleSelectEntity}
                                onToggleSelectEntity={onToggleSelectEntity}
                                onGroupSelected={onGroupSelected}
                                onUngroup={onUngroup}
                                onRenameEntity={onRenameEntity}
                                onToggleEntityVisible={onToggleEntityVisible}
                                onToggleEntityLocked={onToggleEntityLocked}
                                onReparentEntity={onReparentEntity}
                            />
                            {(selectedEntity || selectedEntityIds.length > 0) ? (
                                <StudioInspector
                                    // WHICH lamp, not just what it is called. The aim field
                                    // remembers a pan across drags (a lamp hanging dead down
                                    // has no pan to read back), and without an identity that
                                    // memory followed the selection onto the NEXT lamp.
                                    identity={selectedEntityId || ''}
                                    title={selectedEntityIds.length > 1 ? `${selectedEntityIds.length} selected` : (selectedEntity ? selectedEntity.name : 'Scene')}
                                    subtitle={selectedEntityIds.length > 1 ? `Primary: ${selectedEntity?.name || selectedEntityId}` : (selectedEntity ? selectedEntity.type : 'Project defaults')}
                                    sections={inspectorSections}
                                    values={inspectorValues}
                                    assetOptions={assetOptions}
                                    spaceOptions={spaceOptions}
                                    surfaceOptions={surfaceOptions}
                                    onSectionChange={onInspectorChange}
                                    footer={inspectorFooter}
                                    headerAction={lockToggle}
                                />
                            ) : (
                                <>
                                    <p className="sfp-empty">Select an object above or in the viewport to edit it.</p>
                                    {(onLockHall || onUnlockAll) && (
                                        <div className="scc-buttons insp-lock-row">
                                            {onLockHall && hallIds.length > 0 && (
                                                <button type="button" className="scc-btn" onClick={onLockHall}
                                                    title="Lock the building and its outside boxes: they can no longer be clicked, boxed or moved">
                                                    Lock the hall
                                                </button>
                                            )}
                                            {onUnlockAll && lockedCount > 0 && (
                                                <button type="button" className="scc-btn" onClick={onUnlockAll} title={`Unlock all ${lockedCount} locked objects`}>
                                                    Unlock all ({lockedCount})
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                            {selectedEntity && selectedEntityIds.length <= 1 && !insideGeo && (
                                <TimelinePanel
                                    entity={selectedEntity}
                                    onTimelineChange={(next) => onInspectorChange?.('timeline', next)}
                                />
                            )}
                            {editHistory && (
                                <HistoryPanel steps={editHistory.steps} cursor={editHistory.cursor} onJumpTo={onHistoryJump} />
                            )}
            </>
        ),
        files: (
            <>
                            <FilesPanel presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} libraryItems={libraryItems} viewportMode={viewportMode} onViewportChoice={(mode) => setViewportChoice(document?.projectMeta?.id, mode)} />
            </>
        ),
        publish: (
            <>
                            <PublishPanel document={document} publishState={document?.publishState} liveProjectState={liveProjectState} onPublishPatch={onPublishPatch} onSetLiveProject={onSetLiveProject} onClearLiveProject={onClearLiveProject} onMakeSpacePublic={onMakeSpacePublic} onCopyShareLink={onCopyShareLink} onExportProject={onExportProject} exportStatus={exportStatus} onImportProjectFile={onImportProjectFile} xrState={xrState} presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} onSaveCurrentCamera={onSaveCurrentCamera} activity={syncState?.activity} />
            </>
        ),
        world: (
            <>
                            <ProjectPanel document={document} displayName={displayName} onDisplayNameChange={onDisplayNameChange} onProjectMetaPatch={onProjectMetaPatch} onWorldPatch={onWorldPatch} onRenderSettingsPatch={onRenderSettingsPatch} onOpenHub={onBackToHub} views={views} lightEnv={lightEnv} />
            </>
        )
    }

    return (
        <div className={`sfp-root${showBar ? ' has-sbar' : ''}`} onDoubleClick={handleViewportDoubleClick} onDragOver={handleViewportDragOver} onDrop={handleViewportDrop} role="application" aria-label="3D viewport">
            <StudioViewportLayout
                layout={vpLayout}
                onSplit={vpSplit}
                onClose={vpClose}
                onSetRatio={vpSetRatio}
                shared={viewportShared}
            />

            {loading && (
                <LoadingScreen variant="cover" label="Loading project" text="loading the project" waitingFor="the project file" />
            )}
            {loadError && (
                <div className="sfp-overlay-card sfp-overlay-card--error">{loadError}</div>
            )}

            {/* Before the sync alert, never between it and the phone's top
                bar: the alert moves that bar down by being its neighbour. */}
            <SurfaceBar
                float
                here="studio"
                space={liveProjectState?.spaceId}
                spaceLabel={liveProjectState?.spaceLabel}
                spaceAddress={liveProjectState?.spaceAddress}
                project={document?.projectMeta?.id}
                projectLabel={document?.projectMeta?.title}
                isLocalInstall={localInstall.isLocal}
                hidden={!showBar}
                layers={isJam ? null : layers?.open}
            >
                {/* Desk | Perform, once the project has something to perform:
                    a connection (a deck, a picture) or a wall. A bare project
                    opens bare (the layers decision, 2026-09-23); "All tools"
                    and a project still loading show it, as they show every name. */}
                {!isJam && (allTools || !layers?.open || layers.open.connections || layers.open.wall) ? (
                    <DeskPerformSwitch current="desk" space={liveProjectState?.spaceId} project={document?.projectMeta?.id} from="studio" />
                ) : null}
                {/* Rig, when the project holds one (a typed lamp or a rental list): the
                    plot of this project, and from there every step of the rig
                    (src/rigbuild/RigSteps.jsx). One of the bar's own words. */}
                {!isJam && rigHref ? (
                    <a className="sbar-link studio-rig-link" href={rigHref} title="The rig of this project: equipment, build, plot, cards, patch sheet, crew link">Rig</a>
                ) : null}
            </SurfaceBar>

            {!uiHidden && !isMobile && (
                <>
                    {(isShown('create') || (bare && !createHeldBack)) && (
                        // Bare, Create is the one window: always drawn, and not
                        // closable, or the first screen would have nothing on it.
                        <StudioFloatingPanel key={`create-${layoutKey}`} title="Create" onClose={bare ? undefined : () => toggle('create')} initialWidth={280} {...panelChrome('create')}>
                            {panelBodies.create}
                        </StudioFloatingPanel>
                    )}
                    {jamMinimal && selectedEntity && (
                        <StudioFloatingPanel key={`jamedit-${layoutKey}`} title={selectedEntity.name || 'Edit'} onClose={() => onSelectEntity?.(null)} initialWidth={240} {...panelChrome('jamedit')}>
                            {panelBodies.jamedit}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && !bare && isOpen('scene') && (
                        <StudioFloatingPanel key={`scene-${layoutKey}`} title="Objects" onClose={() => toggle('scene')} initialWidth={300} {...panelChrome('scene')}>
                            {panelBodies.scene}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && (!bare || codeAskedFor) && isOpen('files') && (
                        <StudioFloatingPanel key={`files-${layoutKey}`} title="Code" onClose={() => toggle('files')} initialWidth={480} minWidth={320} maxWidth={800} {...panelChrome('files')}>
                            {panelBodies.files}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && !bare && isOpen('publish') && (
                        <StudioFloatingPanel key={`publish-${layoutKey}`} title="Share" onClose={() => toggle('publish')} initialWidth={360} minWidth={300} {...panelChrome('publish')}>
                            {panelBodies.publish}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && !bare && isOpen('world') && (
                        <StudioFloatingPanel key={`world-${layoutKey}`} title="Scene" onClose={() => toggle('world')} initialWidth={280} {...panelChrome('world')}>
                            {panelBodies.world}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && !bare && isOpen('projects') && (
                        <StudioFloatingPanel key={`projects-${layoutKey}`} title="Projects" onClose={() => toggle('projects')} initialWidth={260} {...panelChrome('projects')}>
                            <StudioProjectsPanel
                                spaceId={document?.projectMeta?.spaceId}
                                currentProjectId={document?.projectMeta?.id}
                            />
                        </StudioFloatingPanel>
                    )}

                    {!bare && <StudioControlCluster
                        spaceName={liveProjectState?.spaceLabel || 'Studio'}
                        projectName={document?.projectMeta?.title || document?.projectMeta?.id || ''}
                        onViewLive={onViewLive}
                        canViewLive={Boolean(liveProjectState?.isLiveProject)}
                        previewUrl={previewUrl}
                        editMode={viewportEditMode}
                        onSetEditMode={setEditModeFromTools}
                        selectTool={viewportSelectTool && viewportEditMode === 'edit'}
                        walkMode={walkMode}
                        onWalk={requestWalk}
                        gizmoMode={viewportGizmoMode}
                        onSetGizmoMode={selectGizmoMode}
                        gizmoSpace={viewportGizmoSpace}
                        onSetGizmoSpace={setViewportGizmoSpace}
                        openPanels={shownOpen}
                        onTogglePanel={handleTogglePanelFor}
                        onFullscreen={handleFullscreen}
                        onHideUI={() => setUiHidden(true)}
                        onBackToHub={onBackToHub}
                        onOpenNodeEditor={offerNodes ? onOpenNodeEditor : undefined}
                        onOpenProjection={offerProjection ? onOpenProjection : undefined}
                        xrState={xrState}
                        syncState={syncState}
                        onUndo={onUndo}
                        onRedo={onRedo}
                        canUndo={Boolean(editHistory && editHistory.cursor > 0)}
                        canRedo={Boolean(editHistory && editHistory.cursor < editHistory.steps.length)}
                        presence={presence}
                        snapEdges={snapEdges}
                        onToggleSnap={() => setSnapEdges((v) => !v)}
                        onTileLayout={tileLayout}
                        onStackLeft={stackLeft}
                        onStackRight={stackRight}
                        onResetLayout={resetLayout}
                        onShowHelp={() => setShowHelp(true)}
                        rigMirrorOn={rigMirror.on}
                        onToggleRigMirror={rigMirror.available ? rigMirror.toggle : null}
                        cues={cues}
                        liveCueId={liveCueId}
                        onFireCue={onFireCue}
                        onSendRigPositions={rigPositions.send}
                        rigPositionsNote={rigPositions.note}
                        panelKeys={jamMinimal ? ['create'] : null}
                        minimal={jamMinimal}
                        allTools={isJam ? jamAllTools : allTools}
                        onToggleAllTools={isJam ? handleToggleJamTools : handleToggleAllTools}
                        allToolsHint={isJam ? null : (allTools
                            ? 'Back to layers: each tool arrives as the project grows'
                            : 'Every tool from the start, on every project')}
                    />}
                </>
            )}

            {/* The only sync indicator lives in the control cluster, which is gated
                !isMobile — so on a phone an expired session was completely silent while
                the editor kept taking edits that a reload would drop. Rendered even when
                the UI is hidden: losing work is not chrome. */}
            {syncState?.pendingSyncError && (
                <div className="studio-sync-alert" role="alert">
                    {syncState.pendingSyncError}
                </div>
            )}
            {!uiHidden && isMobile && (
                <>
                    <div className="smb-topbar">
                        {!jamMinimal && !bare && (
                            <button type="button" className="smb-top-btn" onClick={onBackToHub} aria-label="Back to projects">←</button>
                        )}
                        <span className="smb-title">{document?.projectMeta?.title || liveProjectState?.spaceLabel || 'Project'}</span>
                        {/* The way across, on a phone. The node editor has carried its
                            "Open in Studio" since the doors audit, but only the desktop
                            control cluster had the return trip — so on a phone the two
                            building tools were connected in one direction only. */}
                        {!jamMinimal && !bare && offerNodes && onOpenNodeEditor && (
                            <button
                                type="button"
                                className="smb-top-btn"
                                onClick={onOpenNodeEditor}
                                aria-label="Open this project in the node editor"
                                title="Open this project in the node editor"
                            >
                                Nodes
                            </button>
                        )}
                        {!jamMinimal && !bare && offerProjection && onOpenProjection && (
                            <button
                                type="button"
                                className="smb-top-btn"
                                onClick={onOpenProjection}
                                aria-label="Put this project on a wall"
                                title="Put this project on a wall"
                            >
                                Projection
                            </button>
                        )}
                        {/* Nothing to edit in an empty room. */}
                        {!bare && (
                            <button
                                type="button"
                                className={`smb-top-btn${viewportEditMode === 'edit' ? ' is-active' : ''}`}
                                onClick={() => setViewportEditMode((m) => (m === 'navigate' ? 'edit' : 'navigate'))}
                            >
                                {viewportEditMode === 'edit' ? 'Editing' : 'Edit'}
                            </button>
                        )}
                        {/* Undo and Redo, and the save line: the phone has no Ctrl key. Their own row
                            (full width, never more than one 44 px button high), so the bar grows by at most
                            one row in every save state and the long "Not saved: ..." wraps beside the buttons
                            instead of pushing a third row (UX audit S03 review). */}
                        {!bare && ((onUndo && onRedo) || syncState) && (
                            <div className="smb-status-row">
                                {onUndo && onRedo && (
                                    <span className="smb-undo-redo">
                                        <button type="button" className="smb-top-btn" onClick={onUndo} disabled={!(editHistory && editHistory.cursor > 0)} aria-label="Undo" title="Undo (Ctrl+Z)">Undo</button>
                                        <button type="button" className="smb-top-btn" onClick={onRedo} disabled={!(editHistory && editHistory.cursor < editHistory.steps.length)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
                                    </span>
                                )}
                                {syncState && <StudioSaveLine syncState={syncState} className="smb-save-line" />}
                            </div>
                        )}
                    </div>
                    {mobileSheet && (
                        <div className="smb-sheet">
                            <div className="smb-sheet-head">
                                <span>{mobilePanels.find(([id]) => id === mobileSheet)?.[1]}</span>
                                <button type="button" onClick={() => setMobileSheet(null)} aria-label="Close panel">×</button>
                            </div>
                            <div className="smb-sheet-body">{panelBodies[mobileSheet]}</div>
                        </div>
                    )}
                    {/* On a phone the control cluster is not drawn at all, so the
                        strip rides just above the bottom bar — the one band of a
                        390px screen a thumb reaches without regripping. Hidden
                        while a sheet is open, which occupies the same band. */}
                    {!jamMinimal && onFireCue && !mobileSheet && (
                        <StudioCueStrip
                            cues={cues}
                            liveCueId={liveCueId}
                            onFire={onFireCue}
                            className="smb-cues"
                            buttonClassName="smb-top-btn"
                        />
                    )}
                    <nav className="smb-nav" aria-label="Studio windows">
                        {mobilePanels.map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                className={`smb-nav-btn${mobileSheet === id ? ' is-active' : ''}`}
                                onClick={() => setMobileSheet((current) => (current === id ? null : id))}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                </>
            )}

            {walkBuild ? walkBuild(uiHidden) : null}

            {uiHidden && !walkMode && (
                <button className="sfp-show-ui-btn" onClick={() => setUiHidden(false)} title="Show UI (H)">
                    ≡
                </button>
            )}

            {quickInsert && (
                <StudioQuickInsert
                    position={quickInsert}
                    worldPos={quickInsert.worldPos}
                    onClose={() => setQuickInsert(null)}
                    onCreateEntity={onCreateEntity}
                    onCreateFromAsset={onCreateFromAsset}
                    assets={libraryItems.filter(canPlaceInScene)}
                    onOpenCreate={() => { if (!isShown('create')) handleTogglePanelFor('create') }}
                    palette={jamMinimal ? JAM_PRIMITIVES : null}
                    moreLabel={jamMinimal ? 'More ▸' : undefined}
                />
            )}

            {/* Only once the real document is here: before it every project
                looks empty, and the coach picks its first hint from that. */}
            {!uiHidden && !loading && (layers ? layers.loaded : true) && (
                <StudioCoachMarks
                    authType={authType}
                    entityCount={entities?.length || 0}
                    hasSelection={(selectedEntityIds?.length || 0) > 0 || Boolean(selectedEntityId)}
                    selectTicks={selectTicks}
                    covered={isMobile && Boolean(mobileSheet)}
                    shareOpen={isOpen('publish') || mobileSheet === 'publish'}
                    createOpen={isShown('create') || mobileSheet === 'create'}
                    isOpenJam={isJam}
                />
            )}

            {!uiHidden && !loading && <RigMirrorHint on={rigMirror.on} />}
        </div>
    )
}
