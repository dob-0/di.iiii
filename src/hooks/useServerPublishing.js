import { useCallback } from 'react'
import { collectSceneAssetRefs, resolveAssetEntries } from '../services/sceneArchive.js'
import { overwriteServerScene } from '../services/serverSpaces.js'
import { generateObjectId } from '../state/sceneStore.js'
import { isHtmlLikeMimeType } from '../utils/assetContentType.js'

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '')

export const isCurrentSpaceServerAssetUrl = (value = '', assetId = '', serverAssetBaseUrl = '') => {
    if (!value || !assetId || !serverAssetBaseUrl) {
        return false
    }
    try {
        const origin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'http://localhost'
        const expected = new URL(`${trimTrailingSlash(serverAssetBaseUrl)}/${assetId}`, origin)
        const actual = new URL(value, origin)
        return actual.origin === expected.origin && actual.pathname === expected.pathname
    } catch {
        return false
    }
}

const verifyRemoteAssetAvailability = async (value = '') => {
    if (!value) return false
    try {
        const response = await fetch(value, {
            method: 'HEAD',
            cache: 'no-store'
        })
        if (!response.ok) {
            return false
        }
        const contentType = response.headers?.get?.('content-type') || ''
        return !isHtmlLikeMimeType(contentType)
    } catch {
        return false
    }
}

const formatMissingAssetList = (assets = []) => {
    const names = assets
        .map(asset => asset?.name || asset?.id)
        .filter(Boolean)
    const uniqueNames = [...new Set(names)]
    if (!uniqueNames.length) {
        return 'unknown assets'
    }
    if (uniqueNames.length <= 3) {
        return uniqueNames.join(', ')
    }
    return `${uniqueNames.slice(0, 3).join(', ')} and ${uniqueNames.length - 3} more`
}

export function useServerPublishing({
    canPublishToServer,
    canUploadServerAssets,
    spaceId,
    isOfflineMode,
    serverAssetBaseUrl,
    setOfflineMode,
    markServerSync,
    applyRemoteScene,
    getServerScene,
    submitSceneOps,
    getBaseSceneData,
    getSavedViewData,
    objects,
    getAssetBlob,
    getAssetSourceUrl,
    uploadAssetToServer,
    setServerAssetSyncProgress,
    sceneVersionRef,
    setSceneVersion,
    liveClientIdRef
} = {}) {
    const handleReloadFromServer = useCallback(async (options = {}) => {
        const { skipConfirm = false } = options
        if (!canPublishToServer || !spaceId) {
            alert('Server sync unavailable for this space.')
            return
        }
        if (isOfflineMode) {
            alert('Disable offline mode before reloading from the server.')
            return
        }
        if (!skipConfirm) {
            const confirmed = window.confirm('Reloading will replace your local scene with the server version. Continue?')
            if (!confirmed) return
        }
        setOfflineMode?.(false)
        try {
            const response = await getServerScene?.(spaceId)
            if (response?.scene) {
                const baseUrl = response.scene.assetsBaseUrl || serverAssetBaseUrl || ''
                await applyRemoteScene?.(response.scene, {
                    silent: true,
                    remoteVersion: response.scene.defaultSceneVersion || null,
                    assetsBaseUrl: baseUrl,
                    serverVersion: response.version ?? null
                })
                markServerSync?.('Reloaded from server')
            } else {
                alert('Server scene not available.')
            }
        } catch (error) {
            console.warn('Failed to reload server scene', error)
            alert('Error: Could not reload scene from server.')
        }
    }, [
        applyRemoteScene,
        canPublishToServer,
        getServerScene,
        isOfflineMode,
        markServerSync,
        serverAssetBaseUrl,
        setOfflineMode,
        spaceId
    ])

    const syncAssetsForPublish = useCallback(async () => {
        if (!canPublishToServer) return true
        const assetRefs = collectSceneAssetRefs(objects || [])
        const entries = await resolveAssetEntries(objects, { getAssetBlob, getAssetSourceUrl })
        const resolvedIds = new Set(
            entries
                .map(entry => entry?.meta?.id)
                .filter(Boolean)
        )
        const missingAssets = Array.from(assetRefs.values()).filter((meta) => meta?.id && !resolvedIds.has(meta.id))
        if (missingAssets.length) {
            throw new Error(`Some assets are missing and cannot be published: ${formatMissingAssetList(missingAssets)}.`)
        }
        const targets = []
        for (const entry of entries) {
            const meta = entry?.meta
            if (!meta?.id || !entry?.blob) continue
            const isCurrentServerAsset = isCurrentSpaceServerAssetUrl(entry.sourceUrl, meta.id, serverAssetBaseUrl)
            if (isCurrentServerAsset) {
                const available = await verifyRemoteAssetAvailability(entry.sourceUrl)
                if (available) {
                    continue
                }
            }
            targets.push(entry)
        }
        if (!targets.length) {
            setServerAssetSyncProgress?.({
                active: false,
                completed: 0,
                total: 0,
                label: ''
            })
            return true
        }
        if (!canUploadServerAssets) {
            throw new Error('Cannot sync assets while offline. Disable offline mode and try again.')
        }
        setServerAssetSyncProgress?.({
            active: true,
            completed: 0,
            total: targets.length,
            label: 'Syncing assets to server...'
        })
        let completed = 0
        try {
            for (const entry of targets) {
                const meta = entry.meta
                const blob = entry.blob
                if (!blob || !meta?.id) continue
                await uploadAssetToServer?.({
                    file: blob,
                    assetId: meta.id,
                    name: meta.name,
                    mimeType: meta.mimeType,
                    trackPending: false
                })
                completed += 1
                setServerAssetSyncProgress?.(prev => ({
                    ...prev,
                    completed: completed
                }))
            }
        } finally {
            setServerAssetSyncProgress?.({
                active: false,
                completed: 0,
                total: 0,
                label: ''
            })
        }
        return true
    }, [
        canPublishToServer,
        canUploadServerAssets,
        getAssetBlob,
        getAssetSourceUrl,
        objects,
        serverAssetBaseUrl,
        uploadAssetToServer,
        setServerAssetSyncProgress
    ])

    const handlePublishToServer = useCallback(async () => {
        if (!canPublishToServer || !spaceId) {
            alert('Publishing is unavailable for this space.')
            return
        }
        let payload = null
        try {
            await syncAssetsForPublish()
            payload = {
                ...getBaseSceneData?.(),
                savedView: getSavedViewData?.()
            }
            setOfflineMode?.(false)
            const response = await submitSceneOps?.(spaceId, sceneVersionRef?.current || 0, [
                {
                    opId: generateObjectId(),
                    clientId: liveClientIdRef?.current,
                    type: 'replaceScene',
                    payload: { scene: payload }
                }
            ])
            if (typeof response?.newVersion === 'number') {
                setSceneVersion?.(response.newVersion)
            }
            markServerSync?.('Published to server')
            alert('Scene synced to server.')
        } catch (error) {
            console.warn('Failed to publish scene to server', error)
            if (error?.status === 409) {
                const latestVersion = error?.data?.latestVersion
                const reloadMessage = latestVersion
                    ? `Server scene version ${latestVersion} differs from your local copy. Choose OK to reload from server, or Cancel to consider overwriting the server scene.`
                    : 'Server scene changed since your last reload. Choose OK to reload from server, or Cancel to consider overwriting it.'
                const shouldReload = window.confirm(reloadMessage)
                if (shouldReload) {
                    await handleReloadFromServer({ skipConfirm: true })
                    return
                }
                if (!payload) {
                    alert('Cannot force publish without a scene payload.')
                    return
                }
                const force = window.confirm('Force publish and overwrite the server scene for everyone? This cannot be undone.')
                if (!force) {
                    alert('Publish cancelled.')
                    return
                }
                try {
                    const response = await overwriteServerScene(spaceId, {
                        ...payload,
                        sceneVersion: sceneVersionRef?.current || payload.sceneVersion || 0
                    })
                    if (typeof response?.newVersion === 'number') {
                        setSceneVersion?.(response.newVersion)
                        markServerSync?.('Published to server (forced)')
                    } else {
                        await handleReloadFromServer({ skipConfirm: true })
                    }
                    alert('Server scene overwritten with your copy.')
                } catch (forceError) {
                    console.warn('Force publish failed', forceError)
                    alert(forceError?.message || 'Error: Force publish failed.')
                }
                return
            }
            alert(error?.message || 'Error: Could not sync scene to server.')
        }
    }, [
        canPublishToServer,
        getBaseSceneData,
        getSavedViewData,
        handleReloadFromServer,
        markServerSync,
        sceneVersionRef,
        setOfflineMode,
        setSceneVersion,
        spaceId,
        submitSceneOps,
        syncAssetsForPublish,
        liveClientIdRef
    ])

    return {
        handleReloadFromServer,
        handlePublishToServer,
        syncAssetsForPublish
    }
}

export default useServerPublishing
