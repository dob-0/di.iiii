import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import NodeAnatomyPanel from './NodeAnatomyPanel.jsx'
import RawViewport from './RawViewport.jsx'
import RawGraphSurface from './RawGraphSurface.jsx'
import NodePalette from './NodePalette.jsx'
import TextPanelWindow from './TextPanelWindow.jsx'
import ImagePanelWindow from './ImagePanelWindow.jsx'
import MonitorPanelWindow from './MonitorPanelWindow.jsx'
import WorldPanelWindow from './WorldPanelWindow.jsx'
import OutlinerPanelWindow from './OutlinerPanelWindow.jsx'
import CreatePanelWindow from './CreatePanelWindow.jsx'
import ChatPanelWindow from './ChatPanelWindow.jsx'
import AgentChatPanelWindow from './AgentChatPanelWindow.jsx'
import WebcamSourcePanel from './WebcamSourcePanel.jsx'
import VideoFrameFeed from './VideoFrameFeed.jsx'
import SoundAnalysisFeed from './SoundAnalysisFeed.jsx'
import KeyboardFeed from './KeyboardFeed.jsx'
import MidiOutFeed from './MidiOutFeed.jsx'
import ButtonPanelWindow from './ButtonPanelWindow.jsx'
import MicSourcePanel from './MicSourcePanel.jsx'
import WorkStatusPanel from './WorkStatusPanel.jsx'
import AgentRunPanel from './AgentRunPanel.jsx'
import TimelinePanelWindow from './TimelinePanelWindow.jsx'
import KeeperPanelWindow from './KeeperPanelWindow.jsx'
import MidiInputPanel from './MidiInputPanel.jsx'
import DirectorPanelWindow from './DirectorPanelWindow.jsx'
import RawHelpDialog from './RawHelpDialog.jsx'
import { useProjectStore } from '../../project/state/projectStore.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../../project/hooks/useOpHistory.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import { createEdge, createNode, getNodeFamily, getNodeType, isNodeMadeOfCode } from '../../project/nodeRegistry.js'
import { deriveNodeInspectorSections } from '../../project/graph/nodeInspectorSections.js'
import { readNode } from '../../project/graph/nodeReading.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeInput, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'
import { resolveScopeWorldNode } from '../utils/viewportWorldState.js'
import { hasClockNode } from '../../project/graph/useGraphClock.js'
import { useDocumentClock } from '../../project/graph/useDocumentClock.js'
import { isNodeInScope, useNodeGraphScope } from '../../project/graph/useNodeGraphScope.js'
import { buildNodeValues as buildNodeValuesForType } from '../../project/graph/nodeGraphAuthoring.js'
import { buildAllNodesExample } from '../../project/graph/examples/allNodesExample.js'
import { buildSceneExample } from '../../project/graph/examples/sceneExample.js'
import { STUDIO_TYPE_ID, buildStudioInterior } from '../../project/graph/studioNode.js'
import { buildStudioProjectPath } from '../../studio/utils/studioRouting.js'

const getNodeRender = (node) => getNodeType(node?.typeId)?.render || 'hidden'
const isPanelNode = (node) => getNodeRender(node) === 'panel-2d'

import { buildRawProjectsPath, navigateToRawPath } from '../utils/rawRouting.js'
import { DEFAULT_PROJECT_SPACE_ID, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { saveAssetFromFile } from '../../storage/assetStore.js'
import { describeRejectedFiles, partitionDroppedFiles, resolveDropScopeId } from '../utils/dropAsset.js'
import { RAW_ANATOMY_Z, clampWindowFrame, getAnatomyDefaultFrame, getGraphEdgeInsets, getScopeMarkerTop, getWorkspaceTopInset, selectMountedPanelNodes } from '../utils/windowLayout.js'
import { isPaletteSummons, resolveZenPreference, writeZenPreference, liftAutoZen } from '../utils/zenMode.js'
import {
    clearLocalWorkspaceDocument,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument
} from '../utils/localWorkspaceStorage.js'
import { peekRawEnterNode, clearRawEnterNode } from '../utils/rawEnterNodeHandoff.js'
import {
    detectDeviceType,
    getDefaultNodeScale,
    getAvailableScales
} from '../utils/deviceDetection.js'

const DISPLAY_NAME_KEY = 'dii.raw.displayName'
const NODE_SCALE_KEY = 'dii.raw.nodeScale'
const USER_ID_KEY = 'dii.raw.userId'

// The lane was called Seed until 2026-07-30, so anyone who used it before then
// has their display name, scale and stable presence id under `dii.seed.*`.
// Carry them over once instead of silently resetting the identity they picked.
const LEGACY_KEY_PREFIX = 'dii.seed.'
function migrateLegacyRawStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return
    for (const key of [DISPLAY_NAME_KEY, NODE_SCALE_KEY, USER_ID_KEY]) {
        if (window.localStorage.getItem(key) !== null) continue
        const legacy = window.localStorage.getItem(LEGACY_KEY_PREFIX + key.slice('dii.raw.'.length))
        if (legacy !== null) window.localStorage.setItem(key, legacy)
    }
}
migrateLegacyRawStorage()
const ROOT_WORLD_CARD_WIDTH = 160
const ROOT_WORLD_CARD_HEIGHT = 120
// Exported for the guard test: every key must name a REGISTERED type. The map
// used to carry six phantoms (view.assets/activity/project, legacy-world.*)
// naming Studio panels that were never made into node types.
export const WINDOW_DEFAULT_POSITIONS = {
    'universe.world':  { x: 120,  y: 60, width: 680, height: 480 },
    'view.inspector':  { x: 24,   y: 56, width: 320, height: 480 },
    'agent':           { x: 96,   y: 140, width: 420, height: 480 },
    'view.outliner':   { x: 24,   y: 56, width: 240, height: 360 },
    'view.library':    { x: 24,   y: 56, width: 260, height: 380 },
}

const ACTIVE_MARKER_TYPE_IDS = ['world.light', 'world.environment', 'world.background', 'world.grid', 'world.camera']

const buildWindowStateFromNode = (node, index = 0, graphContext = null) => {
    const def = WINDOW_DEFAULT_POSITIONS[node.typeId] || { x: 96, y: 140, width: 360, height: 280 }
    const frame = node.values?.frame || {}
    const hasSavedPos = frame.x != null && frame.y != null
    // Cascade unpositioned windows by a STABLE per-node offset, not the list
    // index — index shifts when a sibling closes, which made every later
    // unpositioned window hop 32px.
    // …and spread in TWO dimensions over 16 slots: the old 8-slot 32px
    // staircase left concurrently-open windows ~90% overlapped whenever two
    // ids hashed near each other (audit 08-21, desk-07: three windows, one
    // pile). Still the stable per-node hash — never the list index.
    const cascadeSlot = hasSavedPos
        ? 0
        : Array.from(String(node.id)).reduce((sum, ch) => sum + ch.charCodeAt(0), index) % 16
    const cascadeX = hasSavedPos ? 0 : (cascadeSlot % 4) * 72
    const cascadeY = hasSavedPos ? 0 : Math.floor(cascadeSlot / 4) * 56
    return {
        id: node.id,
        title: frame.title || evaluateNodeInput(node, 'title', graphContext) || node.label,
        x: (frame.x ?? def.x) + cascadeX,
        y: (frame.y ?? def.y) + cascadeY,
        width: frame.width || def.width,
        height: frame.height || def.height,
        zIndex: frame.zIndex || 6,
        visible: frame.visible !== false,
        minimized: Boolean(frame.minimized),
        pinned: Boolean(frame.pinned)
    }
}

function BrowserPanelWindow({ node }) {
    const title = node.values?.title || node.label
    const url = node.values?.url || 'https://example.com'
    return (
        <div className="raw-browser-panel-window">
            <div className="raw-browser-panel-bar">
                <strong>{title}</strong>
                <span>{url}</span>
            </div>
            <iframe
                title={title}
                src={url}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals"
            />
        </div>
    )
}

export default function RawEditor({
    projectId,
    spaceId = DEFAULT_PROJECT_SPACE_ID,
    localStorageKey = '',
    seedOnFirstVisit = false
}) {
    const [displayName] = useState(() => {
        try {
            return window.localStorage.getItem(DISPLAY_NAME_KEY) || ''
        } catch {
            return ''
        }
    })
    const [paletteState, setPaletteState] = useState({
        open: false,
        placement: null
    })
    const [overflowOpen, setOverflowOpen] = useState(false)
    const [helpOpen, setHelpOpen] = useState(false)
    // Zen: nothing resident on the workspace. Read once, from this device's
    // preference, defaulting to on only for a workspace with no work in it —
    // see zenMode.js for why it is not document state.
    const zenWorkspaceKey = projectId || localStorageKey || 'default'
    const [zen, setZen] = useState(false)
    const zenReadRef = useRef(false)
    const [outlinerOpen, setOutlinerOpen] = useState(false)
    const [outlinerFrame, setOutlinerFrame] = useState({ x: 24, y: 56, width: 240, height: 360, zIndex: 20, minimized: false, pinned: false })
    // The "what is it made of" sheet. Same shape as the Outliner's state, but
    // its frame is seeded on open rather than at mount: it is the only window
    // here whose opening size depends on the viewport it opens into, because on
    // a phone it has to finish above where the selection sheet docks.
    const [anatomyFrame, setAnatomyFrame] = useState(null)
    const [chatOpen, setChatOpen] = useState(false)
    const [chatFrame, setChatFrame] = useState({ x: 24, y: 432, width: 280, height: 360, zIndex: 20, minimized: false, pinned: false })
    const [readChatCount, setReadChatCount] = useState(0)
    const [isWorldFullscreen, setIsWorldFullscreen] = useState(false)
    // Bumped after inserting a whole graph at once — tells the surface this
    // is the one moment a forced re-fit is a kindness, not a yank.
    const [fitSignal, setFitSignal] = useState(0)
    // Declared here because hostInspector's JSX is built partway down the
    // component and needs it; the effect that measures it lives further down,
    // next to the selection state it depends on.
    const scaffoldRef = useRef(null)

    const initialStoreState = useMemo(() => {
        if (projectId || !localStorageKey) return undefined
        const savedDocument = readLocalWorkspaceDocument(localStorageKey)
        if (savedDocument) return { document: savedDocument, version: 0 }
        // NO starter seed any more. The audit measured it: 71 words, two open
        // windows and a four-node demo installed as if they were your work —
        // while the true-empty state (13 words, one offer) was the cleanest
        // screen in the product and the one first-timers never saw. On a phone
        // the seeded windows collided with the cards outright. The demo lives
        // one tap away behind "Make me a scene", where choosing it is the
        // person's own act. seedOnFirstVisit stays accepted for compatibility;
        // it now means only "this route is a local canvas".
        return undefined
    }, [localStorageKey, projectId])

    const store = useProjectStore(initialStoreState)
    const { state, dispatch } = store
    const projectSync = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'raw-client',
        opIdPrefix: 'raw-op'
    })
    const { applyLocalOps: _applyLocalOps } = projectSync
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: DISPLAY_NAME_KEY,
        userIdStorageKey: USER_ID_KEY,
        anonymousLabel: 'Guest',
        userIdPrefix: 'raw-user'
    })
    useEffect(() => {
        if (chatOpen) setReadChatCount(presence.messages.length)
    }, [chatOpen, presence.messages.length])
    const unreadChatCount = chatOpen ? 0 : Math.max(0, presence.messages.length - readChatCount)
    const localSaveFailedRef = useRef(false)
    const topbarRef = useRef(null)
    const [workspaceTop, setWorkspaceTop] = useState(168)
    const [nodeScale, setNodeScale] = useState(() => {
        try {
            const saved = window.localStorage.getItem(NODE_SCALE_KEY)
            if (saved) return parseFloat(saved)
        } catch {
            // Ignore
        }
        const deviceType = detectDeviceType()
        return getDefaultNodeScale(deviceType)
    })
    const { applyLocalOps, undo, redo } = useOpHistory({
        projectId,
        document: state.document,
        applyLocalOps: _applyLocalOps,
        ignoreTypes: ['setWorkspaceState', 'setShowState']
    })

    const document = state.document
    const isLocalWorkspace = !projectId
    const resolvedSpaceId = spaceId || document.projectMeta?.spaceId || DEFAULT_PROJECT_SPACE_ID
    const entities = document.entities || []
    const nodes = useMemo(() => document.nodes || [], [document.nodes])
    const workspaceState = document.workspaceState || {}
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const selectedNode = nodes.find((node) => node.id === workspaceState.selectedNodeId) || null
    const authoredNodes = nodes
    // Node-graph scope has no forced root type — the true document root
    // (currentScopeId === null) is a plain, always-available scope you can
    // place any node type directly into, same as any node's interior. Node 0
    // is an ordinary node, not an auto-created/auto-entered singleton (product
    // decision 2026-07-17 — see nodeRegistry.js/projectSchema.js comments).
    const scope = useNodeGraphScope({ nodes: authoredNodes })
    const { navStack, currentScopeId, enterNode: scopeEnterNode, navigateToScope: scopeNavigateToScope, reset: scopeReset, goToRoot: scopeGoToRoot } = scope

    // RawHub's "open studio" shortcut hands off a node to land inside via
    // sessionStorage (see rawEnterNodeHandoff.js for why this can't live in
    // the synced document). Peeked (non-destructive — StrictMode's dev-mode
    // double-invoke of lazy initializers means a destructive read here would
    // consume the value on the throwaway first pass and never see it on the
    // real one) once per mount, then re-checked on every `nodes` change until
    // the handed-off node actually shows up, since the document may still be
    // syncing from the server on first render. Cleared only once applied.
    const [pendingEnterNodeId, setPendingEnterNodeId] = useState(() => peekRawEnterNode(projectId))
    useEffect(() => {
        if (!pendingEnterNodeId) return
        if (authoredNodes.some((node) => node.id === pendingEnterNodeId)) {
            scopeGoToRoot(pendingEnterNodeId)
            clearRawEnterNode()
            setPendingEnterNodeId(null)
        }
    }, [pendingEnterNodeId, authoredNodes, scopeGoToRoot])
    // Panel windows are scoped exactly like graph cards. Before, this filtered
    // the whole document, so every universe.world node at any depth kept a live
    // <Canvas> mounted in every scope — see selectMountedPanelNodes.
    const visibleViewNodes = useMemo(
        () => selectMountedPanelNodes({
            nodes,
            isPanel: isPanelNode,
            currentScopeId,
            isWorldFullscreen
        }),
        [nodes, currentScopeId, isWorldFullscreen]
    )
    const topZIndex = useMemo(
        () => Math.max(6, ...visibleViewNodes.map((node) => node.values?.frame?.zIndex || 1)),
        [visibleViewNodes]
    )
    // Selection is visible only where it STANDS. The old filter was by node
    // TYPE against a retired World/View/Graph axis — with activeSurface
    // defaulting to 'world', selecting a panel node (Text, Image, Monitor)
    // yielded no inspector and no Delete at all, and a node selected in one
    // scope kept an armed Delete FAB after you walked somewhere it is not.
    const scopedSelectedNode = useMemo(
        () => (isNodeInScope(selectedNode, currentScopeId) ? selectedNode : null),
        [selectedNode, currentScopeId]
    )
    // Objects (document.entities) are root-scope citizens: the room draws them
    // at root, so that is where they can be picked and deleted.
    const scopedSelectedEntity = currentScopeId === null ? selectedEntity : null
    // Every node in the current scope gets a card, panel types included.
    //
    // Panel nodes used to be excluded here, which meant they had NO
    // representation on the canvas: they could not be selected, wired, moved or
    // deleted from the graph, and because graphCardEdges below drops any edge
    // whose endpoints are not both cards, a wire into `view.text`'s content was
    // invisible even though it was real and carrying a value. A node the graph
    // cannot draw is not really in the graph.
    //
    // It also made containers impossible: entering a node whose contents are
    // all panels showed an empty scope. The window and the card are two views
    // of one node — the window is the panel, the card is the node — which is
    // the same split TouchDesigner draws between a Panel COMP in the network
    // editor and the panel it renders.
    // How many nodes each node contains. A card with contents is a place you
    // can go; one without is not, and until now they looked identical — every
    // card wore the same chevron, so the chevron said nothing.
    const childCounts = useMemo(() => {
        const counts = new Map()
        for (const node of authoredNodes) {
            const parentId = node.parentId || null
            if (!parentId) continue
            counts.set(parentId, (counts.get(parentId) || 0) + 1)
        }
        return counts
    }, [authoredNodes])

    const graphCardNodes = useMemo(
        () => nodes.filter((node) => (node.parentId || null) === currentScopeId),
        [nodes, currentScopeId]
    )
    // Edges are scoped along with nodes — an edge whose endpoints aren't both
    // in the current scope's card set has no business rendering here.
    const graphCardEdges = useMemo(() => {
        const cardIds = new Set(graphCardNodes.map((node) => node.id))
        return (document.edges || []).filter((edge) => cardIds.has(edge.fromNodeId) && cardIds.has(edge.toNodeId))
    }, [document.edges, graphCardNodes])
    // The topbar counts THIS room; the empty-state logic asks about the whole
    // document (a zen desk inside a full project is not "empty").
    const nodeCount = graphCardNodes.length
    const hasAnyNodes = authoredNodes.length > 0
    const hasGraphNodes = hasAnyNodes
    // universe.world is not a singleton (product decision 2026-07-19) — a scope
    // can hold more than one. Hierarchy-as-connection (Kantan Mapper pattern):
    // being a sibling of the current scope is the only "connection" needed, no
    // wire — but exactly one World needs to be "the" one for viewport/panel
    // purposes, so pick the explicitly-marked-live one (workspaceState.
    // liveWorldNodeIdByScope, set via the World panel's own live toggle — see
    // WorldPanelWindow's onSetLive below), defaulting to first-created when
    // nothing's been marked yet.
    const worldNode = useMemo(
        () => resolveScopeWorldNode(authoredNodes, currentScopeId, document.workspaceState?.liveWorldNodeIdByScope),
        [authoredNodes, currentScopeId, document.workspaceState?.liveWorldNodeIdByScope]
    )
    const hasWorldNode = Boolean(worldNode)
    // Generalizes the World live-toggle above to any scope-repeatable type
    // where exactly one "active" result is wanted (world.light/world.
    // background/world.grid) — same hierarchy-as-connection idea, same
    // workspaceState side-channel, just keyed by type as well as scope since
    // there's no dedicated map per type the way World has its own.
    const activeMarkerTypeIds = ACTIVE_MARKER_TYPE_IDS
    const getActiveNodeId = useCallback((typeId, scopeId) => {
        const candidates = authoredNodes.filter((node) => node.typeId === typeId && (node.parentId || null) === scopeId)
        if (!candidates.length) return null
        const key = `${typeId}::${scopeId || ''}`
        const markedId = (document.workspaceState?.activeNodeIdByTypeScope || {})[key]
        const marked = candidates.find((node) => node.id === markedId)
        return (marked || candidates[0]).id
    }, [authoredNodes, document.workspaceState?.activeNodeIdByTypeScope])
    const setActiveNodeId = useCallback((typeId, scopeId, nodeId) => {
        const key = `${typeId}::${scopeId || ''}`
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { activeNodeIdByTypeScope: { [key]: nodeId } } }
        })
    }, [applyLocalOps])
    // Per-universe chrome control (product decision 2026-07-17): walk up from
    // the current scope to the nearest ancestor universe.space node and read
    // its showChrome value — lets one universe be a normal authoring space
    // (full topbar) and another a chromeless embed/kiosk view. No ancestor
    // universe.space anywhere in the stack (e.g. true document root, or
    // inside a non-universe container with no universe ancestor) always
    // shows chrome. Esc already pops the scope stack unconditionally
    // (existing handler below), so chromeless scopes are never a dead end.
    const chromeVisible = useMemo(() => {
        // Zen wins over the scope rule: a scope that would show chrome still
        // shows none while the workspace is zen. The palette is the way back,
        // and Esc still pops the scope stack, so this is never a dead end.
        if (zen) return false
        for (let i = navStack.length - 1; i >= 1; i--) {
            const scopeNode = authoredNodes.find((n) => n.id === navStack[i])
            if (scopeNode?.typeId === 'universe.space') {
                return scopeNode.values?.showChrome !== false
            }
        }
        return true
    }, [zen, navStack, authoredNodes])
    // Computed once: pointer type doesn't change mid-session on the devices this
    // matters for, and re-checking on every render would just be wasted work.
    const [pointerVerb] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
            ? 'Double-tap'
            : 'Double-click'
    ))
    const showEmptyHint = !hasGraphNodes && !hasWorldNode
    const topbarLocationText = showEmptyHint ? `${pointerVerb} to place your first node` : ''

    useEffect(() => {
        if (hasAnyNodes) return
        setIsWorldFullscreen(false)
        setOutlinerOpen(false)
        scopeReset()
    }, [hasAnyNodes, scopeReset])



    const pendingLocalSaveRef = useRef(null)
    useEffect(() => {
        if (!isLocalWorkspace || !localStorageKey) return undefined
        // Debounced: the whole node document is stringified per write, and an
        // undebounced effect ran that synchronously on EVERY op — including
        // every rAF-gated drag frame, which is exactly when jank hurts most.
        // The pending ref + unload flush below make the debounce lossless.
        pendingLocalSaveRef.current = document
        const timer = setTimeout(() => {
            pendingLocalSaveRef.current = null
            // Quota exhaustion is realistic. Discarding the result meant saving
            // stayed silently dead for the session — same one-time-alert shape
            // as the asset-store quota path in useAssetRestore.
            if (writeLocalWorkspaceDocument(localStorageKey, document)) return
            if (localSaveFailedRef.current) return
            localSaveFailedRef.current = true
            console.error('[local-workspace] save failed — browser storage is full or unavailable')
            alert('This canvas can no longer be saved to browser storage (it is full or unavailable). Export your work — reloading will lose changes made from now on.')
        }, 400)
        return () => clearTimeout(timer)
    }, [document, isLocalWorkspace, localStorageKey])
    useEffect(() => {
        if (!isLocalWorkspace || !localStorageKey || typeof window === 'undefined') return undefined
        const flush = () => {
            if (pendingLocalSaveRef.current) {
                writeLocalWorkspaceDocument(localStorageKey, pendingLocalSaveRef.current)
                pendingLocalSaveRef.current = null
            }
        }
        window.addEventListener('beforeunload', flush)
        return () => {
            window.removeEventListener('beforeunload', flush)
            flush()
        }
    }, [isLocalWorkspace, localStorageKey])

    useEffect(() => {
        try {
            window.localStorage.setItem(NODE_SCALE_KEY, String(nodeScale))
        } catch {
            // Ignore localStorage errors
        }
    }, [nodeScale])

    useLayoutEffect(() => {
        const updateWorkspaceTop = () => {
            setWorkspaceTop(getWorkspaceTopInset({
                topbarRect: topbarRef.current?.getBoundingClientRect?.()
            }))
        }

        updateWorkspaceTop()
        window.addEventListener('resize', updateWorkspaceTop)

        let resizeObserver = null
        if (typeof ResizeObserver !== 'undefined' && topbarRef.current) {
            resizeObserver = new ResizeObserver(updateWorkspaceTop)
            resizeObserver.observe(topbarRef.current)
        }

        return () => {
            window.removeEventListener('resize', updateWorkspaceTop)
            resizeObserver?.disconnect?.()
        }
    }, [presence.users.length])

    const selectNode = (nodeId, patch = {}) => {
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: {
                patch: {
                    selectedNodeId: nodeId || null,
                    ...patch
                }
            }
        })
    }

    const selectEntity = (entityId) => {
        dispatch({ type: 'select-entity', entityId })
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { selectedNodeId: null } }
        })
    }

    // universe.world is not a singleton, and the fullscreen/overlay renders
    // always show the scope's live-marked world — so anything that opens a
    // specific world must make that world the live one first.
    const markWorldLive = (node) => {
        if ((document.workspaceState?.liveWorldNodeIdByScope || {})[node.parentId || ''] === node.id) return
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { liveWorldNodeIdByScope: { [node.parentId || '']: node.id } } }
        })
    }

    const clearSelection = useCallback(() => {
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { selectedNodeId: null } }
        })
    }, [applyLocalOps, dispatch])

    const handleEnterNode = useCallback((nodeId) => {
        const node = authoredNodes.find((n) => n.id === nodeId)
        if (!node) return
        // A closed panel window had NO reopen path (close wrote
        // frame.visible=false and nothing ever set it back) — entering the
        // node's graph card now reopens its window instead of entering an
        // empty scope.
        if (getNodeRender(node) === 'panel-2d' && node.values?.frame?.visible === false) {
            applyLocalOps({
                type: 'updateNode',
                payload: { nodeId, patch: { values: { frame: { ...(node.values?.frame || {}), visible: true } } } }
            })
            return
        }
        if (node.typeId === 'universe.world') setIsWorldFullscreen(true)
        // Selection dies at the door. It used to survive every scope walk,
        // keeping a red Delete armed for a node no longer on screen — the
        // scope clamp above hides it, and this stops the stale id from
        // travelling in the shared workspace state at all.
        if (workspaceState.selectedNodeId || selectedEntity) clearSelection()
        scopeEnterNode(nodeId)
    }, [authoredNodes, scopeEnterNode, applyLocalOps, workspaceState.selectedNodeId, selectedEntity, clearSelection])

    const handleNavigateToScope = useCallback((targetIndex) => {
        // Fullscreen SURVIVES scope navigation now: walking through a door
        // swaps which room fills the screen, which is the TouchDesigner
        // go-inside/come-out feel. It used to cancel on every step — the
        // render and the graph could never both be part of one journey.
        if (workspaceState.selectedNodeId || selectedEntity) clearSelection()
        scopeNavigateToScope(targetIndex)
    }, [scopeNavigateToScope, workspaceState.selectedNodeId, selectedEntity, clearSelection])

    // Browser/hardware BACK pops one scope level. This is the only exit on a
    // phone when a space hides the chrome (showChrome:false removes the back
    // button and breadcrumb, and the Escape fallback needs a keyboard) —
    // without it a chromeless scope is a dead end on touch.
    const scopeDepthRef = useRef(0)
    const navigateUpRef = useRef(() => {})
    useEffect(() => {
        scopeDepthRef.current = navStack.length
        navigateUpRef.current = () => handleNavigateToScope(navStack.length - 2)
    }, [navStack, handleNavigateToScope])
    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onPop = () => {
            // Depth 1 IS the root ([null]) — the old `> 0` guard was always
            // true, so Back at root navigated to stack index -1 and rendered
            // a false-empty canvas that read as total data loss on a phone
            // (the document was intact all along; measured on the S24).
            if (scopeDepthRef.current > 1) {
                navigateUpRef.current()
                window.history.pushState({ rawScope: true }, '')
            } else {
                // At root, Back stays put: re-arm the guard entry so the app
                // neither blanks nor silently exits mid-edit. Leaving is what
                // ← Projects and the tab are for.
                window.history.pushState({ rawScope: true }, '')
            }
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])
    useEffect(() => {
        if (typeof window === 'undefined') return
        // arm one history entry when entering the first scope level
        if (navStack.length === 1) window.history.pushState({ rawScope: true }, '')
    }, [navStack.length])

    const handleInspectorChange = (component, nextComponentValue) => {
        if (scopedSelectedNode) {
            applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: scopedSelectedNode.id,
                    patch: { [component]: nextComponentValue }
                }
            })
            return
        }

        if (scopedSelectedEntity) {
            applyLocalOps({
                type: 'updateComponent',
                payload: {
                    entityId: scopedSelectedEntity.id,
                    component,
                    patch: nextComponentValue
                }
            })
            return
        }

        if (component === 'worldState') {
            applyLocalOps({
                type: 'setWorldState',
                payload: { patch: nextComponentValue }
            })
        }
    }

    // Raw could render entities and edit them (the inspector has handled a
    // selected entity since the lane was forked) and delete them — it simply
    // had no way to make one. `createEntity` is a shared-schema op, so this is
    // the missing verb, not a new model: the same op Studio's Create window
    // sends, into the same document, undoable through the same history.
    //
    // Placement is the plain grid, not Studio's look-where-the-camera-is
    // version: the orbit controls live inside RawViewport's Canvas and are not
    // reachable from here. A ring around a target this component cannot read
    // would just be origin with extra steps.
    const handleCreateEntity = useCallback((type) => {
        const count = (state.document.entities || []).length
        const entity = createEntityOfType(type, {
            components: {
                transform: { position: [((count % 4) - 1.5) * 1.4, 0, Math.floor(count / 4) * -1.8] }
            }
        })
        if (!entity) return
        applyLocalOps({
            type: 'createEntity',
            payload: { entity }
        }, { activityMessage: `Created ${entity.type}.` })
        dispatch({ type: 'select-entity', entityId: entity.id })
    }, [applyLocalOps, dispatch, state.document.entities])

    const handleDeleteSelected = useCallback(() => {
        if (scopedSelectedNode) {
            applyLocalOps([
                {
                    type: 'deleteNode',
                    payload: { nodeId: scopedSelectedNode.id }
                },
                {
                    type: 'setWorkspaceState',
                    payload: { patch: { selectedNodeId: null } }
                }
            ], { activityMessage: `Deleted ${scopedSelectedNode.label}.`, activityLevel: 'warning' })
            return
        }
        if (!scopedSelectedEntity) return
        applyLocalOps({
            type: 'deleteEntity',
            payload: { entityId: scopedSelectedEntity.id }
        }, { activityMessage: `Deleted ${scopedSelectedEntity.name}.`, activityLevel: 'warning' })
        dispatch({ type: 'select-entity', entityId: null })
    }, [applyLocalOps, dispatch, scopedSelectedEntity, scopedSelectedNode])

    const handleResetLocalWorkspace = () => {
        if (!isLocalWorkspace) return
        if (!window.confirm('Clear this canvas? This wipes everything you have made here — every node, wire and window, including anything nested inside them — and cannot be undone.')) return
        clearLocalWorkspaceDocument(localStorageKey)
        dispatch({ type: 'replace-document', document: {}, version: 0 })
        dispatch({
            type: 'append-activity',
            level: 'warning',
            message: 'Cleared the canvas.'
        })
    }

    const inspectorSections = scopedSelectedNode
        ? deriveNodeInspectorSections(scopedSelectedNode)
        : (scopedSelectedEntity
            ? getInspectorSections(scopedSelectedEntity)
            : [
                {
                    id: 'worldState',
                    label: 'World',
                    fields: [
                        { label: 'Background', component: 'worldState', path: ['backgroundColor'], type: 'color' },
                        { label: 'Grid Visible', component: 'worldState', path: ['gridVisible'], type: 'checkbox' },
                        { label: 'Grid Size', component: 'worldState', path: ['gridSize'], type: 'number', min: 1, step: 1 }
                    ]
                }
            ])

    // Renaming exists only for nodes — entities and the world keep their
    // own naming stories. Empty names are refused upstream in TitleField.
    const handleRenameSelected = useCallback((label) => {
        const nodeId = workspaceState.selectedNodeId
        if (!nodeId) return
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { label } }
        }, { activityMessage: `Renamed a node to “${label}”.` })
    }, [applyLocalOps, workspaceState.selectedNodeId])

    const inspectorValues = scopedSelectedNode
        ? { values: { ...(scopedSelectedNode.values || {}) } }
        : (scopedSelectedEntity ? scopedSelectedEntity.components : { worldState: document.worldState })
    const inspectorTitle = scopedSelectedNode ? scopedSelectedNode.label : (scopedSelectedEntity ? scopedSelectedEntity.name : 'World')
    const inspectorSubtitle = scopedSelectedNode ? scopedSelectedNode.typeId : (scopedSelectedEntity ? scopedSelectedEntity.type : 'Scene defaults')

    // Entering the fullscreen room with a node selected kept the inspector
    // sheet over 38% of it — with an armed Delete floating over the stage
    // (audit 08-21, phone-61). Fullscreen means the room, whole; a selection
    // made INSIDE it (arranging) is untouched — this runs on entry only.
    useEffect(() => {
        if (!isWorldFullscreen) return
        clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWorldFullscreen])

    // Read the zen preference ONCE, and only after the document has loaded —
    // the default depends on whether this workspace already has work in it, and
    // on first render it always looks empty.
    useEffect(() => {
        if (zenReadRef.current || !document) return
        zenReadRef.current = true
        setZen(resolveZenPreference(zenWorkspaceKey, {
            nodeCount: (document.nodes || []).length
        }))
    }, [document, zenWorkspaceKey])

    const setZenPreference = useCallback((next) => {
        setZen(next)
        writeZenPreference(zenWorkspaceKey, next)
    }, [zenWorkspaceKey])

    // The canvas stopped being empty: if zen was only the derived
    // empty-canvas default, lift it so the topbar — and its Scene button —
    // exist the moment there is a scene to look at. An explicit zen choice
    // is never touched (audit 08-21: entering the scene took a 4-step
    // palette incantation because the chrome never came back).
    const documentNodeCount = (document?.nodes || []).length
    useEffect(() => {
        if (!zenReadRef.current || documentNodeCount === 0) return
        if (liftAutoZen(zenWorkspaceKey)) setZen(false)
    }, [documentNodeCount, zenWorkspaceKey])

    // Cmd/Ctrl+K or a bare `/` opens the palette at the middle of the screen.
    // Touch already has this: double-tapping empty canvas opens the same
    // palette, which is why there is no second gesture to learn and no new
    // chrome for a finger to reach.
    useEffect(() => {
        const onKeyDown = (event) => {
            if (!isPaletteSummons(event)) return
            event.preventDefault()
            setPaletteState({
                open: true,
                placement: {
                    clientX: Math.round(window.innerWidth / 2) - 140,
                    clientY: Math.round(window.innerHeight / 3)
                }
            })
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    const openPalette = (placement = null) => {
        setPaletteState({
            open: true,
            placement
        })
    }

    // What an empty canvas MEANS depends on where you are standing.
    //
    // Entering a Cube used to show the same blank grid as an empty workspace,
    // with nothing to say that a Cube has no insides — it is a case in a
    // JavaScript switch, not a graph. An empty room and a thing that cannot
    // have a room are not the same fact, and showing one screen for both is the
    // lie that made entering a node feel broken.
    const scopeNode = useMemo(
        () => (currentScopeId ? authoredNodes.find((node) => node.id === currentScopeId) || null : null),
        [authoredNodes, currentScopeId]
    )

    const scopeEmptyHint = useMemo(() => {
        if (!currentScopeId) return `${pointerVerb} to place your first node.`
        const label = scopeNode?.label || 'this node'
        // The old sentence for a code-made node — "there is nothing inside it
        // to see" — taught the owner's exact wrong belief: children placed
        // inside a spatial node DO render and DO travel with it, and the one
        // sentence a first-timer read was the one denying it. Say the true
        // thing, by kind: a spatial node carries what you put in it; only a
        // non-spatial code node (a colour, a math step) genuinely has no room.
        if (isNodeMadeOfCode(scopeNode?.typeId)) {
            const spatial = getNodeType(scopeNode?.typeId)?.render === 'spatial-3d'
            return spatial
                ? `Inside ${label}. What you place here becomes part of it.`
                : `Inside ${label} — code, no room of its own.`
        }
        return `Inside ${label}. ${pointerVerb} to place the first node in it.`
    }, [currentScopeId, pointerVerb, scopeNode])

    // …and the sentence above is only the first half of the answer. It says
    // THAT a Cube has no inside; the sheet says what it has instead. Opening
    // seeds the frame from the viewport, because on a phone the sheet has to
    // finish above where the selection sheet docks and that arithmetic needs a
    // height nobody has at mount.
    const openAnatomy = useCallback(() => {
        setAnatomyFrame(getAnatomyDefaultFrame({
            viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,
            viewportHeight: typeof window === 'undefined' ? 800 : window.innerHeight,
            workspaceTop,
            chromeVisible
        }))
    }, [chromeVisible, workspaceTop])

    // Leaving the node closes the sheet. A sheet describing the node you have
    // walked out of is worse than no sheet: it looks current and is not.
    useEffect(() => { setAnatomyFrame(null) }, [currentScopeId])

    const buildNodeValues = (definitionId, params, place) =>
        buildNodeValuesForType(definitionId, params, place, {
            workspaceTop,
            topZIndex,
            // What is already standing in the room this node is joining, so a
            // new object steps aside instead of landing inside the last one.
            occupied: authoredNodes
                .filter((node) => (node.parentId || null) === (currentScopeId || null)
                    && getNodeType(node.typeId)?.render === 'spatial-3d')
                .map((node) => node.values?.position)
                .filter(Boolean)
        })

    const handlePaletteCreate = ({ definition, params, placement: palettePlace }) => {
        if (!definition) return
        const place = palettePlace || {}
        const values = buildNodeValues(definition.id, params, place)
        // Step aside until the card lands CLEAR of every existing card in this
        // scope. New cards used to land square on old ones — the audit watched
        // a Merge bury a Cube's whole header, and a card land over another's
        // door, which left that door silently unclickable forever. Same idea
        // as findFreeSpot in the room, in card coordinates.
        let cardX = (place.graphX ?? place.clientX ?? 280) - (ROOT_WORLD_CARD_WIDTH / 2)
        let cardY = Math.max(20, (place.graphY ?? place.clientY ?? 160) - (ROOT_WORLD_CARD_HEIGHT / 2))
        // A spatial node lands IN THE ROOM at the click — and its card used to
        // land centred on the very same click, burying the thing it had just
        // made (the audit watched a cube vanish behind its own card; owner:
        // "still conflict with backdrop display and geo"). The card steps
        // below the click instead, so what you placed stays visible above it.
        if (getNodeType(definition.id)?.render === 'spatial-3d') {
            cardY = Math.max(20, (place.graphY ?? place.clientY ?? 160) + 90)
        }
        const siblings = authoredNodes.filter((node) => (node.parentId || null) === (currentScopeId || null))
        const collides = (x, y) => siblings.some((node) =>
            Math.abs((node.graphX ?? 0) - x) < ROOT_WORLD_CARD_WIDTH + 16
            && Math.abs((node.graphY ?? 0) - y) < 130)
        for (let step = 0; step < 24 && collides(cardX, cardY); step += 1) {
            cardX += 44
            cardY += 44
        }
        const nextNode = createNode(definition.id, {
            values,
            graphX: cardX,
            graphY: cardY,
            parentId: currentScopeId
        })
        if (!nextNode) return
        const workspacePatch = { selectedNodeId: nextNode.id }
        // A container arrives with its contents. `studio` is one palette entry;
        // entering it has to reveal the subgraph it is made of, so the interior
        // is created in the SAME op batch — otherwise a single undo would leave
        // an empty container behind, and entering a freshly-placed Studio would
        // show nothing.
        const interior = definition.id === STUDIO_TYPE_ID
            ? buildStudioInterior({ studioNodeId: nextNode.id, workspaceTop })
            : []
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps([
            { type: 'createNode', payload: { node: nextNode } },
            ...interior.map((node) => ({ type: 'createNode', payload: { node } })),
            { type: 'setWorkspaceState', payload: { patch: workspacePatch } }
        ], {
            activityMessage: interior.length
                ? `Created ${definition.label} with ${interior.length} panels inside.`
                : `Created ${definition.label}.`
        })
        setPaletteState({ open: false, placement: null })
    }

    const handleWorldSurfaceDoubleClick = (placement) => {
        openPalette(placement)
    }

    // --- Bringing a file in -------------------------------------------------
    // Dropping a model/video/sound/image onto the surface stores it and places
    // the node that plays it. Two storage routes, one behaviour: a server-
    // backed project uploads (content-addressed, shared with collaborators), a
    // local workspace keeps the bytes in this browser's IndexedDB — which is
    // the same place ModelObject/useAssetUrl already look first, so the node
    // renders identically either way.
    const [dropState, setDropState] = useState({ over: false, busy: false, notice: '' })
    // "Studio now has a Colour socket" — because the socket it is talking about
    // is one scope up and nowhere on screen.
    const [promotedNotice, setPromotedNotice] = useState(null)
    const dropDepthRef = useRef(0)

    useEffect(() => {
        if (!dropState.notice) return undefined
        const timer = setTimeout(() => setDropState((prev) => ({ ...prev, notice: '' })), 6000)
        return () => clearTimeout(timer)
    }, [dropState.notice])

    const handleFilesDropped = useCallback(async (fileList, place = {}, dropScopeId = undefined) => {
        const targetScopeId = dropScopeId === undefined ? currentScopeId : dropScopeId
        const { accepted, rejected } = partitionDroppedFiles(fileList)
        const rejectedNotice = describeRejectedFiles(rejected)
        if (!accepted.length) {
            setDropState({ over: false, busy: false, notice: rejectedNotice })
            return
        }
        setDropState({ over: false, busy: true, notice: '' })

        const ops = []
        const created = []
        const failed = []
        for (const [index, { file, typeId }] of accepted.entries()) {
            try {
                const asset = projectId
                    ? await uploadProjectAsset(projectId, file)
                    : await saveAssetFromFile(file)
                if (!asset?.id) throw new Error('no asset id')
                const values = buildNodeValuesForType(typeId, {}, place, { workspaceTop, topZIndex })
                const node = createNode(typeId, {
                    values: { ...values, src: asset.id },
                    // Fan them out so a multi-file drop doesn't stack cards.
                    graphX: (place.graphX ?? 280) - (ROOT_WORLD_CARD_WIDTH / 2) + (index * 32),
                    graphY: Math.max(20, (place.graphY ?? 160) - (ROOT_WORLD_CARD_HEIGHT / 2) + (index * 32)),
                    parentId: targetScopeId
                })
                if (!node) throw new Error(`unknown node type ${typeId}`)
                ops.push({ type: 'upsertAsset', payload: { asset } })
                ops.push({ type: 'createNode', payload: { node } })
                created.push({ node, file })
            } catch (error) {
                failed.push({ file, error })
            }
        }

        if (ops.length) {
            const last = created[created.length - 1]
            // Only follow the selection when the node landed in the scope the
            // graph is showing — otherwise the inspector would describe a node
            // that isn't on screen.
            if (targetScopeId === currentScopeId) {
                ops.push({ type: 'setWorkspaceState', payload: { patch: { selectedNodeId: last.node.id } } })
            }
            applyLocalOps(ops, {
                activityMessage: created.length === 1
                    ? `Brought in ${created[0].file.name}.`
                    : `Brought in ${created.length} files.`
            })
        }

        const failureNotice = failed.length
            ? `Could not bring in ${failed.map(({ file }) => file?.name || 'file').join(', ')}.`
            : ''
        setDropState({
            over: false,
            busy: false,
            notice: [failureNotice, rejectedNotice].filter(Boolean).join(' ')
        })
    }, [applyLocalOps, currentScopeId, projectId, topZIndex, workspaceTop])

    // The inspector's "＋" on an asset port: same storage as a drop, but the
    // node already exists, so this only fills that port in.
    const handlePickAssetFile = useCallback(async (file, field) => {
        if (!file || !scopedSelectedNode) return
        setDropState({ over: false, busy: true, notice: '' })
        try {
            const asset = projectId
                ? await uploadProjectAsset(projectId, file)
                : await saveAssetFromFile(file)
            if (!asset?.id) throw new Error('no asset id')
            applyLocalOps([
                { type: 'upsertAsset', payload: { asset } },
                {
                    type: 'updateNode',
                    payload: {
                        nodeId: scopedSelectedNode.id,
                        patch: { values: { [field?.path?.[0] || 'src']: asset.id } }
                    }
                }
            ], { activityMessage: `Brought in ${file.name}.` })
            setDropState({ over: false, busy: false, notice: '' })
        } catch {
            setDropState({ over: false, busy: false, notice: `Could not bring in ${file.name}.` })
        }
    }, [applyLocalOps, projectId, scopedSelectedNode])

    const handleSurfaceDragEnter = (event) => {
        if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
        event.preventDefault()
        dropDepthRef.current += 1
        setDropState((prev) => (prev.over ? prev : { ...prev, over: true }))
    }

    const handleSurfaceDragOver = (event) => {
        if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
        // Without this the browser navigates away to the dropped file — the
        // default that makes an unhandled drop look like a crash.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
    }

    const handleSurfaceDragLeave = () => {
        dropDepthRef.current = Math.max(0, dropDepthRef.current - 1)
        if (dropDepthRef.current === 0) setDropState((prev) => ({ ...prev, over: false }))
    }

    const handleSurfaceDrop = (event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return
        event.preventDefault()
        dropDepthRef.current = 0
        const scopeId = resolveDropScopeId(
            (x, y) => window.document.elementFromPoint(x, y),
            event.clientX,
            event.clientY,
            currentScopeId
        )
        handleFilesDropped(files, { graphX: event.clientX, graphY: event.clientY }, scopeId)
    }

    // Every palette-creatable node type in one graph, with the maths chain
    // actually driving the geometry. Unlike the streaming preset below, this one
    // builds nothing that isn't implemented — see the module for which ports are
    // deliberately left unwired and why.
    const handleCreateAllNodesExample = () => {
        const { nodes: exampleNodes, edges: exampleEdges } = buildAllNodesExample({
            parentId: currentScopeId || null,
            workspaceTop
        })
        if (!exampleNodes.length) return

        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps([
            ...exampleNodes.map((node) => ({ type: 'createNode', payload: { node } })),
            ...exampleEdges.map((edge) => ({ type: 'createEdge', payload: { edge } })),
            {
                type: 'setWorkspaceState',
                payload: { patch: { selectedNodeId: null } }
            }
        ], {
            activityMessage: `Created the all-nodes example (${exampleNodes.length} nodes, ${exampleEdges.length} edges).`
        })
        // 94 nodes had just landed mostly off-screen with the view unmoved —
        // spaghetti in the visible corner and no sign of the rest (audit
        // 08-21). The person asked to SEE every node; show them every node.
        setFitSignal((token) => token + 1)
    }

    // A scene made the way a person makes one: a room, a light, a shape, a place
    // for your own file, and a note saying the moves in plain words. This is the
    // answer to "I cannot understand how it works" — something to open and copy,
    // rather than another feature.
    const handleCreateSceneExample = () => {
        const { nodes: sceneNodes, edges: sceneEdges } = buildSceneExample({
            parentId: currentScopeId || null,
            workspaceTop
        })
        if (!sceneNodes.length) return

        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps([
            ...sceneNodes.map((node) => ({ type: 'createNode', payload: { node } })),
            ...sceneEdges.map((edge) => ({ type: 'createEdge', payload: { edge } })),
            {
                type: 'setWorkspaceState',
                payload: { patch: { selectedNodeId: null } }
            }
        ], { activityMessage: 'Made a scene: a room, a light, a cube and a place for your own model.' })
    }


    // The scaffold's offset is published as a custom property rather than an
    // inline `top`, because an inline declaration outranks every media query:
    // the phone bottom-sheet rule in raw.css could not override it, so the
    // panel stayed pinned over the very node it was inspecting. CSS decides
    // where this sits; JS only supplies the measured offset.
    const hostInspector = (
        <aside ref={scaffoldRef} className="raw-selection-scaffold" style={{ '--raw-scaffold-top': workspaceTop + 'px' }}>
            <PropertyInspector
                title={inspectorTitle}
                onRename={scopedSelectedNode ? handleRenameSelected : null}
                subtitle={inspectorSubtitle}
                sections={inspectorSections}
                values={inspectorValues}
                assetOptions={document.assets || []}
                onSectionChange={handleInspectorChange}
                onPickAssetFile={handlePickAssetFile}
                emptyMessage="Double-click the world or the view to start authoring."
            />
        </aside>
    )

    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
    // Rebuilt every frame while a Time node exists — the per-pass outputCache
    // must not survive a tick or the clock would freeze at its first sample.
    const clockNow = useDocumentClock(document)
    // Stamp the show clock ONCE, the first time a Time node lands in the
    // document. From then on every window — editor, second tab, /out —
    // derives the same elapsed time from the document instead of its own
    // page-load clock. Never re-stamped, never in undo history.
    const hasShowClock = hasClockNode(document.nodes)
    const showClockEpoch = document.showState?.clockEpoch || 0
    useEffect(() => {
        if (!hasShowClock || showClockEpoch > 0) return
        applyLocalOps({ type: 'setShowState', payload: { patch: { clockEpoch: Date.now() } } })
    }, [hasShowClock, showClockEpoch, applyLocalOps])
    // Live, non-serializable node outputs (a captured webcam's VideoTexture)
    // that can't live in node.values — see createNodeGraphContext's liveOutputs.
    const [liveOutputs, setLiveOutputs] = useState(() => new Map())
    const handleLiveOutputChange = useCallback((nodeId, portId, value) => {
        setLiveOutputs((prev) => {
            const key = `${nodeId}:${portId}`
            // null/undefined clears the port (unmount, capture failed); any
            // other value — including 0, an empty array — is set as-is, so a
            // real "silent microphone" reading doesn't get treated as unset.
            const clear = value === null || value === undefined
            if (clear && !prev.has(key)) return prev
            // identical value re-reported (mic at a steady level, the same
            // texture instance) must not re-render the whole editor
            if (!clear && prev.get(key) === value) return prev
            const next = new Map(prev)
            if (clear) next.delete(key)
            else next.set(key, value)
            return next
        })
    }, [])
    // Stable per-port wrappers for the capture panels. These MUST NOT be
    // inline lambdas at the call site: the panels' effects depend on the
    // callback identity, and a fresh lambda per render makes cleanup fire
    // every render — with a live capture that is set→delete→set on
    // liveOutputs, an infinite update loop (hit with an active webcam,
    // 2026-08-08).
    const handleFrameOutputChange = useCallback((nodeId, texture) => {
        handleLiveOutputChange(nodeId, 'frame', texture)
    }, [handleLiveOutputChange])
    const handleKeyState = useCallback((nodeId, pressed, count) => {
        handleLiveOutputChange(nodeId, 'pressed', pressed)
        handleLiveOutputChange(nodeId, 'count', count)
    }, [handleLiveOutputChange])
    const handleMidiOutStatus = useCallback((nodeId, status) => {
        handleLiveOutputChange(nodeId, 'status', status)
    }, [handleLiveOutputChange])
    const handleSoundOutputChange = useCallback((nodeId, levels) => {
        handleLiveOutputChange(nodeId, 'volume', levels?.volume ?? null)
        handleLiveOutputChange(nodeId, 'low', levels?.low ?? null)
        handleLiveOutputChange(nodeId, 'mid', levels?.mid ?? null)
        handleLiveOutputChange(nodeId, 'high', levels?.high ?? null)
    }, [handleLiveOutputChange])
    const handleMicOutputChange = useCallback((nodeId, volume, frequency) => {
        handleLiveOutputChange(nodeId, 'volume', volume)
        handleLiveOutputChange(nodeId, 'frequency', frequency)
    }, [handleLiveOutputChange])
    // Stable graph-surface callbacks: as inline lambdas these re-registered
    // RawGraphSurface's window-level drag/key listeners on every parent
    // render, and a teardown mid-drag dropped the queued final frame.
    const handleCreateEdge = useCallback((payload) => applyLocalOps({
        type: 'createEdge',
        payload: { edge: payload }
    }), [applyLocalOps])
    // Put an interior port on the container's face: place the doorway node and
    // its wire in ONE op batch, so a single undo takes both away and no
    // intermediate state exists where a door sits there wired to nothing.
    //
    // Honest about what this is: a long press advertises itself to nobody. This
    // is a shortcut for the gesture, not the way anyone DISCOVERS it — placing
    // an In/Out node from the palette by hand remains that.
    const handlePromotePort = useCallback(({ node, port, dir }) => {
        if (!node || !port) return
        const container = currentScopeId ? authoredNodes.find((n) => n.id === currentScopeId) : null
        if (!container) {
            setDropState({
                over: false,
                busy: false,
                notice: 'Go inside a container first — a doorway makes a socket on the container it is in.'
            })
            return
        }
        // An OUT door carries a value from an interior output to the outside; an
        // IN door brings a value from outside into an interior input.
        const doorTypeId = dir === 'out' ? 'port.out' : 'port.in'
        const door = createNode(doorTypeId, {
            values: {
                // ONLY values.label. The card keeps the type's own name ("In"/
                // "Out"); the socket's name lives here and the inspector edits
                // exactly this field. Writing both would let a rename diverge
                // them permanently, and the socket would then be named by
                // whichever one happened to be read.
                label: port.label || port.id,
                // Inherited from the port it came from, so most doors never
                // need the type picker touched.
                portType: port.type || 'any'
            },
            graphX: (node.graphX ?? 0) + (dir === 'out' ? 260 : -260),
            graphY: node.graphY ?? 0,
            parentId: currentScopeId
        })
        if (!door) return
        const edge = dir === 'out'
            ? createEdge(node.id, port.id, door.id, 'value')
            : createEdge(door.id, 'value', node.id, port.id)
        applyLocalOps([
            { type: 'createNode', payload: { node: door } },
            { type: 'createEdge', payload: { edge } },
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: door.id } } }
        ], { activityMessage: `Exposed ${port.label || port.id} on ${container.label}.` })
        // The new socket is one level up, off-screen from here — say so, or the
        // gesture appears to have done nothing.
        setPromotedNotice({
            containerId: container.id,
            containerLabel: container.label,
            portLabel: port.label || port.id
        })
    }, [applyLocalOps, authoredNodes, currentScopeId])

    const handleDeleteEdge = useCallback((edgeId) => applyLocalOps({
        type: 'deleteEdge',
        payload: { edgeId }
    }), [applyLocalOps])
    const handleDeleteNode = useCallback((nodeId) => {
        applyLocalOps([
            { type: 'deleteNode', payload: { nodeId } },
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } }
        ], { activityMessage: 'Deleted node.', activityLevel: 'warning' })
    }, [applyLocalOps])
    const handleMoveNode = useCallback((nodeId, nextX, nextY) => applyLocalOps({
        type: 'updateNode',
        payload: { nodeId, patch: { graphX: nextX, graphY: nextY } }
    }), [applyLocalOps])

    // Ctrl/Cmd+D. The audit found NO duplication path of any kind — a composed
    // object could not be stamped twice except by rebuilding it. This clones
    // the node alone (not its subtree — a container's copy arriving empty is
    // visible and fixable; a deep clone with re-identified interior wiring is
    // its own change), stepped aside in both spaces so the copy never lands
    // exactly on the original.
    const handleDuplicateSelected = useCallback(() => {
        const source = workspaceState.selectedNodeId
            ? authoredNodes.find((node) => node.id === workspaceState.selectedNodeId)
            : null
        if (!source) return
        const values = JSON.parse(JSON.stringify(source.values || {}))
        if (Array.isArray(values.position)) {
            values.position = [values.position[0] + 0.6, values.position[1], values.position[2] + 0.6]
        }
        const copy = createNode(source.typeId, {
            label: source.label,
            parentId: source.parentId || null,
            graphX: (source.graphX || 0) + 48,
            graphY: (source.graphY || 0) + 48,
            values
        })
        if (!copy) return
        applyLocalOps(
            { type: 'createNode', payload: { node: copy } },
            { activityMessage: `Duplicated ${source.label || 'a node'}.` }
        )
        selectNode(copy.id)
    }, [applyLocalOps, authoredNodes, selectNode, workspaceState.selectedNodeId])
    // Between-pass node state (a Lag's last answer) — this window's own,
    // never React state, dropped whole when the document changes.
    const [frameMemory] = useState(() => createFrameMemory())
    useEffect(() => { frameMemory.clear() }, [frameMemory, projectId])
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs, frameMemory }),
        [document, clockNow, liveOutputs, frameMemory]
    )

    // The sheet's own context, built from the SAME three inputs as the one the
    // room draws with — evaluation is pure, so same document + same clock +
    // same liveOutputs is the same answer, and the sheet cannot hold a second
    // opinion about what a port is carrying.
    //
    // With one exception, now that Lag exists: frameMemory is impure by
    // design, so the sheet carries its OWN memory — sharing the room's would
    // write it twice per frame at two different clocks and corrupt the glide.
    // Its rows converge on the room's value within a lag constant.
    //
    // The one input it deliberately quantises is the clock. graphContext is
    // rebuilt 60 times a second while a Time node exists, and a sine read at
    // 60 Hz is an unreadable blur — so the sheet's clock advances in 125 ms
    // steps. That makes the staleness a stated 125 ms rather than an accident,
    // and it is a legibility decision, not a cost one: these rows are text
    // somebody is reading, not a frame being drawn.
    const anatomyNow = Math.floor((clockNow || 0) / 125) * 125
    const [anatomyMemory] = useState(() => createFrameMemory())
    const anatomyReading = useMemo(() => {
        if (!anatomyFrame || !scopeNode) return null
        return readNode(scopeNode, {
            // EVERY node, never the scoped card list: a container's sockets come
            // from doorway nodes living in a different scope, and the scoped
            // list finds none of them, silently, with every test still green.
            allNodes: authoredNodes,
            context: createNodeGraphContext(document, { now: anatomyNow, liveOutputs, frameMemory: anatomyMemory }),
            document,
            childCount: childCounts.get(scopeNode.id) || 0
        })
    }, [anatomyFrame, scopeNode, authoredNodes, document, liveOutputs, anatomyMemory, childCounts, anatomyNow])

    const handleShowFeedingCard = useCallback((nodeId) => {
        // What feeds the node you are standing in is a card in the scope
        // OUTSIDE it, which is where walking out puts you.
        handleNavigateToScope(navStack.length - 2)
        selectNode(nodeId)
    }, [handleNavigateToScope, navStack.length, selectNode])

    const renderViewNodeContent = (node) => {
        const resolvedValues = evaluateNodeInputs(node, graphContext)
        if (node.typeId === 'universe.world') {
            return (
                <WorldPanelWindow
                    document={document}
                    selectedEntityId={scopedSelectedEntity?.id || null}
                    selectedNodeId={scopedSelectedNode?.id || null}
                    onSelectEntity={selectEntity}
                    onSelectNode={selectNode}
                    onClearSelection={clearSelection}
                    onWorldDoubleClick={handleWorldSurfaceDoubleClick}
                    onMoveNode={handleMoveWorldNode}
                    cursors={presence.cursors}
                    onCursorMove={presence.emitCursor}
                    onCursorLeave={presence.clearCursor}
                    nodeScale={nodeScale}
                    // The room this World belongs to, not the World's own
                    // interior. A World is render:'panel-2d' — a window onto a
                    // room, and its own live-marker is keyed by its PARENT
                    // scope (see isLive just below), so the room it shows is
                    // the room it stands in. Showing node.id instead meant a
                    // cube placed beside the World was never drawn by it.
                    scopeId={currentScopeId}
                    // The scope's ●-resolved world, NOT this panel's own node:
                    // sky/light fall back through worldNode, so two open Scene
                    // windows in one room used to show two different skies.
                    // A non-live window's own Sky field is inert until ● marks
                    // it — that is what the ● toggle means now.
                    worldNode={worldNode}
                    liveOutputs={liveOutputs}
                    isLive={(document.workspaceState?.liveWorldNodeIdByScope || {})[node.parentId || ''] === node.id}
                    onSetLive={() => markWorldLive(node)}
                    onEnterFullscreen={() => {
                        // The fullscreen/overlay renders always show `worldNode`
                        // (the scope's live-marked world), so opening from a
                        // second world's panel used to display a different
                        // world than the one clicked. Mark it live first.
                        markWorldLive(node)
                        setIsWorldFullscreen(true)
                    }}
                />
            )
        }
        if (node.typeId === 'view.browser') {
            return <BrowserPanelWindow node={{ ...node, values: resolvedValues }} />
        }
        if (node.typeId === 'view.image') {
            return <ImagePanelWindow node={node} values={resolvedValues} assetMap={assetMap} />
        }
        if (node.typeId === 'stream.monitor') {
            return <MonitorPanelWindow node={node} values={resolvedValues} />
        }
        if (node.typeId === 'source.webcam') {
            return <WebcamSourcePanel node={node} onFrameChange={handleFrameOutputChange} />
        }
        if (node.typeId === 'source.mic') {
            return <MicSourcePanel node={node} onLevelsChange={handleMicOutputChange} />
        }
        if (node.typeId === 'device.midi.in') {
            return (
                <MidiInputPanel
                    node={node}
                    values={resolvedValues}
                    onSignalChange={(nodeId, ports) => {
                        // null clears every port at once (unmount). Otherwise
                        // only the ports this message carries are written, so a
                        // CC does not wipe the last note and vice versa.
                        for (const portId of ['note', 'velocity', 'cc', 'value', 'trigger']) {
                            if (ports === null) handleLiveOutputChange(nodeId, portId, null)
                            else if (ports[portId] !== undefined) handleLiveOutputChange(nodeId, portId, ports[portId])
                        }
                    }}
                    onConfigChange={(nodeId, patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId, patch: { values: { ...node.values, ...patch } } }
                    })}
                />
            )
        }
        if (node.typeId === 'work.status') {
            return <WorkStatusPanel node={node} onValuesChange={handleLiveOutputChange} />
        }
        if (node.typeId === 'work.agent') {
            return (
                <AgentRunPanel
                    node={node}
                    prompt={resolvedValues.prompt}
                    trigger={resolvedValues.trigger}
                    onValuesChange={handleLiveOutputChange}
                />
            )
        }
        if (node.typeId === 'agent.keeper') {
            return (
                <KeeperPanelWindow
                    node={node}
                    values={resolvedValues}
                    onReplyChange={(nodeId, reply, busy) => {
                        handleLiveOutputChange(nodeId, 'reply', reply)
                        handleLiveOutputChange(nodeId, 'busy', busy)
                    }}
                    // Endpoint and model are settable in the window itself, not
                    // only in the inspector: a node the palette can place must be
                    // usable where it lands, without also placing an inspector.
                    onConfigChange={(nodeId, patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId, patch: { values: { ...node.values, ...patch } } }
                    })}
                />
            )
        }
        if (node.typeId === 'view.director') {
            return <DirectorPanelWindow node={node} />
        }
        if (node.typeId === 'view.button') {
            return (
                <ButtonPanelWindow
                    node={node}
                    values={resolvedValues}
                    onHeld={(nodeId, held) => handleLiveOutputChange(nodeId, 'pressed', held)}
                    onPress={(nodeId) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId, patch: { values: { ...node.values, presses: (Number(node.values?.presses) || 0) + 1 } } }
                    })}
                />
            )
        }
        if (node.typeId === 'view.timeline') {
            return (
                <TimelinePanelWindow
                    node={node}
                    values={resolvedValues}
                    clockNow={clockNow}
                    onChange={(clips) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, clips } } }
                    })}
                    onTransport={(patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, ...patch } } }
                    })}
                />
            )
        }
        // Studio chrome, as nodes. These render the SAME components as the
        // hardcoded outliner and inspector below — the panel node supplies the
        // window, the editor supplies the body, so neither has to thread the
        // selection and document through the graph as ports.
        if (node.typeId === 'view.outliner') {
            return (
                <OutlinerPanelWindow
                    nodes={authoredNodes}
                    selectedNodeId={workspaceState.selectedNodeId || null}
                    onSelectNode={(nodeId) => selectNode(nodeId)}
                />
            )
        }
        if (node.typeId === 'view.library') {
            return <CreatePanelWindow onCreateEntity={handleCreateEntity} />
        }
        if (node.typeId === 'view.inspector') {
            return (
                <PropertyInspector
                    title={inspectorTitle}
                    onRename={scopedSelectedNode ? handleRenameSelected : null}
                    subtitle={inspectorSubtitle}
                    sections={inspectorSections}
                    values={inspectorValues}
                    assetOptions={document.assets || []}
                    onSectionChange={handleInspectorChange}
                    onPickAssetFile={handlePickAssetFile}
                    emptyMessage="Select a node to inspect it."
                />
            )
        }
        if (node.typeId === 'agent') {
            return (
                <AgentChatPanelWindow
                    chatId={node.values?.chatId || null}
                    onPersistChatId={(chatId) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { chatId } } }
                    })}
                />
            )
        }
        // Every unhandled panel-2d type falls through to a text box, which is
        // how the streaming preset's stream.monitor/stream.controller ended up
        // looking like working features. Anything added above this line must be
        // real; anything below it is a text box wearing another name.
        return <TextPanelWindow node={node} values={resolvedValues} />
    }

    const visibleSelection = Boolean(scopedSelectedNode || scopedSelectedEntity)

    // How much of the canvas the selection panel is covering from the bottom,
    // so the graph can fit itself into the part you can actually see. Only
    // counts when the panel is anchored to the bottom edge (the phone sheet) —
    // a floating panel at the top-right occludes a corner, not a band, and
    // treating it as a band would push the graph up for no reason.
    const [graphBottomInset, setGraphBottomInset] = useState(0)
    useEffect(() => {
        const el = scaffoldRef.current
        if (!el) {
            setGraphBottomInset(0)
            return undefined
        }
        const measure = () => {
            const rect = el.getBoundingClientRect()
            const anchoredToBottom = Math.abs(rect.bottom - window.innerHeight) < 2
            setGraphBottomInset(anchoredToBottom ? rect.height : 0)
        }
        measure()
        // ResizeObserver is absent in jsdom (and in any non-browser runtime).
        // The window resize listener alone still catches the case that matters
        // — the viewport changing — so degrade rather than throw.
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        observer?.observe(el)
        window.addEventListener('resize', measure)
        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [visibleSelection])


    // Keyboard delete for OBJECTS only — node deletion is RawGraphSurface's
    // handler, which checks its own scope map; both firing would double-op.
    useEffect(() => {
        if (!scopedSelectedEntity) return undefined
        const handler = (event) => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return
            const target = event.target
            const tag = target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return
            event.preventDefault()
            handleDeleteSelected()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleDeleteSelected, scopedSelectedEntity])

    useEffect(() => {
        const handler = (event) => {
            const tag = event.target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return
            if (event.key === 'Escape' && navStack.length > 1) {
                event.preventDefault()
                handleNavigateToScope(navStack.length - 2)
                return
            }
            // At the top of the stack there is no scope left to pop — Escape
            // closes the fullscreen room instead of dying silently. Deeper
            // down, fullscreen survives the walk by design (the go-inside/
            // come-out journey), so scope-popping keeps priority.
            if (event.key === 'Escape' && navStack.length === 1 && isWorldFullscreen) {
                event.preventDefault()
                setIsWorldFullscreen(false)
                return
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
                // Browsers bookmark on Ctrl+D; duplicating the selected node
                // is what a person arranging a scene means by it here.
                event.preventDefault()
                handleDuplicateSelected()
                return
            }
            const isUndo = (event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey
            const isRedo = (event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))
            if (!isUndo && !isRedo) return
            event.preventDefault()
            // Undo/redo replays inverse ops through applyLocalOps — the same
            // network-backed path as every other document write, so history
            // stays granular and never reverts collaborators' concurrent
            // edits (see docs/ai/known-fixes.md). The local-only Blank
            // Workspace shares the path: without a projectId the ops only
            // dispatch locally, and a separate effect persists `document`
            // to localStorage on change.
            if (isUndo) undo()
            else redo()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleDuplicateSelected, handleNavigateToScope, navStack.length, undo, redo, isWorldFullscreen])

    const handleMoveWorldNode = (nodeId, nextPosition) => {
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { values: { position: nextPosition } } }
        })
    }

    // Everything the workspace can summon. The Windows menu's job, the help
    // button's job and the chat button's job all arrive here rather than
    // sitting resident on the surface — and any panel node that is currently
    // hidden is listed generically, so a node type added later is summonable
    // without touching this list.
    const hiddenPanelNodes = authoredNodes.filter(
        (node) => isPanelNode(node) && node.values?.frame?.visible === false
    )
    const paletteCommands = [
        {
            id: 'chrome',
            label: zen ? 'Show the toolbar' : 'Hide the toolbar',
            hint: zen ? 'topbar, controls' : 'zen — surface and nodes only',
            run: () => setZenPreference(!zen)
        },
        // The room must stay one keystroke away everywhere — with the
        // backdrop retired (the desk is clear, always) this is the zen
        // route in; the audit called its absence critical back when the
        // backdrop still papered over it.
        { id: 'room', label: 'Full screen', hint: 'the 3D view, fullscreen', run: () => setIsWorldFullscreen(true) },
        { id: 'help', label: 'Help', hint: 'what the keys do', run: () => setHelpOpen(true) },
        { id: 'chat', label: 'Chat', hint: 'talk to whoever is here', run: () => setChatOpen(true) },
        { id: 'outliner', label: 'Outliner', hint: 'every node in the project', run: () => setOutlinerOpen(true) },
        ...hiddenPanelNodes.map((node) => ({
            id: `window:${node.id}`,
            label: node.values?.frame?.title || node.label || getNodeType(node.typeId)?.label || 'Panel',
            hint: `open — ${node.typeId}`,
            run: () => applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: node.id,
                    patch: { values: { frame: { ...(node.values?.frame || {}), visible: true } } }
                }
            })
        }))
    ]

    // "Blank White Workspace" was neither blank nor white nor, in the
    // product's vocabulary, a workspace. It is the canvas that lives in this
    // browser.
    const workspaceTitle = isLocalWorkspace ? 'Local canvas' : (document.projectMeta?.title || 'Untitled project')
    const graphTopInset = chromeVisible ? workspaceTop : 0
    // Windows float over the graph, so the fit has to dodge the docked ones or
    // it centres the card cluster underneath one — see getGraphEdgeInsets.
    // Through the SAME clamp DesktopWindow applies: the stored frame is where a
    // window wants to be, not where it renders. The bottom reserve alone moved
    // the seeded welcome window up by 116px, and insets read off the stored
    // frame put the graph's free band in the wrong place entirely.
    const graphContentInsets = getGraphEdgeInsets({
        frames: [
            // The anatomy sheet is a docked window like any other, so the fit
            // has to dodge it too — otherwise the cards centre underneath the
            // window explaining them.
            ...(anatomyFrame && !anatomyFrame.minimized ? [anatomyFrame] : []),
            ...visibleViewNodes
                .filter((node) => node.values?.frame?.minimized !== true)
                .map((node) => node.values?.frame)
                .filter(Boolean)
        ]
            .map((frame) => clampWindowFrame(frame, {
                allowOverflowLeft: true,
                allowOverflowTop: true,
                viewportWidth: typeof window === 'undefined' ? undefined : window.innerWidth,
                viewportHeight: typeof window === 'undefined' ? undefined : window.innerHeight
            })),
        surfaceRect: {
            left: 0,
            top: graphTopInset,
            width: typeof window === 'undefined' ? 0 : window.innerWidth,
            height: typeof window === 'undefined' ? 0 : window.innerHeight - graphTopInset
        }
    })

    return (
        <main className="raw-editor-shell">
            <header className={`raw-topbar${chromeVisible ? ' is-seeded' : ''}`} ref={topbarRef}>
                {chromeVisible && (
                    <>
                        <div className="raw-topbar-left">
                            <button type="button" className="raw-topbar-back" onClick={() => {
                                navigateToRawPath(buildRawProjectsPath(resolvedSpaceId))
                            }}>
                                ← Projects
                            </button>
                            <span className="raw-topbar-name" title={workspaceTitle}>{workspaceTitle}</span>
                        </div>
                        <div className="raw-topbar-center">
                            {navStack.length > 1 ? (
                                <nav className="raw-topbar-breadcrumb" aria-label="Node scope">
                                    <button type="button" className="raw-topbar-crumb" onClick={() => handleNavigateToScope(0)}>◈</button>
                                    {navStack.slice(1).map((scopeId, i) => {
                                        const crumbNode = authoredNodes.find((n) => n.id === scopeId)
                                        const stackIndex = i + 1
                                        const isLast = stackIndex === navStack.length - 1
                                        return (
                                            <span key={scopeId} className="raw-topbar-crumb-group">
                                                <span className="raw-topbar-crumb-sep">›</span>
                                                <button
                                                    type="button"
                                                    className={`raw-topbar-crumb${isLast ? ' is-current' : ''}`}
                                                    onClick={() => handleNavigateToScope(stackIndex)}
                                                >
                                                    {crumbNode?.label || 'Node'}
                                                </button>
                                            </span>
                                        )
                                    })}
                                </nav>
                            ) : showEmptyHint ? (
                                <span className="raw-topbar-location" aria-live="polite">{topbarLocationText}</span>
                            ) : null}
                            <div className="raw-topbar-windows">
                                <button
                                    type="button"
                                    className={isWorldFullscreen ? 'is-active' : ''}
                                    // The room of the CURRENT scope, fullscreen —
                                    // any scope, not only where a World card
                                    // stands. The old behaviour toggled the root
                                    // World window's frame, which is unmounted in
                                    // every other scope: a button that did
                                    // nothing, silently, exactly where a person
                                    // most needed to see what they were building.
                                    onClick={() => setIsWorldFullscreen((current) => !current)}
                                >
                                    {isWorldFullscreen ? '← Graph' : 'Scene'}
                                </button>
                            </div>
                        </div>
                        <div className="raw-topbar-right">
                            <button type="button" className="raw-topbar-help-action" onClick={() => setHelpOpen(true)}>
                                Help
                            </button>
                            {nodeCount > 0 && (
                                <button
                                    type="button"
                                    className={`raw-topbar-node-count${outlinerOpen ? ' is-active' : ''}`}
                                    onClick={() => setOutlinerOpen((v) => !v)}
                                    title="Toggle outliner"
                                    aria-label={`${nodeCount} nodes`}
                                >
                                    {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                                </button>
                            )}
                            {/* No Chat button alone in a local canvas: there
                                is nobody on the other end (the doc lives in
                                this browser), and a resident social control in
                                a single-person room is the audit's definition
                                of noise. It returns the moment presence shows
                                anyone, and the ⋯ menu's Chat entry stays as
                                the always-there path. */}
                            {(!isLocalWorkspace || presence.users.length > 0 || unreadChatCount > 0) && (
                                <button
                                    type="button"
                                    className={`raw-topbar-node-count${chatOpen ? ' is-active' : ''}`}
                                    onClick={() => setChatOpen((v) => !v)}
                                    title="Toggle chat"
                                    aria-label="Toggle chat"
                                >
                                    Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
                                </button>
                            )}
                            <div className="raw-topbar-overflow">
                                <button type="button" className="raw-topbar-overflow-btn" onClick={() => setOverflowOpen((v) => !v)}>⋯</button>
                                {overflowOpen && (
                                    <div className="raw-topbar-overflow-menu">
                                        <button type="button" onClick={() => { scopeReset(); setOverflowOpen(false) }}>Home</button>
                                        {/* One project, two editors — this is the
                                            way across. The local canvas has no
                                            Studio twin, so no link there. */}
                                        {!isLocalWorkspace && projectId && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOverflowOpen(false)
                                                    navigateToRawPath(buildStudioProjectPath(projectId, resolvedSpaceId))
                                                }}
                                            >
                                                Open in Studio
                                            </button>
                                        )}
                                        {/* Configuration, not work — the ⋯ is
                                            where the audit sent it. */}
                                        <div className="raw-topbar-scale-control">
                                            <label htmlFor="node-scale-select">Size:</label>
                                            <select
                                                id="node-scale-select"
                                                value={nodeScale}
                                                onChange={(e) => setNodeScale(parseFloat(e.target.value))}
                                                title="Adjust node size for mobile, tablet, VR, or desktop viewing"
                                            >
                                                {getAvailableScales().map((s) => (
                                                    <option key={s.value} value={s.value}>
                                                        {s.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <button type="button" onClick={() => { handleCreateSceneExample(); setOverflowOpen(false) }}>Build an example</button>
                                        <button type="button" onClick={() => { handleCreateAllNodesExample(); setOverflowOpen(false) }}>All Nodes Example</button>
                                        {isLocalWorkspace && (
                                            <button type="button" onClick={() => { handleResetLocalWorkspace(); setOverflowOpen(false) }}>Clear the canvas</button>
                                        )}
                                        {presence.users.length > 0 && presence.users.map((user) => (
                                            <span key={user.socketId || user.userId} className="raw-user-pill">
                                                {user.userName}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </header>

            {state.loading ? <div className="raw-overlay-message">Loading project…</div> : null}
            {state.loadError ? <div className="raw-overlay-message is-error">{state.loadError}</div> : null}
            {visibleSelection && (
                <button
                    type="button"
                    className="raw-delete-fab"
                    // The phone rule rides this: Delete sits just above the
                    // docked sheet, not top-right where Android notification
                    // banners steal the tap (measured on the S24, 2026-08-20).
                    style={{ '--raw-sheet-inset': `${graphBottomInset}px` }}
                    onClick={handleDeleteSelected}
                >
                    Delete
                </button>
            )}

            <section
                className={`raw-surface-shell${navStack.length > 1 ? ' is-inside-node' : ''}${dropState.over ? ' is-drop-target' : ''}`}
                onDragEnter={handleSurfaceDragEnter}
                onDragOver={handleSurfaceDragOver}
                onDragLeave={handleSurfaceDragLeave}
                onDrop={handleSurfaceDrop}
            >
            {/* THE DESK IS CLEAR — always. The backdrop room lived here from
                2026-08-19 to 2026-08-20: first always-on, then only when
                something stood in it, and the owner's verdict stayed the
                same ("i don't want to backdrop display of geo… i mean clear
                desk"). The room is seen through the Scene window (resizable),
                the fullscreen Room (topbar and palette), and /out — never as
                wallpaper behind the cards. */}
                {/* Graph is the primary surface — always visible */}
                <RawGraphSurface
                    key={currentScopeId || 'root'}
                    chromeless={!chromeVisible}
                    topInset={graphTopInset}
                    bottomInset={graphBottomInset}
                    contentInsets={graphContentInsets}
                    nodes={graphCardNodes}
                    childCounts={childCounts}
                    // EVERY node, not graphCardNodes. A container's doorways
                    // live INSIDE it — a different scope from its own card — so
                    // the scoped list would find none of them and the container
                    // would simply never grow a socket, silently, with every
                    // unit test still passing.
                    portScopeNodes={authoredNodes}
                    onClearSelection={clearSelection}
                    fitSignal={fitSignal}
                    onPromotePort={handlePromotePort}
                    // Only at the ROOT of a truly blank desk. Inside a
                    // container the same button injected the whole six-node
                    // demo INTO the container the person was filling (seen
                    // live 2026-08-20: a stray double-click inside a fresh
                    // Geo buried it under a demo room). The ⋯ menu still
                    // offers the demo deliberately, anywhere.
                    onMakeScene={currentScopeId === null && nodes.length === 0 ? handleCreateSceneExample : null}
                    // Only inside a CODE-made node: there the empty canvas IS
                    // the question. A container's reading stays one tap away on
                    // the marker's ? — two resident buttons for one answer was
                    // the clutter the audit counted.
                    onExplainScope={currentScopeId && isNodeMadeOfCode(scopeNode?.typeId) ? openAnatomy : null}
                    emptyHint={scopeEmptyHint}
                    edges={graphCardEdges}
                    selectedNodeId={workspaceState.selectedNodeId}
                    onEnterNode={handleEnterNode}
                    onSelectNode={selectNode}
                    onCreateEdge={handleCreateEdge}
                    onDeleteEdge={handleDeleteEdge}
                    onDeleteNode={handleDeleteNode}
                    onMoveNode={handleMoveNode}
                    onDoubleClick={(placement) => openPalette(placement)}
                    isNodeActive={(node) =>
                        activeMarkerTypeIds.includes(node.typeId)
                        && getActiveNodeId(node.typeId, node.parentId || null) === node.id
                    }
                    onSetActive={(node) => setActiveNodeId(node.typeId, node.parentId || null, node.id)}
                    activeMarkerTypeIds={activeMarkerTypeIds}
                />
                {/* Zen's three residents are surface, nodes, wordmark — this is
                    the wordmark. Ambient, non-interactive, kept when chrome is
                    summoned too. */}
                <div className="raw-surface-wordmark" aria-hidden="true">di<span>.</span>iiii</div>
                {dropState.over && (
                    <div className="raw-drop-veil" aria-hidden="true">
                        <span>drop to bring it in</span>
                    </div>
                )}
                {(dropState.busy || dropState.notice) && (
                    <div className={`raw-drop-notice${dropState.notice ? ' is-warning' : ''}`} role="status" aria-live="polite">
                        {dropState.busy ? 'Bringing it in…' : dropState.notice}
                    </div>
                )}
                {/* Panel nodes float above the graph as viewport-fixed windows */}
                {visibleViewNodes.map((node, index) => {
                    const windowState = buildWindowStateFromNode(node, index, graphContext)
                    // The family, not the type id: the cards say "the room" and
                    // the windows used to say UNIVERSE.WORLD. Same node, two
                    // vocabularies — and the colour is what ties the window to
                    // its card on the canvas behind it.
                    const family = getNodeFamily(node.typeId)
                    return (
                        <DesktopWindow
                            key={node.id}
                            windowState={windowState}
                            title={windowState.title}
                            kicker={family?.label || node.typeId}
                            accent={family?.color || null}
                            allowOverflowLeft
                            allowOverflowTop
                            onFocus={() => {
                                selectNode(node.id)
                                // already topmost → no op. Unconditional bumps
                                // inflated zIndex forever AND pushed a real
                                // undo entry per title-bar click, so Ctrl+Z
                                // undid a focus instead of the last edit.
                                if ((node.values?.frame?.zIndex || 6) >= topZIndex) return
                                applyLocalOps({
                                    type: 'updateNode',
                                    payload: {
                                        nodeId: node.id,
                                        patch: { values: { frame: { ...(node.values?.frame || {}), zIndex: topZIndex + 1 } } }
                                    }
                                })
                            }}
                            onPatch={(patch) => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: { values: { frame: { ...(node.values?.frame || {}), ...patch } } }
                                }
                            })}
                            onClose={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: { values: { frame: { ...(node.values?.frame || {}), visible: false } } }
                                }
                            })}
                            onToggleMinimize={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: { values: { frame: { ...(node.values?.frame || {}), minimized: !node.values?.frame?.minimized } } }
                                }
                            })}
                            onTogglePin={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: { values: { frame: { ...(node.values?.frame || {}), pinned: !node.values?.frame?.pinned } } }
                                }
                            })}
                            onEnter={() => handleEnterNode(node.id)}
                        >
                            {renderViewNodeContent(node)}
                        </DesktopWindow>
                    )
                })}
            </section>

            {/* The socket this made is one level up and off-screen, so the
                gesture would otherwise look like it did nothing. */}
            {promotedNotice && (
                <div className="raw-promoted-notice" role="status" aria-live="polite">
                    <span>
                        <strong>{promotedNotice.containerLabel}</strong> now has a{' '}
                        <strong>{promotedNotice.portLabel}</strong> socket
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            // Navigate by the container's OWN scope, never
                            // navStack.length - 2: at the root that is index -1,
                            // which truncates the stack to empty and takes the
                            // trail, the Escape exit and the marker with it.
                            const parentId = authoredNodes.find((n) => n.id === promotedNotice.containerId)?.parentId || null
                            const index = navStack.indexOf(parentId)
                            handleNavigateToScope(index >= 0 ? index : 0)
                            selectNode(promotedNotice.containerId)
                            setPromotedNotice(null)
                        }}
                    >
                        Go and see
                    </button>
                    <button type="button" className="raw-promoted-notice-close" onClick={() => setPromotedNotice(null)}>×</button>
                </div>
            )}

            {/* Where you are, and the way back out. Deliberately OUTSIDE the
                chromeVisible gate: chromeVisible starts with `if (zen) return
                false`, and a fresh workspace opens in zen, so the breadcrumb
                that already exists is hidden exactly when someone first walks
                into a container. Entering a World additionally goes fullscreen
                and strips the rest. The result was an empty grid with no name
                and no visible exit — indistinguishable from having destroyed
                your work. This is the one thing that must never be hidden. */}
            {navStack.length > 1 && (
                <div
                    className="raw-scope-marker"
                    role="status"
                    aria-live="polite"
                    // Below the topbar when there is one, near the top when
                    // there is not. Measured: the topbar is 49px and full-width,
                    // so a fixed top:12px sat inside it with chrome on.
                    style={{ top: `${getScopeMarkerTop({ chromeVisible, workspaceTop })}px` }}
                >
                    <button
                        type="button"
                        className="raw-scope-marker-out"
                        onClick={() => handleNavigateToScope(navStack.length - 2)}
                        title="Leave"
                        aria-label="Leave"
                    >
                        ‹
                    </button>
                    <span className="raw-scope-marker-label">
                        inside <strong>{scopeNode?.label || 'a node'}</strong>
                    </span>
                    {/* The general way in. The empty-state button only exists
                        while the scope is empty, and a container you have put
                        something in is exactly where "what is this made of" is
                        most worth asking. */}
                    {/* A glyph, not a sentence: the resident four-word button
                        was the audit's example of info squatting on the one
                        strip that must stay minimal. The question mark IS the
                        question; title and accessible name carry the words. */}
                    <button
                        type="button"
                        className="raw-scope-marker-what"
                        onClick={openAnatomy}
                        title={`What ${scopeNode?.label || 'this node'} is made of`}
                        aria-label={`what is it made of — ${scopeNode?.label || 'this node'}`}
                    >
                        ?
                    </button>
                    {navStack.length > 2 && (
                        <button
                            type="button"
                            className="raw-scope-marker-root"
                            onClick={() => handleNavigateToScope(0)}
                            title="All the way out"
                        >
                            ◈
                        </button>
                    )}
                </div>
            )}

            {/* One invisible feed per playing Video node, so a Frame wire
                carries the picture even while the room isn't on screen —
                see VideoFrameFeed for why this lives here. */}
            {nodes
                .filter((node) => node.typeId === 'media.video' && node.values?.src && assetMap.has(node.values.src))
                .map((node) => (
                    <VideoFrameFeed
                        key={node.id}
                        node={node}
                        asset={assetMap.get(node.values.src)}
                        onFrameChange={handleFrameOutputChange}
                    />
                ))}
            {nodes
                .filter((node) => node.typeId === 'media.audio' && node.values?.src && assetMap.has(node.values.src))
                .map((node) => (
                    <SoundAnalysisFeed
                        key={node.id}
                        node={node}
                        asset={assetMap.get(node.values.src)}
                        onLevelsChange={handleSoundOutputChange}
                    />
                ))}
            {nodes
                .filter((node) => node.typeId === 'device.keyboard')
                .map((node) => (
                    <KeyboardFeed key={node.id} node={node} onKeyState={handleKeyState} />
                ))}
            {nodes
                .filter((node) => node.typeId === 'device.midi.out')
                .map((node) => (
                    <MidiOutFeed
                        key={node.id}
                        node={node}
                        inputs={evaluateNodeInputs(node, graphContext)}
                        onStatus={handleMidiOutStatus}
                    />
                ))}

            {/* Fullscreen room — takes over the full viewport. Any scope,
                not only Worlds: the room you are standing in IS the thing
                being built, whatever kind of node owns it. */}
            {isWorldFullscreen && (
                <div className="raw-world-fullscreen" style={{ top: `${chromeVisible ? workspaceTop : 0}px` }}>
                    {/* The way back, on the surface itself: zen has no topbar,
                        and a fullscreen room whose only exit lives in hidden
                        chrome is a trap (measured: ⤢ in zen stranded you until
                        you knew to summon the chrome by keyboard). */}
                    <button
                        type="button"
                        className="raw-room-exit"
                        onClick={() => setIsWorldFullscreen(false)}
                        title="Back to the graph"
                    >
                        ‹ graph
                    </button>
                    <RawViewport
                        topInset={0}
                        document={document}
                        selectedEntityId={scopedSelectedEntity?.id || null}
                        selectedNodeId={scopedSelectedNode?.id || null}
                        onSelectEntity={selectEntity}
                        onSelectNode={selectNode}
                        onClearSelection={clearSelection}
                        onWorldDoubleClick={handleWorldSurfaceDoubleClick}
                        onMoveNode={handleMoveWorldNode}
                        cursors={presence.cursors}
                        onCursorMove={presence.emitCursor}
                        onCursorLeave={presence.clearCursor}
                        nodeScale={nodeScale}
                        showEmptyHint={false}
                        // The room you are STANDING IN, not the inside of the
                        // live World. The graph canvas filters on
                        // currentScopeId and the palette creates with
                        // parentId: currentScopeId — while this said
                        // worldNode.id, the two halves of the screen named
                        // different rooms, so anything placed at root landed
                        // somewhere real and was never drawn. worldNode is
                        // still passed, for sky and lighting.
                        scopeId={currentScopeId}
                        worldNode={worldNode}
                        liveOutputs={liveOutputs}
                    />
                </div>
            )}


            {outlinerOpen && (
                <DesktopWindow
                    windowState={outlinerFrame}
                    title="Outliner"
                    minTop={workspaceTop}
                    onFocus={() => setOutlinerFrame((f) => ({ ...f, zIndex: 20 }))}
                    onPatch={(patch) => setOutlinerFrame((f) => ({ ...f, ...patch }))}
                    onClose={() => setOutlinerOpen(false)}
                    onToggleMinimize={() => setOutlinerFrame((f) => ({ ...f, minimized: !f.minimized }))}
                    onTogglePin={() => setOutlinerFrame((f) => ({ ...f, pinned: !f.pinned }))}
                >
                    <OutlinerPanelWindow
                        nodes={authoredNodes}
                        selectedNodeId={workspaceState.selectedNodeId || null}
                        onSelectNode={(nodeId) => selectNode(nodeId)}
                    />
                </DesktopWindow>
            )}

            {anatomyFrame && anatomyReading && (
                <DesktopWindow
                    windowState={anatomyFrame}
                    title={`What ${anatomyReading.label} is made of`}
                    kicker={anatomyReading.kicker}
                    accent={anatomyReading.accent}
                    minTop={workspaceTop}
                    onFocus={() => setAnatomyFrame((f) => ({ ...f, zIndex: RAW_ANATOMY_Z }))}
                    onPatch={(patch) => setAnatomyFrame((f) => ({ ...f, ...patch }))}
                    onClose={() => setAnatomyFrame(null)}
                    onToggleMinimize={() => setAnatomyFrame((f) => ({ ...f, minimized: !f.minimized }))}
                    onTogglePin={() => setAnatomyFrame((f) => ({ ...f, pinned: !f.pinned }))}
                >
                    <NodeAnatomyPanel reading={anatomyReading} onShowCard={handleShowFeedingCard} />
                </DesktopWindow>
            )}

            {chatOpen && (
                <DesktopWindow
                    windowState={chatFrame}
                    title="Chat"
                    minTop={workspaceTop}
                    onFocus={() => setChatFrame((f) => ({ ...f, zIndex: 20 }))}
                    onPatch={(patch) => setChatFrame((f) => ({ ...f, ...patch }))}
                    onClose={() => setChatOpen(false)}
                    onToggleMinimize={() => setChatFrame((f) => ({ ...f, minimized: !f.minimized }))}
                    onTogglePin={() => setChatFrame((f) => ({ ...f, pinned: !f.pinned }))}
                >
                    <ChatPanelWindow
                        messages={presence.messages}
                        onSend={presence.sendChatMessage}
                    />
                </DesktopWindow>
            )}

            <RawHelpDialog
                open={helpOpen}
                onClose={() => setHelpOpen(false)}
            />

            {visibleSelection ? hostInspector : null}

            <NodePalette
                open={paletteState.open}
                placement={paletteState.placement}
                onClose={() => setPaletteState({ open: false, placement: null })}
                onCreate={handlePaletteCreate}
                commands={paletteCommands}
            />

        </main>
    )
}
