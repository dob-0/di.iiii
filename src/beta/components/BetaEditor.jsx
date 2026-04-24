import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import BetaViewport from './BetaViewport.jsx'
import BetaGraphSurface from './BetaGraphSurface.jsx'
import OpCreateDialog from './OpCreateDialog.jsx'
import NodePalette from './NodePalette.jsx'
import { useProjectStore } from '../../project/state/projectStore.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { getInspectorSections } from '../../project/entityRegistry.js'
import { createEdge, createNode, getNodeType } from '../../project/nodeRegistry.js'

const getNodeRender = (node) => getNodeType(node?.typeId)?.render || 'hidden'
const isPanelNode = (node) => getNodeRender(node) === 'panel-2d'

const portToInspectorField = (port) => {
    const label = port.label || port.id
    const path = [port.id]
    if (port.type === 'color') return { label, path, type: 'color', portType: 'color' }
    if (port.type === 'boolean') return { label, path, type: 'checkbox', portType: 'boolean' }
    if (port.type === 'number') return { label, path, type: 'number', min: port.min, max: port.max, step: port.step, portType: 'number' }
    if (port.type === 'string') {
        const isMultiline = port.id === 'body' || port.id === 'text'
        return { label, path, type: isMultiline ? 'textarea' : 'text', portType: 'string' }
    }
    if (port.type === 'vec3') return { label, path, type: 'vec3', portType: 'vec3' }
    if (port.type === 'geometry' || port.type === 'texture' || port.type === 'signal') {
        return { label, path, type: 'connection', portType: port.type }
    }
    return { label, path, type: 'text', portType: port.type || 'any' }
}

const deriveInspectorSections = (node) => {
    if (!node) return []
    const typeId = node.typeId || node.definitionId
    const type = getNodeType(typeId)
    const ports = type?.isNull
        ? (node.values?.portDefs || []).filter((p) => p.dir === 'in')
        : (type?.inputs || [])
    if (!ports.length) return []
    const fields = ports.map(portToInspectorField).filter(Boolean)
    if (!fields.length) return []
    return [{ id: 'values', label: 'Ports', fields }]
}
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
const VIEW_DOUBLE_CLICK_IGNORE_SELECTOR = [
    '.beta-topbar',
    '.beta-window',
    '.beta-op-create-backdrop',
    '.beta-selection-scaffold',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    'iframe'
].join(',')

const WINDOW_DEFAULT_POSITIONS = {
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

function TextPanelWindow({ node }) {
    return (
        <div className="beta-window-stack">
            <h4>{node.values?.title || node.label}</h4>
            <p>{node.values?.text || 'This panel is ready for authored UI.'}</p>
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
    const [createDialogState, setCreateDialogState] = useState({
        open: false,
        surface: 'world',
        placement: null
    })
    const [paletteState, setPaletteState] = useState({
        open: false,
        surface: 'world',
        placement: null
    })
    const [overflowOpen, setOverflowOpen] = useState(false)

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
    const { applyLocalOps } = projectSync
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: 'dii.beta.displayName',
        userIdStorageKey: 'dii.beta.userId',
        anonymousLabel: 'Beta',
        userIdPrefix: 'beta-user'
    })
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
    const visibleViewNodes = useMemo(
        () => viewNodes.filter((node) => node.values?.frame?.visible !== false),
        [viewNodes]
    )
    const topZIndex = useMemo(
        () => Math.max(6, ...visibleViewNodes.map((node) => node.values?.frame?.zIndex || 1)),
        [visibleViewNodes]
    )

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
            payload: {
                patch: {
                    selectedNodeId: null
                }
            }
        })
    }

    const clearSelection = () => {
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: {
                patch: {
                    selectedNodeId: null
                }
            }
        })
    }

    const handleInspectorChange = (component, nextComponentValue) => {
        if (selectedNode) {
            const patch = { [component]: nextComponentValue }
            if (component === 'values') patch.params = nextComponentValue
            applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: selectedNode.id,
                    patch
                }
            })
            return
        }

        if (selectedEntity) {
            applyLocalOps({
                type: 'updateComponent',
                payload: {
                    entityId: selectedEntity.id,
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

    const handleDeleteSelected = () => {
        if (selectedNode) {
            applyLocalOps([
                {
                    type: 'deleteNode',
                    payload: { nodeId: selectedNode.id }
                },
                {
                    type: 'setWorkspaceState',
                    payload: { patch: { selectedNodeId: null } }
                }
            ], { activityMessage: `Deleted ${selectedNode.label}.`, activityLevel: 'warning' })
            return
        }
        if (!selectedEntity) return
        applyLocalOps({
            type: 'deleteEntity',
            payload: { entityId: selectedEntity.id }
        }, { activityMessage: `Deleted ${selectedEntity.name}.`, activityLevel: 'warning' })
        dispatch({ type: 'select-entity', entityId: null })
    }

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

    const inspectorSections = selectedNode
        ? deriveInspectorSections(selectedNode)
        : (selectedEntity
            ? getInspectorSections(selectedEntity)
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

    const inspectorValues = selectedNode
        ? { values: { ...(selectedNode.values || {}) } }
        : (selectedEntity ? selectedEntity.components : { worldState: document.worldState })
    const inspectorTitle = selectedNode ? selectedNode.label : (selectedEntity ? selectedEntity.name : 'World')
    const inspectorSubtitle = selectedNode ? selectedNode.typeId : (selectedEntity ? selectedEntity.type : 'Scene defaults')

    const openCreateDialog = (surface, placement = null) => {
        setCreateDialogState({
            open: true,
            surface,
            placement
        })
    }

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
            values.frame = {
                x: Math.max(24, (place?.clientX || 280) - 180),
                y: Math.max(workspaceTop + 24, (place?.clientY || (workspaceTop + 180)) - 36),
                width: 360,
                height: 280,
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
            graphX: Math.max(20, (place.clientX || 280) - (ROOT_WORLD_CARD_WIDTH / 2)),
            graphY: Math.max(workspaceTop + 12, (place.clientY || (workspaceTop + 160)) - (ROOT_WORLD_CARD_HEIGHT / 2))
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

    const handleStartFromNodeZero = () => {
        const existing = authoredNodes.find((node) => node.typeId === 'universe.node0')
        if (existing) {
            dispatch({ type: 'select-entity', entityId: null })
            applyLocalOps({
                type: 'setWorkspaceState',
                payload: {
                    patch: {
                        activeSurface: 'graph',
                        selectedNodeId: existing.id
                    }
                }
            }, { activityMessage: 'Focused Node 0.' })
            return
        }

        const node = createNode('universe.node0', {
            graphX: 120,
            graphY: workspaceTop + 84,
            values: buildNodeValues('universe.node0', {
                title: 'Node 0'
            }, {
                clientX: 220,
                clientY: workspaceTop + 160
            })
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
                        selectedNodeId: node.id
                    }
                }
            }
        ], { activityMessage: 'Created Node 0.' })
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

    const activateSurface = (surface) => {
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { activeSurface: surface } }
        })
    }

    const handleCreateNode = ({ definition, params, openGraph = false }) => {
        if (!definition) return
        const existingSingleton = definition.singleton
            ? authoredNodes.find((node) => node.typeId === definition.id)
            : null
        const placement = createDialogState.placement || {}
        const nextSurface = openGraph ? 'graph' : definition.surface
        const ops = []
        let selectedNodeId = existingSingleton?.id || null

        if (existingSingleton) {
            const nextValues = { ...(existingSingleton.values || {}), ...(params || {}) }
            if (definition.surface === 'view') {
                const prevFrame = existingSingleton.values?.frame || {}
                nextValues.frame = {
                    ...prevFrame,
                    visible: true,
                    x: placement.clientX ? Math.max(24, placement.clientX - 180) : (prevFrame.x || 96),
                    y: placement.clientY ? Math.max(workspaceTop + 24, placement.clientY - 36) : (prevFrame.y || 140),
                    zIndex: topZIndex + 1,
                    title: params?.title || prevFrame.title || existingSingleton.label
                }
            }
            ops.push({
                type: 'updateNode',
                payload: { nodeId: existingSingleton.id, patch: { values: nextValues } }
            })
        } else {
            const values = buildNodeValues(definition.id, params, placement)
            const nextNode = createNode(definition.id, { values })
            if (!nextNode) return
            selectedNodeId = nextNode.id
            ops.push({ type: 'createNode', payload: { node: nextNode } })
        }

        ops.push({
            type: 'setWorkspaceState',
            payload: { patch: { selectedNodeId, activeSurface: nextSurface } }
        })

        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps(ops, { activityMessage: `Created ${definition.label} node.` })
        setCreateDialogState({ open: false, surface: 'world', placement: null })
    }

    const hostInspector = (
        <aside className="beta-selection-scaffold">
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

    const renderViewNodeContent = (node) => {
        if (node.typeId === 'view.browser') {
            return <BrowserPanelWindow node={node} />
        }
        return <TextPanelWindow node={node} />
    }

    const visibleSelection = Boolean(selectedNode || selectedEntity)
    const activeSurface = workspaceState.activeSurface || 'graph'

    const handleMoveWorldNode = (nodeId, nextPosition) => {
        applyLocalOps({
            type: 'updateNode',
            payload: { nodeId, patch: { values: { position: nextPosition } } }
        })
    }

    const workspaceTitle = isLocalWorkspace ? 'Blank White Workspace' : (document.projectMeta?.title || 'Beta Project')

    return (
        <main
            className={`beta-editor-shell beta-editor-shell-${activeSurface}`}
            onDoubleClick={(event) => {
                if (activeSurface !== 'view') return
                if (event.target?.closest?.(VIEW_DOUBLE_CLICK_IGNORE_SELECTOR)) return
                openPalette('view', {
                    clientX: event.clientX,
                    clientY: event.clientY
                })
            }}
        >
            <header className="beta-topbar" ref={topbarRef}>
                <div className="beta-topbar-left">
                    <button type="button" className="beta-topbar-back" onClick={() => {
                        navigateToBetaPath(buildBetaProjectsPath(resolvedSpaceId))
                    }}>
                        ← {isLocalWorkspace ? 'Projects' : 'Hub'}
                    </button>
                    <span className="beta-topbar-name" title={workspaceTitle}>{workspaceTitle}</span>
                </div>
                <div className="beta-topbar-surfaces">
                    <button type="button" className={activeSurface === 'world' ? 'is-active' : ''} onClick={() => activateSurface('world')}>World</button>
                    <button type="button" className={activeSurface === 'view' ? 'is-active' : ''} onClick={() => activateSurface('view')}>View</button>
                    <button type="button" className={activeSurface === 'graph' ? 'is-active' : ''} onClick={() => activateSurface('graph')}>Graph</button>
                </div>
                <div className="beta-topbar-right">
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
                    {authoredNodes.length > 0 && (
                        <span className="beta-topbar-node-count">{authoredNodes.length} nodes</span>
                    )}
                    <div className="beta-topbar-overflow">
                        <button type="button" className="beta-topbar-overflow-btn" onClick={() => setOverflowOpen((v) => !v)}>⋯</button>
                        {overflowOpen && (
                            <div className="beta-topbar-overflow-menu">
                                <button type="button" onClick={() => { openCreateDialog('world'); setOverflowOpen(false) }}>Add World Node</button>
                                <button type="button" onClick={() => { openCreateDialog('view'); setOverflowOpen(false) }}>Add View Node</button>
                                <button type="button" onClick={() => { handleStartFromNodeZero(); setOverflowOpen(false) }}>Start From Node 0</button>
                                <button type="button" onClick={() => { handleCreateStreamingPrototype(); setOverflowOpen(false) }}>Create Streaming Prototype</button>
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
            </header>

            {state.loading ? <div className="beta-overlay-message">Loading project…</div> : null}
            {state.loadError ? <div className="beta-overlay-message is-error">{state.loadError}</div> : null}
            {(selectedEntity || selectedNode) && (
                <button type="button" className="beta-delete-fab" onClick={handleDeleteSelected}>
                    Delete
                </button>
            )}

            <section className="beta-surface-shell" style={{ paddingTop: `${workspaceTop}px` }}>
                {activeSurface === 'graph' ? (
                    <BetaGraphSurface
                        nodes={nodes}
                        edges={document.edges || []}
                        selectedNodeId={workspaceState.selectedNodeId}
                        onSelectNode={selectNode}
                        onCreateEdge={(payload) => applyLocalOps({
                            type: 'createEdge',
                            payload: { edge: payload }
                        })}
                        onDeleteNode={(nodeId) => applyLocalOps([
                            { type: 'deleteNode', payload: { nodeId } },
                            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } }
                        ], { activityMessage: 'Deleted node.', activityLevel: 'warning' })}
                        onDoubleClick={(placement) => openPalette('graph', placement)}
                    />
                ) : null}

                {activeSurface === 'world' ? (
                    <BetaViewport
                        document={document}
                        selectedEntityId={state.selectedEntityId}
                        selectedNodeId={workspaceState.selectedNodeId}
                        onSelectEntity={selectEntity}
                        onSelectNode={selectNode}
                        onClearSelection={clearSelection}
                        onWorldDoubleClick={(placement) => openPalette('world', placement)}
                        onMoveNode={handleMoveWorldNode}
                        cursors={presence.cursors}
                        onCursorMove={presence.emitCursor}
                        onCursorLeave={presence.clearCursor}
                        nodeScale={nodeScale}
                    />
                ) : null}

                {activeSurface === 'view' ? (
                    <section
                        className="beta-view-surface"
                        onDoubleClick={(event) => {
                            if (event.target?.closest?.(VIEW_DOUBLE_CLICK_IGNORE_SELECTOR)) return
                            openPalette('view', { clientX: event.clientX, clientY: event.clientY })
                        }}
                    >
                        {!visibleViewNodes.length ? (
                            <div className="beta-empty-view-state">
                                <h2>Blank view.</h2>
                                <p>Double-click to add a node.</p>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {activeSurface === 'view' ? visibleViewNodes.map((node, index) => {
                    const windowState = buildWindowStateFromNode(node, index)
                    return (
                        <DesktopWindow
                            key={node.id}
                            windowState={windowState}
                            title={windowState.title}
                            minTop={workspaceTop}
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
                }) : null}
            </section>

            {visibleSelection && activeSurface !== 'view' ? hostInspector : null}

            <NodePalette
                open={paletteState.open}
                surface={paletteState.surface}
                placement={paletteState.placement}
                onClose={() => setPaletteState({ open: false, surface: 'world', placement: null })}
                onCreate={handlePaletteCreate}
            />

            <OpCreateDialog
                open={createDialogState.open}
                surface={createDialogState.surface}
                onClose={() => setCreateDialogState({ open: false, surface: 'world', placement: null })}
                onCreate={handleCreateNode}
            />
        </main>
    )
}
