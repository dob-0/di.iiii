export const SCENE_DATA_VERSION = 4
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

export const defaultScene = {
    version: SCENE_DATA_VERSION,
    objects: [],
    backgroundColor: '#FFFFF0',
    gridSize: 1000,
    isGridVisible: true,
    isGizmoVisible: true,
    isPerfVisible: false,
    ambientLight: {
        color: '#ffffff',
        intensity: 0.6
    },
    directionalLight: {
        color: '#ffffff',
        intensity: 1,
        position: [10, 10, 5]
    },
    transformSnaps: {
        translation: 1,
        rotation: 15,
        scale: 0.1
    },
    default3DView: {
        position: [8, 8, 8],
        target: [0, 0, 0]
    },
    savedView: {
        viewMode: '3D',
        position: [8, 8, 8],
        target: [0, 0, 0]
    }
}

export const generateObjectId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const normalizeObject = (obj) => {
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

export const normalizeObjects = (list = []) => list.map(normalizeObject)

