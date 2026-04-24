// Manual CJS mirror of src/shared/projectSchema.js (keep in lockstep).
// Server-side consumers (serverXR) load this via loadSharedModule('projectSchema.cjs').
// This file intentionally does NOT import the client-only node registry,
// so it accepts any typeId without validation.

const PROJECT_DOCUMENT_VERSION = 4

const ENTITY_TYPES = new Set([
  'box',
  'sphere',
  'cone',
  'cylinder',
  'text',
  'image',
  'video',
  'audio',
  'model'
])

const WINDOW_IDS = ['viewport', 'assets', 'inspector', 'outliner', 'activity', 'project']

const LEGACY_ROOT_NODE_IDS = new Set(['root-node', 'world-root', 'view-root'])
const LEGACY_ROOT_TYPE_IDS = new Set(['core.project', 'world.root', 'view.root'])
const SINGLETON_TYPE_IDS = new Set(['time', 'source.ar', 'world.light', 'world.background', 'world.grid'])

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
  }
  return value
}

const ensureVector = (value, fallback = [0, 0, 0]) => {
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

const generateId = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultWindowLayout = {
  activeWindowId: 'viewport',
  windows: {
    viewport: { id: 'viewport', title: 'Viewport', visible: true, minimized: false, pinned: true, x: 24, y: 176, width: 860, height: 580, zIndex: 3 },
    assets: { id: 'assets', title: 'Assets', visible: true, minimized: false, pinned: false, x: 910, y: 176, width: 360, height: 360, zIndex: 4 },
    inspector: { id: 'inspector', title: 'Inspector', visible: true, minimized: false, pinned: false, x: 910, y: 552, width: 360, height: 420, zIndex: 5 },
    outliner: { id: 'outliner', title: 'Outliner', visible: false, minimized: false, pinned: false, x: 24, y: 620, width: 280, height: 260, zIndex: 2 },
    activity: { id: 'activity', title: 'Activity', visible: false, minimized: false, pinned: false, x: 320, y: 620, width: 340, height: 260, zIndex: 1 },
    project: { id: 'project', title: 'Project', visible: false, minimized: false, pinned: false, x: 680, y: 620, width: 320, height: 260, zIndex: 1 }
  }
}

const defaultWorldState = {
  backgroundColor: '#ebe7df',
  gridVisible: true,
  gridSize: 24,
  ambientLight: { color: '#ffffff', intensity: 0.85 },
  directionalLight: { color: '#fff7ea', intensity: 1.15, position: [8, 12, 4] },
  savedView: { mode: 'perspective', position: [0, 2.4, 6.5], target: [0, 0.75, 0] }
}

const defaultXrState = {
  mode: 'none',
  debugVisible: false,
  vrSupported: false,
  arSupported: false
}

const defaultPresentationFixedCamera = {
  projection: 'perspective',
  position: [0, 2.4, 6.5],
  target: [0, 0.75, 0],
  fov: 50,
  zoom: 1,
  near: 0.1,
  far: 200,
  locked: false
}

const defaultPresentationState = {
  mode: 'scene',
  fixedCamera: defaultPresentationFixedCamera,
  codeHtml: '',
  entryView: 'scene'
}

const defaultPublishState = {
  shareEnabled: false,
  xrDefaultMode: 'none',
  lastExportAt: 0
}

const defaultWorkspaceState = {
  activeSurface: 'world',
  selectedNodeId: null
}

const defaultProjectDocument = {
  version: PROJECT_DOCUMENT_VERSION,
  projectMeta: { id: '', spaceId: 'main', title: 'Untitled Project', createdAt: 0, updatedAt: 0, source: 'project' },
  nodes: [],
  edges: [],
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

const buildDefaultComponentsForType = (type = 'box') => {
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

const normalizeAsset = (asset = {}) => ({
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

const normalizeWindowLayout = (layout = {}) => {
  const source = layout && typeof layout === 'object' ? layout : {}
  const windows = {}
  WINDOW_IDS.forEach((windowId) => {
    windows[windowId] = normalizeWindowState(windowId, source.windows?.[windowId], defaultWindowLayout.windows[windowId])
  })
  const requestedActive = ensureString(source.activeWindowId, defaultWindowLayout.activeWindowId)
  return {
    activeWindowId: windows[requestedActive] ? requestedActive : defaultWindowLayout.activeWindowId,
    windows
  }
}

const normalizeEntity = (entity = {}) => {
  const rawType = ensureString(entity.type, 'box')
  const type = ENTITY_TYPES.has(rawType) ? rawType : 'box'
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

const normalizePresentationState = (presentation = {}, worldState = defaultWorldState) => {
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

const normalizePublishState = (publish = {}) => {
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

const normalizeProjectMeta = (meta = {}) => {
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

const mergeLegacyValues = (source = {}) => {
  const values = source.values && typeof source.values === 'object' ? cloneValue(source.values) : {}
  if (source.params && typeof source.params === 'object') {
    for (const [key, value] of Object.entries(source.params)) {
      if (values[key] === undefined) values[key] = cloneValue(value)
    }
  }
  if (source.spatial?.position && values.position === undefined) values.position = cloneValue(source.spatial.position)
  if (source.spatial?.rotation && values.rotation === undefined) values.rotation = cloneValue(source.spatial.rotation)
  if (source.spatial?.scale && values.scale === undefined) values.scale = cloneValue(source.spatial.scale)
  if (source.frame?.width !== undefined && values.width === undefined) values.width = source.frame.width
  if (source.frame?.height !== undefined && values.height === undefined) values.height = source.frame.height
  return values
}

const normalizeProjectNode = (node = {}) => {
  const source = node && typeof node === 'object' ? node : {}
  const typeId = ensureString(source.typeId, ensureString(source.definitionId, ''))
  if (!typeId) return null
  if (LEGACY_ROOT_TYPE_IDS.has(typeId)) return null
  if (LEGACY_ROOT_NODE_IDS.has(source.id)) return null

  const values = mergeLegacyValues(source)
  const graphX = Number.isFinite(Number(source.graphX))
    ? Number(source.graphX)
    : Number.isFinite(Number(source.params?.canvasPosition?.x))
      ? Number(source.params.canvasPosition.x)
      : 0
  const graphY = Number.isFinite(Number(source.graphY))
    ? Number(source.graphY)
    : Number.isFinite(Number(source.params?.canvasPosition?.y))
      ? Number(source.params.canvasPosition.y)
      : 0
  const assetRef = ensureString(
    source.assetRef,
    Array.isArray(source.assetBindings) && source.assetBindings[0]?.assetId
      ? source.assetBindings[0].assetId
      : ''
  ) || null

  return {
    id: ensureString(source.id, generateId('node')),
    typeId,
    label: ensureString(source.label, typeId),
    values,
    graphX,
    graphY,
    runtimeId: source.runtimeId ?? null,
    assetRef
  }
}

const normalizeProjectEdge = (edge = {}) => {
  const source = edge && typeof edge === 'object' ? edge : {}
  const fromNodeId = ensureString(source.fromNodeId, ensureString(source.sourceId, ''))
  const toNodeId = ensureString(source.toNodeId, ensureString(source.targetId, ''))
  if (!fromNodeId || !toNodeId) return null
  const fromPort = ensureString(source.fromPort, 'out')
  const toPort = ensureString(source.toPort, ensureString(source.label, 'in'))
  return {
    id: ensureString(source.id, generateId('edge')),
    fromNodeId,
    fromPort,
    toNodeId,
    toPort
  }
}

const normalizeTemplate = (template = {}) => {
  const source = template && typeof template === 'object' ? template : {}
  return {
    id: ensureString(source.id, generateId('template')),
    label: ensureString(source.label, 'Untitled Template'),
    typeId: ensureString(source.typeId, ensureString(source.definitionId, '')),
    values: source.values && typeof source.values === 'object' ? cloneValue(source.values) : {}
  }
}

const normalizeWorkspaceState = (workspace = {}) => {
  const source = workspace && typeof workspace === 'object' ? workspace : {}
  const activeSurface = ensureString(source.activeSurface, defaultWorkspaceState.activeSurface)
  return {
    ...cloneValue(defaultWorkspaceState),
    ...cloneValue(source),
    activeSurface: ['world', 'view', 'graph'].includes(activeSurface) ? activeSurface : defaultWorkspaceState.activeSurface,
    selectedNodeId: ensureString(source.selectedNodeId, '') || null
  }
}

const normalizeNodesList = (list = []) => {
  const seenSingletons = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const normalized = normalizeProjectNode(raw)
    if (!normalized) continue
    if (SINGLETON_TYPE_IDS.has(normalized.typeId)) {
      if (seenSingletons.has(normalized.typeId)) continue
      seenSingletons.add(normalized.typeId)
    }
    out.push(normalized)
  }
  return out
}

const normalizeEdgesList = (list = [], nodeIds = new Set()) => {
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const normalized = normalizeProjectEdge(raw)
    if (!normalized) continue
    if (!nodeIds.has(normalized.fromNodeId) || !nodeIds.has(normalized.toNodeId)) continue
    out.push(normalized)
  }
  return out
}

const normalizeProjectDocument = (document = {}) => {
  const source = document && typeof document === 'object' ? document : {}
  const worldState = normalizeWorldState(source.worldState)
  const workspaceState = normalizeWorkspaceState(source.workspaceState)
  const nodes = normalizeNodesList(source.nodes)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = normalizeEdgesList(source.edges, nodeIds)

  return {
    version: PROJECT_DOCUMENT_VERSION,
    projectMeta: normalizeProjectMeta(source.projectMeta),
    nodes,
    edges,
    templates: Array.isArray(source.templates) ? source.templates.map(normalizeTemplate) : [],
    workspaceState: {
      ...workspaceState,
      selectedNodeId: nodeIds.has(workspaceState.selectedNodeId) ? workspaceState.selectedNodeId : null
    },
    entities: Array.isArray(source.entities) ? source.entities.map(normalizeEntity) : [],
    worldState,
    xrState: normalizeXrState(source.xrState),
    presentationState: normalizePresentationState(source.presentationState, worldState),
    publishState: normalizePublishState(source.publishState),
    windowLayout: normalizeWindowLayout(source.windowLayout),
    assets: Array.isArray(source.assets) ? source.assets.map(normalizeAsset) : []
  }
}

const mergePatch = (target, patch) => {
  if (Array.isArray(patch)) {
    return cloneValue(patch)
  }
  if (!patch || typeof patch !== 'object') {
    return patch
  }
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

const applyProjectOps = (document, ops = []) => {
  let nextDocument = normalizeProjectDocument(document)
  let entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
  let assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
  let nodes = new Map(nextDocument.nodes.map((node) => [node.id, node]))
  let edges = new Map(nextDocument.edges.map((edge) => [edge.id, edge]))

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
        if (!node) break
        if (SINGLETON_TYPE_IDS.has(node.typeId)) {
          const duplicate = Array.from(nodes.values()).some((existing) => existing.typeId === node.typeId)
          if (duplicate) break
        }
        nodes.set(node.id, node)
        break
      }
      case 'updateNode': {
        const nodeId = ensureString(payload.nodeId)
        if (!nodeId || !nodes.has(nodeId)) break
        const existing = nodes.get(nodeId)
        const patch = payload.patch || {}
        const nextValues = patch.values && typeof patch.values === 'object'
          ? { ...existing.values, ...cloneValue(patch.values) }
          : existing.values
        const merged = {
          ...existing,
          ...(patch.label !== undefined ? { label: ensureString(patch.label, existing.label) } : {}),
          ...(patch.graphX !== undefined ? { graphX: ensureNumber(patch.graphX, existing.graphX) } : {}),
          ...(patch.graphY !== undefined ? { graphY: ensureNumber(patch.graphY, existing.graphY) } : {}),
          ...(patch.runtimeId !== undefined ? { runtimeId: patch.runtimeId } : {}),
          ...(patch.assetRef !== undefined ? { assetRef: patch.assetRef || null } : {}),
          values: nextValues
        }
        nodes.set(nodeId, merged)
        break
      }
      case 'deleteNode': {
        const nodeId = ensureString(payload.nodeId)
        if (!nodeId) break
        nodes.delete(nodeId)
        for (const [edgeId, edge] of edges) {
          if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) edges.delete(edgeId)
        }
        if (nextDocument.workspaceState.selectedNodeId === nodeId) {
          nextDocument.workspaceState = normalizeWorkspaceState({
            ...nextDocument.workspaceState,
            selectedNodeId: null
          })
        }
        break
      }
      case 'createEdge': {
        if (!payload.edge) break
        const edge = normalizeProjectEdge(payload.edge)
        if (!edge) break
        if (!nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId)) break
        edges.set(edge.id, edge)
        break
      }
      case 'updateEdge': {
        const edgeId = ensureString(payload.edgeId)
        if (!edgeId || !edges.has(edgeId)) break
        const merged = normalizeProjectEdge(mergePatch(edges.get(edgeId), payload.patch || {}))
        if (!merged) break
        edges.set(edgeId, merged)
        break
      }
      case 'deleteEdge': {
        const edgeId = ensureString(payload.edgeId)
        if (edgeId) edges.delete(edgeId)
        break
      }
      case 'setWorldState': {
        nextDocument.worldState = normalizeWorldState(mergePatch(nextDocument.worldState, payload.patch || {}))
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
          edges = new Map(nextDocument.edges.map((edge) => [edge.id, edge]))
        }
        break
      }
      default:
        break
    }
  })

  nextDocument.entities = Array.from(entities.values())
  nextDocument.assets = Array.from(assets.values())
  nextDocument.nodes = Array.from(nodes.values())
  nextDocument.edges = Array.from(edges.values())
  nextDocument.projectMeta.updatedAt = Date.now()
  return normalizeProjectDocument(nextDocument)
}

module.exports = {
  PROJECT_DOCUMENT_VERSION,
  ENTITY_TYPES: Array.from(ENTITY_TYPES),
  WINDOW_IDS,
  defaultProjectDocument,
  defaultPresentationState,
  defaultPublishState,
  defaultWorldState,
  defaultXrState,
  defaultWindowLayout,
  buildDefaultComponentsForType,
  cloneValue,
  ensureVector,
  generateId,
  mergePatch,
  normalizeAsset,
  normalizeEntity,
  normalizePresentationState,
  normalizePublishState,
  normalizeProjectDocument,
  normalizeProjectNode,
  normalizeProjectEdge,
  normalizeProjectMeta,
  normalizeWindowLayout,
  applyProjectOps
}
