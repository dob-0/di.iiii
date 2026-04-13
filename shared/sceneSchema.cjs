const SCENE_DATA_VERSION = 4
const VECTOR_SIZE = 3

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

const defaultScene = {
  version: SCENE_DATA_VERSION,
  objects: [],
  // more neutral, slightly warm background to improve contrast
  backgroundColor: '#f7f6ef',
  // make grid reasonably sized for a new empty scene
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

module.exports = {
  SCENE_DATA_VERSION,
  defaultScene,
  ensureVector,
  ensureExpressions,
  normalizeObject,
  normalizeObjects,
  generateObjectId
}
