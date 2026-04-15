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
    liveSyncFeatureEnabled,
    isLiveSyncEnabled,
    sceneVersion,
    spaceId,
    canPublishToServer,
    isReadOnly,
    serverSyncInfo,
    isSocketConnected,
    collaborators,
    participantRoster,
    isSceneStreamConnected,
    sceneStreamState,
    sceneStreamError
}) {
    return useMemo(() => {
        const list = []
        const otherParticipants = Array.isArray(participantRoster)
            ? participantRoster.filter((participant) => !participant.isSelf)
            : []
        const collaboratorCount = collaborators?.length || otherParticipants.length || 0
        const collaboratorSummary = collaboratorCount > 0
            ? otherParticipants
                .slice(0, 3)
                .map((participant) => participant.userName || participant.displayName || participant.userId)
                .filter(Boolean)
                .join(', ')
            : 'No other collaborators online'

        if (isReadOnly) {
            list.push({
                key: 'read-only',
                label: 'Read-only mode',
                detail: 'Editing locked by admin',
                showBar: false
            })
        }

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
            if (isReadOnly) return 'Read-only (editing locked)'
            if (!spaceId) return 'Server sync disabled'
            if (!canPublishToServer) return 'Server sync disabled'
            if (liveSyncFeatureEnabled && isLiveSyncEnabled && sceneStreamState === 'degraded') return 'Live collaboration degraded'
            if (liveSyncFeatureEnabled && isLiveSyncEnabled) return 'Live collaboration active'
            return 'Server sync ready'
        })()
        const serverDetail = (() => {
            if (isReadOnly) return ''
            if (!canPublishToServer || isOfflineMode) return ''
            if (liveSyncFeatureEnabled && isLiveSyncEnabled) {
                if (sceneStreamState === 'degraded') {
                    return sceneStreamError || 'Presence is connected, but the scene event stream is reconnecting.'
                }
                if (!serverSyncInfo?.ts) return 'Scene edits sync live. Publish is still available for full-scene overwrite.'
                return `${serverSyncInfo.label} @ ${new Date(serverSyncInfo.ts).toLocaleTimeString()}`
            }
            if (!serverSyncInfo?.ts) return 'Live sync is off. Use Publish to sync changes between browsers.'
            return `${serverSyncInfo.label} @ ${new Date(serverSyncInfo.ts).toLocaleTimeString()}`
        })()
        list.push({
            key: 'server-status',
            label: serverLabel,
            percent: 0,
            detail: serverDetail,
            showBar: false
        })

        if (supportsServerSpaces && !isOfflineMode) {
            list.push({
                key: 'presence-status',
                label: isSocketConnected
                    ? `Presence connected: ${collaboratorCount} ${collaboratorCount === 1 ? 'collaborator' : 'collaborators'} online`
                    : 'Presence disconnected',
                detail: isSocketConnected
                    ? `${collaboratorSummary}. ${liveSyncFeatureEnabled && isLiveSyncEnabled ? 'Cursor presence uses sockets.' : 'Publish to sync scene changes.'}`
                    : 'Waiting to reconnect presence and cursor updates.',
                showBar: false
            })
        }

        if (supportsServerSpaces && !isOfflineMode && liveSyncFeatureEnabled && isLiveSyncEnabled) {
            const streamLabel = (() => {
                if (sceneStreamState === 'connected') return 'Scene stream connected'
                if (sceneStreamState === 'connecting') return 'Scene stream connecting'
                if (sceneStreamState === 'degraded') return 'Scene stream degraded'
                return 'Scene stream idle'
            })()
            const streamDetail = (() => {
                if (sceneStreamState === 'connected') {
                    return 'Scene edits sync live through the event stream.'
                }
                if (sceneStreamState === 'connecting') {
                    return 'Presence may be online while the scene event stream catches up.'
                }
                if (sceneStreamState === 'degraded') {
                    return sceneStreamError || 'Presence is online, but scene edits are waiting for the event stream to recover.'
                }
                return 'Scene stream is idle.'
            })()
            list.push({
                key: 'scene-stream',
                label: streamLabel,
                detail: streamDetail,
                showBar: false,
                percent: isSceneStreamConnected ? 100 : 0
            })
        }

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
        liveSyncFeatureEnabled,
        isLiveSyncEnabled,
        spaceId,
        canPublishToServer,
        isReadOnly,
        serverSyncInfo?.label,
        serverSyncInfo?.ts,
        isSocketConnected,
        collaborators,
        participantRoster,
        isSceneStreamConnected,
        sceneStreamState,
        sceneStreamError
    ])
}

export default useStatusItems
