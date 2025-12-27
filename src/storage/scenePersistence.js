import { listSpaces } from './spaceStore.js'
import { defaultScene } from '../state/sceneStore.js'

export const LOCAL_STORAGE_KEY = '3d-editor-scene'
const STORAGE_KEY_PREFIX = `${LOCAL_STORAGE_KEY}:`

export const getSceneStorageKey = (spaceId) => {
    if (!spaceId) return LOCAL_STORAGE_KEY
    return `${LOCAL_STORAGE_KEY}:${spaceId}`
}

const isQuotaExceededError = (error) => {
    if (!error) return false
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        return true
    }
    // Safari/iOS report code 22, Firefox 1014
    return error.code === 22 || error.code === 1014
}

const evictSceneStorageEntry = (keepKey) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return false
    }
    try {
        const spaces = listSpaces()
        for (let index = spaces.length - 1; index >= 0; index -= 1) {
            const space = spaces[index]
            if (space.isPermanent) continue
            const candidateKey = getSceneStorageKey(space.id)
            if (candidateKey === keepKey) continue
            if (window.localStorage.getItem(candidateKey) !== null) {
                window.localStorage.removeItem(candidateKey)
                console.warn(`Removed stored scene for space ${space.id} to free quota.`)
                return true
            }
        }
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
            const key = window.localStorage.key(i)
            if (!key || key === keepKey) continue
            if (key === LOCAL_STORAGE_KEY || key.startsWith(STORAGE_KEY_PREFIX)) {
                window.localStorage.removeItem(key)
                console.warn(`Removed stored scene "${key}" to free quota.`)
                return true
            }
        }
    } catch (error) {
        console.warn('Failed to evict stored scene data', error)
    }
    return false
}

export const persistSceneToLocalStorage = (sceneData, storageKey = LOCAL_STORAGE_KEY) => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return false
        }
        const jsonString = JSON.stringify(sceneData)
        const attemptSave = () => {
            window.localStorage.setItem(storageKey, jsonString)
            return true
        }
        try {
            return attemptSave()
        } catch (error) {
            if (!isQuotaExceededError(error)) {
                throw error
            }
            while (evictSceneStorageEntry(storageKey)) {
                try {
                    return attemptSave()
                } catch (retryError) {
                    if (!isQuotaExceededError(retryError)) {
                        throw retryError
                    }
                }
            }
            throw error
        }
    } catch (error) {
        console.error('Failed to save scene to localStorage:', error)
        alert('Error: Could not save scene. Please export your work and clear saved scenes.')
        return false
    }
}

export const buildSceneSignature = (scene = {}) => {
    const {
        version = defaultScene.version,
        objects = [],
        backgroundColor = defaultScene.backgroundColor,
        ambientLight = defaultScene.ambientLight,
        directionalLight = defaultScene.directionalLight,
        transformSnaps = defaultScene.transformSnaps,
        gridSize = defaultScene.gridSize,
        isGridVisible = defaultScene.isGridVisible,
        isGizmoVisible = defaultScene.isGizmoVisible,
        isPerfVisible = defaultScene.isPerfVisible
    } = scene
    return JSON.stringify({
        version,
        objects,
        backgroundColor,
        ambientLight,
        directionalLight,
        transformSnaps,
        gridSize,
        isGridVisible,
        isGizmoVisible,
        isPerfVisible
    })
}
