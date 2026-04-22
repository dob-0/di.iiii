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
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import {
    createNodeFromDefinition,
    getNodeInspectorSections
} from '../../project/nodeRegistry.js'
import { buildBetaProjectsPath, navigateToBetaPath } from '../utils/betaRouting.js'
import { DEFAULT_PROJECT_SPACE_ID, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { getWorkspaceTopInset } from '../utils/windowLayout.js'
import { detectEntityTypeForAsset } from '../../utils/mediaAssetTypes.js'
import {
    clearLocalWorkspaceDocument,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument
} from '../utils/localWorkspaceStorage.js'
import {
    detectDeviceType,
    getDefaultNodeScale,
    getAvailableScales,
    getDensityFromScale
} from '../utils/deviceDetection.js'

const DISPLAY_NAME_KEY = 'dii.beta.displayName'
const NODE_SCALE_KEY = 'dii.beta.nodeScale'
const ROOT_WORLD_CARD_WIDTH = 160
const ROOT_WORLD_CARD_HEIGHT = 120
const STUDIO_PRINTER_PROFILES_KEY = 'dii.studio.printerProfiles'
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

const getStarterPlacement = (count = 0) => [((count % 4) - 1.5) * 1.4, 0, Math.floor(count / 4) * -1.8]

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
    const def = WINDOW_DEFAULT_POSITIONS[node.definitionId] || { x: 96, y: 140, width: 360, height: 280 }
    // Cascade x/y when frame hasn't been explicitly positioned yet
    const hasSavedPos = node.frame?.x != null && node.frame?.y != null
    const cascadeOffset = hasSavedPos ? 0 : index * 32
    return {
        id: node.id,
        title: node.frame?.title || node.params?.title || node.label,
        x: (node.frame?.x ?? def.x) + cascadeOffset,
        y: (node.frame?.y ?? def.y) + cascadeOffset,
        width: node.frame?.width || def.width,
        height: node.frame?.height || def.height,
        zIndex: node.frame?.zIndex || 6,
        visible: node.frame?.visible !== false,
        minimized: Boolean(node.frame?.minimized),
        pinned: Boolean(node.frame?.pinned)
    }
}

function BetaAssetsWindow({ assets, onUploadAssets, onCreateEntity, canUploadAssets = true }) {
    return (
        <div className="beta-window-stack">
            {canUploadAssets ? (
                <label className="beta-file-button">
                    <input type="file" multiple onChange={(event) => {
                        const files = Array.from(event.target.files || [])
                        onUploadAssets?.(files)
                        event.target.value = ''
                    }} />
                    Import Image / Video / Audio / Model
                </label>
            ) : (
                <div className="beta-empty-state">
                    <strong>Blank root mode</strong>
                    <p>Open a saved space project when you want uploads and shared assets.</p>
                </div>
            )}
            <div className="beta-primitive-row">
                {['box', 'sphere', 'cone', 'cylinder', 'text'].map((type) => (
                    <button key={type} type="button" onClick={() => onCreateEntity(type)}>{type}</button>
                ))}
            </div>
            <div className="beta-assets-list">
                {assets.length ? assets.map((asset) => (
                    <button key={asset.id} type="button" className="beta-asset-row" onClick={() => onCreateEntity(detectEntityTypeForAsset(asset), asset)}>
                        <strong>{asset.name}</strong>
                        <span>{asset.mimeType}</span>
                    </button>
                )) : <p className="beta-empty-state">No imported assets yet.</p>}
            </div>
        </div>
    )
}

function BetaOutlinerWindow({
    entities,
    nodes,
    selectedEntityId,
    selectedNodeId,
    onSelectEntity,
    onSelectNode
}) {
    const visibleNodes = nodes.filter((node) => !['core.project', 'world.root', 'view.root'].includes(node.definitionId))

    return (
        <ul className="beta-outliner">
            {visibleNodes.map((node) => (
                <li key={node.id}>
                    <button type="button" className={node.id === selectedNodeId ? 'is-active' : ''} onClick={() => onSelectNode(node.id)}>
                        <strong>{node.label}</strong>
                        <span>{node.definitionId}</span>
                    </button>
                </li>
            ))}
            {entities.map((entity) => (
                <li key={entity.id}>
                    <button type="button" className={entity.id === selectedEntityId ? 'is-active' : ''} onClick={() => onSelectEntity(entity.id)}>
                        <strong>{entity.name}</strong>
                        <span>{entity.type}</span>
                    </button>
                </li>
            ))}
            {!visibleNodes.length && !entities.length ? <li className="beta-empty-state">No authored nodes or entities yet.</li> : null}
        </ul>
    )
}

function BetaActivityWindow({ activity }) {
    return (
        <div className="beta-activity-list">
            {activity.length ? activity.map((entry) => (
                <article key={entry.id} className={`beta-activity-row is-${entry.level}`}>
                    <strong>{entry.level}</strong>
                    <p>{entry.message}</p>
                </article>
            )) : <p className="beta-empty-state">No project activity yet.</p>}
        </div>
    )
}

function BetaProjectWindow({ document, displayName, onDisplayNameChange, onProjectMetaPatch, onWorldStatePatch }) {
    return (
        <div className="beta-window-stack">
            <label className="beta-property-field">
                <span>Display Name</span>
                <input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
            </label>
            <label className="beta-property-field">
                <span>Project Title</span>
                <input
                    value={document.projectMeta?.title || ''}
                    onChange={(event) => onProjectMetaPatch({ title: event.target.value })}
                />
            </label>
            <label className="beta-property-field">
                <span>Background</span>
                <input
                    type="color"
                    value={document.worldState?.backgroundColor || '#ffffff'}
                    onChange={(event) => onWorldStatePatch({ backgroundColor: event.target.value })}
                />
            </label>
            <label className="beta-property-field beta-checkbox-field">
                <span>Grid Visible</span>
                <input
                    type="checkbox"
                    checked={document.worldState?.gridVisible !== false}
                    onChange={(event) => onWorldStatePatch({ gridVisible: event.target.checked })}
                />
            </label>
        </div>
    )
}

function BrowserPanelWindow({ node }) {
    return (
        <div className="beta-browser-panel-window">
            <div className="beta-browser-panel-bar">
                <strong>{node.params?.title || node.label}</strong>
                <span>{node.params?.url || 'https://example.com'}</span>
            </div>
            <iframe
                title={node.params?.title || node.label}
                src={node.params?.url || 'https://example.com'}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
            />
        </div>
    )
}

function TextPanelWindow({ node }) {
    return (
        <div className="beta-window-stack">
            <h4>{node.params?.title || node.label}</h4>
            <p>{node.params?.text || 'This panel is ready for authored UI.'}</p>
        </div>
    )
}

export default function BetaEditor({
    projectId,
    spaceId = DEFAULT_PROJECT_SPACE_ID,
    localStorageKey = ''
}) {
    const [displayName, setDisplayName] = useState(() => {
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
    const [studioPrinterProfiles, setStudioPrinterProfiles] = useState(() => {
        try {
            const raw = window.localStorage.getItem(STUDIO_PRINTER_PROFILES_KEY)
            const parsed = raw ? JSON.parse(raw) : []
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    })

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
    const rootCanvasRef = useRef(null)
    const [workspaceTop, setWorkspaceTop] = useState(168)
    const [rootDragState, setRootDragState] = useState(null)
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
    const authoredNodes = useMemo(
        () => nodes.filter((node) => !['core.project', 'world.root', 'view.root'].includes(node.definitionId)),
        [nodes]
    )
    const viewNodes = useMemo(
        () => nodes.filter((node) => node.mount?.surface === 'view' && node.frame),
        [nodes]
    )
    const visibleViewNodes = useMemo(
        () => viewNodes.filter((node) => node.frame?.visible !== false),
        [viewNodes]
    )
    const topZIndex = useMemo(
        () => Math.max(6, ...visibleViewNodes.map((node) => node.frame?.zIndex || 1)),
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

    const handleCreateEntity = (type, asset = null) => {
        const entity = createEntityOfType(type, {
            name: asset?.name ? asset.name.replace(/\.[^.]+$/, '') : undefined,
            components: {
                transform: {
                    position: getStarterPlacement(entities.length)
                },
                ...(asset ? {
                    media: {
                        assetId: asset.id,
                        autoplay: type !== 'image',
                        loop: true,
                        muted: type === 'video'
                    }
                } : {})
            }
        })
        applyLocalOps({
            type: 'createEntity',
            payload: { entity }
        }, { activityMessage: `Created ${entity.type} entity.` })
        selectEntity(entity.id)
    }

    const handleUploadAssets = async (files = []) => {
        if (!projectId) {
            dispatch({
                type: 'append-activity',
                level: 'warning',
                message: 'Asset upload is available after you open a saved space project.'
            })
            return
        }
        for (const file of files) {
            const asset = await uploadProjectAsset(projectId, file)
            applyLocalOps({
                type: 'upsertAsset',
                payload: { asset }
            }, { activityMessage: `Imported ${file.name}.` })
            handleCreateEntity(detectEntityTypeForAsset(asset || file), asset)
        }
    }

    const handleInspectorChange = (component, nextComponentValue) => {
        if (selectedNode) {
            applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: selectedNode.id,
                    patch: {
                        [component]: nextComponentValue
                    }
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

    const handleWorldPatch = (patch) => {
        applyLocalOps({
            type: 'setWorldState',
            payload: { patch }
        })
    }

    const handleProjectMetaPatch = (patch) => {
        applyLocalOps({
            type: 'setProjectMeta',
            payload: { patch }
        })
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

    const handleResetCanvasLayout = () => {
        const ops = nodes
            .filter((node) => node.params?.canvasPosition)
            .map((node) => ({
                type: 'updateNode',
                payload: {
                    nodeId: node.id,
                    patch: {
                        params: {
                            ...node.params,
                            canvasPosition: undefined
                        }
                    }
                }
            }))
        if (ops.length) applyLocalOps(...ops)
    }

    const inspectorSections = selectedNode
        ? getNodeInspectorSections(selectedNode).map((section) => {
            if (selectedNode.definitionId !== 'app.printer3d' || section.id !== 'params') return section
            return {
                ...section,
                fields: section.fields.map((field) => {
                    if (field.path?.[0] !== 'studioProfileId') return field
                    return {
                        ...field,
                        options: [
                            { label: 'None', value: '' },
                            ...studioPrinterProfiles.map((profile) => ({
                                label: profile.name || profile.id,
                                value: profile.id
                            }))
                        ]
                    }
                })
            }
        })
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

    const inspectorValues = selectedNode ? selectedNode : (selectedEntity ? selectedEntity.components : { worldState: document.worldState })
    const inspectorTitle = selectedNode ? selectedNode.label : (selectedEntity ? selectedEntity.name : 'World')
    const inspectorSubtitle = selectedNode ? selectedNode.definitionId : (selectedEntity ? selectedEntity.type : 'Scene defaults')
    const selectedPrinterProfile = selectedNode?.definitionId === 'app.printer3d'
        ? studioPrinterProfiles.find((profile) => profile.id === selectedNode.params?.studioProfileId) || null
        : null

    const persistStudioPrinterProfiles = (profiles) => {
        setStudioPrinterProfiles(profiles)
        try {
            window.localStorage.setItem(STUDIO_PRINTER_PROFILES_KEY, JSON.stringify(profiles))
        } catch {
            // ignore
        }
    }

    const handleSavePrinterProfile = () => {
        if (!selectedNode || selectedNode.definitionId !== 'app.printer3d') return
        const existingId = selectedNode.params?.studioProfileId
        const profileId = existingId || `printer-${Date.now()}`
        const profile = {
            id: profileId,
            name: selectedNode.params?.title || selectedNode.params?.model || '3D Printer',
            params: {
                model: selectedNode.params?.model || 'Prusa MK4',
                endpoint: selectedNode.params?.endpoint || '',
                buildVolumeX: Number(selectedNode.params?.buildVolumeX) || 250,
                buildVolumeY: Number(selectedNode.params?.buildVolumeY) || 210,
                buildVolumeZ: Number(selectedNode.params?.buildVolumeZ) || 220,
                defaultMaterial: selectedNode.params?.defaultMaterial || 'PLA',
                nozzleMm: Number(selectedNode.params?.nozzleMm) || 0.4
            }
        }
        const nextProfiles = [
            ...studioPrinterProfiles.filter((item) => item.id !== profileId),
            profile
        ]
        persistStudioPrinterProfiles(nextProfiles)
        applyLocalOps({
            type: 'updateNode',
            payload: {
                nodeId: selectedNode.id,
                patch: {
                    params: {
                        ...(selectedNode.params || {}),
                        studioProfileId: profileId
                    }
                }
            }
        }, { activityMessage: `Saved printer profile ${profile.name}.` })
    }

    const handleLoadPrinterProfile = () => {
        if (!selectedNode || selectedNode.definitionId !== 'app.printer3d') return
        const profileId = selectedNode.params?.studioProfileId
        const profile = studioPrinterProfiles.find((item) => item.id === profileId)
        if (!profile) return
        applyLocalOps({
            type: 'updateNode',
            payload: {
                nodeId: selectedNode.id,
                patch: {
                    params: {
                        ...(selectedNode.params || {}),
                        ...profile.params,
                        studioProfileId: profile.id
                    }
                }
            }
        }, { activityMessage: `Loaded printer profile ${profile.name}.` })
    }

    const enterWorld = (nodeId) => {
        const worldNode = nodes.find((n) => n.id === nodeId)
        const is3d = worldNode?.definitionId === 'world.3d'
        const ops = [
            {
                type: 'setWorkspaceState',
                payload: {
                    patch: {
                        activeWorldId: nodeId,
                        activeSurface: is3d ? 'world' : 'view'
                    }
                }
            }
        ]
        if (is3d) {
            ops.push({
                type: 'setWorldState',
                payload: {
                    patch: {
                        backgroundColor: worldNode?.params?.backgroundColor || '#0a0e16',
                        gridVisible: worldNode?.params?.gridVisible !== false
                    }
                }
            })
        }
        applyLocalOps(ops)
    }

    const exitWorld = () => {
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: { patch: { activeWorldId: null } }
        })
    }

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

    const handlePaletteCreate = ({ definition, params, placement: palettePlace }) => {
        if (!definition) return
        const place = palettePlace || {}
        const fromRootCanvas = paletteState.surface === 'all'
        const isRootNode = definition.surface === 'root'
        const nextSurface = isRootNode ? 'world' : definition.surface
        const rootCardPosition = isRootNode
            ? {
                x: Math.max(20, (place.clientX || 280) - (ROOT_WORLD_CARD_WIDTH / 2)),
                y: Math.max(workspaceTop + 12, (place.clientY || (workspaceTop + 160)) - (ROOT_WORLD_CARD_HEIGHT / 2))
            }
            : null
        const ops = []
        const nextNode = createNodeFromDefinition(definition.id, {
            params: isRootNode
                ? {
                    ...params,
                    canvasPosition: rootCardPosition
                }
                : fromRootCanvas
                    ? {
                        ...params,
                        canvasPosition: {
                            x: Math.max(20, (place.clientX || 280) - (ROOT_WORLD_CARD_WIDTH / 2)),
                            y: Math.max(workspaceTop + 12, (place.clientY || (workspaceTop + 160)) - (ROOT_WORLD_CARD_HEIGHT / 2))
                        }
                    }
                : params,
            spatial: definition.surface === 'world' && definition.mode === 'spatial'
                ? {
                    position: definition.id === 'geom.cube'
                        ? [place.point?.[0] || 0, Math.max(0.5, (place.point?.[1] || 0) + 0.5), place.point?.[2] || 0]
                        : [place.point?.[0] || 0, Math.max(1.2, (place.point?.[1] || 0) + 1.2), place.point?.[2] || 0]
                }
                : undefined,
            frame: definition.surface === 'view'
                ? {
                    x: Math.max(24, (place.clientX || 280) - 180),
                    y: Math.max(workspaceTop + 24, (place.clientY || (workspaceTop + 180)) - 36),
                    zIndex: topZIndex + 1,
                    title: params.title || definition.label
                }
                : undefined
        })
        ops.push({ type: 'createNode', payload: { node: nextNode } })
        if (isRootNode || fromRootCanvas) {
            ops.push({
                type: 'setWorkspaceState',
                payload: {
                    patch: {
                        activeWorldId: null,
                        selectedNodeId: nextNode.id
                    }
                }
            })
        } else {
            ops.push({
                type: 'setWorkspaceState',
                payload: { patch: { selectedNodeId: nextNode.id, activeSurface: nextSurface } }
            })
        }
        dispatch({ type: 'select-entity', entityId: null })
        applyLocalOps(ops, { activityMessage: `Created ${definition.label}.` })
        setPaletteState({ open: false, surface: fromRootCanvas ? 'all' : 'root', placement: null })
    }

    const activateSurface = (surface) => {
        applyLocalOps({
            type: 'setWorkspaceState',
            payload: {
                patch: {
                    activeSurface: surface
                }
            }
        })
    }

    const handleCreateNode = ({ definition, params, openGraph = false }) => {
        if (!definition) return
        const existingSingleton = definition.singleton
            ? authoredNodes.find((node) => node.definitionId === definition.id)
            : null
        const placement = createDialogState.placement || {}
        const nextSurface = openGraph ? 'graph' : definition.surface
        const ops = []
        let selectedNodeId = existingSingleton?.id || null

        if (existingSingleton) {
            const nextPatch = {
                params: {
                    ...(existingSingleton.params || {}),
                    ...params
                }
            }
            if (definition.surface === 'view') {
                nextPatch.frame = {
                    ...(existingSingleton.frame || {}),
                    visible: true,
                    x: placement.clientX ? Math.max(24, placement.clientX - 180) : (existingSingleton.frame?.x || 96),
                    y: placement.clientY ? Math.max(workspaceTop + 24, placement.clientY - 36) : (existingSingleton.frame?.y || 140),
                    zIndex: topZIndex + 1,
                    title: params.title || existingSingleton.params?.title || existingSingleton.label
                }
            }
            ops.push({
                type: 'updateNode',
                payload: {
                    nodeId: existingSingleton.id,
                    patch: nextPatch
                }
            })
        } else {
            const nextNode = createNodeFromDefinition(definition.id, {
                params,
                spatial: definition.surface === 'world' && definition.mode === 'spatial'
                    ? {
                        position: definition.id === 'geom.cube'
                            ? [placement.point?.[0] || 0, Math.max(0.5, (placement.point?.[1] || 0) + 0.5), placement.point?.[2] || 0]
                            : [placement.point?.[0] || 0, Math.max(1.2, (placement.point?.[1] || 0) + 1.2), placement.point?.[2] || 0]
                    }
                    : undefined,
                frame: definition.surface === 'view'
                    ? {
                        x: Math.max(24, (placement.clientX || 280) - 180),
                        y: Math.max(workspaceTop + 24, (placement.clientY || (workspaceTop + 180)) - 36),
                        zIndex: topZIndex + 1,
                        title: params.title || definition.label
                    }
                    : undefined
            })
            selectedNodeId = nextNode.id
            ops.push({
                type: 'createNode',
                payload: { node: nextNode }
            })
        }

        ops.push({
            type: 'setWorkspaceState',
            payload: {
                patch: {
                    selectedNodeId,
                    activeSurface: nextSurface
                }
            }
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
            {selectedNode?.definitionId === 'app.printer3d' ? (
                <div className="beta-printer-profile-actions">
                    <button type="button" onClick={handleSavePrinterProfile}>Save To Studio Profiles</button>
                    <button type="button" onClick={handleLoadPrinterProfile} disabled={!selectedPrinterProfile}>Load Profile</button>
                    <span>{selectedPrinterProfile ? `linked: ${selectedPrinterProfile.name}` : 'link this printer to a studio profile'}</span>
                </div>
            ) : null}
        </aside>
    )

    const renderViewNodeContent = (node) => {
        if (node.definitionId === 'view.inspector') {
            return (
                <PropertyInspector
                    title={inspectorTitle}
                    subtitle={inspectorSubtitle}
                    sections={inspectorSections}
                    values={inspectorValues}
                    assetOptions={document.assets || []}
                    onSectionChange={handleInspectorChange}
                    emptyMessage="Select a node or entity to edit it."
                />
            )
        }
        if (node.definitionId === 'view.assets') {
            return (
                <BetaAssetsWindow
                    assets={document.assets || []}
                    canUploadAssets={!isLocalWorkspace}
                    onUploadAssets={handleUploadAssets}
                    onCreateEntity={handleCreateEntity}
                />
            )
        }
        if (node.definitionId === 'view.outliner') {
            return (
                <BetaOutlinerWindow
                    entities={entities}
                    nodes={authoredNodes}
                    selectedEntityId={state.selectedEntityId}
                    selectedNodeId={workspaceState.selectedNodeId}
                    onSelectEntity={selectEntity}
                    onSelectNode={selectNode}
                />
            )
        }
        if (node.definitionId === 'view.activity') {
            return <BetaActivityWindow activity={state.activity} />
        }
        if (node.definitionId === 'view.project') {
            return (
                <BetaProjectWindow
                    document={document}
                    displayName={displayName}
                    onDisplayNameChange={(value) => {
                        setDisplayName(value)
                        try {
                            window.localStorage.setItem(DISPLAY_NAME_KEY, value)
                        } catch {
                            // ignore
                        }
                    }}
                    onProjectMetaPatch={handleProjectMetaPatch}
                    onWorldStatePatch={handleWorldPatch}
                />
            )
        }
        if (node.definitionId === 'view.browser') {
            return <BrowserPanelWindow node={node} />
        }
        return <TextPanelWindow node={node} />
    }

    const visibleSelection = Boolean(selectedNode || selectedEntity)
    const activeSurface = workspaceState.activeSurface || 'world'
    const activeWorldId = workspaceState.activeWorldId || null
    const showRootCanvas = !activeWorldId
    const rootCanvasNodes = useMemo(
        () => authoredNodes.filter((node) =>
            node.definitionId === 'world.3d' ||
            node.definitionId === 'world.2d' ||
            node.params?.canvasPosition
        ),
        [authoredNodes]
    )
    const getRootCanvasCardPosition = (node, index = 0) => {
        const saved = node.params?.canvasPosition
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            return { x: saved.x, y: saved.y }
        }
        const scaledCardWidth = Math.round(ROOT_WORLD_CARD_WIDTH * nodeScale)
        const scaledCardHeight = Math.round(ROOT_WORLD_CARD_HEIGHT * nodeScale)
        const gap = Math.round(18 * nodeScale)
        const column = index % 4
        const row = Math.floor(index / 4)
        return {
            x: 64 + (column * (scaledCardWidth + gap)),
            y: workspaceTop + 20 + (row * (scaledCardHeight + gap))
        }
    }

    useEffect(() => {
        if (!rootDragState) return undefined

        const handlePointerMove = (event) => {
            const canvasRect = rootCanvasRef.current?.getBoundingClientRect?.()
            if (!canvasRect) return
            const currentNode = nodes.find((node) => node.id === rootDragState.nodeId)
            if (!currentNode) return
            const scaledCardWidth = ROOT_WORLD_CARD_WIDTH * nodeScale
            const scaledCardHeight = ROOT_WORLD_CARD_HEIGHT * nodeScale
            const x = Math.max(
                12,
                Math.min(
                    canvasRect.width - scaledCardWidth - 12,
                    event.clientX - canvasRect.left - rootDragState.offsetX
                )
            )
            const y = Math.max(
                workspaceTop + 12,
                Math.min(
                    canvasRect.height - scaledCardHeight - 12,
                    event.clientY - canvasRect.top - rootDragState.offsetY
                )
            )

            applyLocalOps({
                type: 'updateNode',
                payload: {
                    nodeId: rootDragState.nodeId,
                    patch: {
                        params: {
                            ...(currentNode.params || {}),
                            canvasPosition: { x, y }
                        }
                    }
                }
            })
        }

        const handlePointerUp = () => {
            setRootDragState(null)
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
        }
    }, [applyLocalOps, nodes, rootDragState, workspaceTop])

    const handleRootCanvasPointerDown = (node, index, event) => {
        if (event.button !== 0) return
        selectNode(node.id)
        const canvasRect = rootCanvasRef.current?.getBoundingClientRect?.()
        if (!canvasRect) return
        const cardPosition = getRootCanvasCardPosition(node, index)
        setRootDragState({
            nodeId: node.id,
            offsetX: event.clientX - canvasRect.left - cardPosition.x,
            offsetY: event.clientY - canvasRect.top - cardPosition.y
        })
    }

    const handleMoveWorldNode = (nodeId, nextPosition) => {
        const currentNode = nodes.find((node) => node.id === nodeId)
        if (!currentNode) return
        applyLocalOps({
            type: 'updateNode',
            payload: {
                nodeId,
                patch: {
                    spatial: {
                        ...(currentNode.spatial || {}),
                        position: nextPosition
                    }
                }
            }
        })
    }

    const workspaceTitle = isLocalWorkspace ? 'Blank White Workspace' : (document.projectMeta?.title || 'Beta Project')
    const workspaceSubtitle = isLocalWorkspace
        ? 'Double-click the world or the view to start authoring nodes.'
        : projectId
    const presenceStatus = isLocalWorkspace ? 'local' : presence.presenceState
    const streamStatus = isLocalWorkspace ? 'local' : state.sceneStreamState

    if (showRootCanvas) {
        return (
            <main
                className="beta-editor-shell beta-root-canvas-mode"
                onDoubleClick={(event) => {
                    if (event.target?.closest?.('.beta-topbar, .beta-world-node-card, button')) return
                    setPaletteState({ open: true, surface: 'all', placement: { clientX: event.clientX, clientY: event.clientY } })
                }}
            >
                <header className="beta-topbar" onClick={(e) => e.stopPropagation()}>
                    <div className="beta-topbar-left">
                        <button type="button" className="beta-topbar-back" onClick={(event) => {
                            event.stopPropagation()
                            navigateToBetaPath(buildBetaProjectsPath(resolvedSpaceId))
                        }}>
                            ← Projects
                        </button>
                    </div>
                    <div className="beta-topbar-right">
                        <div className="beta-topbar-scale-control">
                            <label htmlFor="root-node-scale-select">Size:</label>
                            <select
                                id="root-node-scale-select"
                                value={nodeScale}
                                onChange={(e) => setNodeScale(parseFloat(e.target.value))}
                                title="Adjust node size for mobile, tablet, VR, or desktop viewing"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {getAvailableScales().map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </header>
                <div className="beta-root-canvas" ref={rootCanvasRef}>
                    {rootCanvasNodes.length === 0 ? (
                        <div className="beta-root-canvas-hint">
                            <p>double-click to create any node</p>
                        </div>
                    ) : (
                        <div className="beta-world-node-layer">
                            {rootCanvasNodes.map((node, index) => {
                                const cardPosition = getRootCanvasCardPosition(node, index)
                                const isWorldNode = node.definitionId === 'world.3d' || node.definitionId === 'world.2d'
                                return (
                                <div
                                    key={node.id}
                                    className="beta-world-node-card"
                                    data-density={getDensityFromScale(nodeScale)}
                                    style={{
                                        left: `${cardPosition.x}px`,
                                        top: `${cardPosition.y}px`,
                                        '--card-scale': nodeScale
                                    }}
                                    onPointerDown={(event) => handleRootCanvasPointerDown(node, index, event)}
                                >
                                    <span className="beta-world-node-icon">
                                        {node.definitionId === 'world.3d'
                                            ? '⬡'
                                            : node.definitionId === 'world.2d'
                                                ? '⬜'
                                                : node.mount?.surface === 'world'
                                                    ? '◆'
                                                    : '◫'}
                                    </span>
                                    <strong className="beta-world-node-title">{node.params?.title || node.label}</strong>
                                    <span className="beta-world-node-type">{node.definitionId}</span>
                                    {isWorldNode ? (
                                        <button
                                            type="button"
                                            className="beta-world-node-enter"
                                            onClick={(e) => { e.stopPropagation(); enterWorld(node.id) }}
                                        >
                                            Enter →
                                        </button>
                                    ) : null}
                                </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                {paletteState.open && (
                    <NodePalette
                        open={paletteState.open}
                        surface={paletteState.surface}
                        placement={paletteState.placement}
                        onClose={() => setPaletteState({ open: false, surface: 'all', placement: null })}
                        onCreate={handlePaletteCreate}
                    />
                )}
                {visibleSelection ? hostInspector : null}
            </main>
        )
    }

    return (
        <main
            className={`beta-editor-shell beta-editor-shell-${activeSurface}`}
            onDoubleClick={(event) => {
                if (activeSurface !== 'view') return
                if (event.target?.closest?.(VIEW_DOUBLE_CLICK_IGNORE_SELECTOR)) return
                openCreateDialog('view', {
                    clientX: event.clientX,
                    clientY: event.clientY
                })
            }}
        >
            <header className="beta-topbar" ref={topbarRef}>
                <div className="beta-topbar-left">
                    <button type="button" className="beta-topbar-back" onClick={() => {
                        if (activeWorldId) {
                            exitWorld()
                        } else {
                            navigateToBetaPath(buildBetaProjectsPath(resolvedSpaceId))
                        }
                    }}>
                        ← {activeWorldId ? 'Canvas' : (isLocalWorkspace ? 'Projects' : 'Hub')}
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
                        selectedNodeId={workspaceState.selectedNodeId}
                        onSelectNode={selectNode}
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
                                        patch: {
                                            frame: {
                                                ...(node.frame || {}),
                                                zIndex: topZIndex + 1
                                            }
                                        }
                                    }
                                })
                            }}
                            onPatch={(patch) => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: {
                                        frame: {
                                            ...(node.frame || {}),
                                            ...patch
                                        }
                                    }
                                }
                            })}
                            onClose={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: {
                                        frame: {
                                            ...(node.frame || {}),
                                            visible: false
                                        }
                                    }
                                }
                            })}
                            onToggleMinimize={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: {
                                        frame: {
                                            ...(node.frame || {}),
                                            minimized: !node.frame?.minimized
                                        }
                                    }
                                }
                            })}
                            onTogglePin={() => applyLocalOps({
                                type: 'updateNode',
                                payload: {
                                    nodeId: node.id,
                                    patch: {
                                        frame: {
                                            ...(node.frame || {}),
                                            pinned: !node.frame?.pinned
                                        }
                                    }
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
