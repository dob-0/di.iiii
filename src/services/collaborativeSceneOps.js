import {
    SCENE_DATA_VERSION,
    applySceneOps,
    cloneSceneValue,
    generateObjectId,
    normalizeObjects
} from '../shared/sceneSchema.js'

export const COLLABORATIVE_SCENE_SETTING_KEYS = [
    'backgroundColor',
    'gridSize',
    'gridAppearance',
    'renderSettings',
    'ambientLight',
    'directionalLight',
    'transformSnaps'
]

export const buildCollaborativeSceneSnapshot = ({
    objects = [],
    backgroundColor,
    gridSize,
    gridAppearance,
    renderSettings,
    ambientLight,
    directionalLight,
    transformSnaps,
    default3DView
} = {}) => ({
    version: SCENE_DATA_VERSION,
    objects: normalizeObjects(cloneSceneValue(objects)),
    backgroundColor,
    gridSize,
    gridAppearance: cloneSceneValue(gridAppearance),
    renderSettings: cloneSceneValue(renderSettings),
    ambientLight: cloneSceneValue(ambientLight),
    directionalLight: cloneSceneValue(directionalLight),
    transformSnaps: cloneSceneValue(transformSnaps),
    default3DView: cloneSceneValue(default3DView)
})

export const getSceneSnapshotSignature = (snapshot) => JSON.stringify(snapshot || null)

const buildObjectPatch = (prevObject = {}, nextObject = {}) => {
    const patch = {}
    const keys = new Set([
        ...Object.keys(prevObject || {}),
        ...Object.keys(nextObject || {})
    ])
    keys.forEach((key) => {
        if (key === 'id') return
        const before = prevObject?.[key]
        const after = nextObject?.[key]
        if (JSON.stringify(before) !== JSON.stringify(after)) {
            patch[key] = cloneSceneValue(after)
        }
    })
    return patch
}

export const buildSceneOpsFromSnapshots = ({
    previousSnapshot,
    nextSnapshot,
    clientId
} = {}) => {
    if (!previousSnapshot || !nextSnapshot) return []

    const ops = []
    const previousObjects = Array.isArray(previousSnapshot.objects) ? previousSnapshot.objects : []
    const nextObjects = Array.isArray(nextSnapshot.objects) ? nextSnapshot.objects : []
    const previousById = new Map(previousObjects.map(obj => [obj.id, obj]))
    const nextById = new Map(nextObjects.map(obj => [obj.id, obj]))

    nextObjects.forEach((object) => {
        if (!object?.id) return
        if (!previousById.has(object.id)) {
            ops.push({
                opId: generateObjectId(),
                clientId,
                type: 'addObject',
                payload: { object: cloneSceneValue(object) }
            })
            return
        }
        const previousObject = previousById.get(object.id)
        const patch = buildObjectPatch(previousObject, object)
        if (Object.keys(patch).length > 0) {
            ops.push({
                opId: generateObjectId(),
                clientId,
                type: 'updateObject',
                payload: {
                    objectId: object.id,
                    patch
                }
            })
        }
    })

    previousObjects.forEach((object) => {
        if (!object?.id || nextById.has(object.id)) return
        ops.push({
            opId: generateObjectId(),
            clientId,
            type: 'deleteObject',
            payload: { objectId: object.id }
        })
    })

    const settingsPatch = {}
    COLLABORATIVE_SCENE_SETTING_KEYS.forEach((key) => {
        if (JSON.stringify(previousSnapshot[key]) !== JSON.stringify(nextSnapshot[key])) {
            settingsPatch[key] = cloneSceneValue(nextSnapshot[key])
        }
    })
    if (Object.keys(settingsPatch).length > 0) {
        ops.push({
            opId: generateObjectId(),
            clientId,
            type: 'setSceneSettings',
            payload: settingsPatch
        })
    }

    if (JSON.stringify(previousSnapshot.default3DView) !== JSON.stringify(nextSnapshot.default3DView)) {
        ops.push({
            opId: generateObjectId(),
            clientId,
            type: 'setView',
            payload: {
                default3DView: cloneSceneValue(nextSnapshot.default3DView)
            }
        })
    }

    return ops
}

export {
    applySceneOps,
    cloneSceneValue
}
