import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import RawViewport from './RawViewport.jsx'
import RawGraphSurface from './RawGraphSurface.jsx'
import NodePalette from './NodePalette.jsx'
import TextPanelWindow from './TextPanelWindow.jsx'
import ListPanelWindow from './ListPanelWindow.jsx'
import ImagePanelWindow from './ImagePanelWindow.jsx'
import MonitorPanelWindow from './MonitorPanelWindow.jsx'
import WorldPanelWindow from './WorldPanelWindow.jsx'
import OutlinerPanelWindow from './OutlinerPanelWindow.jsx'
import CreatePanelWindow from './CreatePanelWindow.jsx'
import PublishPanelWindow from './PublishPanelWindow.jsx'
import ChatPanelWindow from './ChatPanelWindow.jsx'
import AgentChatPanelWindow from './AgentChatPanelWindow.jsx'
import WebcamSourcePanel from './WebcamSourcePanel.jsx'
import LiveFeeds from './LiveFeeds.jsx'
import { useLiveOutputs } from '../utils/useLiveOutputs.js'
import DeskPanelWindow from './DeskPanelWindow.jsx'
import InsideView from './inside/InsideView.jsx'
import { withMachineOptions } from './inside/topMachineOptions.js'
import { DECK_INPUTS, VJ_DECK_TYPE, isPictureType, masterNodeId } from '../../project/tops/vjDeck.js'
import { useMachinePresence } from '../../project/tops/useMachinePresence.js'
import ButtonPanelWindow from './ButtonPanelWindow.jsx'
import MicSourcePanel from './MicSourcePanel.jsx'
import WorkStatusPanel from './WorkStatusPanel.jsx'
import AgentRunPanel from './AgentRunPanel.jsx'
import TimelinePanelWindow from './TimelinePanelWindow.jsx'
import KeeperPanelWindow from './KeeperPanelWindow.jsx'
import DmxOutPanelWindow from './DmxOutPanelWindow.jsx'
import MidiInputPanel from './MidiInputPanel.jsx'
import DirectorPanelWindow from './DirectorPanelWindow.jsx'
import VjDeckView from './vjDeck/VjDeckView.jsx'
import RawHelpDialog from './RawHelpDialog.jsx'
import { useProjectStore } from '../../project/state/projectStore.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../../project/hooks/useOpHistory.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import { currentAuthor } from '../../project/authorship.js'
import useDeleteConfirm from '../../hooks/useDeleteConfirm.jsx'
import { createEdge, createNode, getNodeFamily, getNodeOutputs, getNodeType, isNodeMadeOfCode, operationLabelPatch } from '../../project/nodeRegistry.js'
import { buildOutputsSection, deriveNodeInspectorSections } from '../../project/graph/nodeInspectorSections.js'
import { readNode } from '../../project/graph/nodeReading.js'
import { wireOps } from '../../project/graph/insideReading.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeInput, evaluateNodeInputs, evaluateNodeOutput } from '../../project/graph/nodeGraphRuntime.js'
import { SCRIPTS_BLOCKED_MESSAGE, SCRIPT_EXAMPLE_COMPUTE, applyNodeScript, useNodeScriptStatus, useNodeScripts } from '../../project/graph/nodeScripts.js'
import { resolveScopeWorldNode } from '../utils/viewportWorldState.js'
import { hasClockNode } from '../../project/graph/useGraphClock.js'
import { useDocumentClock } from '../../project/graph/useDocumentClock.js'
import { isNodeInScope, useNodeGraphScope } from '../../project/graph/useNodeGraphScope.js'
import { buildNodeValues as buildNodeValuesForType } from '../../project/graph/nodeGraphAuthoring.js'
import { buildAllNodesExample } from '../../project/graph/examples/allNodesExample.js'
import { buildSceneExample } from '../../project/graph/examples/sceneExample.js'
import { STUDIO_TYPE_ID, buildStudioInterior } from '../../project/graph/studioNode.js'
import { buildSpaceProjectsPath, buildStudioProjectPath, buildSpacesPath } from '../../studio/utils/studioRouting.js'
import { buildWikiPath } from '../../utils/spaceRouting.js'

const getNodeRender = (node) => getNodeType(node?.typeId)?.render || 'hidden'
const isPanelNode = (node) => getNodeRender(node) === 'panel-2d'
// Which space a panel window lives in. Unpinned = the world, with the cards.
// Pinned = the screen, the old behaviour. On a phone everything is the
// screen: the clamp that fits a 680-wide default into 390px IS the layout
// there (the camp desks were authored against it), and a world window would
// walk straight out of it. Before the surface has published a viewport there
// is nothing to place through, so screen until then. One rule, read both
// where a window is rendered and where a new one is placed.
const isNarrowViewport = () => typeof window !== 'undefined' && window.innerWidth < RAW_NARROW_VIEWPORT
const panelWindowSpace = (frame, viewport) => (frame?.pinned || isNarrowViewport() || !viewport) ? 'screen' : 'world'

import { buildRawOutPath, buildRawProjectPath, navigateToRawPath } from '../utils/rawRouting.js'
import { describeRootEmptyCanvas } from '../utils/emptyCanvasHint.js'
import { DEFAULT_PROJECT_SPACE_ID, createProject, updateProjectDocument, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { saveAssetFromFile } from '../../storage/assetStore.js'
import { describeRejectedFiles, partitionDroppedFiles, resolveDropScopeId } from '../utils/dropAsset.js'
import { RAW_NARROW_VIEWPORT, RAW_WINDOW_MINIMIZED_HEIGHT, RAW_WINDOW_PADDING, clampWindowFrame, getBottomReserve, getGraphEdgeInsets, getWorkspaceTopInset, placeNewWindowFrame, resolveChromeVisible, selectMountedPanelNodes } from '../utils/windowLayout.js'
import { CARD_WIDTH, getCardBox } from '../utils/cardGeometry.js'
import { isPaletteSummons, resolveZenPreference, writeZenPreference, liftAutoZen } from '../utils/zenMode.js'
import {
    clearLocalWorkspaceDocument,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument
} from '../utils/localWorkspaceStorage.js'
import useWorkspaceLayout from '../utils/useWorkspaceLayout.js'
import { cycleFocus, isMaximised, maximiseFrame, restoreFrame } from '../utils/workspaceLayout.js'
import { peekRawEnterNode, clearRawEnterNode } from '../utils/rawEnterNodeHandoff.js'
import { readSelectedNodeId, writeSelectedNodeId } from '../utils/rawSelectionStorage.js'
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
    'view.publish':    { x: 24,   y: 56, width: 300, height: 430 },
    'view.list':       { x: 24,   y: 56, width: 660, height: 560 },
}

const ACTIVE_MARKER_TYPE_IDS = ['world.light', 'world.environment', 'world.background', 'world.grid', 'world.camera']

// `frame` is passed in rather than read off the node: where a window sits is
// the person's own arrangement laid over the document's seed, and only the
// editor holds both halves. See utils/workspaceLayout.js.
// isWorldSpace: whether THIS window will render in graph units (unpinned, on
// a wide-enough viewport — see panelWindowSpace/windowSpaceFor). Screen-space
// windows interpret x/y as viewport pixels, so a card's graph position is not
// a valid offset for them; only a world-space window gets the card-anchored
// placement below.
const buildWindowStateFromNode = (node, index = 0, graphContext = null, windowFrame = null, isWorldSpace = false) => {
    const def = WINDOW_DEFAULT_POSITIONS[node.typeId] || { x: 96, y: 140, width: 360, height: 280 }
    const frame = windowFrame || node.values?.frame || {}
    const hasSavedPos = frame.x != null && frame.y != null
    // Design audit A5: an unpositioned window used to cascade from the SAME
    // shared corner every panel type starts at (def.x/def.y) with only a
    // hash-based 16-slot nudge to spread it — which piled a whole document's
    // worth of frameless windows (the API, an import, an example, an agent)
    // into that one corner, on top of whatever cards were already there.
    // A world-space window with a real card anchors to it instead: clear,
    // to the right, in the SAME graph units the card itself uses — stable
    // under pan/zoom (unlike re-deriving a screen position from the live
    // viewport every render), and never on top of the card it belongs to.
    // Screen-space windows (pinned, or a narrow/phone viewport where the
    // clamp is the whole layout) keep the original per-id cascade.
    let anchorX = def.x
    let anchorY = def.y
    let cascadeX = 0
    let cascadeY = 0
    if (!hasSavedPos && isWorldSpace && Number.isFinite(node.graphX) && Number.isFinite(node.graphY)) {
        anchorX = node.graphX + CARD_WIDTH + 24
        anchorY = node.graphY
    } else if (!hasSavedPos) {
        // Cascade unpositioned windows by a STABLE per-node offset, not the
        // list index — index shifts when a sibling closes, which made every
        // later unpositioned window hop 32px.
        // …and spread in TWO dimensions over 16 slots: the old 8-slot 32px
        // staircase left concurrently-open windows ~90% overlapped whenever
        // two ids hashed near each other (audit 08-21, desk-07: three
        // windows, one pile). Still the stable per-node hash — never index.
        const cascadeSlot = Array.from(String(node.id)).reduce((sum, ch) => sum + ch.charCodeAt(0), index) % 16
        cascadeX = (cascadeSlot % 4) * 72
        cascadeY = Math.floor(cascadeSlot / 4) * 56
    }
    return {
        id: node.id,
        title: frame.title || evaluateNodeInput(node, 'title', graphContext) || node.label,
        x: (frame.x ?? anchorX) + cascadeX,
        y: (frame.y ?? anchorY) + cascadeY,
        width: frame.width || def.width,
        height: frame.height || def.height,
        zIndex: frame.zIndex || 6,
        visible: frame.visible !== false,
        minimized: Boolean(frame.minimized),
        pinned: Boolean(frame.pinned),
        maximized: Boolean(frame.maximized)
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

// Stable, so the inside view's Script tab never re-renders for a new object.
const NODE_SCRIPT_PROPS = {
    useStatus: useNodeScriptStatus,
    onApply: (text, nodeId) => applyNodeScript(nodeId, text),
    example: SCRIPT_EXAMPLE_COMPUTE,
    blockedMessage: SCRIPTS_BLOCKED_MESSAGE
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
    const overflowRef = useRef(null)
    const [helpOpen, setHelpOpen] = useState(false)
    // Zen: nothing resident on the workspace. Read once, from this device's
    // preference, defaulting to on only for a workspace with no work in it —
    // see zenMode.js for why it is not document state.
    const zenWorkspaceKey = projectId || localStorageKey || 'default'
    const [zen, setZen] = useState(false)
    const zenReadRef = useRef(false)
    const [outlinerOpen, setOutlinerOpen] = useState(false)
    const [outlinerFrame, setOutlinerFrame] = useState({ x: 24, y: 56, width: 240, height: 360, zIndex: 20, minimized: false, pinned: false })
    // How much of the screen the inside frame (InsideView) covers while you
    // stand in a node — the canvas fits its cards into what is left.
    const [insideInsets, setInsideInsets] = useState(null)
    // The canvas viewport as the graph surface publishes it — pan, zoom and
    // where the surface's box begins. Unpinned panel windows are placed
    // through it, which is what makes them part of the world.
    const [graphViewport, setGraphViewport] = useState(null)
    const handleViewportChange = useCallback((viewport) => setGraphViewport(viewport), [])
    const [chatOpen, setChatOpen] = useState(false)
    const [chatFrame, setChatFrame] = useState({ x: 24, y: 432, width: 280, height: 360, zIndex: 20, minimized: false, pinned: false })
    const [readChatCount, setReadChatCount] = useState(0)
    const [readSpaceChatCount, setReadSpaceChatCount] = useState(0)
    // Where the windows are, for this person, on this device. The document
    // keeps the seed; this keeps the arrangement. utils/workspaceLayout.js.
    const {
        frameOf,
        setLocalFrame,
        forgetNodes: forgetWindowFrames
    } = useWorkspaceLayout({
        spaceId,
        projectId: projectId || localStorageKey || null,
        viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth
    })
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
    // Only a project that actually lives in a space has a space room. A local
    // canvas has no server document and no neighbours, so it gets no tabs.
    const chatSpaceId = projectId ? (spaceId || DEFAULT_PROJECT_SPACE_ID) : ''
    const presence = useProjectPresence({
        projectId,
        spaceId: chatSpaceId,
        displayName,
        displayNameStorageKey: DISPLAY_NAME_KEY,
        userIdStorageKey: USER_ID_KEY,
        anonymousLabel: 'Guest',
        userIdPrefix: 'raw-user'
    })
    const { requestDelete, deleteConfirm } = useDeleteConfirm()
    const spaceChatMessages = chatSpaceId ? (presence.spaceMessages || []) : null
    // Space first: alone in your own project, the four people you mean are in
    // the other projects.
    const [chatChannel, setChatChannel] = useState(chatSpaceId ? 'space' : 'project')
    const spaceChatCount = spaceChatMessages ? spaceChatMessages.length : 0
    useEffect(() => {
        if (chatOpen && chatChannel === 'project') setReadChatCount(presence.messages.length)
    }, [chatOpen, chatChannel, presence.messages.length])
    useEffect(() => {
        if (chatOpen && chatChannel === 'space') setReadSpaceChatCount(spaceChatCount)
    }, [chatOpen, chatChannel, spaceChatCount])
    // One badge over both rooms — the question the number answers is "is anyone
    // talking to me", and which of two tabs it landed in is the tab strip's job.
    // The room you are looking at is read by definition; the other one is not,
    // which is why the open panel can still carry a count.
    const unreadChatCount = ((chatOpen && chatChannel === 'project')
        ? 0
        : Math.max(0, presence.messages.length - readChatCount))
        + ((chatOpen && chatChannel === 'space')
            ? 0
            : Math.max(0, spaceChatCount - readSpaceChatCount))
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
    // Selection is per viewer (fix #5 / design audit A4) — React state,
    // mirrored into sessionStorage per CANVAS rather than written into the
    // shared document. See rawSelectionStorage.js for why: a setWorkspaceState
    // op here used to broadcast whoever last clicked to every other device.
    // Keyed by zenWorkspaceKey (not bare projectId) for the same reason zen
    // already is: a local/canvas-mode workspace has no projectId at all, and
    // two different local canvases in one browser must not share a selection.
    const [localSelectedNodeId, setLocalSelectedNodeIdState] = useState(() => readSelectedNodeId(zenWorkspaceKey))
    const setLocalSelectedNodeId = useCallback((nodeId) => {
        setLocalSelectedNodeIdState(nodeId || null)
        writeSelectedNodeId(zenWorkspaceKey, nodeId || null)
    }, [zenWorkspaceKey])
    // Covers switching projects/canvases without a remount — a fresh one's
    // selection must not inherit the previous one's.
    useEffect(() => {
        setLocalSelectedNodeIdState(readSelectedNodeId(zenWorkspaceKey))
    }, [zenWorkspaceKey])
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const selectedNode = nodes.find((node) => node.id === localSelectedNodeId) || null
    const authoredNodes = nodes
    // Node-graph scope has no forced root type — the true document root
    // (currentScopeId === null) is a plain, always-available scope you can
    // place any node type directly into, same as any node's interior. Node 0
    // is an ordinary node, not an auto-created/auto-entered singleton (product
    // decision 2026-07-17 — see nodeRegistry.js/projectSchema.js comments).
    const scope = useNodeGraphScope({ nodes: authoredNodes })
    const { navStack, currentScopeId, enterNode: scopeEnterNode, navigateToScope: scopeNavigateToScope, reset: scopeReset, goToRoot: scopeGoToRoot, goToNode: scopeGoToNode } = scope

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
            isWorldFullscreen,
            frameOf
        }),
        [nodes, currentScopeId, isWorldFullscreen, frameOf]
    )
    // A layout outlives the windows it describes. Prune against what the
    // document actually holds, so a deleted node cannot keep a slot forever.
    const panelNodeIds = useMemo(
        () => nodes.filter((node) => isPanelNode(node)).map((node) => node.id).join(','),
        [nodes]
    )
    useEffect(() => {
        forgetWindowFrames(panelNodeIds ? panelNodeIds.split(',') : [])
    }, [panelNodeIds, forgetWindowFrames])

    const topZIndex = useMemo(
        () => Math.max(6, ...visibleViewNodes.map((node) => frameOf(node).zIndex || 1)),
        [visibleViewNodes, frameOf]
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
    // "Where did my cube go?" The desk is deliberately clear (owner, 2026-08-20:
    // "i mean clear desk"), so a spatial node you just placed is standing in a
    // room you are not looking at — and the button to that room said the same
    // word whether it held nothing or held your whole scene. Counting what
    // stands there makes placing the first thing visibly change something
    // besides the card, without putting the room back as wallpaper.
    // Entities are root-scope citizens, same rule the viewport draws by.
    const roomCount = useMemo(() => {
        const standing = authoredNodes.filter((node) => (node.parentId || null) === (currentScopeId || null)
            && getNodeType(node.typeId)?.render === 'spatial-3d').length
        return standing + (currentScopeId ? 0 : entities.length)
    }, [authoredNodes, currentScopeId, entities.length])
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
    // Zen wins over the scope rule: a scope that would show chrome still
    // shows none while the workspace is zen. The palette is the way back,
    // and Esc still pops the scope stack, so this is never a dead end. The
    // Kiosk's Show toolbar is read through its wire (resolveChromeVisible).
    const chromeVisible = useMemo(() => {
        const context = createNodeGraphContext(document)
        return resolveChromeVisible({
            zen,
            navStack,
            nodes: authoredNodes,
            readShowChrome: (scopeNode) => evaluateNodeInput(scopeNode, 'showChrome', context)
        })
    }, [zen, navStack, authoredNodes, document])
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
        // pendingSyncError, because the sync alert pushes the topbar down 40px and a
        // ResizeObserver never fires for that: the bar MOVES, it does not resize. Without
        // this the workspace keeps the old inset and the scope pill lands on the toolbar.
    }, [presence.users.length, state.pendingSyncError])

    // `patch` is a leftover extension point for OTHER workspaceState fields a
    // caller might want to set in the same gesture (none do today) — it still
    // goes to the shared document; selection itself never does any more.
    const selectNode = (nodeId, patch = {}) => {
        dispatch({ type: 'select-entity', entityId: null })
        setLocalSelectedNodeId(nodeId || null)
        if (Object.keys(patch).length) {
            applyLocalOps({ type: 'setWorkspaceState', payload: { patch } })
        }
    }

    const selectEntity = (entityId) => {
        dispatch({ type: 'select-entity', entityId })
        setLocalSelectedNodeId(null)
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
        setLocalSelectedNodeId(null)
    }, [dispatch, setLocalSelectedNodeId])

    const handleEnterNode = useCallback((nodeId) => {
        const node = authoredNodes.find((n) => n.id === nodeId)
        if (!node) return
        // A closed panel window had NO reopen path (close wrote
        // frame.visible=false and nothing ever set it back) — entering the
        // node's card reopens it. It used to reopen INSTEAD of entering; now
        // every node has the same inside (its window shows in SEE there), so
        // it reopens AND enters, and the window is back when you leave.
        if (getNodeRender(node) === 'panel-2d' && frameOf(node).visible === false) {
            setLocalFrame(nodeId, { visible: true })
        }
        if (node.typeId === 'universe.world') setIsWorldFullscreen(true)
        // Selection dies at the door. It used to survive every scope walk,
        // keeping a red Delete armed for a node no longer on screen — the
        // scope clamp above hides it, and this stops the stale id from
        // lingering (now purely local; it never travelled in the shared
        // workspace state to begin with — fix #5).
        if (localSelectedNodeId || selectedEntity) clearSelection()
        scopeEnterNode(nodeId)
    }, [authoredNodes, scopeEnterNode, frameOf, setLocalFrame, localSelectedNodeId, selectedEntity, clearSelection])

    const handleNavigateToScope = useCallback((targetIndex) => {
        // Fullscreen SURVIVES scope navigation now: walking through a door
        // swaps which room fills the screen, which is the TouchDesigner
        // go-inside/come-out feel. It used to cancel on every step — the
        // render and the graph could never both be part of one journey.
        if (localSelectedNodeId || selectedEntity) clearSelection()
        scopeNavigateToScope(targetIndex)
    }, [scopeNavigateToScope, localSelectedNodeId, selectedEntity, clearSelection])

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
                    patch: {
                        [component]: nextComponentValue,
                        // An operator family's card is named by the operation
                        // it is set to, so changing the menu renames the card
                        // — unless the person has typed their own name, which
                        // is theirs and is never overwritten.
                        ...operationLabelPatch(scopedSelectedNode, component, nextComponentValue)
                    }
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
    // Publish state is two plain document ops, the same ones Studio's publish
    // panel writes. Undoable like any other edit, and they sync through the
    // ordinary op path, so a guest with a redeemed invite can make them.
    const handlePresentationPatch = useCallback((patch) => {
        applyLocalOps({ type: 'setPresentationState', payload: { patch } })
    }, [applyLocalOps])

    const handlePublishPatch = useCallback((patch) => {
        applyLocalOps({ type: 'setPublishState', payload: { patch } })
    }, [applyLocalOps])

    const handleCreateEntity = useCallback((type) => {
        const count = (state.document.entities || []).length
        const entity = createEntityOfType(type, {
            createdBy: currentAuthor(displayName),
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

    // Nothing is applied until the confirm comes back: a delete is the one
    // edit the person who loses the work cannot undo, because undo history is
    // per-client.
    const handleDeleteSelected = useCallback(() => {
        if (scopedSelectedNode) {
            requestDelete(
                { id: scopedSelectedNode.id, name: scopedSelectedNode.label, author: scopedSelectedNode.createdBy },
                () => {
                    applyLocalOps(
                        { type: 'deleteNode', payload: { nodeId: scopedSelectedNode.id } },
                        { activityMessage: `Deleted ${scopedSelectedNode.label}.`, activityLevel: 'warning' }
                    )
                    setLocalSelectedNodeId(null)
                }
            )
            return
        }
        if (!scopedSelectedEntity) return
        requestDelete(
            { id: scopedSelectedEntity.id, name: scopedSelectedEntity.name, author: scopedSelectedEntity.createdBy },
            () => {
                applyLocalOps({
                    type: 'deleteEntity',
                    payload: { entityId: scopedSelectedEntity.id }
                }, { activityMessage: `Deleted ${scopedSelectedEntity.name}.`, activityLevel: 'warning' })
                dispatch({ type: 'select-entity', entityId: null })
            }
        )
    }, [applyLocalOps, dispatch, requestDelete, scopedSelectedEntity, scopedSelectedNode, setLocalSelectedNodeId])

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

    // The bridge out of the local canvas.
    //
    // The landing's only call to action sends every first-time visitor to
    // `/{space}/raw` — a canvas kept in this one browser. Until now nothing
    // made there could become a project: no second device, no collaborator, no
    // public link, and a cleared browser took it. The canvas was a dead end by
    // construction, and it was the front door.
    //
    // Deliberately a copy, not a move: the local canvas is left exactly as it
    // was. Someone who saves and then wants the scratch surface back still has
    // it, and a failed save cannot cost them the work — the one thing this
    // must never do.
    const [isSavingToSpace, setIsSavingToSpace] = useState(false)
    const handleSaveCanvasToSpace = useCallback(async () => {
        if (!isLocalWorkspace || isSavingToSpace) return
        const title = (window.prompt('Name this project', 'Canvas') || '').trim()
        if (!title) return
        setIsSavingToSpace(true)
        dispatch({ type: 'append-activity', level: 'info', message: `Saving “${title}” to ${resolvedSpaceId}…` })
        try {
            const response = await createProject(resolvedSpaceId, { title, slug: title, source: 'raw-v2' })
            const newId = response.project.id
            await updateProjectDocument(newId, {
                ...document,
                projectMeta: {
                    ...(document.projectMeta || {}),
                    id: newId,
                    spaceId: resolvedSpaceId,
                    title,
                    source: 'raw-v2'
                }
            })
            navigateToRawPath(buildRawProjectPath(newId, resolvedSpaceId))
        } catch (error) {
            // Stay on the canvas with the work intact and say why. A failure
            // here is usually scope — a guest can write to the open space and
            // its own sandbox, and nowhere else.
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: error?.message || `Could not save to ${resolvedSpaceId}. Your canvas is untouched.`
            })
            setIsSavingToSpace(false)
        }
    }, [dispatch, document, isLocalWorkspace, isSavingToSpace, resolvedSpaceId])

    // Hoisted ahead of the inspector's own graph read just below (fix #1/#2
    // needs both before hostInspector is built, further down this
    // component) — everything else that uses them (the show-clock stamp, the
    // live-capture handlers) still reads them by closure from here, hook
    // order unaffected since these are unconditional calls either way.
    // Rebuilt every frame while a Time node exists — the per-pass outputCache
    // must not survive a tick or the clock would freeze at its first sample.
    const clockNow = useDocumentClock(document)
    // Live, non-serializable node outputs (a captured webcam's VideoTexture)
    // that can't live in node.values — see createNodeGraphContext's liveOutputs.
    const [liveOutputs, handleLiveOutputChange] = useLiveOutputs()

    // An input port with a wire into it takes its value from the wire; a typed
    // value there was accepted and silently ignored. The sheet marks it.
    const wiredPortIds = scopedSelectedNode
        ? (document.edges || [])
            .filter((edge) => edge.toNodeId === scopedSelectedNode.id)
            .map((edge) => edge.toPort)
        : []
    // "from <source node label>" (design audit A3/B8, fix #1): a wire only
    // ever runs between two cards in the SAME scope (graphCardEdges' own
    // rule), so the source is always right here on screen — no scope walk
    // needed to find it.
    const wiredSources = useMemo(() => {
        if (!scopedSelectedNode) return {}
        const map = {}
        for (const edge of document.edges || []) {
            if (edge.toNodeId !== scopedSelectedNode.id) continue
            const source = authoredNodes.find((candidate) => candidate.id === edge.fromNodeId)
            map[edge.toPort] = { nodeId: edge.fromNodeId, label: source?.label || 'a node' }
        }
        return map
    }, [scopedSelectedNode, document.edges, authoredNodes])
    // The inspector sheet's own read of the graph (fix #1/#2) — same
    // quantised-clock, own-frameMemory convention the "what it's made of"
    // reading uses further down: a Lag's state must not be written twice per
    // frame at two different clocks, so the sheet never shares the room's
    // frameMemory, and a sine read at 60 Hz would be an unreadable blur on
    // text someone is reading rather than a frame being drawn.
    const inspectorNow = Math.floor((clockNow || 0) / 125) * 125
    const [inspectorMemory] = useState(() => createFrameMemory())
    const inspectorGraphContext = useMemo(
        () => createNodeGraphContext(document, { now: inspectorNow, liveOutputs, frameMemory: inspectorMemory }),
        [document, inspectorNow, liveOutputs, inspectorMemory]
    )
    // The evaluated value every input actually carries right now — wired or
    // not (evaluateNodeInputs falls back to the stored value/default exactly
    // like the room does), so the sheet can never show a number that
    // disagrees with what is really arriving (design audit A3: "Roughness
    // WIRED shows 1; the Number wired into it holds 0.4").
    const resolvedNodeInputValues = useMemo(
        () => (scopedSelectedNode ? evaluateNodeInputs(scopedSelectedNode, inspectorGraphContext) : null),
        [scopedSelectedNode, inspectorGraphContext]
    )
    // The "Out" section's live values (fix #2) — every output this node
    // actually has, doorway-promoted sockets included (getNodeOutputs' own
    // contract), read the same way the room reads them.
    const resolvedNodeOutputValues = useMemo(() => {
        if (!scopedSelectedNode) return null
        const values = {}
        for (const port of getNodeOutputs(scopedSelectedNode, authoredNodes)) {
            values[port.id] = evaluateNodeOutput(scopedSelectedNode, port.id, inspectorGraphContext)
        }
        return values
    }, [scopedSelectedNode, authoredNodes, inspectorGraphContext])
    // A picture operator's Runs on lists the machines this space can see right
    // now; the registry only knows "where the page is open".
    // Presence only on a desk that uses it: picture operators or a Desk panel.
    const usesDesk = nodes.some((node) => isPictureType(node.typeId) || node.typeId === 'view.desk')
    const { machines: knownMachines } = useMachinePresence(usesDesk ? resolvedSpaceId : '')
    const withMachines = (sections) => withMachineOptions(scopedSelectedNode, sections, knownMachines)
    const inspectorSections = scopedSelectedNode
        ? (() => {
            const sections = withMachines(deriveNodeInspectorSections(scopedSelectedNode, { wiredPortIds, wiredSources }))
            // "Out", with live values (fix #2 / design audit B8) — appended
            // after Settings/Ports so a person reads what goes IN before what
            // comes OUT, same order the card itself is wired left to right.
            const outputsSection = buildOutputsSection(scopedSelectedNode, authoredNodes)
            return outputsSection ? [...sections, outputsSection] : sections
        })()
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
        const nodeId = localSelectedNodeId
        if (!nodeId) return
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { label } }
        }, { activityMessage: `Renamed a node to “${label}”.` })
    }, [applyLocalOps, localSelectedNodeId])

    // `values.values` carries the resolved input values, not the raw stored
    // ones — a wired port displays what the wire brings (fix #1), and an
    // unwired one shows exactly what it always showed (evaluateNodeInputs
    // falls back to node.values then the port default, so nothing else
    // changes). `values.outputs` feeds the new Out section the same way
    // every other section reads its own slot.
    const inspectorValues = scopedSelectedNode
        ? { values: resolvedNodeInputValues || { ...(scopedSelectedNode.values || {}) }, outputs: resolvedNodeOutputValues || {} }
        : (scopedSelectedEntity ? scopedSelectedEntity.components : { worldState: document.worldState })
    const inspectorTitle = scopedSelectedNode ? scopedSelectedNode.label : (scopedSelectedEntity ? scopedSelectedEntity.name : 'World')
    // Plain words, never a typeId (fix #3 / design audit B5: "geom.cube" in
    // the subtitle, contrast 3.32-3.77:1, and nowhere did a node say what it
    // does). The registry's one-line `summary` first; the family word if a
    // type somehow has none; never the id itself.
    const selectedNodeType = scopedSelectedNode ? getNodeType(scopedSelectedNode.typeId) : null
    const inspectorSubtitle = scopedSelectedNode
        ? (selectedNodeType?.summary || getNodeFamily(scopedSelectedNode.typeId)?.label || '')
        : (scopedSelectedEntity ? scopedSelectedEntity.type : 'Scene defaults')

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
        // At the root of an empty LOCAL canvas, say which canvas this is before
        // saying what to do in it. The only other place that says so is the
        // topbar title ('Local canvas'), and an empty workspace opens in zen,
        // which hides the topbar — so at the exact moment a first-time visitor
        // arrives from "Step inside", nothing on screen distinguishes a
        // browser-only scratch surface from a space that will keep their work.
        // Crossing from Studio's ⇄ Nodes landed on exactly this screen, which is
        // what made the two editors look unconnected: the door worked, the room
        // it opened onto looked blank.
        if (!currentScopeId) {
            return describeRootEmptyCanvas({ isLocalWorkspace, entityCount: entities.length, pointerVerb })
        }
        const label = scopeNode?.label || 'this node'
        // The old sentence for a code-made node — "there is nothing inside it
        // to see" — taught the owner's exact wrong belief: children placed
        // inside a spatial node DO render and DO travel with it, and the one
        // sentence a first-timer read was the one denying it. Say the true
        // thing, by kind: a spatial node carries what you put in it; only a
        // non-spatial code node (a colour, a math step) genuinely has no room.
        // Every node has an inside now: its canvas is where you place nodes
        // and wire them into it through the IN side of the frame around it.
        if (isNodeMadeOfCode(scopeNode?.typeId)) {
            return `Inside ${label}. Place a node here, then wire it into ${label} on the In side.`
        }
        return `Inside ${label}. ${pointerVerb} to place the first node in it.`
    }, [currentScopeId, entities.length, isLocalWorkspace, pointerVerb, scopeNode])


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

    // A new panel window opens against its card and wholly on screen. The
    // frame buildNodeValues hands over is screen arithmetic around the click;
    // an unpinned window is graph units placed through the viewport, and near
    // the bottom or right of the screen the guess opened partly outside it
    // (festival-machine inventory 2026-09-06). Only creation comes through
    // here — a window a person has dragged is never re-placed.
    const placeFrameForNewNode = useCallback((frame, node, place) => placeNewWindowFrame({
        frame,
        card: getCardBox(node),
        anchor: place,
        space: panelWindowSpace(frame, graphViewport),
        viewport: graphViewport,
        viewportWidth: typeof window === 'undefined' ? undefined : window.innerWidth,
        viewportHeight: typeof window === 'undefined' ? undefined : window.innerHeight,
        workspaceTop: chromeVisible ? workspaceTop : RAW_WINDOW_PADDING
    }), [chromeVisible, graphViewport, workspaceTop])

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
        if (values.frame) {
            values.frame = placeFrameForNewNode(values.frame, { typeId: definition.id, graphX: cardX, graphY: cardY, values }, place)
        }
        const nextNode = createNode(definition.id, {
            values,
            graphX: cardX,
            graphY: cardY,
            parentId: currentScopeId,
            createdBy: currentAuthor(displayName)
        })
        if (!nextNode) return
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
            ...interior.map((node) => ({ type: 'createNode', payload: { node } }))
        ], {
            activityMessage: interior.length
                ? `Created ${definition.label} with ${interior.length} panels inside.`
                : `Created ${definition.label}.`
        })
        setLocalSelectedNodeId(nextNode.id)
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
                // Fan them out so a multi-file drop doesn't stack cards.
                const graphX = (place.graphX ?? 280) - (ROOT_WORLD_CARD_WIDTH / 2) + (index * 32)
                const graphY = Math.max(20, (place.graphY ?? 160) - (ROOT_WORLD_CARD_HEIGHT / 2) + (index * 32))
                if (values.frame) {
                    values.frame = placeFrameForNewNode(values.frame, { typeId, graphX, graphY, values }, place)
                }
                const node = createNode(typeId, {
                    values: { ...values, src: asset.id },
                    graphX,
                    graphY,
                    parentId: targetScopeId,
                    createdBy: currentAuthor(displayName)
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
            applyLocalOps(ops, {
                activityMessage: created.length === 1
                    ? `Brought in ${created[0].file.name}.`
                    : `Brought in ${created.length} files.`
            })
            // Only follow the selection when the node landed in the scope the
            // graph is showing — otherwise the inspector would describe a node
            // that isn't on screen.
            if (targetScopeId === currentScopeId) {
                setLocalSelectedNodeId(last.node.id)
            }
        }

        const failureNotice = failed.length
            ? `Could not bring in ${failed.map(({ file }) => file?.name || 'file').join(', ')}.`
            : ''
        setDropState({
            over: false,
            busy: false,
            notice: [failureNotice, rejectedNotice].filter(Boolean).join(' ')
        })
    }, [applyLocalOps, currentScopeId, placeFrameForNewNode, projectId, setLocalSelectedNodeId, topZIndex, workspaceTop])

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
        setLocalSelectedNodeId(null)
        applyLocalOps([
            ...exampleNodes.map((node) => ({ type: 'createNode', payload: { node } })),
            ...exampleEdges.map((edge) => ({ type: 'createEdge', payload: { edge } }))
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
        setLocalSelectedNodeId(null)
        applyLocalOps([
            ...sceneNodes.map((node) => ({ type: 'createNode', payload: { node } })),
            ...sceneEdges.map((edge) => ({ type: 'createEdge', payload: { edge } }))
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
                onSelectSource={selectNode}
                emptyMessage="Double-click the world or the view to start authoring."
            />
        </aside>
    )

    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
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
    // A Button press is a live event, never a document op (a cue in the undo
    // history made Ctrl+Z un-press the show). Counted per window, published
    // through the side channel; view.button's runtime adds any stored count.
    const pressCountsRef = useRef(new Map())
    const handleButtonPress = useCallback((nodeId) => {
        const next = (pressCountsRef.current.get(nodeId) || 0) + 1
        pressCountsRef.current.set(nodeId, next)
        handleLiveOutputChange(nodeId, 'presses', next)
    }, [handleLiveOutputChange])
    const handleButtonHeld = useCallback((nodeId, held) => {
        handleLiveOutputChange(nodeId, 'pressed', held)
    }, [handleLiveOutputChange])
    // Stable graph-surface callbacks: as inline lambdas these re-registered
    // RawGraphSurface's window-level drag/key listeners on every parent
    // render, and a teardown mid-drag dropped the queued final frame.
    // RawGraphSurface's wire-drop handler reports a bare
    // {fromNodeId, fromPort, toNodeId, toPort} — it never minted an id, so
    // this used to forward the payload straight through as the edge and the
    // server's findIdlessCreateOp (serverXR/src/opValidation.js) rejected
    // the whole op batch with op_missing_id. Mint the id here, at the one
    // place a raw wire-drop payload becomes an edge op.
    const handleCreateEdge = useCallback((payload) => applyLocalOps({
        type: 'createEdge',
        payload: { edge: createEdge(payload.fromNodeId, payload.fromPort, payload.toNodeId, payload.toPort) }
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
            parentId: currentScopeId,
            createdBy: currentAuthor(displayName)
        })
        if (!door) return
        const edge = dir === 'out'
            ? createEdge(node.id, port.id, door.id, 'value')
            : createEdge(door.id, 'value', node.id, port.id)
        applyLocalOps([
            { type: 'createNode', payload: { node: door } },
            { type: 'createEdge', payload: { edge } }
        ], { activityMessage: `Exposed ${port.label || port.id} on ${container.label}.` })
        setLocalSelectedNodeId(door.id)
        // The new socket is one level up, off-screen from here — say so, or the
        // gesture appears to have done nothing.
        setPromotedNotice({
            containerId: container.id,
            containerLabel: container.label,
            portLabel: port.label || port.id
        })
    }, [applyLocalOps, authoredNodes, currentScopeId, setLocalSelectedNodeId])

    const handleDeleteEdge = useCallback((edgeId) => applyLocalOps({
        type: 'deleteEdge',
        payload: { edgeId }
    }), [applyLocalOps])
    const handleDeleteNode = useCallback((nodeId) => {
        applyLocalOps({ type: 'deleteNode', payload: { nodeId } }, { activityMessage: 'Deleted node.', activityLevel: 'warning' })
        setLocalSelectedNodeId(null)
    }, [applyLocalOps, setLocalSelectedNodeId])
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
        const source = localSelectedNodeId
            ? authoredNodes.find((node) => node.id === localSelectedNodeId)
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
            values,
            // The copy belongs to whoever made it, not to the original's
            // author — see cloneSubtree in Studio's clipboard.
            createdBy: currentAuthor(displayName)
        })
        if (!copy) return
        applyLocalOps(
            { type: 'createNode', payload: { node: copy } },
            { activityMessage: `Duplicated ${source.label || 'a node'}.` }
        )
        selectNode(copy.id)
    }, [applyLocalOps, authoredNodes, selectNode, localSelectedNodeId])
    // Between-pass node state (a Lag's last answer) — this window's own,
    // never React state, dropped whole when the document changes.
    const [frameMemory] = useState(() => createFrameMemory())
    useEffect(() => { frameMemory.clear() }, [frameMemory, projectId])
    // Node scripts run in a worker on machines that allow desk scripts; their
    // last answers ride into this pass (and the room's) — nodeScripts.js.
    const scriptResults = useNodeScripts(document, { liveOutputs })
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs, frameMemory, scriptResults }),
        [document, clockNow, liveOutputs, frameMemory, scriptResults]
    )

    // The one door RawGraphSurface's cards get into a live value — a node id
    // and a port id in, this frame's real answer out, read through the SAME
    // graphContext the room itself draws with (real clock, real liveOutputs).
    // Feeds CardValueViewer and CardPreview's live overlay. authoredNodes, not
    // graphCardNodes: a wired source can live outside the current scope.
    const readOutput = useCallback((nodeId, portId) => {
        const sourceNode = authoredNodes.find((candidate) => candidate.id === nodeId)
        if (!sourceNode) return undefined
        return evaluateNodeOutput(sourceNode, portId, graphContext)
    }, [authoredNodes, graphContext])

    // Walk to wherever a node lives and select it — the far end of a wire
    // named on the inside's IN or OUT side, one scope out, two in, or next
    // door. The node you are standing IN is selected by standing in it.
    const handleGoToNode = useCallback((nodeId) => {
        if (!nodeId) return
        if (localSelectedNodeId || selectedEntity) clearSelection()
        if (!scopeGoToNode(nodeId)) return
        selectNode(nodeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeGoToNode, localSelectedNodeId, selectedEntity, clearSelection])

    // A wire made from the inside frame: an inner card into this node's input,
    // or this node's output into an inner card. An input reads one wire, so a
    // new one replaces whatever fed it, in the same undoable batch.
    const handleInsideWire = useCallback((spec) => {
        const edge = createEdge(spec.fromNodeId, spec.fromPort, spec.toNodeId, spec.toPort)
        applyLocalOps(wireOps(document.edges || [], edge), { activityMessage: 'Wired from inside.' })
    }, [applyLocalOps, document.edges])
    const handleInsideChangeValue = useCallback((nodeId, portId, value) => {
        const node = authoredNodes.find((entry) => entry.id === nodeId)
        if (!node) return
        const nextValues = { ...(node.values || {}), [portId]: value }
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { values: nextValues, ...operationLabelPatch(node, 'values', nextValues) } }
        })
    }, [applyLocalOps, authoredNodes])
    const handleInsidePatchValues = useCallback((nodeId, values) => applyLocalOps({
        type: 'updateNode',
        payload: { nodeId, patch: { values } }
    }), [applyLocalOps])
    const handleInsideRename = useCallback((nodeId, label) => applyLocalOps({
        type: 'updateNode',
        payload: { nodeId, patch: { label } }
    }, { activityMessage: `Renamed a node to “${label}”.` }), [applyLocalOps])

    // `placement` is where the window's content stands: 'window' on the patch,
    // 'inside' in the inside view's SEE. Only the VJ deck reads it today.
    const renderViewNodeContent = (node, { placement = 'window' } = {}) => {
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
        if (node.typeId === 'view.desk') {
            return (
                <DeskPanelWindow
                    spaceId={resolvedSpaceId}
                    onPlace={(typeId, params) => handlePaletteCreate({
                        definition: getNodeType(typeId),
                        params,
                        placement: { graphX: (node.graphX ?? 0) + 320, graphY: (node.graphY ?? 0) + 40 }
                    })}
                />
            )
        }
        if (node.typeId === 'source.webcam') {
            // A view of the feed LiveFeeds holds — closing it stops nothing.
            return <WebcamSourcePanel node={node} texture={liveOutputs.get(`${node.id}:frame`) ?? null} />
        }
        if (node.typeId === 'source.mic') {
            return <MicSourcePanel node={node} volume={liveOutputs.get(`${node.id}:volume`) ?? 0} />
        }
        if (node.typeId === 'device.midi.in') {
            return (
                <MidiInputPanel
                    node={node}
                    values={resolvedValues}
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
        if (node.typeId === 'device.dmx.out') {
            return (
                <DmxOutPanelWindow
                    node={node}
                    values={resolvedValues}
                    // Host is settable in the window itself, not only in the
                    // inspector — a node the palette can place must be usable
                    // where it lands.
                    onConfigChange={(nodeId, patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId, patch: { values: { ...node.values, ...patch } } }
                    })}
                />
            )
        }
        if (node.typeId === 'vj.deck') {
            // The deck as a window on the patch, or inside the node (SEE hands
            // placement 'inside'). One view, one state: node.values.deck.
            return (
                <VjDeckView
                    node={node}
                    placement={placement}
                    assets={document.assets || []}
                    // Which node feeds each input, so a playing input tile can
                    // show that node's picture. A deck feeding a deck shows its master.
                    inputSources={Object.fromEntries((document.edges || [])
                        .filter((edge) => edge?.toNodeId === node.id && DECK_INPUTS.includes(edge.toPort) && edge.fromNodeId)
                        .map((edge) => {
                            const from = (document.nodes || []).find((candidate) => candidate.id === edge.fromNodeId)
                            return [edge.toPort, from?.typeId === VJ_DECK_TYPE ? masterNodeId(from.id) : edge.fromNodeId]
                        }))}
                    onPatchValues={(patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, ...patch } } }
                    })}
                    onUploadFile={async (file) => {
                        const asset = projectId ? await uploadProjectAsset(projectId, file) : await saveAssetFromFile(file)
                        if (asset?.id) applyLocalOps({ type: 'upsertAsset', payload: { asset } }, { activityMessage: `Brought in ${file.name}.` })
                        return asset
                    }}
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
                    presses={evaluateNodeOutput(node, 'presses', graphContext)}
                    onHeld={handleButtonHeld}
                    onPress={handleButtonPress}
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
                    selectedNodeId={localSelectedNodeId || null}
                    onSelectNode={(nodeId) => selectNode(nodeId)}
                />
            )
        }
        if (node.typeId === 'view.library') {
            return <CreatePanelWindow onCreateEntity={handleCreateEntity} />
        }
        if (node.typeId === 'view.publish') {
            return (
                <PublishPanelWindow
                    projectId={projectId}
                    spaceId={resolvedSpaceId}
                    presentationState={document.presentationState || {}}
                    publishState={document.publishState || {}}
                    onPresentationPatch={handlePresentationPatch}
                    onPublishPatch={handlePublishPatch}
                />
            )
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
                    onSelectSource={selectNode}
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
        if (node.typeId === 'view.list') {
            return (
                <ListPanelWindow
                    node={node}
                    values={resolvedValues}
                    onChange={(patch) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, ...patch } } }
                    })}
                />
            )
        }
        if (node.typeId === 'view.text') {
            // A note is written where it is read. The wire check keeps the box
            // read-only when an edge feeds `content` — see TextPanelWindow.
            const driven = (graphContext?.edges || []).some(
                (edge) => edge.toNodeId === node.id && edge.toPort === 'content'
            )
            return (
                <TextPanelWindow
                    node={node}
                    values={resolvedValues}
                    driven={driven}
                    onChange={(content) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId: node.id, patch: { values: { ...node.values, content } } }
                    })}
                />
            )
        }
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

    // Design audit C4: the ⋯ menu ignored Escape and an outside click —
    // measured staying open under Help and through zooming. Capture phase so
    // this runs before the scope-Escape handler just below it, and
    // stopImmediatePropagation so the same Escape press that closes the menu
    // does not also pop the node scope in the same keystroke.
    useEffect(() => {
        if (!overflowOpen) return undefined
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopImmediatePropagation()
            setOverflowOpen(false)
        }
        const handlePointerDown = (event) => {
            if (overflowRef.current?.contains(event.target)) return
            setOverflowOpen(false)
        }
        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('pointerdown', handlePointerDown, true)
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('pointerdown', handlePointerDown, true)
        }
    }, [overflowOpen])

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
            // Walk the pile of windows the way the eye does. Ctrl+` is the
            // one binding no browser and no editor has already taken, and it
            // is what a person coming from any other window manager reaches
            // for. Shift walks back.
            if (event.ctrlKey && event.key === '`') {
                const order = [...visibleViewNodes]
                    .filter((node) => frameOf(node).minimized !== true)
                    .sort((a, b) => (frameOf(b).zIndex || 6) - (frameOf(a).zIndex || 6))
                    .map((node) => node.id)
                const nextId = cycleFocus(order, localSelectedNodeId, event.shiftKey ? -1 : 1)
                if (!nextId) return
                event.preventDefault()
                selectNode(nextId)
                setLocalFrame(nextId, { zIndex: topZIndex + 1 })
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
    }, [handleDuplicateSelected, handleNavigateToScope, navStack.length, undo, redo, isWorldFullscreen, visibleViewNodes, frameOf, setLocalFrame, selectNode, topZIndex, localSelectedNodeId])

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
        (node) => isPanelNode(node) && frameOf(node).visible === false
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
            label: frameOf(node).title || node.label || getNodeType(node.typeId)?.label || 'Panel',
            hint: `open — ${node.typeId}`,
            run: () => setLocalFrame(node.id, { visible: true })
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
    const narrowViewport = isNarrowViewport()
    const windowSpaceFor = (frame) => panelWindowSpace(frame, graphViewport)
    // World windows are content: fit-all frames them along with the cards.
    const worldWindowBounds = narrowViewport
        ? []
        : visibleViewNodes
            .filter((node) => !frameOf(node).pinned)
            .map((node) => {
                const state = buildWindowStateFromNode(node, 0, graphContext, frameOf(node), true)
                return { x: state.x, y: state.y, width: state.width, height: state.minimized ? RAW_WINDOW_MINIMIZED_HEIGHT : state.height }
            })
    const edgeInsets = getGraphEdgeInsets({
        frames: [
            // Only PINNED windows dock against the graph's edges now. An
            // unpinned window lives in the world with the cards — it is
            // content the fit frames, not chrome the fit dodges.
            ...visibleViewNodes
                .map((node) => frameOf(node))
                .filter((frame) => frame.minimized !== true)
                .filter((frame) => windowSpaceFor(frame) === 'screen')
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
    // Inside a node the frame is chrome on every side of the canvas; the fit
    // dodges the larger of the two on each edge.
    const activeInsideInsets = currentScopeId ? insideInsets : null
    const graphContentInsets = activeInsideInsets
        ? {
            left: Math.max(edgeInsets.left, activeInsideInsets.left),
            right: Math.max(edgeInsets.right, activeInsideInsets.right),
            top: Math.max(edgeInsets.top, activeInsideInsets.top),
            bottom: Math.max(edgeInsets.bottom, activeInsideInsets.bottom)
        }
        : edgeInsets

    return (
        <main className="raw-editor-shell">
            {/* An expired session stops the sync layer retrying (useProjectDocumentSync's
                401 branch clearTimeout()s and breaks) while the editor keeps accepting
                edits. They sit in a queue in memory and a reload drops them. Nothing in
                this lane rendered that state, on any device — so the work vanished with
                no warning at all. Deliberately OUTSIDE the chromeVisible gate: zen hides
                the toolbar, and losing an hour of work is not furniture. */}
            {state.pendingSyncError && (
                <div className="raw-sync-alert" role="alert">
                    {state.pendingSyncError}
                </div>
            )}
            <header className={`raw-topbar${chromeVisible ? ' is-seeded' : ''}`} ref={topbarRef}>
                {chromeVisible && (
                    <>
                        <div className="raw-topbar-left">
                            <button type="button" className="raw-topbar-back" aria-label="Back to projects" onClick={() => {
                                navigateToRawPath(buildSpaceProjectsPath(resolvedSpaceId))
                            }}>
                                ←<span className="raw-topbar-word"> Projects</span>
                            </button>
                            {/* Name the space, not just the project. Studio's cluster has
                                always shown "space · project"; Raw showed the project
                                alone, so nothing on screen told you which space you were
                                editing in. Folded into the existing element rather than
                                adding chrome — the id is what the URL says, so it is the
                                recognisable form. */}
                            <span
                                className="raw-topbar-name"
                                title={isLocalWorkspace ? workspaceTitle : `${resolvedSpaceId} · ${workspaceTitle}`}
                            >
                                {isLocalWorkspace ? workspaceTitle : (
                                    <>
                                        <span className="raw-topbar-name-space">{resolvedSpaceId}</span>
                                        {/* Its own element so the narrow rule can drop the
                                            title and keep the space: a space id is short
                                            ("wcc"), a project title is not, and which space
                                            you are in is the fact you cannot otherwise
                                            recover from this bar. */}
                                        <span className="raw-topbar-name-project">{` · ${workspaceTitle}`}</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="raw-topbar-center">
                            {navStack.length > 1 ? (
                                <nav className="raw-topbar-breadcrumb" aria-label="Node scope">
                                    {/* Design audit B6: the floating scope marker's
                                        Leave (‹) is the control most reached for —
                                        put it where the breadcrumb already lives so
                                        it is not a second piece of chrome to find. */}
                                    <button
                                        type="button"
                                        className="raw-topbar-crumb raw-topbar-crumb-back"
                                        onClick={() => handleNavigateToScope(navStack.length - 2)}
                                        aria-label="Leave — back one level"
                                        title="Leave"
                                    >
                                        ‹
                                    </button>
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
                            {/* Design audit A1: at 600px and below this button,
                                Help, the node count and Chat move into the ⋯
                                menu (see the phone-only group there) so the
                                bar fits without becoming a side-scroller. */}
                            <div className="raw-topbar-windows raw-topbar-hide-narrow">
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
                                    title={isWorldFullscreen
                                        ? 'Back to the graph'
                                        : roomCount > 0
                                            ? `Open the room — ${roomCount} thing${roomCount === 1 ? '' : 's'} standing in it`
                                            : 'Open the room — nothing standing in it yet'}
                                >
                                    {isWorldFullscreen
                                        ? '← Graph'
                                        : roomCount > 0 ? `Scene · ${roomCount}` : 'Scene'}
                                </button>
                            </div>
                        </div>
                        <div className="raw-topbar-right">
                            <button type="button" className="raw-topbar-help-action raw-topbar-hide-narrow" onClick={() => setHelpOpen(true)}>
                                Help
                            </button>
                            {nodeCount > 0 && (
                                <button
                                    type="button"
                                    className={`raw-topbar-node-count raw-topbar-hide-narrow${outlinerOpen ? ' is-active' : ''}`}
                                    onClick={() => setOutlinerOpen((v) => !v)}
                                    title="Toggle outliner"
                                    aria-label={`${nodeCount} nodes`}
                                >
                                    {nodeCount}<span className="raw-topbar-word"> {nodeCount === 1 ? 'node' : 'nodes'}</span>
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
                                    className={`raw-topbar-node-count raw-topbar-hide-narrow${chatOpen ? ' is-active' : ''}`}
                                    onClick={() => setChatOpen((v) => !v)}
                                    title="Toggle chat"
                                    aria-label="Toggle chat"
                                >
                                    Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
                                </button>
                            )}
                            <div className="raw-topbar-overflow" ref={overflowRef}>
                                <button
                                    type="button"
                                    className="raw-topbar-overflow-btn"
                                    onClick={() => setOverflowOpen((v) => !v)}
                                    aria-label="More"
                                    aria-haspopup="true"
                                    aria-expanded={overflowOpen}
                                >
                                    ⋯
                                </button>
                                {overflowOpen && (
                                    <div className="raw-topbar-overflow-menu" role="menu" aria-label="More">
                                        {/* Design audit C4: navigation, view
                                            settings and help used to sit in one
                                            unsorted list. Three groups, named
                                            for what they do rather than what
                                            they are made of. */}
                                        <span className="raw-topbar-overflow-group-label">Project</span>
                                        <button type="button" role="menuitem" onClick={() => { scopeReset(); setOverflowOpen(false) }}>Home</button>
                                        {/* One project, two editors — this is the
                                            way across. The local canvas has no
                                            Editor twin, so no link there.
                                            "Editor" not "Studio": Studio is one
                                            place inside the product, not the
                                            product (docs/ai/vocabulary.md,
                                            2026-09-11). */}
                                        {!isLocalWorkspace && projectId && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setOverflowOpen(false)
                                                    navigateToRawPath(buildStudioProjectPath(projectId, resolvedSpaceId))
                                                }}
                                            >
                                                Open in Editor
                                            </button>
                                        )}
                                        {/* The projector cable had zero inbound
                                            links — /out was reachable only by
                                            typing the address (doors audit). */}
                                        {!isLocalWorkspace && projectId && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={async () => {
                                                    setOverflowOpen(false)
                                                    const url = `${window.location.origin}${buildRawOutPath(projectId, resolvedSpaceId)}`
                                                    try {
                                                        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
                                                        else if (typeof window.prompt === 'function') window.prompt('Copy projector link', url)
                                                    } catch {
                                                        if (typeof window.prompt === 'function') window.prompt('Copy projector link', url)
                                                    }
                                                }}
                                            >
                                                Copy projector link
                                            </button>
                                        )}
                                        {/* The way out of a browser-only canvas
                                            and into a real project. First,
                                            because it is the only thing here
                                            that changes what the work IS. */}
                                        {isLocalWorkspace && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={isSavingToSpace}
                                                onClick={() => { setOverflowOpen(false); handleSaveCanvasToSpace() }}
                                            >
                                                {isSavingToSpace ? 'Saving…' : `Save to ${resolvedSpaceId}`}
                                            </button>
                                        )}
                                        {/* The exits back to di.iiii — the canvas was a
                                            sealed room before the doors audit. */}
                                        <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); navigateToRawPath(buildSpacesPath()) }}>Spaces</button>
                                        {isLocalWorkspace && (
                                            <button type="button" role="menuitem" onClick={() => { handleResetLocalWorkspace(); setOverflowOpen(false) }}>Clear the canvas</button>
                                        )}

                                        <span className="raw-topbar-overflow-group-label">View</span>
                                        {/* Design audit A1: at 600px and below,
                                            the Scene toggle, the node count
                                            (outliner) and Chat drop off the bar
                                            itself (raw-topbar-hide-narrow) and
                                            live here instead — shown only at
                                            that width (raw-topbar-overflow-
                                            narrow-only in raw.css) so the menu
                                            does not carry duplicate controls on
                                            a desktop where the bar already has
                                            room for them. */}
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="raw-topbar-overflow-narrow-only"
                                            onClick={() => { setOverflowOpen(false); setIsWorldFullscreen((current) => !current) }}
                                        >
                                            {isWorldFullscreen
                                                ? 'Back to the graph'
                                                : roomCount > 0 ? `Scene · ${roomCount}` : 'Scene'}
                                        </button>
                                        {nodeCount > 0 && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="raw-topbar-overflow-narrow-only"
                                                onClick={() => { setOverflowOpen(false); setOutlinerOpen((v) => !v) }}
                                            >
                                                {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                                            </button>
                                        )}
                                        {(!isLocalWorkspace || presence.users.length > 0 || unreadChatCount > 0) && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="raw-topbar-overflow-narrow-only"
                                                onClick={() => { setOverflowOpen(false); setChatOpen((v) => !v) }}
                                            >
                                                Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
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
                                        <button type="button" role="menuitem" onClick={() => { handleCreateSceneExample(); setOverflowOpen(false) }}>Build an example</button>
                                        <button type="button" role="menuitem" onClick={() => { handleCreateAllNodesExample(); setOverflowOpen(false) }}>All Nodes Example</button>

                                        <span className="raw-topbar-overflow-group-label">Help</span>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="raw-topbar-overflow-narrow-only"
                                            onClick={() => { setOverflowOpen(false); setHelpOpen(true) }}
                                        >
                                            Help
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); navigateToRawPath(buildWikiPath()) }}>Wiki</button>

                                        {presence.users.length > 0 && (
                                            <>
                                                <span className="raw-topbar-overflow-group-label">Here now</span>
                                                {presence.users.map((user) => (
                                                    <span key={user.socketId || user.userId} className="raw-user-pill">
                                                        {user.userName}
                                                    </span>
                                                ))}
                                            </>
                                        )}
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
                style={activeInsideInsets ? {
                    '--raw-inside-canvas-left': `${activeInsideInsets.left}px`,
                    '--raw-inside-canvas-bottom': `${activeInsideInsets.bottom}px`
                } : undefined}
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
                    // …and never when the room already holds objects: the demo
                    // injects six nodes, and offering that as the primary action
                    // on somebody's Studio project invites them to bury it.
                    onMakeScene={currentScopeId === null && nodes.length === 0 && entities.length === 0 ? handleCreateSceneExample : null}
                    // The way to the work that IS here. Without it the crossing
                    // from Studio ends on a blank grid whose only offer is to
                    // start over.
                    onOpenRoom={currentScopeId === null && nodes.length === 0 && entities.length > 0
                        ? () => setIsWorldFullscreen(true)
                        : null}
                    emptyHint={scopeEmptyHint}
                    edges={graphCardEdges}
                    selectedNodeId={localSelectedNodeId}
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
                    onViewportChange={handleViewportChange}
                    extraBounds={worldWindowBounds}
                    readOutput={readOutput}
                />
                {/* Inside ANY node: the same workshop around its canvas —
                    see it working, its settings and inputs, what it gives and
                    where, and the code it is made of. The one "where am I". */}
                {scopeNode ? (
                    <InsideView
                        key={scopeNode.id}
                        node={scopeNode}
                        allNodes={authoredNodes}
                        document={document}
                        clockNow={clockNow}
                        liveOutputs={liveOutputs}
                        machines={knownMachines}
                        depth={navStack.length}
                        childCount={childCounts.get(scopeNode.id) || 0}
                        top={graphTopInset}
                        assetOptions={document.assets || []}
                        // The floating copy of this node's window is not
                        // mounted while you stand inside it (selectMounted-
                        // PanelNodes is scoped), so SEE holds the only one.
                        renderWindow={renderViewNodeContent}
                        onChangeValue={handleInsideChangeValue}
                        onPatchValues={handleInsidePatchValues}
                        // Every node's Script tab runs through the one worker
                        // (nodeScripts.js); picture operators keep their own.
                        scriptProps={NODE_SCRIPT_PROPS}
                        onRename={handleInsideRename}
                        onLeave={() => handleNavigateToScope(navStack.length - 2)}
                        onLeaveAll={() => handleNavigateToScope(0)}
                        onGoToNode={handleGoToNode}
                        onWire={handleInsideWire}
                        onUnplug={handleDeleteEdge}
                        onInsetsChange={setInsideInsets}
                    />
                ) : null}
                {/* Zen's three residents are surface, nodes, wordmark — this is
                    the wordmark. Ambient, kept when the toolbar is summoned too.
                    It became the way home in the 2026-08-21 doors audit: the
                    canvas was a sealed room (no nav, no path back to
                    di.iiii), and a wordmark that links home is the one exit
                    that adds no furniture. Same resting look, quiet hover.
                    Design audit B10/#18: it drew over the inside panel's own
                    fields (measured: over Exposure, over Focus). Every node has
                    an inside frame now, so it hides whenever you stand in one. */}
                <a
                    className={`raw-surface-wordmark${navStack.length > 1 ? ' is-hidden' : ''}`}
                    href="/"
                    aria-label="di.iiii — home"
                    onClick={(e) => { e.preventDefault(); navigateToRawPath('/') }}
                >di<span>.</span>iiii</a>
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
                {/* Panel nodes are windows. Unpinned, a window stands IN the
                    world like its card — pan the canvas and it travels, zoom
                    and it shrinks — so many scenes can be spread across one
                    desk. Pinned, it is fixed to the screen the old way; on a
                    phone every window is, because the clamp is the layout. */}
                {visibleViewNodes.map((node, index) => {
                    const frame = frameOf(node)
                    // Design audit A5: a node made with no frame at all — the
                    // API, an import, an example, an agent — used to cascade
                    // by a hash of its id alone, which knows nothing about
                    // where the node's own card sits and piled every such
                    // window into the same top-left corner (and onto each
                    // other, sharing that one corner). placeNewWindowFrame
                    // (the palette's own placement) was tried here first, but
                    // it reads the LIVE pan/zoom every call — fine for a
                    // frame that gets saved once at creation, wrong for one
                    // that is recomputed on every render, since panning would
                    // then drag the window along behind a card it is not
                    // pinned to. buildWindowStateFromNode's fallback below
                    // anchors to the card's own GRAPH position instead —
                    // stable under pan/zoom, and still clear of the card
                    // rather than centred on the old shared corner. A frame
                    // someone has actually dragged is never touched.
                    const space = windowSpaceFor(frame)
                    const windowState = buildWindowStateFromNode(node, index, graphContext, frame, space === 'world')
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
                            space={space}
                            viewport={graphViewport}
                            onFocus={() => {
                                selectNode(node.id)
                                // already topmost → no op. Unconditional bumps
                                // inflated zIndex forever, and back when this
                                // was an op it pushed a real undo entry per
                                // title-bar click, so Ctrl+Z undid a focus
                                // instead of the last edit.
                                if ((frame.zIndex || 6) >= topZIndex) return
                                setLocalFrame(node.id, { zIndex: topZIndex + 1 })
                            }}
                            onPatch={(patch) => setLocalFrame(node.id, patch)}
                            onClose={() => setLocalFrame(node.id, { visible: false })}
                            onToggleMinimize={() => setLocalFrame(node.id, { minimized: !frame.minimized })}
                            // Maximise fills the workspace, never the page —
                            // a window over the topbar hides the way out, and
                            // one at the true bottom edge lands under the
                            // sign-in button. Restore returns the frame the
                            // person left, not the project's seed.
                            onToggleMaximize={() => setLocalFrame(node.id, isMaximised(frame)
                                ? restoreFrame(frame)
                                // Filling the workspace and sitting under
                                // another window is not filling the workspace.
                                : maximiseFrame({ ...frame, zIndex: topZIndex + 1 }, {
                                    left: RAW_WINDOW_PADDING,
                                    top: graphTopInset + RAW_WINDOW_PADDING,
                                    width: (typeof window === 'undefined' ? 1280 : window.innerWidth) - RAW_WINDOW_PADDING * 2,
                                    height: (typeof window === 'undefined' ? 800 : window.innerHeight)
                                        - graphTopInset - RAW_WINDOW_PADDING * 2 - getBottomReserve(typeof window === 'undefined' ? 1280 : window.innerWidth)
                                }))}
                            // Pinning changes the frame's coordinate space, so
                            // the numbers are converted through the viewport at
                            // that moment and the window stays exactly where the
                            // eye left it: pin = world → screen pixels, unpin =
                            // screen pixels → world units.
                            onTogglePin={() => {
                                const pinned = !frame.pinned
                                const vp = graphViewport
                                const converted = (!vp || narrowViewport) ? {} : pinned
                                    ? {
                                        x: (vp.originLeft || 0) + vp.panX + windowState.x * vp.zoom,
                                        y: (vp.originTop || 0) + vp.panY + windowState.y * vp.zoom,
                                        width: windowState.width * vp.zoom,
                                        height: windowState.height * vp.zoom
                                    }
                                    : {
                                        x: (windowState.x - (vp.originLeft || 0) - vp.panX) / vp.zoom,
                                        y: (windowState.y - (vp.originTop || 0) - vp.panY) / vp.zoom,
                                        width: windowState.width / vp.zoom,
                                        height: windowState.height / vp.zoom
                                    }
                                setLocalFrame(node.id, { ...converted, pinned })
                            }}
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

            {/* Where you are, and the way back out, is the inside frame's head
                (InsideView) — deliberately above every overlay, zen and the
                fullscreen room included, because it is the one thing that must
                never be hidden. There is no second marker. */}

            {/* Every live feed, for as long as its node exists — a window is
                only a view of it. See LiveFeeds. */}
            <LiveFeeds
                document={document}
                graphContext={graphContext}
                liveOutputs={liveOutputs}
                assetMap={assetMap}
                spaceId={resolvedSpaceId}
                projectId={projectId || null}
                onLiveOutputChange={handleLiveOutputChange}
            />

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
                        scriptResults={scriptResults}
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
                        selectedNodeId={localSelectedNodeId || null}
                        onSelectNode={(nodeId) => selectNode(nodeId)}
                    />
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
                        spaceMessages={spaceChatMessages}
                        onSendSpace={presence.sendSpaceChatMessage}
                        spaceLabel={chatSpaceId || 'Space'}
                        canModerate={Boolean(presence.canModerateSpaceChat)}
                        onRemoveSpaceMessage={presence.removeSpaceChatMessage}
                        channel={chatChannel}
                        onChannelChange={setChatChannel}
                    />
                </DesktopWindow>
            )}

            <RawHelpDialog
                open={helpOpen}
                onClose={() => setHelpOpen(false)}
                hasNodes={hasAnyNodes}
            />

            {visibleSelection ? hostInspector : null}

            <NodePalette
                open={paletteState.open}
                placement={paletteState.placement}
                onClose={() => setPaletteState({ open: false, placement: null })}
                onCreate={handlePaletteCreate}
                commands={paletteCommands}
            />

            {deleteConfirm}

        </main>
    )
}
