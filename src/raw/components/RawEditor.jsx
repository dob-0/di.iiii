import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import RawViewport from './RawViewport.jsx'
import RawGraphSurface from './RawGraphSurface.jsx'
import NodePalette from './NodePalette.jsx'
import TextPanelWindow from './TextPanelWindow.jsx'
import ImagePanelWindow from './ImagePanelWindow.jsx'
import WorldPanelWindow from './WorldPanelWindow.jsx'
import OutlinerPanelWindow from './OutlinerPanelWindow.jsx'
import CreatePanelWindow from './CreatePanelWindow.jsx'
import ChatPanelWindow from './ChatPanelWindow.jsx'
import AgentChatPanelWindow from './AgentChatPanelWindow.jsx'
import WebcamSourcePanel from './WebcamSourcePanel.jsx'
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
import { createEdge, createNode, getNodeFamily, getNodeType } from '../../project/nodeRegistry.js'
import { deriveNodeInspectorSections } from '../../project/graph/nodeInspectorSections.js'
import { createNodeGraphContext, evaluateNodeInput, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'
import { resolveScopeWorldNode } from '../utils/viewportWorldState.js'
import { hasClockNode, useGraphClock } from '../../project/graph/useGraphClock.js'
import { useNodeGraphScope } from '../../project/graph/useNodeGraphScope.js'
import { buildNodeValues as buildNodeValuesForType } from '../../project/graph/nodeGraphAuthoring.js'
import { buildAllNodesExample } from '../../project/graph/examples/allNodesExample.js'
import { buildStarterWorkspaceDocument } from '../../project/graph/examples/starterWorkspace.js'
import { STUDIO_TYPE_ID, buildStudioInterior } from '../../project/graph/studioNode.js'
import { getSurfaceWorkflow } from '../utils/surfaceWorkflow.js'
import { matchesNodeTypeSurface } from '../../project/graph/nodeSurfaceFilters.js'

const getNodeRender = (node) => getNodeType(node?.typeId)?.render || 'hidden'
const isPanelNode = (node) => getNodeRender(node) === 'panel-2d'

import { buildRawProjectsPath, navigateToRawPath } from '../utils/rawRouting.js'
import { DEFAULT_PROJECT_SPACE_ID, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { saveAssetFromFile } from '../../storage/assetStore.js'
import { describeRejectedFiles, partitionDroppedFiles, resolveDropScopeId } from '../utils/dropAsset.js'
import { clampWindowFrame, getGraphEdgeInsets, getWorkspaceTopInset, selectMountedPanelNodes } from '../utils/windowLayout.js'
import { isPaletteSummons, resolveZenPreference, writeZenPreference } from '../utils/zenMode.js'
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
const WINDOW_DEFAULT_POSITIONS = {
    'universe.world':  { x: 120,  y: 60, width: 680, height: 480 },
    'view.inspector':  { x: 24,   y: 56, width: 320, height: 480 },
    'agent':           { x: 96,   y: 140, width: 420, height: 480 },
    'view.assets':     { x: 24,   y: 56, width: 280, height: 380 },
    'view.outliner':   { x: 24,   y: 56, width: 240, height: 360 },
    'view.library':    { x: 24,   y: 56, width: 260, height: 380 },
    'view.activity':   { x: 24,   y: 56, width: 280, height: 300 },
    'view.project':    { x: 24,   y: 56, width: 280, height: 320 },
    'legacy-world.inspector': { x: 24,   y: 56, width: 320, height: 420 },
    'legacy-world.assets':    { x: 360,  y: 56, width: 280, height: 360 },
    'legacy-world.outliner':  { x: 660,  y: 56, width: 240, height: 360 },
}

const ACTIVE_MARKER_TYPE_IDS = ['world.light', 'world.background', 'world.grid']

const buildWindowStateFromNode = (node, index = 0, graphContext = null) => {
    const def = WINDOW_DEFAULT_POSITIONS[node.typeId] || { x: 96, y: 140, width: 360, height: 280 }
    const frame = node.values?.frame || {}
    const hasSavedPos = frame.x != null && frame.y != null
    // Cascade unpositioned windows by a STABLE per-node offset, not the list
    // index — index shifts when a sibling closes, which made every later
    // unpositioned window hop 32px.
    const cascadeSlot = hasSavedPos
        ? 0
        : Array.from(String(node.id)).reduce((sum, ch) => sum + ch.charCodeAt(0), index) % 8
    const cascadeOffset = hasSavedPos ? 0 : cascadeSlot * 32
    return {
        id: node.id,
        title: frame.title || evaluateNodeInput(node, 'title', graphContext) || node.label,
        x: (frame.x ?? def.x) + cascadeOffset,
        y: (frame.y ?? def.y) + cascadeOffset,
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
        surface: 'world',
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
    const [chatOpen, setChatOpen] = useState(false)
    const [chatFrame, setChatFrame] = useState({ x: 24, y: 432, width: 280, height: 360, zIndex: 20, minimized: false, pinned: false })
    const [readChatCount, setReadChatCount] = useState(0)
    const [isWorldFullscreen, setIsWorldFullscreen] = useState(false)
    const [isWorldOverlay, setIsWorldOverlay] = useState(false)
    // Declared here because hostInspector's JSX is built partway down the
    // component and needs it; the effect that measures it lives further down,
    // next to the selection state it depends on.
    const scaffoldRef = useRef(null)

    // Whether THIS mount seeded the starter constellation — read once by the
    // zen effect below, so a seeded (but brand-new) workspace still opens bare.
    const seededStarterRef = useRef(false)

    const initialStoreState = useMemo(() => {
        if (projectId || !localStorageKey) return undefined
        const savedDocument = readLocalWorkspaceDocument(localStorageKey)
        if (savedDocument) return { document: savedDocument, version: 0 }
        if (!seedOnFirstVisit) return undefined
        // First visit to a blank local workspace: seed the starter desk as the
        // document's ORIGIN (not an op batch), so undo unwinds to nothing
        // instead of deleting the constellation node by node. The projectId
        // guard above makes this unreachable for any server-backed document.
        seededStarterRef.current = true
        return {
            document: buildStarterWorkspaceDocument({
                workspaceTop: 168,
                viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
                viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800
            }),
            version: 0
        }
    }, [localStorageKey, projectId, seedOnFirstVisit])

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
        anonymousLabel: 'Raw',
        userIdPrefix: 'raw-user'
    })
    useEffect(() => {
        if (chatOpen) setReadChatCount(presence.messages.length)
    }, [chatOpen, presence.messages.length])
    const unreadChatCount = chatOpen ? 0 : Math.max(0, presence.messages.length - readChatCount)
    const localSaveFailedRef = useRef(false)
    const topbarRef = useRef(null)
    const workflowRef = useRef(null)
    const [workspaceTop, setWorkspaceTop] = useState(168)
    const [workflowHeight, setWorkflowHeight] = useState(0)
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
        ignoreTypes: ['setWorkspaceState']
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
    const activeSurface = workspaceState.activeSurface || 'graph'
    const workflow = getSurfaceWorkflow(activeSurface)
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
    const surfaceSelectedNode = useMemo(() => {
        if (!selectedNode) return null
        const selectedType = getNodeType(selectedNode.typeId)
        return matchesNodeTypeSurface(selectedType, activeSurface) ? selectedNode : null
    }, [activeSurface, selectedNode])
    const surfaceSelectedEntity = activeSurface === 'world' ? selectedEntity : null
    const surfaceNodes = useMemo(
        () => authoredNodes.filter((node) => matchesNodeTypeSurface(getNodeType(node.typeId), activeSurface)),
        [activeSurface, authoredNodes]
    )
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
    const surfaceNodeCount = authoredNodes.length
    const hasAnyNodes = surfaceNodeCount > 0
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
        setIsWorldOverlay(false)
        setOutlinerOpen(false)
        scopeReset()
    }, [hasAnyNodes, scopeReset])

    useEffect(() => {
        if (!hasWorldNode) {
            setIsWorldFullscreen(false)
            setIsWorldOverlay(false)
        }
    }, [hasWorldNode])

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
            alert('This workspace can no longer be saved to browser storage (it is full or unavailable). Export your work — reloading will lose changes made from now on.')
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

    useLayoutEffect(() => {
        const updateWorkflowHeight = () => {
            const el = workflowRef.current
            const nextHeight = el ? el.offsetTop + el.offsetHeight : workspaceTop
            setWorkflowHeight(nextHeight)
        }

        updateWorkflowHeight()
        window.addEventListener('resize', updateWorkflowHeight)

        let resizeObserver = null
        if (typeof ResizeObserver !== 'undefined' && workflowRef.current) {
            resizeObserver = new ResizeObserver(updateWorkflowHeight)
            resizeObserver.observe(workflowRef.current)
        }

        return () => {
            window.removeEventListener('resize', updateWorkflowHeight)
            resizeObserver?.disconnect?.()
        }
    }, [activeSurface, workflow.actionLabel, workflow.description, workflow.title, workspaceTop])

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

    const clearSelection = () => {
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { selectedNodeId: null } }
        })
    }

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
        scopeEnterNode(nodeId)
    }, [authoredNodes, scopeEnterNode, applyLocalOps])

    const handleNavigateToScope = useCallback((targetIndex) => {
        const newScopeId = navStack[targetIndex] ?? null
        if (worldNode && newScopeId !== worldNode.id) setIsWorldFullscreen(false)
        scopeNavigateToScope(targetIndex)
    }, [navStack, scopeNavigateToScope, worldNode])

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
            if (scopeDepthRef.current > 0) {
                navigateUpRef.current()
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
        if (surfaceSelectedNode) {
            applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: surfaceSelectedNode.id,
                    patch: { [component]: nextComponentValue }
                }
            })
            return
        }

        if (surfaceSelectedEntity) {
            applyLocalOps({
                type: 'updateComponent',
                payload: {
                    entityId: surfaceSelectedEntity.id,
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
        if (surfaceSelectedNode) {
            applyLocalOps([
                {
                    type: 'deleteNode',
                    payload: { nodeId: surfaceSelectedNode.id }
                },
                {
                    type: 'setWorkspaceState',
                    payload: { patch: { selectedNodeId: null } }
                }
            ], { activityMessage: `Deleted ${surfaceSelectedNode.label}.`, activityLevel: 'warning' })
            return
        }
        if (!surfaceSelectedEntity) return
        applyLocalOps({
            type: 'deleteEntity',
            payload: { entityId: surfaceSelectedEntity.id }
        }, { activityMessage: `Deleted ${surfaceSelectedEntity.name}.`, activityLevel: 'warning' })
        dispatch({ type: 'select-entity', entityId: null })
    }, [applyLocalOps, dispatch, surfaceSelectedEntity, surfaceSelectedNode])

    const handleResetLocalWorkspace = () => {
        if (!isLocalWorkspace) return
        if (!window.confirm('Reset Workspace? This wipes the entire local workspace — every node, edge, and window — and cannot be undone.')) return
        clearLocalWorkspaceDocument(localStorageKey)
        dispatch({ type: 'replace-document', document: {}, version: 0 })
        dispatch({
            type: 'append-activity',
            level: 'warning',
            message: 'Reset blank workspace.'
        })
    }

    const inspectorSections = surfaceSelectedNode
        ? deriveNodeInspectorSections(surfaceSelectedNode)
        : (surfaceSelectedEntity
            ? getInspectorSections(surfaceSelectedEntity)
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

    const inspectorValues = surfaceSelectedNode
        ? { values: { ...(surfaceSelectedNode.values || {}) } }
        : (surfaceSelectedEntity ? surfaceSelectedEntity.components : { worldState: document.worldState })
    const inspectorTitle = surfaceSelectedNode ? surfaceSelectedNode.label : (surfaceSelectedEntity ? surfaceSelectedEntity.name : 'World')
    const inspectorSubtitle = surfaceSelectedNode ? surfaceSelectedNode.typeId : (surfaceSelectedEntity ? surfaceSelectedEntity.type : 'Scene defaults')

    // Read the zen preference ONCE, and only after the document has loaded —
    // the default depends on whether this workspace already has work in it, and
    // on first render it always looks empty.
    useEffect(() => {
        if (zenReadRef.current || !document) return
        zenReadRef.current = true
        setZen(resolveZenPreference(zenWorkspaceKey, {
            nodeCount: (document.nodes || []).length,
            // The starter constellation is seeded, not built by the person —
            // a seeded first visit still defaults to zen (stored choice wins).
            defaultZen: seededStarterRef.current ? true : undefined
        }))
    }, [document, zenWorkspaceKey])

    const setZenPreference = useCallback((next) => {
        setZen(next)
        writeZenPreference(zenWorkspaceKey, next)
    }, [zenWorkspaceKey])

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
                surface: 'graph',
                placement: {
                    clientX: Math.round(window.innerWidth / 2) - 140,
                    clientY: Math.round(window.innerHeight / 3)
                }
            })
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    const openPalette = (surface, placement = null) => {
        setPaletteState({
            open: true,
            surface,
            placement
        })
    }

    const buildNodeValues = (definitionId, params, place) =>
        buildNodeValuesForType(definitionId, params, place, { workspaceTop, topZIndex })

    const handlePaletteCreate = ({ definition, params, placement: palettePlace }) => {
        if (!definition) return
        const place = palettePlace || {}
        const values = buildNodeValues(definition.id, params, place)
        const nextNode = createNode(definition.id, {
            values,
            graphX: (place.graphX ?? place.clientX ?? 280) - (ROOT_WORLD_CARD_WIDTH / 2),
            graphY: Math.max(20, (place.graphY ?? place.clientY ?? 160) - (ROOT_WORLD_CARD_HEIGHT / 2)),
            parentId: currentScopeId
        })
        if (!nextNode) return
        const nodeRender = getNodeType(definition.id)?.render || 'hidden'
        const workspacePatch = { selectedNodeId: nextNode.id }
        if (nodeRender === 'hidden') workspacePatch.activeSurface = 'graph'
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
        setPaletteState({ open: false, surface: paletteState.surface, placement: null })
    }

    const handleWorldSurfaceDoubleClick = (placement) => {
        openPalette('world', placement)
    }

    // --- Bringing a file in -------------------------------------------------
    // Dropping a model/video/sound/image onto the surface stores it and places
    // the node that plays it. Two storage routes, one behaviour: a server-
    // backed project uploads (content-addressed, shared with collaborators), a
    // local workspace keeps the bytes in this browser's IndexedDB — which is
    // the same place ModelObject/useAssetUrl already look first, so the node
    // renders identically either way.
    const [dropState, setDropState] = useState({ over: false, busy: false, notice: '' })
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
        if (!file || !surfaceSelectedNode) return
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
                        nodeId: surfaceSelectedNode.id,
                        patch: { values: { [field?.path?.[0] || 'src']: asset.id } }
                    }
                }
            ], { activityMessage: `Brought in ${file.name}.` })
            setDropState({ over: false, busy: false, notice: '' })
        } catch {
            setDropState({ over: false, busy: false, notice: `Could not bring in ${file.name}.` })
        }
    }, [applyLocalOps, projectId, surfaceSelectedNode])

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
                payload: { patch: { activeSurface: 'graph', selectedNodeId: null } }
            }
        ], {
            activityMessage: `Created the all-nodes example (${exampleNodes.length} nodes, ${exampleEdges.length} edges).`
        })
    }

    const handleCreateStreamingPrototype = () => {
        const startX = 80
        const startY = workspaceTop + 72
        const mkNode = ({ typeId, label, graphX, graphY, hostHint = '', values = {} }) => {
            const seededValues = buildNodeValues(typeId, {
                ...values,
                ...(hostHint ? { hostHint } : {})
            }, {
                clientX: graphX + 180,
                clientY: graphY + 48
            })
            return createNode(typeId, {
                label,
                graphX,
                graphY,
                values: seededValues
            })
        }

        const instaNode = mkNode({
            typeId: 'source.insta360',
            label: 'Insta360 [mac]',
            graphX: startX,
            graphY: startY,
            hostHint: 'mac'
        })
        const stereoNode = mkNode({
            typeId: 'source.stereo',
            label: 'Stereo Cam [linux]',
            graphX: startX,
            graphY: startY + 150,
            hostHint: 'linux'
        })
        const micNode = mkNode({
            typeId: 'source.mic',
            label: 'Mic [mac]',
            graphX: startX,
            graphY: startY + 300,
            hostHint: 'mac'
        })
        const ptzANode = mkNode({
            typeId: 'device.ptz.osc',
            label: 'PTZ A [windows]',
            graphX: startX + 260,
            graphY: startY,
            hostHint: 'windows',
            values: { oscAddress: '/ptz/a' }
        })
        const ptzBNode = mkNode({
            typeId: 'device.ptz.osc',
            label: 'PTZ B [windows]',
            graphX: startX + 260,
            graphY: startY + 150,
            hostHint: 'windows',
            values: { oscAddress: '/ptz/b' }
        })
        const controllerNode = mkNode({
            typeId: 'stream.controller',
            label: 'Controller [mobile]',
            graphX: startX + 260,
            graphY: startY + 300,
            hostHint: 'mobile',
            values: { title: 'Mobile Control Desk' }
        })
        const compositorNode = mkNode({
            typeId: 'stream.compositor',
            label: 'Compositor [linux]',
            graphX: startX + 560,
            graphY: startY + 120,
            hostHint: 'linux'
        })
        const outputNode = mkNode({
            typeId: 'stream.output',
            label: 'Stream Output [windows]',
            graphX: startX + 880,
            graphY: startY + 80,
            hostHint: 'windows',
            values: { target: 'rtmp://localhost/live/main' }
        })
        const monitorNode = mkNode({
            typeId: 'stream.monitor',
            label: 'Program Monitor [mac]',
            graphX: startX + 880,
            graphY: startY + 240,
            hostHint: 'mac',
            values: { title: 'Program Monitor' }
        })

        const nodesToCreate = [
            instaNode,
            stereoNode,
            micNode,
            ptzANode,
            ptzBNode,
            controllerNode,
            compositorNode,
            outputNode,
            monitorNode
        ].filter(Boolean)

        if (!nodesToCreate.length) return

        const id = (node) => node?.id || ''
        const edgesToCreate = [
            createEdge(id(instaNode), 'frame', id(compositorNode), 'primary'),
            createEdge(id(ptzANode), 'frame', id(compositorNode), 'altA'),
            createEdge(id(ptzBNode), 'frame', id(compositorNode), 'altB'),
            createEdge(id(stereoNode), 'depth', id(compositorNode), 'depth'),
            createEdge(id(controllerNode), 'mix', id(compositorNode), 'mix'),
            createEdge(id(compositorNode), 'program', id(outputNode), 'video'),
            createEdge(id(micNode), 'frequency', id(outputNode), 'audio'),
            createEdge(id(compositorNode), 'program', id(monitorNode), 'src')
        ].filter((edge) => edge.fromNodeId && edge.toNodeId)

        const ops = [
            ...nodesToCreate.map((node) => ({ type: 'createNode', payload: { node } })),
            ...edgesToCreate.map((edge) => ({ type: 'createEdge', payload: { edge } })),
            {
                type: 'setWorkspaceState',
                payload: {
                    patch: {
                        activeSurface: 'graph',
                        selectedNodeId: compositorNode?.id || null
                    }
                }
            }
        ]

        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps(ops, {
            activityMessage: 'Created streaming prototype graph (linux + mac + windows + mobile).'
        })
    }

    // The scaffold's offset is published as a custom property rather than an
    // inline `top`, because an inline declaration outranks every media query:
    // the phone bottom-sheet rule in raw.css could not override it, so the
    // panel stayed pinned over the very node it was inspecting. CSS decides
    // where this sits; JS only supplies the measured offset.
    const hostInspector = (
        <aside ref={scaffoldRef} className="raw-selection-scaffold" style={{ '--raw-scaffold-top': workflowHeight + 'px' }}>
            <PropertyInspector
                title={inspectorTitle}
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
    const clockNow = useGraphClock(hasClockNode(document.nodes))
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
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs }),
        [document, clockNow, liveOutputs]
    )

    const renderViewNodeContent = (node) => {
        const resolvedValues = evaluateNodeInputs(node, graphContext)
        if (node.typeId === 'universe.world') {
            return (
                <WorldPanelWindow
                    document={document}
                    selectedEntityId={surfaceSelectedEntity?.id || null}
                    selectedNodeId={surfaceSelectedNode?.id || null}
                    onSelectEntity={selectEntity}
                    onSelectNode={selectNode}
                    onClearSelection={clearSelection}
                    onWorldDoubleClick={handleWorldSurfaceDoubleClick}
                    onMoveNode={handleMoveWorldNode}
                    cursors={presence.cursors}
                    onCursorMove={presence.emitCursor}
                    onCursorLeave={presence.clearCursor}
                    nodeScale={nodeScale}
                    scopeId={node.id}
                    worldNode={node}
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
                    onEnterOverlay={() => {
                        markWorldLive(node)
                        setIsWorldOverlay(true)
                        applyLocalOps({
                            type: 'updateNode',
                            payload: {
                                nodeId: node.id,
                                patch: { values: { frame: { ...(node.values?.frame || {}), visible: false } } }
                            }
                        })
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
        if (node.typeId === 'view.timeline') {
            return (
                <TimelinePanelWindow
                    node={node}
                    values={resolvedValues}
                    onChange={(clips) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, clips } } }
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
                    nodes={surfaceNodes}
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

    const visibleSelection = Boolean(surfaceSelectedNode || surfaceSelectedEntity)

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
    }, [visibleSelection, activeSurface])


    useEffect(() => {
        if (!visibleSelection || activeSurface === 'graph') return undefined
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
    }, [activeSurface, handleDeleteSelected, visibleSelection])

    useEffect(() => {
        const handler = (event) => {
            const tag = event.target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return
            if (event.key === 'Escape' && navStack.length > 1) {
                event.preventDefault()
                handleNavigateToScope(navStack.length - 2)
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
    }, [handleNavigateToScope, navStack.length, undo, redo])

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
    const hiddenPanelNodes = surfaceNodes.filter(
        (node) => isPanelNode(node) && node.values?.frame?.visible === false
    )
    const paletteCommands = [
        {
            id: 'chrome',
            label: zen ? 'Show the chrome' : 'Hide the chrome',
            hint: zen ? 'topbar, controls' : 'zen — surface and nodes only',
            run: () => setZenPreference(!zen)
        },
        { id: 'help', label: 'Help', hint: 'what the keys do', run: () => setHelpOpen(true) },
        { id: 'chat', label: 'Chat', hint: 'talk to whoever is here', run: () => setChatOpen(true) },
        { id: 'outliner', label: 'Outliner', hint: 'every node in this scope', run: () => setOutlinerOpen(true) },
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

    const workspaceTitle = isLocalWorkspace ? 'Blank White Workspace' : (document.projectMeta?.title || 'Raw Project')
    const graphTopInset = chromeVisible ? workspaceTop : 0
    // Windows float over the graph, so the fit has to dodge the docked ones or
    // it centres the card cluster underneath one — see getGraphEdgeInsets.
    // Through the SAME clamp DesktopWindow applies: the stored frame is where a
    // window wants to be, not where it renders. The bottom reserve alone moved
    // the seeded welcome window up by 116px, and insets read off the stored
    // frame put the graph's free band in the wrong place entirely.
    const graphContentInsets = getGraphEdgeInsets({
        frames: visibleViewNodes
            .filter((node) => node.values?.frame?.minimized !== true)
            .map((node) => node.values?.frame)
            .filter(Boolean)
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
                                ← {isLocalWorkspace ? 'Projects' : 'Hub'}
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
                            {hasWorldNode && (
                                <div className="raw-topbar-windows">
                                    <button
                                        type="button"
                                        className={isWorldOverlay || isWorldFullscreen ? 'is-active' : ''}
                                        onClick={() => {
                                            if (isWorldFullscreen) { setIsWorldFullscreen(false); return }
                                            if (isWorldOverlay) { setIsWorldOverlay(false); return }
                                            const currentlyVisible = worldNode?.values?.frame?.visible !== false
                                            applyLocalOps({
                                                type: 'updateNode',
                                                payload: {
                                                    nodeId: worldNode.id,
                                                    patch: { values: { frame: { ...(worldNode.values?.frame || {}), visible: !currentlyVisible } } }
                                                }
                                            })
                                        }}
                                    >
                                        {isWorldFullscreen ? '← World' : isWorldOverlay ? '← Overlay' : 'World'}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="raw-topbar-right">
                            <button type="button" className="raw-topbar-help-action" onClick={() => setHelpOpen(true)}>
                                Help
                            </button>
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
                            {surfaceNodeCount > 0 && (
                                <button
                                    type="button"
                                    className={`raw-topbar-node-count${outlinerOpen ? ' is-active' : ''}`}
                                    onClick={() => setOutlinerOpen((v) => !v)}
                                    title="Toggle outliner"
                                    aria-label={`${surfaceNodeCount} nodes`}
                                >
                                    {surfaceNodeCount} {surfaceNodeCount === 1 ? 'node' : 'nodes'}
                                </button>
                            )}
                            <button
                                type="button"
                                className={`raw-topbar-node-count${chatOpen ? ' is-active' : ''}`}
                                onClick={() => setChatOpen((v) => !v)}
                                title="Toggle chat"
                                aria-label="Toggle chat"
                            >
                                Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
                            </button>
                            <div className="raw-topbar-overflow">
                                <button type="button" className="raw-topbar-overflow-btn" onClick={() => setOverflowOpen((v) => !v)}>⋯</button>
                                {overflowOpen && (
                                    <div className="raw-topbar-overflow-menu">
                                        <button type="button" onClick={() => { scopeReset(); setOverflowOpen(false) }}>Home</button>
                                        <button type="button" onClick={() => { handleCreateAllNodesExample(); setOverflowOpen(false) }}>All Nodes Example</button>
                                        <button type="button" onClick={() => { handleCreateStreamingPrototype(); setOverflowOpen(false) }}>Streaming Prototype</button>
                                        {isLocalWorkspace && (
                                            <button type="button" onClick={() => { handleResetLocalWorkspace(); setOverflowOpen(false) }}>Reset Workspace</button>
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
                <button type="button" className="raw-delete-fab" onClick={handleDeleteSelected}>
                    Delete
                </button>
            )}

            <section
                className={`raw-surface-shell${isWorldOverlay && !isWorldFullscreen ? ' is-world-overlay' : ''}${navStack.length > 1 ? ' is-inside-node' : ''}${dropState.over ? ' is-drop-target' : ''}`}
                onDragEnter={handleSurfaceDragEnter}
                onDragOver={handleSurfaceDragOver}
                onDragLeave={handleSurfaceDragLeave}
                onDrop={handleSurfaceDrop}
            >
                {/* Graph is the primary surface — always visible */}
                <RawGraphSurface
                    key={currentScopeId || 'root'}
                    chromeless={!chromeVisible}
                    topInset={graphTopInset}
                    bottomInset={graphBottomInset}
                    contentInsets={graphContentInsets}
                    nodes={graphCardNodes}
                    emptyHint={`${pointerVerb} to place your first node.`}
                    edges={graphCardEdges}
                    selectedNodeId={workspaceState.selectedNodeId}
                    onEnterNode={handleEnterNode}
                    onSelectNode={selectNode}
                    onCreateEdge={handleCreateEdge}
                    onDeleteEdge={handleDeleteEdge}
                    onDeleteNode={handleDeleteNode}
                    onMoveNode={handleMoveNode}
                    onDoubleClick={(placement) => openPalette('graph', placement)}
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

            {/* Fullscreen world — takes over the full viewport */}
            {hasWorldNode && isWorldFullscreen && (
                <div className="raw-world-fullscreen" style={{ top: `${workspaceTop}px` }}>
                    <RawViewport
                        topInset={0}
                        document={document}
                        selectedEntityId={surfaceSelectedEntity?.id || null}
                        selectedNodeId={surfaceSelectedNode?.id || null}
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
                        scopeId={worldNode?.id}
                        worldNode={worldNode}
                        liveOutputs={liveOutputs}
                    />
                </div>
            )}

            {/* Overlay world — 3D scene renders behind the graph */}
            {hasWorldNode && isWorldOverlay && !isWorldFullscreen && (
                <div className="raw-world-overlay">
                    <RawViewport
                        topInset={workspaceTop}
                        document={document}
                        selectedEntityId={surfaceSelectedEntity?.id || null}
                        selectedNodeId={surfaceSelectedNode?.id || null}
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
                        scopeId={worldNode?.id}
                        worldNode={worldNode}
                        liveOutputs={liveOutputs}
                    />
                </div>
            )}

            {outlinerOpen && (
                <DesktopWindow
                    windowState={outlinerFrame}
                    title="Outliner"
                    kicker={activeSurface}
                    minTop={workspaceTop}
                    onFocus={() => setOutlinerFrame((f) => ({ ...f, zIndex: 20 }))}
                    onPatch={(patch) => setOutlinerFrame((f) => ({ ...f, ...patch }))}
                    onClose={() => setOutlinerOpen(false)}
                    onToggleMinimize={() => setOutlinerFrame((f) => ({ ...f, minimized: !f.minimized }))}
                    onTogglePin={() => setOutlinerFrame((f) => ({ ...f, pinned: !f.pinned }))}
                >
                    <OutlinerPanelWindow
                        nodes={surfaceNodes}
                        selectedNodeId={workspaceState.selectedNodeId || null}
                        onSelectNode={(nodeId) => selectNode(nodeId)}
                    />
                </DesktopWindow>
            )}

            {chatOpen && (
                <DesktopWindow
                    windowState={chatFrame}
                    title="Chat"
                    kicker={activeSurface}
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
                surface={activeSurface}
                onClose={() => setHelpOpen(false)}
            />

            {visibleSelection ? hostInspector : null}

            <NodePalette
                open={paletteState.open}
                surface={paletteState.surface}
                placement={paletteState.placement}
                onClose={() => setPaletteState({ open: false, surface: 'world', placement: null })}
                onCreate={handlePaletteCreate}
                commands={paletteCommands}
            />

        </main>
    )
}
