import { useCallback, useMemo, useState } from 'react'
import { supportsServerSpaces } from '../services/serverSpaces.js'
import { getSceneStorageKey, persistSceneToLocalStorage } from '../storage/scenePersistence.js'
import { useServerEndpoints } from './useServerEndpoints.js'
import { useSyncPreferences } from './useSyncPreferences.js'

export function useAppSyncSupportState({
    spaceId,
    liveSyncFeatureEnabled
} = {}) {
    const canAccessServerSpaces = supportsServerSpaces && Boolean(spaceId)
    const canSyncServerScene = Boolean(liveSyncFeatureEnabled && canAccessServerSpaces)

    const {
        isOfflineMode,
        setOfflineMode,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        shouldSyncServerScene
    } = useSyncPreferences({
        spaceId,
        liveSyncFeatureEnabled,
        canSyncServerScene
    })

    const { serverAssetBaseUrl, buildSpaceApiUrl } = useServerEndpoints(spaceId)
    const sceneStorageKey = useMemo(() => getSceneStorageKey(spaceId), [spaceId])

    const persistSceneData = useCallback(
        (sceneData) => persistSceneToLocalStorage(sceneData, sceneStorageKey),
        [sceneStorageKey]
    )

    const [localSaveStatus, setLocalSaveStatus] = useState({
        ts: null,
        label: 'Not saved locally'
    })

    const markLocalSave = useCallback((label = 'Saved locally') => {
        setLocalSaveStatus({ ts: Date.now(), label })
    }, [])

    const persistSceneDataWithStatus = useCallback(
        (sceneData, label = 'Auto-saved locally') => {
            const ok = persistSceneData(sceneData)
            if (ok) {
                markLocalSave(label)
            }
            return ok
        },
        [markLocalSave, persistSceneData]
    )

    const [serverSyncInfo, setServerSyncInfo] = useState({
        ts: null,
        label: 'Server: not synced yet'
    })

    const markServerSync = useCallback((label = 'Synced with server') => {
        setServerSyncInfo({ ts: Date.now(), label })
    }, [])

    return {
        canAccessServerSpaces,
        canSyncServerScene,
        isOfflineMode,
        setOfflineMode,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        shouldSyncServerScene,
        serverAssetBaseUrl,
        buildSpaceApiUrl,
        sceneStorageKey,
        localSaveStatus,
        markLocalSave,
        persistSceneDataWithStatus,
        serverSyncInfo,
        markServerSync
    }
}

export default useAppSyncSupportState
