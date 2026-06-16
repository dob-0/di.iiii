import { useCallback, useEffect, useMemo, useState } from 'react'

const OFFLINE_MODE_STORAGE_PREFIX = '3d-editor-offline-mode'

export function useSyncPreferences({
    spaceId,
    liveSyncFeatureEnabled,
    canSyncServerScene
} = {}) {
    const offlineModeStorageKey = useMemo(() => {
        if (!spaceId) return `${OFFLINE_MODE_STORAGE_PREFIX}:local`
        return `${OFFLINE_MODE_STORAGE_PREFIX}:${spaceId}`
    }, [spaceId])

    const [isOfflineMode, setIsOfflineMode] = useState(() => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) return false
        try {
            return window.localStorage.getItem(offlineModeStorageKey) === 'true'
        } catch {
            return false
        }
    })

    useEffect(() => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) {
            setIsOfflineMode(false)
            return
        }
        try {
            setIsOfflineMode(window.localStorage.getItem(offlineModeStorageKey) === 'true')
        } catch {
            setIsOfflineMode(false)
        }
    }, [offlineModeStorageKey])

    const persistOfflinePreference = useCallback((nextValue) => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) return
        try {
            window.localStorage.setItem(offlineModeStorageKey, nextValue ? 'true' : 'false')
        } catch {
            // ignore storage errors
        }
    }, [offlineModeStorageKey])

    const setOfflineMode = useCallback((nextValue) => {
        setIsOfflineMode(nextValue)
        persistOfflinePreference(nextValue)
    }, [persistOfflinePreference])

    const liveSyncStorageKey = useMemo(() => (canSyncServerScene ? `live-sync:${spaceId}` : null), [canSyncServerScene, spaceId])

    const readLiveSyncPreference = useCallback(() => {
        if (!liveSyncFeatureEnabled || !liveSyncStorageKey || typeof window === 'undefined') {
            return false
        }
        try {
            const stored = window.localStorage.getItem(liveSyncStorageKey)
            if (stored === 'on') return true
            if (stored === 'off') return false
        } catch {
            // ignore storage errors
        }
        return true
    }, [liveSyncFeatureEnabled, liveSyncStorageKey])

    const [isLiveSyncEnabledState, setIsLiveSyncEnabledState] = useState(false)
    const setIsLiveSyncEnabled = useCallback((nextValue) => {
        setIsLiveSyncEnabledState(nextValue)
        if (!liveSyncStorageKey || typeof window === 'undefined') return
        try {
            window.localStorage.setItem(liveSyncStorageKey, nextValue ? 'on' : 'off')
        } catch {
            // ignore
        }
    }, [liveSyncStorageKey])

    useEffect(() => {
        if (!liveSyncFeatureEnabled || isOfflineMode) return
        setIsLiveSyncEnabledState(readLiveSyncPreference())
    }, [isOfflineMode, liveSyncFeatureEnabled, readLiveSyncPreference])

    useEffect(() => {
        if (!liveSyncFeatureEnabled || !canSyncServerScene || isOfflineMode) {
            setIsLiveSyncEnabled(false)
        }
    }, [canSyncServerScene, isOfflineMode, liveSyncFeatureEnabled, setIsLiveSyncEnabled])

    const isLiveSyncEnabled = Boolean(liveSyncFeatureEnabled && isLiveSyncEnabledState && canSyncServerScene)
    const shouldSyncServerScene = Boolean(liveSyncFeatureEnabled && canSyncServerScene && isLiveSyncEnabled)

    return {
        isOfflineMode,
        setOfflineMode,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        shouldSyncServerScene
    }
}

export default useSyncPreferences
