import { useMemo } from 'react'

export function useStatusItems({
    uploadProgress,
    assetRestoreProgress,
    serverAssetSyncProgress,
    serverAssetSyncPending,
    localSaveStatus,
    mediaOptimizationStatus,
    supportsServerSpaces,
    isOfflineMode,
    sceneVersion,
    spaceId,
    canPublishToServer,
    serverSyncInfo
}) {
    return useMemo(() => {
        const list = []

        if (uploadProgress?.active) {
            const percent = uploadProgress.total ? Math.round((uploadProgress.completed / uploadProgress.total) * 100) : 0
            list.push({
                key: 'upload',
                label: 'Uploading Assets',
                percent,
                detail: `${uploadProgress.completed}/${uploadProgress.total}`
            })
        }

        if (assetRestoreProgress?.active) {
            const percent = assetRestoreProgress.total ? Math.round((assetRestoreProgress.completed / assetRestoreProgress.total) * 100) : 0
            list.push({
                key: 'restore',
                label: 'Restoring Assets',
                percent,
                detail: `${assetRestoreProgress.completed}/${assetRestoreProgress.total}`
            })
        }

        if (serverAssetSyncProgress?.active) {
            const percent = serverAssetSyncProgress.total
                ? Math.round((serverAssetSyncProgress.completed / serverAssetSyncProgress.total) * 100)
                : 0
            list.push({
                key: 'server-asset-sync-progress',
                label: serverAssetSyncProgress.label || 'Syncing assets to server...',
                percent,
                detail: `${serverAssetSyncProgress.completed}/${serverAssetSyncProgress.total}`
            })
        } else if (serverAssetSyncPending > 0) {
            list.push({
                key: 'server-asset-sync',
                label: 'Syncing assets to server...',
                indeterminate: true,
                detail: `${serverAssetSyncPending} pending`
            })
        }

        const localSaveDetail = localSaveStatus?.ts
            ? new Date(localSaveStatus.ts).toLocaleTimeString()
            : ''
        list.push({
            key: 'local-save',
            label: localSaveStatus?.ts ? localSaveStatus.label : 'Local: not saved yet',
            detail: localSaveDetail,
            showBar: false
        })

        if (mediaOptimizationStatus?.active) {
            const hasTotal = mediaOptimizationStatus.total > 0
            const percent = hasTotal
                ? Math.round((mediaOptimizationStatus.completed / mediaOptimizationStatus.total) * 100)
                : 0
            list.push({
                key: 'media-optimization',
                label: mediaOptimizationStatus.label || 'Optimizing media',
                percent: hasTotal ? percent : undefined,
                indeterminate: !hasTotal,
                detail: `${mediaOptimizationStatus.completed}/${mediaOptimizationStatus.total || '?'}`
            })
        }

        const serverLabel = (() => {
            if (!supportsServerSpaces || isOfflineMode) return 'Server sync unavailable'
            if (!sceneVersion || !spaceId) return 'Server sync disabled'
            if (!canPublishToServer) return 'Server sync disabled'
            return 'Server sync ready'
        })()
        const serverDetail = (() => {
            if (!canPublishToServer || isOfflineMode) return ''
            if (!serverSyncInfo?.ts) return 'Not synced yet'
            return `${serverSyncInfo.label} @ ${new Date(serverSyncInfo.ts).toLocaleTimeString()}`
        })()
        list.push({
            key: 'server-status',
            label: serverLabel,
            percent: 0,
            detail: serverDetail,
            showBar: false
        })

        return list
    }, [
        uploadProgress?.active,
        uploadProgress?.completed,
        uploadProgress?.total,
        assetRestoreProgress?.active,
        assetRestoreProgress?.completed,
        assetRestoreProgress?.total,
        serverAssetSyncProgress?.active,
        serverAssetSyncProgress?.completed,
        serverAssetSyncProgress?.total,
        serverAssetSyncProgress?.label,
        serverAssetSyncPending,
        localSaveStatus?.ts,
        localSaveStatus?.label,
        mediaOptimizationStatus?.active,
        mediaOptimizationStatus?.completed,
        mediaOptimizationStatus?.total,
        mediaOptimizationStatus?.label,
        supportsServerSpaces,
        isOfflineMode,
        sceneVersion,
        spaceId,
        canPublishToServer,
        serverSyncInfo?.label,
        serverSyncInfo?.ts
    ])
}

export default useStatusItems
