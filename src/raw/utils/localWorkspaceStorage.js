export const DEFAULT_LOCAL_WORKSPACE_STORAGE_KEY = 'dii.localNodeWorkspace.main'

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

export const readLocalWorkspaceDocument = (storageKey = DEFAULT_LOCAL_WORKSPACE_STORAGE_KEY) => {
    if (!storageKey || !canUseStorage()) return null
    try {
        const rawValue = window.localStorage.getItem(storageKey)
        if (!rawValue) return null
        const parsed = JSON.parse(rawValue)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

export const writeLocalWorkspaceDocument = (storageKey = DEFAULT_LOCAL_WORKSPACE_STORAGE_KEY, document = null) => {
    if (!storageKey || !document || typeof document !== 'object' || !canUseStorage()) return false
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(document))
        return true
    } catch {
        return false
    }
}

export const clearLocalWorkspaceDocument = (storageKey = DEFAULT_LOCAL_WORKSPACE_STORAGE_KEY) => {
    if (!storageKey || !canUseStorage()) return false
    try {
        window.localStorage.removeItem(storageKey)
        return true
    } catch {
        return false
    }
}
