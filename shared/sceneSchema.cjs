const SCENE_DATA_VERSION = 4
const VECTOR_SIZE = 3
const DEFAULT_FIXED_CAMERA_POSITION = [0, 1.6, 4]
const DEFAULT_FIXED_CAMERA_TARGET = [0, 1, 0]
const SCENE_SETTINGS_KEYS = [
  'backgroundColor',
  'gridSize',
  'gridAppearance',
  'renderSettings',
  'ambientLight',
  'directionalLight',
  'transformSnaps',
  'presentation',
  'isGridVisible',
  'isGizmoVisible',
  'isPerfVisible'
]

const ensureVector = (vector, defaults) => {
  const source = Array.isArray(vector) ? vector : []
  return defaults.map((fallback, idx) => {
    const value = Number(source[idx])
    return Number.isFinite(value) ? value : fallback
  })
}

const ensureExpressions = (exprs) => {
  if (!Array.isArray(exprs)) {
    return Array(VECTOR_SIZE).fill(null)
  }
  return Array.from({ length: VECTOR_SIZE }, (_, idx) => {
    const raw = exprs[idx]
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  })
}

const defaultPresentation = {
  mode: 'scene',
  sourceType: 'html',
  url: '',
  html: '',
  fixedCamera: {
    projection: 'perspective',
    position: [...DEFAULT_FIXED_CAMERA_POSITION],
    target: [...DEFAULT_FIXED_CAMERA_TARGET],
    fov: 60,
    zoom: 1,
    near: 0.1,
    far: 200,
    locked: true
  }
}

const normalizeFixedCamera = (fixedCamera = {}) => {
  const nextNear = Number(fixedCamera?.near)
  const near = Number.isFinite(nextNear) && nextNear > 0 ? nextNear : defaultPresentation.fixedCamera.near
  const nextFar = Number(fixedCamera?.far)
  const fallbackFar = Math.max(defaultPresentation.fixedCamera.far, near + 1)
  const far = Number.isFinite(nextFar) && nextFar > near ? nextFar : fallbackFar
  const nextFov = Number(fixedCamera?.fov)
  const nextZoom = Number(fixedCamera?.zoom)
  return {
    projection: fixedCamera?.projection === 'orthographic' ? 'orthographic' : 'perspective',
    position: ensureVector(fixedCamera?.position, defaultPresentation.fixedCamera.position),
    target: ensureVector(fixedCamera?.target, defaultPresentation.fixedCamera.target),
    fov: Number.isFinite(nextFov) && nextFov > 0 ? nextFov : defaultPresentation.fixedCamera.fov,
    zoom: Number.isFinite(nextZoom) && nextZoom > 0 ? nextZoom : defaultPresentation.fixedCamera.zoom,
    near,
    far,
    locked: true
  }
}

const normalizePresentation = (presentation = {}) => ({
  mode: presentation?.mode === 'code'
    ? 'code'
    : (presentation?.mode === 'fixed-camera' ? 'fixed-camera' : 'scene'),
  sourceType: presentation?.sourceType === 'url' ? 'url' : 'html',
  url: typeof presentation?.url === 'string' ? presentation.url.trim() : '',
  html: typeof presentation?.html === 'string' ? presentation.html : '',
  fixedCamera: normalizeFixedCamera(presentation?.fixedCamera)
})

const defaultGridAppearance = {
  cellSize: 0.75,
  cellThickness: 0.3,
  sectionSize: 6,
  sectionThickness: 0.65,
  fadeDistance: 42,
  fadeStrength: 0.35,
  offset: 0.015,
  color: '#2b313d',
  sectionColor: '#465063'
}

const defaultScene = {
  version: SCENE_DATA_VERSION,
  objects: [],
  backgroundColor: '#171a20',
  gridSize: 20,
  isGridVisible: true,
  isGizmoVisible: true,
  isPerfVisible: false,
  ambientLight: {
    color: '#ffffff',
    intensity: 0.8
  },
  directionalLight: {
    color: '#ffffff',
    intensity: 1,
    position: [10, 10, 5]
  },
  transformSnaps: {
    translation: 0.1,
    rotation: 15,
    scale: 0.1
  },
  presentation: {
    ...defaultPresentation
  },
  // use a camera position that's closer and centered on the origin
  default3DView: {
    position: [0, 1.6, 4],
    target: [0, 1, 0]
  },
  savedView: {
    viewMode: '3D',
    position: [0, 1.6, 4],
    target: [0, 1, 0]
  }
}

const generateObjectId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const normalizeObject = (obj) => {
  if (!obj) return obj
  const ensuredId = obj.id ?? generateObjectId()
  return {
    ...obj,
    id: ensuredId,
    position: ensureVector(obj.position, [0, 0, 0]),
    rotation: ensureVector(obj.rotation, [0, 0, 0]),
    scale: ensureVector(obj.scale, [1, 1, 1]),
    positionExpressions: ensureExpressions(obj.positionExpressions),
    rotationExpressions: ensureExpressions(obj.rotationExpressions),
    scaleExpressions: ensureExpressions(obj.scaleExpressions)
  }
}

const normalizeObjects = (list = []) => list.map(normalizeObject)

const cloneSceneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneSceneValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneSceneValue(nested)])
    )
  }
  return value
}

const buildBaseScene = (scene) => ({
  ...defaultScene,
  ...(scene && typeof scene === 'object' ? cloneSceneValue(scene) : {}),
  objects: normalizeObjects(scene?.objects || []),
  presentation: normalizePresentation(scene?.presentation)
})

const applySceneOps = (scene, ops = []) => {
  let nextScene = buildBaseScene(scene)
  const objectsById = new Map(nextScene.objects.map(obj => [obj.id, obj]))

  const applyPatch = (obj, patch = {}) => ({
    ...obj,
    ...cloneSceneValue(patch)
  })

  ops.forEach((op) => {
    const payload = op?.payload || {}
    switch (op?.type) {
      case 'addObject': {
        if (!payload.object) break
        const object = normalizeObject(payload.object)
        objectsById.set(object.id, object)
        break
      }
      case 'updateObject': {
        const targetId = payload.objectId
        if (!targetId || !objectsById.has(targetId)) break
        const existing = objectsById.get(targetId)
        objectsById.set(targetId, normalizeObject(applyPatch(existing, payload.patch || {})))
        break
      }
      case 'deleteObject': {
        const targetId = payload.objectId
        if (targetId) {
          objectsById.delete(targetId)
        }
        break
      }
      case 'setSceneSettings': {
        SCENE_SETTINGS_KEYS.forEach((key) => {
          if (key in payload) {
            nextScene[key] = key === 'presentation'
              ? normalizePresentation(payload[key])
              : cloneSceneValue(payload[key])
          }
        })
        break
      }
      case 'setView': {
        if (payload.savedView && typeof payload.savedView === 'object') {
          nextScene.savedView = {
            ...(nextScene.savedView || defaultScene.savedView),
            ...cloneSceneValue(payload.savedView)
          }
        }
        if (payload.default3DView && typeof payload.default3DView === 'object') {
          nextScene.default3DView = {
            ...(nextScene.default3DView || defaultScene.default3DView),
            ...cloneSceneValue(payload.default3DView)
          }
        }
        break
      }
      case 'replaceScene': {
        if (payload.scene && typeof payload.scene === 'object') {
          nextScene = buildBaseScene(payload.scene)
          objectsById.clear()
          nextScene.objects.forEach(obj => objectsById.set(obj.id, obj))
        }
        break
      }
      default:
        break
    }
  })

  nextScene.objects = Array.from(objectsById.values())
  return nextScene
}

module.exports = {
  SCENE_DATA_VERSION,
  SCENE_SETTINGS_KEYS,
  defaultPresentation,
  defaultGridAppearance,
  defaultScene,
  ensureVector,
  ensureExpressions,
  normalizeFixedCamera,
  normalizePresentation,
  cloneSceneValue,
  normalizeObject,
  normalizeObjects,
  generateObjectId,
  applySceneOps
}
