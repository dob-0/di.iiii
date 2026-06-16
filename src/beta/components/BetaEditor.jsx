import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import BetaViewport from './BetaViewport.jsx'
import BetaGraphSurface from './BetaGraphSurface.jsx'
import NodePalette from './NodePalette.jsx'
import TextPanelWindow from './TextPanelWindow.jsx'
import ImagePanelWindow from './ImagePanelWindow.jsx'
import WorldPanelWindow from './WorldPanelWindow.jsx'
import OutlinerPanelWindow from './OutlinerPanelWindow.jsx'
import BetaHelpDialog from './BetaHelpDialog.jsx'
import { useProjectStore } from '../../project/state/projectStore.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { getInspectorSections } from '../../project/entityRegistry.js'
import { createEdge, createNode, getNodeType } from '../../project/nodeRegistry.js'
import { deriveNodeInspectorSections } from '../utils/nodeInspectorSections.js'
import { createNodeGraphContext, evaluateNodeInputs } from '../utils/nodeGraphRuntime.js'
import { getSurfaceWorkflow } from '../utils/surfaceWorkflow.js'
import { matchesNodeTypeSurface } from '../utils/nodeSurfaceFilters.js'

const getNodeRender = (node) => getNodeType(node?.typeId)?.render || 'hidden'
const isPanelNode = (node) => getNodeRender(node) === 'panel-2d'

import { buildBetaProjectsPath, navigateToBetaPath } from '../utils/betaRouting.js'
import { DEFAULT_PROJECT_SPACE_ID } from '../../project/services/projectsApi.js'
import { getWorkspaceTopInset } from '../utils/windowLayout.js'
import {
    clearLocalWorkspaceDocument,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument
} from '../utils/localWorkspaceStorage.js'
import {
    detectDeviceType,
    getDefaultNodeScale,
    getAvailableScales
} from '../utils/deviceDetection.js'

const DISPLAY_NAME_KEY = 'dii.beta.displayName'
const NODE_SCALE_KEY = 'dii.beta.nodeScale'
const ROOT_WORLD_CARD_WIDTH = 160
const ROOT_WORLD_CARD_HEIGHT = 120
const WINDOW_DEFAULT_POSITIONS = {
    'universe.world':  { x: 120,  y: 60, width: 680, height: 480 },
    'view.inspector':  { x: 24,   y: 56, width: 320, height: 480 },
    'view.assets':     { x: 24,   y: 56, width: 280, height: 380 },
    'view.outliner':   { x: 24,   y: 56, width: 240, height: 360 },
    'view.activity':   { x: 24,   y: 56, width: 280, height: 300 },
    'view.project':    { x: 24,   y: 56, width: 280, height: 320 },
    'legacy-world.inspector': { x: 24,   y: 56, width: 320, height: 420 },
    'legacy-world.assets':    { x: 360,  y: 56, width: 280, height: 360 },
    'legacy-world.outliner':  { x: 660,  y: 56, width: 240, height: 360 },
}

const buildWindowStateFromNode = (node, index = 0) => {
    const def = WINDOW_DEFAULT_POSITIONS[node.typeId] || { x: 96, y: 140, width: 360, height: 280 }
    const frame = node.values?.frame || {}
    const hasSavedPos = frame.x != null && frame.y != null
    const cascadeOffset = hasSavedPos ? 0 : index * 32
    return {
        id: node.id,
        title: frame.title || node.values?.title || node.label,
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
        <div className="beta-browser-panel-window">
            <div className="beta-browser-panel-bar">
                <strong>{title}</strong>
                <span>{url}</span>
            </div>
            <iframe
                title={title}
                src={url}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
            />
        </div>
    )
}

export default function BetaEditor({
    projectId,
    spaceId = DEFAULT_PROJECT_SPACE_ID,
    localStorageKey = ''
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
    const [outlinerOpen, setOutlinerOpen] = useState(false)
    const [outlinerFrame, setOutlinerFrame] = useState({ x: 24, y: 56, width: 240, height: 360, zIndex: 20, minimized: false, pinned: false })
    const [isWorldFullscreen, setIsWorldFullscreen] = useState(false)
    const [isWorldOverlay, setIsWorldOverlay] = useState(false)
    const [navStack, setNavStack] = useState([null])

    const initialStoreState = useMemo(() => {
        if (projectId || !localStorageKey) return undefined
        const savedDocument = readLocalWorkspaceDocument(localStorageKey)
        return savedDocument ? { document: savedDocument, version: 0 } : undefined
    }, [localStorageKey, projectId])

    const store = useProjectStore(initialStoreState)
    const { state, dispatch } = store
    const projectSync = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'beta-client',
        opIdPrefix: 'beta-op'
    })
    const { applyLocalOps: _applyLocalOps } = projectSync
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: 'dii.beta.displayName',
        userIdStorageKey: 'dii.beta.userId',
        anonymousLabel: 'Beta',
        userIdPrefix: 'beta-user'
    })
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
    const historyRef = useRef([])
    const redoRef = useRef([])
    const documentRef = useRef(state.document)
    useEffect(() => { documentRef.current = state.document }, [state.document])

    const applyLocalOps = useCallback((ops, options) => {
        const arr = Array.isArray(ops) ? ops : [ops]
        if (arr.some(op => op.type !== 'setWorkspaceState')) {
            historyRef.current = [...historyRef.current.slice(-49), documentRef.current]
            redoRef.current = []
        }
        return _applyLocalOps(ops, options)
    }, [_applyLocalOps])

    const document = state.document
    const isLocalWorkspace = !projectId
    const resolvedSpaceId = spaceId || document.projectMeta?.spaceId || DEFAULT_PROJECT_SPACE_ID
    const entities = document.entities || []
    const nodes = useMemo(() => document.nodes || [], [document.nodes])
    const workspaceState = document.workspaceState || {}
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const selectedNode = nodes.find((node) => node.id === workspaceState.selectedNodeId) || null
    const authoredNodes = nodes
    const viewNodes = useMemo(
        () => nodes.filter(isPanelNode),
        [nodes]
    )
    const activeSurface = workspaceState.activeSurface || 'graph'
    const workflow = getSurfaceWorkflow(activeSurface)
    const visibleViewNodes = useMemo(
        () => viewNodes.filter((node) => node.values?.frame?.visible !== false),
        [viewNodes]
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
    const currentScopeId = navStack[navStack.length - 1]
    // Panel nodes float as windows; graph cards are non-panel, non-context nodes in the current scope
    const graphCardNodes = useMemo(
        () => nodes.filter((node) => {
            if (getNodeType(node.typeId)?.render === 'panel-2d') return false
            if (node.typeId === 'universe.node0') return false  // topbar is node0's presence
            return (node.parentId || null) === currentScopeId
        }),
        [nodes, currentScopeId]
    )
    const surfaceNodeCount = authoredNodes.length
    const hasAnyNodes = surfaceNodeCount > 0
    const hasNodeZero = useMemo(
        () => authoredNodes.some((node) => node.typeId === 'universe.node0'),
        [authoredNodes]
    )
    const createdNodesExcludingNodeZero = useMemo(
        () => authoredNodes.filter((node) => node.typeId !== 'universe.node0'),
        [authoredNodes]
    )
    const hasGraphNodes = createdNodesExcludingNodeZero.length > 0
    const worldNode = useMemo(
        () => authoredNodes.find((node) => node.typeId === 'universe.world') || null,
        [authoredNodes]
    )
    const hasWorldNode = Boolean(worldNode)
    const topbarLocationText = useMemo(() => {
        if (!hasNodeZero) return 'Double-click to place Node 0'
        if (!hasGraphNodes && !hasWorldNode) return 'Double-click to place your first node'
        return workflow.title
    }, [hasGraphNodes, hasNodeZero, hasWorldNode, workflow.title])

    useEffect(() => {
        if (hasAnyNodes) return
        setIsWorldFullscreen(false)
        setIsWorldOverlay(false)
        setOutlinerOpen(false)
        setNavStack([null])
    }, [hasAnyNodes])

    useEffect(() => {
        if (!hasWorldNode) {
            setIsWorldFullscreen(false)
            setIsWorldOverlay(false)
        }
    }, [hasWorldNode])

    // Auto-enter Node 0's scope on load or when it first appears
    useEffect(() => {
        if (!hasNodeZero) return
        const node0 = authoredNodes.find((n) => n.typeId === 'universe.node0')
        if (node0) setNavStack((prev) => prev.includes(node0.id) ? prev : [null, node0.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasNodeZero])

    // Truncate navStack when a scoped node is deleted — prevents ghost scope
    useEffect(() => {
        const nodeIds = new Set(authoredNodes.map((n) => n.id))
        setNavStack((prev) => {
            const cutAt = prev.findIndex((id) => id !== null && !nodeIds.has(id))
            if (cutAt === -1) return prev
            const next = prev.slice(0, cutAt)
            return next.length > 0 ? next : [null]
        })
    }, [authoredNodes])

    useEffect(() => {
        if (!isLocalWorkspace || !localStorageKey) return
        writeLocalWorkspaceDocument(localStorageKey, document)
    }, [document, isLocalWorkspace, localStorageKey])

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
        if (node.typeId === 'universe.world') setIsWorldFullscreen(true)
        setNavStack((prev) => [...prev, nodeId])
    }, [authoredNodes])

    const handleNavigateToScope = useCallback((targetIndex) => {
        setNavStack((prev) => {
            const next = prev.slice(0, targetIndex + 1)
            const newScopeId = next[next.length - 1]
            if (worldNode && newScopeId !== worldNode.id) setIsWorldFullscreen(false)
            return next
        })
    }, [worldNode])

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

    const openPalette = (surface, placement = null) => {
        setPaletteState({
            open: true,
            surface,
            placement
        })
    }

    const buildNodeValues = (definitionId, params, place) => {
        const type = getNodeType(definitionId)
        const render = type?.render || 'hidden'
        const values = { ...(params || {}) }
        if (render === 'spatial-3d' && place?.point) {
            const liftY = definitionId === 'geom.cube' ? 0.5 : 1.2
            values.position = [
                place.point[0] || 0,
                Math.max(liftY, (place.point[1] || 0) + liftY),
                place.point[2] || 0
            ]
        }
        if (render === 'panel-2d') {
            const isWorldNode = definitionId === 'universe.world'
            const defaultW = isWorldNode ? 680 : 360
            const defaultH = isWorldNode ? 480 : 280
            const defaultX = isWorldNode
                ? Math.max(16, (place?.clientX ?? 400) - 340)
                : ((place?.clientX ?? 280) - 180)
            values.frame = {
                x: defaultX,
                y: Math.max(workspaceTop + 24, (place?.clientY ?? (workspaceTop + 180)) - 36),
                width: defaultW,
                height: defaultH,
                zIndex: topZIndex + 1,
                title: params?.title || type?.label || definitionId,
                visible: true
            }
        }
        return values
    }

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
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps([
            { type: 'createNode', payload: { node: nextNode } },
            { type: 'setWorkspaceState', payload: { patch: workspacePatch } }
        ], { activityMessage: `Created ${definition.label}.` })
        setPaletteState({ open: false, surface: paletteState.surface, placement: null })
    }

    const handleStartFromNodeZero = (placement = null) => {
        const existing = authoredNodes.find((node) => node.typeId === 'universe.node0')
        if (existing) {
            if (!navStack.includes(existing.id)) setNavStack([null, existing.id])
            return
        }

        const graphX = (placement?.graphX ?? placement?.clientX ?? 200) - (ROOT_WORLD_CARD_WIDTH / 2)
        const graphY = Math.max(20, (placement?.graphY ?? placement?.clientY ?? (workspaceTop + 160)) - (ROOT_WORLD_CARD_HEIGHT / 2))
        const placementForValues = {
            clientX: placement?.clientX ?? 220,
            clientY: placement?.clientY ?? (workspaceTop + 160)
        }

        const node = createNode('universe.node0', {
            graphX,
            graphY,
            values: buildNodeValues('universe.node0', {
                title: 'Node 0'
            }, placementForValues)
        })
        if (!node) return

        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps([
            { type: 'createNode', payload: { node } },
            {
                type: 'setWorkspaceState',
                payload: {
                    patch: {
                        activeSurface: 'graph',
                        selectedNodeId: null
                    }
                }
            }
        ], { activityMessage: 'Created Node 0.' })
        // Enter Node 0's interior — canvas becomes its world
        setNavStack([null, node.id])
    }

    const handleWorldSurfaceDoubleClick = (placement) => {
        openPalette('world', placement)
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

    const hostInspector = (
        <aside className="beta-selection-scaffold" style={{ top: workflowHeight + 'px' }}>
            <PropertyInspector
                title={inspectorTitle}
                subtitle={inspectorSubtitle}
                sections={inspectorSections}
                values={inspectorValues}
                assetOptions={document.assets || []}
                onSectionChange={handleInspectorChange}
                emptyMessage="Double-click the world or the view to start authoring."
            />
        </aside>
    )

    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
    const graphContext = useMemo(() => createNodeGraphContext(document), [document])

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
                    onEnterFullscreen={() => setIsWorldFullscreen(true)}
                    onEnterOverlay={() => {
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
        return <TextPanelWindow node={node} values={resolvedValues} />
    }

    const visibleSelection = Boolean(surfaceSelectedNode || surfaceSelectedEntity)

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
            if (isUndo && historyRef.current.length > 0) {
                redoRef.current = [...redoRef.current.slice(-49), documentRef.current]
                const prev = historyRef.current.at(-1)
                historyRef.current = historyRef.current.slice(0, -1)
                dispatch({ type: 'replace-document', document: prev, version: state.version })
            } else if (isRedo && redoRef.current.length > 0) {
                historyRef.current = [...historyRef.current.slice(-49), documentRef.current]
                const next = redoRef.current.at(-1)
                redoRef.current = redoRef.current.slice(0, -1)
                dispatch({ type: 'replace-document', document: next, version: state.version })
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [dispatch, handleNavigateToScope, navStack.length, state.version])

    const handleMoveWorldNode = (nodeId, nextPosition) => {
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { values: { position: nextPosition } } }
        })
    }

    const workspaceTitle = isLocalWorkspace ? 'Blank White Workspace' : (document.projectMeta?.title || 'Beta Project')
    const graphTopInset = hasNodeZero ? workspaceTop : 0

    return (
        <main className="beta-editor-shell">
            <header className={`beta-topbar${hasNodeZero ? ' is-seeded' : ''}`} ref={topbarRef}>
                {hasNodeZero && (
                    <>
                        <div className="beta-topbar-left">
                            <button type="button" className="beta-topbar-back" onClick={() => {
                                navigateToBetaPath(buildBetaProjectsPath(resolvedSpaceId))
                            }}>
                                ← {isLocalWorkspace ? 'Projects' : 'Hub'}
                            </button>
                            <span className="beta-topbar-name" title={workspaceTitle}>{workspaceTitle}</span>
                        </div>
                        <div className="beta-topbar-center">
                            {navStack.length > 1 ? (
                                <nav className="beta-topbar-breadcrumb" aria-label="Node scope">
                                    <button type="button" className="beta-topbar-crumb" onClick={() => handleNavigateToScope(0)}>◈</button>
                                    {navStack.slice(1).map((scopeId, i) => {
                                        const crumbNode = authoredNodes.find((n) => n.id === scopeId)
                                        const stackIndex = i + 1
                                        const isLast = stackIndex === navStack.length - 1
                                        return (
                                            <span key={scopeId} className="beta-topbar-crumb-group">
                                                <span className="beta-topbar-crumb-sep">›</span>
                                                <button
                                                    type="button"
                                                    className={`beta-topbar-crumb${isLast ? ' is-current' : ''}`}
                                                    onClick={() => handleNavigateToScope(stackIndex)}
                                                >
                                                    {crumbNode?.label || 'Node'}
                                                </button>
                                            </span>
                                        )
                                    })}
                                </nav>
                            ) : hasNodeZero ? (
                                <nav className="beta-topbar-breadcrumb" aria-label="Node scope">
                                    <button type="button" className="beta-topbar-crumb is-current">◈</button>
                                    <span className="beta-topbar-crumb-group">
                                        <span className="beta-topbar-crumb-sep">›</span>
                                        <button type="button" className="beta-topbar-crumb" onClick={() => handleStartFromNodeZero()}>Node 0</button>
                                    </span>
                                </nav>
                            ) : (
                                <span className="beta-topbar-location" aria-live="polite">{topbarLocationText}</span>
                            )}
                            {hasWorldNode && (
                                <div className="beta-topbar-windows">
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
                        <div className="beta-topbar-right">
                            <button type="button" className="beta-topbar-help-action" onClick={() => setHelpOpen(true)}>
                                Help
                            </button>
                            <div className="beta-topbar-scale-control">
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
                                    className={`beta-topbar-node-count${outlinerOpen ? ' is-active' : ''}`}
                                    onClick={() => setOutlinerOpen((v) => !v)}
                                    title="Toggle outliner"
                                    aria-label={`${surfaceNodeCount} nodes`}
                                >
                                    {surfaceNodeCount} {surfaceNodeCount === 1 ? 'node' : 'nodes'}
                                </button>
                            )}
                            <div className="beta-topbar-overflow">
                                <button type="button" className="beta-topbar-overflow-btn" onClick={() => setOverflowOpen((v) => !v)}>⋯</button>
                                {overflowOpen && (
                                    <div className="beta-topbar-overflow-menu">
                                        <button type="button" onClick={() => { handleStartFromNodeZero(); setOverflowOpen(false) }}>Node 0</button>
                                        <button type="button" onClick={() => { handleCreateStreamingPrototype(); setOverflowOpen(false) }}>Streaming Prototype</button>
                                        {isLocalWorkspace && (
                                            <button type="button" onClick={() => { handleResetLocalWorkspace(); setOverflowOpen(false) }}>Reset Workspace</button>
                                        )}
                                        {presence.users.length > 0 && presence.users.map((user) => (
                                            <span key={user.socketId || user.userId} className="beta-user-pill">
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

            {state.loading ? <div className="beta-overlay-message">Loading project…</div> : null}
            {state.loadError ? <div className="beta-overlay-message is-error">{state.loadError}</div> : null}
            {visibleSelection && (
                <button type="button" className="beta-delete-fab" onClick={handleDeleteSelected}>
                    Delete
                </button>
            )}

            <section className={`beta-surface-shell${isWorldOverlay && !isWorldFullscreen ? ' is-world-overlay' : ''}${navStack.length > 1 ? ' is-inside-node' : ''}`}>
                {/* Graph is the primary surface — always visible */}
                <BetaGraphSurface
                    key={currentScopeId || 'root'}
                    topInset={graphTopInset}
                    nodes={graphCardNodes}
                    emptyHint={hasNodeZero ? 'Double-click to place your first node.' : 'Cursor is material. Double-click to place Node 0.'}
                    edges={document.edges || []}
                    selectedNodeId={workspaceState.selectedNodeId}
                    onEnterNode={handleEnterNode}
                    onSelectNode={selectNode}
                    onCreateEdge={(payload) => applyLocalOps({
                        type: 'createEdge',
                        payload: { edge: payload }
                    })}
                    onDeleteEdge={(edgeId) => applyLocalOps({
                        type: 'deleteEdge',
                        payload: { edgeId }
                    })}
                    onDeleteNode={(nodeId) => applyLocalOps([
                        { type: 'deleteNode', payload: { nodeId } },
                        { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } }
                    ], { activityMessage: 'Deleted node.', activityLevel: 'warning' })}
                    onMoveNode={(nodeId, nextX, nextY) => applyLocalOps({
                        type: 'updateNode',
                        payload: { nodeId, patch: { graphX: nextX, graphY: nextY } }
                    })}
                    onDoubleClick={(placement) => {
                        if (!hasNodeZero) {
                            handleStartFromNodeZero(placement)
                            return
                        }
                        if (currentScopeId === null) {
                            handleStartFromNodeZero()
                            return
                        }
                        openPalette('graph', placement)
                    }}
                />
                {/* Panel nodes float above the graph as viewport-fixed windows */}
                {visibleViewNodes.map((node, index) => {
                    const windowState = buildWindowStateFromNode(node, index)
                    return (
                        <DesktopWindow
                            key={node.id}
                            windowState={windowState}
                            title={windowState.title}
                            kicker={node.typeId}
                            allowOverflowLeft
                            allowOverflowTop
                            onFocus={() => {
                                selectNode(node.id)
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
                        >
                            {renderViewNodeContent(node)}
                        </DesktopWindow>
                    )
                })}
            </section>

            {/* Fullscreen world — takes over the full viewport */}
            {hasWorldNode && isWorldFullscreen && (
                <div className="beta-world-fullscreen" style={{ top: `${workspaceTop}px` }}>
                    <BetaViewport
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
                    />
                </div>
            )}

            {/* Overlay world — 3D scene renders behind the graph */}
            {hasWorldNode && isWorldOverlay && !isWorldFullscreen && (
                <div className="beta-world-overlay">
                    <BetaViewport
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

            <BetaHelpDialog
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
            />

        </main>
    )
}
