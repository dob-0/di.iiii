const PROJECT_DOCUMENT_VERSION = 1
const VECTOR_SIZE = 3

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
    viewport: {
      id: 'viewport',
      title: 'Viewport',
      visible: true,
      minimized: false,
      pinned: true,
      x: 24,
      y: 176,
      width: 860,
      height: 580,
      zIndex: 3
    },
    assets: {
      id: 'assets',
      title: 'Assets',
      visible: true,
      minimized: false,
      pinned: false,
      x: 910,
      y: 176,
      width: 360,
      height: 360,
      zIndex: 4
    },
    inspector: {
      id: 'inspector',
      title: 'Inspector',
      visible: true,
      minimized: false,
      pinned: false,
      x: 910,
      y: 552,
      width: 360,
      height: 420,
      zIndex: 5
    },
    outliner: {
      id: 'outliner',
      title: 'Outliner',
      visible: false,
      minimized: false,
      pinned: false,
      x: 24,
      y: 620,
      width: 280,
      height: 260,
      zIndex: 2
    },
    activity: {
      id: 'activity',
      title: 'Activity',
      visible: false,
      minimized: false,
      pinned: false,
      x: 320,
      y: 620,
      width: 340,
      height: 260,
      zIndex: 1
    },
    project: {
      id: 'project',
      title: 'Project',
      visible: false,
      minimized: false,
      pinned: false,
      x: 680,
      y: 620,
      width: 320,
      height: 260,
      zIndex: 1
    }
  }
}

const defaultWorldState = {
  backgroundColor: '#ebe7df',
  gridVisible: true,
  gridSize: 24,
  ambientLight: {
    color: '#ffffff',
    intensity: 0.85
  },
  directionalLight: {
    color: '#fff7ea',
    intensity: 1.15,
    position: [8, 12, 4]
  },
  savedView: {
    mode: 'perspective',
    position: [0, 2.4, 6.5],
    target: [0, 0.75, 0]
  }
}

const defaultXrState = {
  mode: 'none',
  debugVisible: false,
  vrSupported: false,
  arSupported: false
}

const defaultProjectDocument = {
  version: PROJECT_DOCUMENT_VERSION,
  projectMeta: {
    id: '',
    spaceId: 'main',
    title: 'Untitled Beta Project',
    createdAt: 0,
    updatedAt: 0,
    source: 'beta-v2'
  },
  entities: [],
  worldState: defaultWorldState,
  xrState: defaultXrState,
  windowLayout: defaultWindowLayout,
  assets: []
}

const buildDefaultComponentsForType = (type = 'box') => {
  const base = {
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    appearance: {
      color: '#5fa8ff',
      opacity: 1
    }
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
      base.text = {
        value: 'New Text',
        variant: '2d',
        fontFamily: 'Inter, sans-serif',
        fontWeight: '600',
        fontStyle: 'normal',
        fontSize3D: 0.45,
        depth3D: 0.08
      }
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
    windows[windowId] = normalizeWindowState(
      windowId,
      source.windows?.[windowId],
      defaultWindowLayout.windows[windowId]
    )
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
  const sourceComponents = entity.components && typeof entity.components === 'object'
    ? cloneValue(entity.components)
    : {}
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

const normalizeProjectMeta = (meta = {}) => {
  const source = meta && typeof meta === 'object' ? meta : {}
  const now = Date.now()
  return {
    id: ensureString(source.id, ''),
    spaceId: ensureString(source.spaceId, 'main'),
    title: ensureString(source.title, 'Untitled Beta Project'),
    createdAt: ensureNumber(source.createdAt, now),
    updatedAt: ensureNumber(source.updatedAt, now),
    source: ensureString(source.source, 'beta-v2')
  }
}

const normalizeProjectDocument = (document = {}) => {
  const source = document && typeof document === 'object' ? document : {}
  return {
    version: PROJECT_DOCUMENT_VERSION,
    projectMeta: normalizeProjectMeta(source.projectMeta),
    entities: Array.isArray(source.entities) ? source.entities.map(normalizeEntity) : [],
    worldState: normalizeWorldState(source.worldState),
    xrState: normalizeXrState(source.xrState),
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
        const nextEntity = normalizeEntity(mergePatch(entities.get(entityId), payload.patch || {}))
        entities.set(entityId, nextEntity)
        break
      }
      case 'updateComponent': {
        const entityId = ensureString(payload.entityId)
        const component = ensureString(payload.component)
        if (!entityId || !component || !entities.has(entityId)) break
        const entity = entities.get(entityId)
        const patchedEntity = normalizeEntity({
          ...entity,
          components: {
            ...entity.components,
            [component]: mergePatch(entity.components?.[component], payload.patch || {})
          }
        })
        entities.set(entityId, patchedEntity)
        break
      }
      case 'deleteEntity': {
        const entityId = ensureString(payload.entityId)
        if (entityId) {
          entities.delete(entityId)
        }
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
        if (assetId) {
          assets.delete(assetId)
        }
        break
      }
      case 'replaceDocument': {
        if (payload.document && typeof payload.document === 'object') {
          nextDocument = normalizeProjectDocument(payload.document)
          entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
          assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
        }
        break
      }
      default:
        break
    }
  })

  nextDocument.entities = Array.from(entities.values())
  nextDocument.assets = Array.from(assets.values())
  nextDocument.projectMeta.updatedAt = Date.now()
  return normalizeProjectDocument(nextDocument)
}

module.exports = {
  PROJECT_DOCUMENT_VERSION,
  ENTITY_TYPES: Array.from(ENTITY_TYPES),
  WINDOW_IDS,
  defaultProjectDocument,
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
  normalizeProjectDocument,
  normalizeProjectMeta,
  normalizeWindowLayout,
  applyProjectOps
}
