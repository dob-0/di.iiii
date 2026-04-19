export const PROJECT_DOCUMENT_VERSION = 3
export const ENTITY_TYPES = [
    'box',
    'sphere',
    'cone',
    'cylinder',
    'text',
    'image',
    'video',
    'audio',
    'model'
]
export const WINDOW_IDS = ['viewport', 'assets', 'inspector', 'outliner', 'activity', 'project']
export const PROJECT_ROOT_NODE_ID = 'root-node'
export const PROJECT_WORLD_ROOT_NODE_ID = 'world-root'
export const PROJECT_VIEW_ROOT_NODE_ID = 'view-root'
export const PROJECT_ROOT_GRAPH_ID = 'root-graph'

const ENTITY_TYPE_SET = new Set(ENTITY_TYPES)
const PROJECT_NODE_SURFACES = ['graph', 'world', 'view']
const PROJECT_NODE_MODES = ['hidden', 'spatial', 'panel', 'overlay']
const LEGACY_WINDOW_NODE_DEFINITIONS = {
    assets: 'view.assets',
    inspector: 'view.inspector',
    outliner: 'view.outliner',
    activity: 'view.activity',
    project: 'view.project'
}
const VIEW_NODE_WINDOW_IDS = Object.fromEntries(
    Object.entries(LEGACY_WINDOW_NODE_DEFINITIONS).map(([windowId, definitionId]) => [definitionId, windowId])
)
const NODE_LABELS = {
    'core.project': 'Project Root',
    'world.root': 'World Root',
    'view.root': 'View Root',
    'world.color': 'World Color',
    'world.grid': 'World Grid',
    'world.light': 'World Light',
    'world.camera': 'World Camera',
    'geom.cube': 'Cube',
    'app.browser': 'Browser',
    'view.panel': 'Panel',
    'view.text': 'Text',
    'view.browser': 'Browser Panel',
    'view.inspector': 'Inspector',
    'view.assets': 'Assets',
    'view.outliner': 'Outliner',
    'view.activity': 'Activity',
    'view.project': 'Project'
}

export const cloneValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(cloneValue)
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
    }
    return value
}

export const ensureVector = (value, fallback = [0, 0, 0]) => {
    const source = Array.isArray(value) ? value : []
    return fallback.map((entry, index) => {
        const next = Number(source[index])
        return Number.isFinite(next) ? next : entry
    })
}

const ensureString = (value, fallback = '') => {
    const next = typeof value === 'string' ? value.trim() : ''
    return next || fallback
}

const ensureBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value
    return fallback
}

const ensureNumber = (value, fallback = 0) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

export const mergePatch = (target, patch) => {
    if (Array.isArray(patch)) return cloneValue(patch)
    if (!patch || typeof patch !== 'object') return patch
    const base = target && typeof target === 'object' ? cloneValue(target) : {}
    Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            base[key] = mergePatch(base[key], value)
        } else {
            base[key] = cloneValue(value)
        }
    })
    return base
}

export const generateId = (prefix = 'id') => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const defaultWindowLayout = {
    activeWindowId: 'viewport',
    windows: {
        viewport: { id: 'viewport', title: 'Viewport', visible: true, minimized: false, pinned: true, x: 24, y: 176, width: 860, height: 580, zIndex: 3 },
        assets: { id: 'assets', title: 'Assets', visible: false, minimized: false, pinned: false, x: 910, y: 176, width: 360, height: 360, zIndex: 4 },
        inspector: { id: 'inspector', title: 'Inspector', visible: false, minimized: false, pinned: false, x: 910, y: 552, width: 360, height: 420, zIndex: 5 },
        outliner: { id: 'outliner', title: 'Outliner', visible: false, minimized: false, pinned: false, x: 24, y: 620, width: 280, height: 260, zIndex: 2 },
        activity: { id: 'activity', title: 'Activity', visible: false, minimized: false, pinned: false, x: 320, y: 620, width: 340, height: 260, zIndex: 1 },
        project: { id: 'project', title: 'Project', visible: false, minimized: false, pinned: false, x: 680, y: 620, width: 320, height: 260, zIndex: 1 }
    }
}

export const defaultWorldState = {
    backgroundColor: '#ffffff',
    gridVisible: false,
    gridSize: 24,
    ambientLight: { color: '#ffffff', intensity: 0.8 },
    directionalLight: { color: '#fff7ea', intensity: 1.05, position: [8, 12, 4] },
    savedView: { mode: 'perspective', position: [0, 2.4, 6.5], target: [0, 0.75, 0] }
}

export const defaultXrState = {
    mode: 'none',
    debugVisible: false,
    vrSupported: false,
    arSupported: false
}

export const defaultPresentationFixedCamera = {
    projection: 'perspective',
    position: [0, 2.4, 6.5],
    target: [0, 0.75, 0],
    fov: 50,
    zoom: 1,
    near: 0.1,
    far: 200,
    locked: false
}

export const defaultPresentationState = {
    mode: 'scene',
    fixedCamera: defaultPresentationFixedCamera,
    codeHtml: '',
    entryView: 'scene'
}

export const defaultPublishState = {
    shareEnabled: false,
    xrDefaultMode: 'none',
    lastExportAt: 0
}

export const defaultWorkspaceState = {
    activeSurface: 'world',
    selectedNodeId: null,
    activeGraphId: PROJECT_ROOT_GRAPH_ID,
    enteredNodeId: PROJECT_ROOT_NODE_ID
}

const defaultNodeFrame = {
    x: 96,
    y: 140,
    width: 360,
    height: 280,
    zIndex: 6,
    dock: 'floating',
    minimized: false,
    visible: true,
    pinned: false,
    title: ''
}

const defaultNodeSpatial = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    bounds: [1, 1, 1]
}

const buildDefaultRootNodes = () => ([
    {
        id: PROJECT_ROOT_NODE_ID,
        definitionId: 'core.project',
        label: 'Project Root',
        family: 'core',
        parentId: '',
        mount: { surface: 'graph', mode: 'hidden' },
        params: {},
        runtime: {},
        childGraphId: PROJECT_ROOT_GRAPH_ID
    },
    {
        id: PROJECT_WORLD_ROOT_NODE_ID,
        definitionId: 'world.root',
        label: 'World Root',
        family: 'world',
        parentId: PROJECT_ROOT_NODE_ID,
        mount: { surface: 'world', mode: 'hidden' },
        params: {},
        runtime: {}
    },
    {
        id: PROJECT_VIEW_ROOT_NODE_ID,
        definitionId: 'view.root',
        label: 'View Root',
        family: 'view',
        parentId: PROJECT_ROOT_NODE_ID,
        mount: { surface: 'view', mode: 'hidden' },
        params: {},
        runtime: {}
    }
])

const buildDefaultRootEdges = () => ([
    { id: 'edge-root-world', sourceId: PROJECT_ROOT_NODE_ID, targetId: PROJECT_WORLD_ROOT_NODE_ID, label: 'world' },
    { id: 'edge-root-view', sourceId: PROJECT_ROOT_NODE_ID, targetId: PROJECT_VIEW_ROOT_NODE_ID, label: 'view' }
])

export const defaultProjectDocument = {
    version: PROJECT_DOCUMENT_VERSION,
    projectMeta: { id: '', spaceId: 'main', title: 'Untitled Project', createdAt: 0, updatedAt: 0, source: 'project' },
    rootNodeId: PROJECT_ROOT_NODE_ID,
    nodes: buildDefaultRootNodes(),
    edges: buildDefaultRootEdges(),
    templates: [],
    workspaceState: defaultWorkspaceState,
    entities: [],
    worldState: defaultWorldState,
    xrState: defaultXrState,
    presentationState: defaultPresentationState,
    publishState: defaultPublishState,
    windowLayout: defaultWindowLayout,
    assets: []
}

export const buildDefaultComponentsForType = (type = 'box') => {
    const base = {
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        appearance: { color: '#5fa8ff', opacity: 1 }
    }

    switch (type) {
        case 'sphere':
            base.primitive = { shape: 'sphere', radius: 0.6 }
            break
        case 'cone':
            base.primitive = { shape: 'cone', radius: 0.55, height: 1.4 }
            break
        case 'cylinder':
            base.primitive = { shape: 'cylinder', radiusTop: 0.45, radiusBottom: 0.45, height: 1.2 }
            break
        case 'text':
            base.text = { value: 'New Text', variant: '2d', fontFamily: 'Inter, sans-serif', fontWeight: '600', fontStyle: 'normal', fontSize3D: 0.45, depth3D: 0.08 }
            break
        case 'image':
            base.media = { assetId: null, fit: 'contain', autoplay: false, loop: false, muted: true }
            break
        case 'video':
            base.media = { assetId: null, fit: 'contain', autoplay: true, loop: true, muted: true }
            break
        case 'audio':
            base.media = { assetId: null, autoplay: true, loop: true, muted: false, volume: 0.8, distance: 8 }
            break
        case 'model':
            base.media = { assetId: null, autoplay: false, loop: false, muted: false }
            break
        case 'box':
        default:
            base.primitive = { shape: 'box', size: [1, 1, 1] }
            break
    }

    return base
}

export const normalizeAsset = (asset = {}) => ({
    id: ensureString(asset.id, generateId('asset')),
    name: ensureString(asset.name, 'Untitled Asset'),
    mimeType: ensureString(asset.mimeType, 'application/octet-stream'),
    size: Math.max(0, ensureNumber(asset.size, 0)),
    createdAt: ensureNumber(asset.createdAt, Date.now()),
    url: ensureString(asset.url, ''),
    source: ensureString(asset.source, 'server')
})

const normalizeWindowState = (windowId, value = {}, fallback) => {
    const source = value && typeof value === 'object' ? value : {}
    return {
        ...fallback,
        ...cloneValue(source),
        id: windowId,
        title: ensureString(source.title, fallback.title),
        visible: ensureBoolean(source.visible, fallback.visible),
        minimized: ensureBoolean(source.minimized, fallback.minimized),
        pinned: ensureBoolean(source.pinned, fallback.pinned),
        x: ensureNumber(source.x, fallback.x),
        y: ensureNumber(source.y, fallback.y),
        width: Math.max(240, ensureNumber(source.width, fallback.width)),
        height: Math.max(180, ensureNumber(source.height, fallback.height)),
        zIndex: Math.max(1, ensureNumber(source.zIndex, fallback.zIndex))
    }
}

export const normalizeWindowLayout = (layout = {}) => {
    const source = layout && typeof layout === 'object' ? layout : {}
    const windows = {}
    WINDOW_IDS.forEach((windowId) => {
        windows[windowId] = normalizeWindowState(windowId, source.windows?.[windowId], defaultWindowLayout.windows[windowId])
    })
    const requestedActive = ensureString(source.activeWindowId, defaultWindowLayout.activeWindowId)
    return { activeWindowId: windows[requestedActive] ? requestedActive : defaultWindowLayout.activeWindowId, windows }
}

export const normalizeEntity = (entity = {}) => {
    const rawType = ensureString(entity.type, 'box')
    const type = ENTITY_TYPE_SET.has(rawType) ? rawType : 'box'
    const defaultComponents = buildDefaultComponentsForType(type)
    const sourceComponents = entity.components && typeof entity.components === 'object' ? cloneValue(entity.components) : {}
    const transformSource = sourceComponents.transform || {}
    const appearanceSource = sourceComponents.appearance || {}
    const nextComponents = {
        ...defaultComponents,
        ...sourceComponents,
        transform: {
            ...defaultComponents.transform,
            ...transformSource,
            position: ensureVector(transformSource.position, defaultComponents.transform.position),
            rotation: ensureVector(transformSource.rotation, defaultComponents.transform.rotation),
            scale: ensureVector(transformSource.scale, defaultComponents.transform.scale)
        },
        appearance: {
            ...defaultComponents.appearance,
            ...appearanceSource,
            color: ensureString(appearanceSource.color, defaultComponents.appearance.color),
            opacity: Math.min(1, Math.max(0, ensureNumber(appearanceSource.opacity, defaultComponents.appearance.opacity)))
        }
    }
    if (nextComponents.primitive?.size) {
        nextComponents.primitive.size = ensureVector(nextComponents.primitive.size, [1, 1, 1])
    }
    if (nextComponents.text) {
        nextComponents.text = {
            ...defaultComponents.text,
            ...nextComponents.text,
            value: typeof nextComponents.text.value === 'string' ? nextComponents.text.value : defaultComponents.text.value,
            variant: ensureString(nextComponents.text.variant, defaultComponents.text.variant || '2d')
        }
    }
    if (nextComponents.media) {
        nextComponents.media = {
            ...defaultComponents.media,
            ...nextComponents.media,
            assetId: nextComponents.media.assetId || null
        }
    }
    if (sourceComponents.link || defaultComponents.link) {
        nextComponents.link = {
            enabled: ensureBoolean(sourceComponents.link?.enabled, defaultComponents.link?.enabled || false),
            href: ensureString(sourceComponents.link?.href, defaultComponents.link?.href || '')
        }
    }
    if (sourceComponents.runtime || defaultComponents.runtime) {
        nextComponents.runtime = {
            visible: ensureBoolean(sourceComponents.runtime?.visible, defaultComponents.runtime?.visible ?? true),
            locked: ensureBoolean(sourceComponents.runtime?.locked, defaultComponents.runtime?.locked ?? false)
        }
    }

    return {
        id: ensureString(entity.id, generateId('entity')),
        type,
        name: ensureString(entity.name, `${type[0].toUpperCase()}${type.slice(1)} Entity`),
        components: nextComponents
    }
}

const normalizeWorldState = (world = {}) => {
    const source = world && typeof world === 'object' ? world : {}
    return {
        ...cloneValue(defaultWorldState),
        ...cloneValue(source),
        backgroundColor: ensureString(source.backgroundColor, defaultWorldState.backgroundColor),
        gridVisible: ensureBoolean(source.gridVisible, defaultWorldState.gridVisible),
        gridSize: Math.max(1, ensureNumber(source.gridSize, defaultWorldState.gridSize)),
        ambientLight: {
            color: ensureString(source.ambientLight?.color, defaultWorldState.ambientLight.color),
            intensity: ensureNumber(source.ambientLight?.intensity, defaultWorldState.ambientLight.intensity)
        },
        directionalLight: {
            color: ensureString(source.directionalLight?.color, defaultWorldState.directionalLight.color),
            intensity: ensureNumber(source.directionalLight?.intensity, defaultWorldState.directionalLight.intensity),
            position: ensureVector(source.directionalLight?.position, defaultWorldState.directionalLight.position)
        },
        savedView: {
            mode: ensureString(source.savedView?.mode, defaultWorldState.savedView.mode),
            position: ensureVector(source.savedView?.position, defaultWorldState.savedView.position),
            target: ensureVector(source.savedView?.target, defaultWorldState.savedView.target)
        }
    }
}

const normalizeXrState = (xr = {}) => {
    const source = xr && typeof xr === 'object' ? xr : {}
    return {
        ...cloneValue(defaultXrState),
        ...cloneValue(source),
        mode: ensureString(source.mode, defaultXrState.mode),
        debugVisible: ensureBoolean(source.debugVisible, defaultXrState.debugVisible),
        vrSupported: ensureBoolean(source.vrSupported, defaultXrState.vrSupported),
        arSupported: ensureBoolean(source.arSupported, defaultXrState.arSupported)
    }
}

const normalizePresentationFixedCamera = (camera = {}, worldState = defaultWorldState) => {
    const source = camera && typeof camera === 'object' ? camera : {}
    const worldView = worldState?.savedView || defaultWorldState.savedView
    const projection = ensureString(source.projection, defaultPresentationFixedCamera.projection)
    return {
        ...cloneValue(defaultPresentationFixedCamera),
        ...cloneValue(source),
        projection: ['perspective', 'orthographic'].includes(projection) ? projection : defaultPresentationFixedCamera.projection,
        position: ensureVector(source.position, worldView.position || defaultPresentationFixedCamera.position),
        target: ensureVector(source.target, worldView.target || defaultPresentationFixedCamera.target),
        fov: Math.max(1, ensureNumber(source.fov, defaultPresentationFixedCamera.fov)),
        zoom: Math.max(0.01, ensureNumber(source.zoom, defaultPresentationFixedCamera.zoom)),
        near: Math.max(0.001, ensureNumber(source.near, defaultPresentationFixedCamera.near)),
        far: Math.max(0.01, ensureNumber(source.far, defaultPresentationFixedCamera.far)),
        locked: ensureBoolean(source.locked, defaultPresentationFixedCamera.locked)
    }
}

export const normalizePresentationState = (presentation = {}, worldState = defaultWorldState) => {
    const source = presentation && typeof presentation === 'object' ? presentation : {}
    const mode = ensureString(source.mode, defaultPresentationState.mode)
    const entryView = ensureString(source.entryView, mode || defaultPresentationState.entryView)
    return {
        ...cloneValue(defaultPresentationState),
        ...cloneValue(source),
        mode: ['scene', 'fixed-camera', 'code'].includes(mode) ? mode : defaultPresentationState.mode,
        fixedCamera: normalizePresentationFixedCamera(source.fixedCamera, worldState),
        codeHtml: typeof source.codeHtml === 'string' ? source.codeHtml : defaultPresentationState.codeHtml,
        entryView: ['scene', 'fixed-camera', 'code'].includes(entryView) ? entryView : defaultPresentationState.entryView
    }
}

export const normalizePublishState = (publish = {}) => {
    const source = publish && typeof publish === 'object' ? publish : {}
    const xrDefaultMode = ensureString(source.xrDefaultMode, defaultPublishState.xrDefaultMode)
    return {
        ...cloneValue(defaultPublishState),
        ...cloneValue(source),
        shareEnabled: ensureBoolean(source.shareEnabled, defaultPublishState.shareEnabled),
        xrDefaultMode: ['none', 'vr', 'ar'].includes(xrDefaultMode) ? xrDefaultMode : defaultPublishState.xrDefaultMode,
        lastExportAt: Math.max(0, ensureNumber(source.lastExportAt, defaultPublishState.lastExportAt))
    }
}

export const normalizeProjectMeta = (meta = {}) => {
    const source = meta && typeof meta === 'object' ? meta : {}
    const now = Date.now()
    return {
        id: ensureString(source.id, ''),
        spaceId: ensureString(source.spaceId, 'main'),
        title: ensureString(source.title, 'Untitled Project'),
        createdAt: ensureNumber(source.createdAt, now),
        updatedAt: ensureNumber(source.updatedAt, now),
        source: ensureString(source.source, 'project')
    }
}

const normalizeNodeMount = (mount = {}, fallbackSurface = 'graph', fallbackMode = 'hidden') => {
    const source = mount && typeof mount === 'object' ? mount : {}
    const surface = ensureString(source.surface, fallbackSurface)
    const mode = ensureString(source.mode, fallbackMode)
    return {
        surface: PROJECT_NODE_SURFACES.includes(surface) ? surface : fallbackSurface,
        mode: PROJECT_NODE_MODES.includes(mode) ? mode : fallbackMode
    }
}

const normalizeNodeFrame = (frame = {}, fallback = defaultNodeFrame) => {
    const source = frame && typeof frame === 'object' ? frame : {}
    return {
        ...cloneValue(defaultNodeFrame),
        ...cloneValue(fallback || {}),
        ...cloneValue(source),
        x: ensureNumber(source.x, fallback?.x ?? defaultNodeFrame.x),
        y: ensureNumber(source.y, fallback?.y ?? defaultNodeFrame.y),
        width: Math.max(240, ensureNumber(source.width, fallback?.width ?? defaultNodeFrame.width)),
        height: Math.max(180, ensureNumber(source.height, fallback?.height ?? defaultNodeFrame.height)),
        zIndex: Math.max(1, ensureNumber(source.zIndex, fallback?.zIndex ?? defaultNodeFrame.zIndex)),
        dock: ensureString(source.dock, fallback?.dock ?? defaultNodeFrame.dock),
        minimized: ensureBoolean(source.minimized, fallback?.minimized ?? defaultNodeFrame.minimized),
        visible: ensureBoolean(source.visible, fallback?.visible ?? defaultNodeFrame.visible),
        pinned: ensureBoolean(source.pinned, fallback?.pinned ?? defaultNodeFrame.pinned),
        title: ensureString(source.title, fallback?.title ?? defaultNodeFrame.title)
    }
}

const normalizeNodeSpatial = (spatial = {}, fallback = defaultNodeSpatial) => {
    const source = spatial && typeof spatial === 'object' ? spatial : {}
    const base = fallback && typeof fallback === 'object' ? fallback : defaultNodeSpatial
    return {
        position: ensureVector(source.position, base.position || defaultNodeSpatial.position),
        rotation: ensureVector(source.rotation, base.rotation || defaultNodeSpatial.rotation),
        scale: ensureVector(source.scale, base.scale || defaultNodeSpatial.scale),
        bounds: ensureVector(source.bounds, base.bounds || defaultNodeSpatial.bounds)
    }
}

export const normalizeProjectNode = (node = {}) => {
    const source = node && typeof node === 'object' ? node : {}
    const definitionId = ensureString(source.definitionId, 'core.space')
    const family = ensureString(source.family, definitionId.split('.')[0] || 'core')
    const inferredSurface = source.frame
        ? 'view'
        : (source.spatial
            ? 'world'
            : (definitionId.startsWith('view.')
                ? 'view'
                : ((definitionId.startsWith('world.') || definitionId.startsWith('geom.') || definitionId.startsWith('app.'))
                    ? 'world'
                    : 'graph')))
    const inferredMode = source.frame
        ? 'panel'
        : (source.spatial ? 'spatial' : (inferredSurface === 'view' ? 'panel' : 'hidden'))
    const mount = normalizeNodeMount(source.mount, inferredSurface, inferredMode)
    const normalized = {
        id: ensureString(source.id, generateId('node')),
        definitionId,
        label: ensureString(source.label, NODE_LABELS[definitionId] || definitionId),
        family,
        parentId: ensureString(source.parentId, ''),
        params: source.params && typeof source.params === 'object' ? cloneValue(source.params) : {},
        inputs: Array.isArray(source.inputs) ? cloneValue(source.inputs) : [],
        outputs: Array.isArray(source.outputs) ? cloneValue(source.outputs) : [],
        runtime: source.runtime && typeof source.runtime === 'object' ? cloneValue(source.runtime) : {},
        mount,
        spatial: null,
        frame: null,
        assetBindings: Array.isArray(source.assetBindings) ? cloneValue(source.assetBindings) : [],
        childGraphId: ensureString(source.childGraphId, ''),
        legacyEntityId: ensureString(source.legacyEntityId, '')
    }

    if (source.spatial || mount.mode === 'spatial') {
        normalized.spatial = normalizeNodeSpatial(source.spatial)
    }
    if (source.frame || mount.surface === 'view') {
        normalized.frame = normalizeNodeFrame(source.frame)
    }

    return normalized
}

const normalizeProjectEdge = (edge = {}) => {
    const source = edge && typeof edge === 'object' ? edge : {}
    return {
        id: ensureString(source.id, generateId('edge')),
        sourceId: ensureString(source.sourceId, ''),
        targetId: ensureString(source.targetId, ''),
        label: ensureString(source.label, '')
    }
}

const normalizeTemplate = (template = {}) => {
    const source = template && typeof template === 'object' ? template : {}
    return {
        id: ensureString(source.id, generateId('template')),
        label: ensureString(source.label, 'Untitled Template'),
        definitionId: ensureString(source.definitionId, ''),
        params: source.params && typeof source.params === 'object' ? cloneValue(source.params) : {}
    }
}

export const normalizeWorkspaceState = (workspace = {}) => {
    const source = workspace && typeof workspace === 'object' ? workspace : {}
    const activeSurface = ensureString(source.activeSurface, defaultWorkspaceState.activeSurface)
    return {
        ...cloneValue(defaultWorkspaceState),
        ...cloneValue(source),
        activeSurface: PROJECT_NODE_SURFACES.includes(activeSurface) ? activeSurface : defaultWorkspaceState.activeSurface,
        selectedNodeId: ensureString(source.selectedNodeId, '') || null,
        activeGraphId: ensureString(source.activeGraphId, defaultWorkspaceState.activeGraphId),
        enteredNodeId: ensureString(source.enteredNodeId, defaultWorkspaceState.enteredNodeId)
    }
}

const ensureRootNodes = (nodes = []) => {
    const map = new Map()
    nodes.forEach((node) => {
        const normalized = normalizeProjectNode(node)
        map.set(normalized.id, normalized)
    })

    buildDefaultRootNodes().forEach((rootNode) => {
        const existing = map.get(rootNode.id)
        map.set(rootNode.id, normalizeProjectNode(mergePatch(rootNode, existing || {})))
    })

    return [
        map.get(PROJECT_ROOT_NODE_ID),
        map.get(PROJECT_WORLD_ROOT_NODE_ID),
        map.get(PROJECT_VIEW_ROOT_NODE_ID),
        ...Array.from(map.values()).filter((node) => ![
            PROJECT_ROOT_NODE_ID,
            PROJECT_WORLD_ROOT_NODE_ID,
            PROJECT_VIEW_ROOT_NODE_ID
        ].includes(node.id))
    ]
}

const buildLegacyWindowNode = (windowId, windowState) => normalizeProjectNode({
    id: `legacy-window-${windowId}`,
    definitionId: LEGACY_WINDOW_NODE_DEFINITIONS[windowId] || 'view.panel',
    label: windowState.title || NODE_LABELS[LEGACY_WINDOW_NODE_DEFINITIONS[windowId]] || windowId,
    family: 'view',
    parentId: PROJECT_VIEW_ROOT_NODE_ID,
    mount: { surface: 'view', mode: 'panel' },
    params: {
        title: windowState.title || NODE_LABELS[LEGACY_WINDOW_NODE_DEFINITIONS[windowId]] || windowId
    },
    frame: {
        title: windowState.title || NODE_LABELS[LEGACY_WINDOW_NODE_DEFINITIONS[windowId]] || windowId,
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        zIndex: windowState.zIndex,
        visible: windowState.visible,
        minimized: windowState.minimized,
        pinned: windowState.pinned
    }
})

const buildLegacyWorldNodes = (worldState) => ([
    normalizeProjectNode({
        id: 'legacy-world-color',
        definitionId: 'world.color',
        label: 'World Color',
        family: 'world',
        parentId: PROJECT_WORLD_ROOT_NODE_ID,
        mount: { surface: 'world', mode: 'hidden' },
        params: { color: worldState.backgroundColor }
    }),
    normalizeProjectNode({
        id: 'legacy-world-grid',
        definitionId: 'world.grid',
        label: 'World Grid',
        family: 'world',
        parentId: PROJECT_WORLD_ROOT_NODE_ID,
        mount: { surface: 'world', mode: 'hidden' },
        params: { visible: worldState.gridVisible, size: worldState.gridSize }
    }),
    normalizeProjectNode({
        id: 'legacy-world-light',
        definitionId: 'world.light',
        label: 'World Light',
        family: 'world',
        parentId: PROJECT_WORLD_ROOT_NODE_ID,
        mount: { surface: 'world', mode: 'hidden' },
        params: {
            ambientColor: worldState.ambientLight.color,
            ambientIntensity: worldState.ambientLight.intensity,
            directionalColor: worldState.directionalLight.color,
            directionalIntensity: worldState.directionalLight.intensity,
            directionalPosition: worldState.directionalLight.position
        }
    }),
    normalizeProjectNode({
        id: 'legacy-world-camera',
        definitionId: 'world.camera',
        label: 'World Camera',
        family: 'world',
        parentId: PROJECT_WORLD_ROOT_NODE_ID,
        mount: { surface: 'world', mode: 'hidden' },
        params: {
            mode: worldState.savedView.mode,
            position: worldState.savedView.position,
            target: worldState.savedView.target
        }
    })
])

const buildNodesFromSource = (source = {}, worldState = defaultWorldState, windowLayout = defaultWindowLayout) => {
    const sourceHasNodes = Array.isArray(source.nodes) && source.nodes.length > 0
    if (sourceHasNodes) {
        return ensureRootNodes(source.nodes)
    }

    const nodes = buildDefaultRootNodes()
    const shouldMigrateLegacyWorld = Boolean(source.worldState && typeof source.worldState === 'object')
    const shouldMigrateLegacyWindows = Boolean(source.windowLayout && typeof source.windowLayout === 'object')

    if (shouldMigrateLegacyWorld) {
        nodes.push(...buildLegacyWorldNodes(worldState))
    }

    if (shouldMigrateLegacyWindows) {
        WINDOW_IDS.filter((windowId) => windowId !== 'viewport').forEach((windowId) => {
            nodes.push(buildLegacyWindowNode(windowId, windowLayout.windows[windowId]))
        })
    }

    return ensureRootNodes(nodes)
}

const deriveEdgesFromNodes = (nodes = []) => {
    const edges = buildDefaultRootEdges()
    nodes.forEach((node) => {
        if (!node.parentId) return
        const isDefaultRootEdge = (
            (node.id === PROJECT_WORLD_ROOT_NODE_ID && node.parentId === PROJECT_ROOT_NODE_ID)
            || (node.id === PROJECT_VIEW_ROOT_NODE_ID && node.parentId === PROJECT_ROOT_NODE_ID)
        )
        if (isDefaultRootEdge) return
        edges.push({
            id: `edge-${node.parentId}-${node.id}`,
            sourceId: node.parentId,
            targetId: node.id,
            label: ''
        })
    })
    return edges.map(normalizeProjectEdge)
}

export const deriveWorldStateFromNodes = (nodes = [], fallbackWorldState = defaultWorldState) => {
    const nextWorldState = normalizeWorldState(fallbackWorldState)
    ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
        switch (node.definitionId) {
            case 'world.color':
                nextWorldState.backgroundColor = ensureString(node.params?.color, nextWorldState.backgroundColor)
                break
            case 'world.grid':
                nextWorldState.gridVisible = ensureBoolean(node.params?.visible, nextWorldState.gridVisible)
                nextWorldState.gridSize = Math.max(1, ensureNumber(node.params?.size, nextWorldState.gridSize))
                break
            case 'world.light':
                nextWorldState.ambientLight = {
                    color: ensureString(node.params?.ambientColor, nextWorldState.ambientLight.color),
                    intensity: ensureNumber(node.params?.ambientIntensity, nextWorldState.ambientLight.intensity)
                }
                nextWorldState.directionalLight = {
                    color: ensureString(node.params?.directionalColor, nextWorldState.directionalLight.color),
                    intensity: ensureNumber(node.params?.directionalIntensity, nextWorldState.directionalLight.intensity),
                    position: ensureVector(node.params?.directionalPosition, nextWorldState.directionalLight.position)
                }
                break
            case 'world.camera':
                nextWorldState.savedView = {
                    mode: ensureString(node.params?.mode, nextWorldState.savedView.mode),
                    position: ensureVector(node.params?.position, nextWorldState.savedView.position),
                    target: ensureVector(node.params?.target, nextWorldState.savedView.target)
                }
                break
            default:
                break
        }
    })
    return nextWorldState
}

export const deriveWindowLayoutFromNodes = (nodes = [], fallbackWindowLayout = defaultWindowLayout) => {
    const nextLayout = normalizeWindowLayout(fallbackWindowLayout)
    const windows = cloneValue(nextLayout.windows)

    ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
        const windowId = VIEW_NODE_WINDOW_IDS[node.definitionId]
        if (!windowId) return
        const title = ensureString(node.frame?.title, ensureString(node.params?.title, node.label))
        windows[windowId] = normalizeWindowState(windowId, {
            ...windows[windowId],
            title,
            x: node.frame?.x,
            y: node.frame?.y,
            width: node.frame?.width,
            height: node.frame?.height,
            zIndex: node.frame?.zIndex,
            visible: node.frame?.visible,
            minimized: node.frame?.minimized,
            pinned: node.frame?.pinned
        }, defaultWindowLayout.windows[windowId])
    })

    const activeWindow = Object.values(windows)
        .filter((windowState) => windowState.visible)
        .sort((left, right) => (right.zIndex || 0) - (left.zIndex || 0))[0]

    return normalizeWindowLayout({
        activeWindowId: activeWindow?.id || nextLayout.activeWindowId,
        windows
    })
}

export const normalizeProjectDocument = (document = {}) => {
    const source = document && typeof document === 'object' ? document : {}
    const legacyWorldState = normalizeWorldState(source.worldState)
    const legacyWindowLayout = normalizeWindowLayout(source.windowLayout)
    const nodes = buildNodesFromSource(source, legacyWorldState, legacyWindowLayout)
    const worldState = deriveWorldStateFromNodes(
        nodes,
        source.worldState && typeof source.worldState === 'object' ? legacyWorldState : defaultWorldState
    )
    const windowLayout = deriveWindowLayoutFromNodes(nodes, legacyWindowLayout)
    const rootNodeId = ensureString(source.rootNodeId, PROJECT_ROOT_NODE_ID)
    const workspaceState = normalizeWorkspaceState(source.workspaceState)

    return {
        version: PROJECT_DOCUMENT_VERSION,
        projectMeta: normalizeProjectMeta(source.projectMeta),
        rootNodeId: nodes.some((node) => node.id === rootNodeId) ? rootNodeId : PROJECT_ROOT_NODE_ID,
        nodes,
        edges: Array.isArray(source.edges) && source.edges.length
            ? source.edges.map(normalizeProjectEdge)
            : deriveEdgesFromNodes(nodes),
        templates: Array.isArray(source.templates) ? source.templates.map(normalizeTemplate) : [],
        workspaceState: {
            ...workspaceState,
            selectedNodeId: nodes.some((node) => node.id === workspaceState.selectedNodeId)
                ? workspaceState.selectedNodeId
                : null
        },
        entities: Array.isArray(source.entities) ? source.entities.map(normalizeEntity) : [],
        worldState,
        xrState: normalizeXrState(source.xrState),
        presentationState: normalizePresentationState(source.presentationState, worldState),
        publishState: normalizePublishState(source.publishState),
        windowLayout,
        assets: Array.isArray(source.assets) ? source.assets.map(normalizeAsset) : []
    }
}

const getNodeIdByDefinition = (nodeMap, definitionId) => {
    for (const node of nodeMap.values()) {
        if (node.definitionId === definitionId) return node.id
    }
    return ''
}

const upsertNodeByDefinition = (nodeMap, definitionId, buildNode) => {
    const existingId = getNodeIdByDefinition(nodeMap, definitionId)
    const nextNode = normalizeProjectNode(buildNode(existingId ? nodeMap.get(existingId) : null, existingId))
    nodeMap.set(nextNode.id, nextNode)
}

const syncWorldStatePatchToNodes = (nodeMap, patch, worldState) => {
    if (!patch || typeof patch !== 'object') return

    if (Object.prototype.hasOwnProperty.call(patch, 'backgroundColor')) {
        upsertNodeByDefinition(nodeMap, 'world.color', (existing, existingId) => ({
            ...(existing || {}),
            id: existingId || 'legacy-world-color',
            definitionId: 'world.color',
            label: 'World Color',
            family: 'world',
            parentId: PROJECT_WORLD_ROOT_NODE_ID,
            mount: { surface: 'world', mode: 'hidden' },
            params: {
                ...(existing?.params || {}),
                color: worldState.backgroundColor
            }
        }))
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'gridVisible') || Object.prototype.hasOwnProperty.call(patch, 'gridSize')) {
        upsertNodeByDefinition(nodeMap, 'world.grid', (existing, existingId) => ({
            ...(existing || {}),
            id: existingId || 'legacy-world-grid',
            definitionId: 'world.grid',
            label: 'World Grid',
            family: 'world',
            parentId: PROJECT_WORLD_ROOT_NODE_ID,
            mount: { surface: 'world', mode: 'hidden' },
            params: {
                ...(existing?.params || {}),
                visible: worldState.gridVisible,
                size: worldState.gridSize
            }
        }))
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'ambientLight') || Object.prototype.hasOwnProperty.call(patch, 'directionalLight')) {
        upsertNodeByDefinition(nodeMap, 'world.light', (existing, existingId) => ({
            ...(existing || {}),
            id: existingId || 'legacy-world-light',
            definitionId: 'world.light',
            label: 'World Light',
            family: 'world',
            parentId: PROJECT_WORLD_ROOT_NODE_ID,
            mount: { surface: 'world', mode: 'hidden' },
            params: {
                ...(existing?.params || {}),
                ambientColor: worldState.ambientLight.color,
                ambientIntensity: worldState.ambientLight.intensity,
                directionalColor: worldState.directionalLight.color,
                directionalIntensity: worldState.directionalLight.intensity,
                directionalPosition: worldState.directionalLight.position
            }
        }))
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'savedView')) {
        upsertNodeByDefinition(nodeMap, 'world.camera', (existing, existingId) => ({
            ...(existing || {}),
            id: existingId || 'legacy-world-camera',
            definitionId: 'world.camera',
            label: 'World Camera',
            family: 'world',
            parentId: PROJECT_WORLD_ROOT_NODE_ID,
            mount: { surface: 'world', mode: 'hidden' },
            params: {
                ...(existing?.params || {}),
                mode: worldState.savedView.mode,
                position: worldState.savedView.position,
                target: worldState.savedView.target
            }
        }))
    }
}

const syncWindowStateToNodes = (nodeMap, windowId, windowState) => {
    const definitionId = LEGACY_WINDOW_NODE_DEFINITIONS[windowId]
    if (!definitionId) return

    upsertNodeByDefinition(nodeMap, definitionId, (existing, existingId) => ({
        ...(existing || {}),
        id: existingId || `legacy-window-${windowId}`,
        definitionId,
        label: windowState.title || NODE_LABELS[definitionId] || windowId,
        family: 'view',
        parentId: PROJECT_VIEW_ROOT_NODE_ID,
        mount: { surface: 'view', mode: 'panel' },
        params: {
            ...(existing?.params || {}),
            title: windowState.title || NODE_LABELS[definitionId] || windowId
        },
        frame: {
            ...(existing?.frame || {}),
            title: windowState.title || NODE_LABELS[definitionId] || windowId,
            x: windowState.x,
            y: windowState.y,
            width: windowState.width,
            height: windowState.height,
            zIndex: windowState.zIndex,
            visible: windowState.visible,
            minimized: windowState.minimized,
            pinned: windowState.pinned
        }
    }))
}

export const applyProjectOps = (document, ops = []) => {
    let nextDocument = normalizeProjectDocument(document)
    let entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
    let assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
    let nodes = new Map(nextDocument.nodes.map((node) => [node.id, node]))

    ops.forEach((op) => {
        const payload = op?.payload || {}
        switch (op?.type) {
            case 'createEntity': {
                if (!payload.entity) break
                const entity = normalizeEntity(payload.entity)
                entities.set(entity.id, entity)
                break
            }
            case 'updateEntity': {
                const entityId = ensureString(payload.entityId)
                if (!entityId || !entities.has(entityId)) break
                entities.set(entityId, normalizeEntity(mergePatch(entities.get(entityId), payload.patch || {})))
                break
            }
            case 'updateComponent': {
                const entityId = ensureString(payload.entityId)
                const component = ensureString(payload.component)
                if (!entityId || !component || !entities.has(entityId)) break
                const entity = entities.get(entityId)
                entities.set(entityId, normalizeEntity({
                    ...entity,
                    components: {
                        ...entity.components,
                        [component]: mergePatch(entity.components?.[component], payload.patch || {})
                    }
                }))
                break
            }
            case 'deleteEntity': {
                const entityId = ensureString(payload.entityId)
                if (entityId) entities.delete(entityId)
                break
            }
            case 'createNode': {
                if (!payload.node) break
                const node = normalizeProjectNode(payload.node)
                nodes.set(node.id, node)
                break
            }
            case 'updateNode': {
                const nodeId = ensureString(payload.nodeId)
                if (!nodeId || !nodes.has(nodeId)) break
                nodes.set(nodeId, normalizeProjectNode(mergePatch(nodes.get(nodeId), payload.patch || {})))
                break
            }
            case 'deleteNode': {
                const nodeId = ensureString(payload.nodeId)
                if (!nodeId) break
                nodes.delete(nodeId)
                if (nextDocument.workspaceState.selectedNodeId === nodeId) {
                    nextDocument.workspaceState = normalizeWorkspaceState({
                        ...nextDocument.workspaceState,
                        selectedNodeId: null
                    })
                }
                break
            }
            case 'setWorldState': {
                nextDocument.worldState = normalizeWorldState(mergePatch(nextDocument.worldState, payload.patch || {}))
                syncWorldStatePatchToNodes(nodes, payload.patch || {}, nextDocument.worldState)
                break
            }
            case 'setXrState': {
                nextDocument.xrState = normalizeXrState(mergePatch(nextDocument.xrState, payload.patch || {}))
                break
            }
            case 'setPresentationState': {
                nextDocument.presentationState = normalizePresentationState(
                    mergePatch(nextDocument.presentationState, payload.patch || {}),
                    nextDocument.worldState
                )
                break
            }
            case 'setPublishState': {
                nextDocument.publishState = normalizePublishState(mergePatch(nextDocument.publishState, payload.patch || {}))
                break
            }
            case 'setWindowState': {
                const windowId = ensureString(payload.windowId)
                if (!windowId || !nextDocument.windowLayout.windows[windowId]) break
                const windows = {
                    ...nextDocument.windowLayout.windows,
                    [windowId]: normalizeWindowState(
                        windowId,
                        mergePatch(nextDocument.windowLayout.windows[windowId], payload.patch || {}),
                        defaultWindowLayout.windows[windowId]
                    )
                }
                nextDocument.windowLayout = normalizeWindowLayout({
                    ...nextDocument.windowLayout,
                    windows,
                    activeWindowId: payload.focus ? windowId : nextDocument.windowLayout.activeWindowId
                })
                syncWindowStateToNodes(nodes, windowId, nextDocument.windowLayout.windows[windowId])
                break
            }
            case 'setWorkspaceState': {
                nextDocument.workspaceState = normalizeWorkspaceState(mergePatch(nextDocument.workspaceState, payload.patch || {}))
                break
            }
            case 'setProjectMeta': {
                nextDocument.projectMeta = normalizeProjectMeta(mergePatch(nextDocument.projectMeta, payload.patch || {}))
                break
            }
            case 'upsertAsset': {
                if (!payload.asset) break
                const asset = normalizeAsset(payload.asset)
                assets.set(asset.id, asset)
                break
            }
            case 'deleteAsset': {
                const assetId = ensureString(payload.assetId)
                if (assetId) assets.delete(assetId)
                break
            }
            case 'replaceDocument': {
                if (payload.document && typeof payload.document === 'object') {
                    nextDocument = normalizeProjectDocument(payload.document)
                    entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
                    assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
                    nodes = new Map(nextDocument.nodes.map((node) => [node.id, node]))
                }
                break
            }
            default:
                break
        }
    })

    nextDocument.entities = Array.from(entities.values())
    nextDocument.assets = Array.from(assets.values())
    nextDocument.nodes = ensureRootNodes(Array.from(nodes.values()))
    nextDocument.rootNodeId = nextDocument.nodes.some((node) => node.id === nextDocument.rootNodeId)
        ? nextDocument.rootNodeId
        : PROJECT_ROOT_NODE_ID
    nextDocument.projectMeta.updatedAt = Date.now()
    return normalizeProjectDocument(nextDocument)
}
