import { useCallback, useRef, useState } from 'react'
import { saveAssetBlob, dataUrlToBlob, blobToDataUrl, hasAssetStoreQuotaExceeded, resetAssetStoreQuotaExceeded } from '../storage/assetStore.js'
import { registerAssetSources, clearAssetSources, setAssetSource } from '../services/assetSources.js'

export function useAssetRestore({
    defaultSceneRemoteBase = '',
    legacySceneRemoteBase = '',
    setAssetRestoreProgress,
    remoteAssetsRef,
    remoteAssetsBaseRef
} = {}) {
    const assetStoreQuotaExceededRef = useRef(false)
    const assetStoreQuotaAlertedRef = useRef(false)
    const [remoteAssetsManifest, setRemoteAssetsManifestState] = useState([])
    const [remoteAssetsBaseUrl, setRemoteAssetsBaseUrlState] = useState('')

    const resetRemoteAssets = useCallback(() => {
        if (remoteAssetsRef) remoteAssetsRef.current = null
        if (remoteAssetsBaseRef) remoteAssetsBaseRef.current = ''
        setRemoteAssetsManifestState([])
        setRemoteAssetsBaseUrlState('')
        clearAssetSources()
    }, [remoteAssetsBaseRef, remoteAssetsRef])

    const setRemoteAssetsManifest = useCallback((manifest = [], baseUrl = '') => {
        if (remoteAssetsBaseRef) remoteAssetsBaseRef.current = baseUrl || ''
        if (remoteAssetsRef) remoteAssetsRef.current = Array.isArray(manifest) ? manifest : []
        const assets = Array.isArray(manifest) ? manifest : []
        const base = remoteAssetsBaseRef?.current || ''
        setRemoteAssetsManifestState(assets)
        setRemoteAssetsBaseUrlState(base)
        registerAssetSources(assets, base, [defaultSceneRemoteBase, legacySceneRemoteBase])
    }, [defaultSceneRemoteBase, legacySceneRemoteBase, remoteAssetsBaseRef, remoteAssetsRef])

    const resetAssetStoreQuotaState = useCallback(() => {
        assetStoreQuotaExceededRef.current = false
        assetStoreQuotaAlertedRef.current = false
        resetAssetStoreQuotaExceeded()
    }, [])

    const handleAssetStoreQuotaExceeded = useCallback(() => {
        if (assetStoreQuotaExceededRef.current) return
        assetStoreQuotaExceededRef.current = true
        console.warn('Asset storage quota exceeded; assets will stream from the server.')
        if (!assetStoreQuotaAlertedRef.current) {
            assetStoreQuotaAlertedRef.current = true
            alert('Browser storage is full. Assets will stream from the server instead of being cached locally.')
        }
    }, [])

    const restoreAssetsFromPayload = useCallback(async (assets = [], blobLoader) => {
        if (!Array.isArray(assets) || assets.length === 0) {
            setAssetRestoreProgress?.({
                active: false,
                completed: 0,
                total: 0
            })
            return { fallbackAssets: [] }
        }
        const queue = assets.map((asset) => ({
            ...asset,
            status: 'pending'
        }))
        const parallelism = 3
        setAssetRestoreProgress?.({
            active: true,
            completed: 0,
            total: assets.length
        })
        let completed = 0
        const fallbackAssets = []

        const hydrateAsset = async (item) => {
            try {
                let blob = null
                if (item?.dataUrl) {
                    blob = dataUrlToBlob(item.dataUrl)
                } else if (typeof blobLoader === 'function' && (item?.archivePath || item?.url || item?.id)) {
                    blob = await blobLoader(item)
                } else if (item?.url) {
                    try {
                        const response = await fetch(item.url, { cache: 'no-store' })
                        if (response.ok) {
                            blob = await response.blob()
                        } else {
                            console.warn(`Failed to fetch remote asset ${item.id} from URL`, item.url)
                        }
                    } catch (fetchError) {
                        console.warn(`Error fetching asset ${item?.id} from URL`, fetchError)
                    }
                }
                if (!blob) return
                const fallbackMeta = {
                    id: item.id,
                    name: item.name,
                    mimeType: item.mimeType,
                    createdAt: item.createdAt
                }
                let storedLocally = false
                if (assetStoreQuotaExceededRef.current || hasAssetStoreQuotaExceeded()) {
                    handleAssetStoreQuotaExceeded()
                } else {
                    try {
                        await saveAssetBlob(blob, {
                            id: item.id,
                            name: item.name,
                            mimeType: item.mimeType,
                            createdAt: item.createdAt
                        })
                        storedLocally = true
                    } catch (error) {
                        if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014) {
                            handleAssetStoreQuotaExceeded()
                        } else {
                            throw error
                        }
                    }
                }
                if (!storedLocally) {
                    try {
                        const dataUrl = await blobToDataUrl(blob)
                        if (dataUrl) {
                            const fallbackEntry = {
                                ...fallbackMeta,
                                dataUrl,
                                size: blob?.size ?? item.size
                            }
                            fallbackAssets.push(fallbackEntry)
                            setAssetSource(fallbackEntry)
                        }
                    } catch (error) {
                        console.warn(`Failed to create fallback source for asset ${item?.id}`, error)
                    }
                }
            } catch (error) {
                console.error(`Failed to restore asset ${item?.id}`, error)
            } finally {
                completed += 1
                setAssetRestoreProgress?.(prev => ({
                    ...prev,
                    completed: completed
                }))
            }
        }

        const workers = Array.from({ length: parallelism }, async () => {
            while (queue.length > 0) {
                const next = queue.shift()
                if (!next) break
                await hydrateAsset(next)
            }
        })

        await Promise.all(workers)
        setAssetRestoreProgress?.({
            active: false,
            completed: assets.length,
            total: assets.length
        })
        return { fallbackAssets }
    }, [handleAssetStoreQuotaExceeded, setAssetRestoreProgress])

    const upsertRemoteAssetEntry = useCallback((entry, baseUrl) => {
        if (!entry?.id) return
        const manifest = Array.isArray(remoteAssetsRef?.current)
            ? remoteAssetsRef.current.filter(item => item.id !== entry.id)
            : []
        manifest.push(entry)
        if (remoteAssetsRef) {
            remoteAssetsRef.current = manifest
        }
        if (typeof baseUrl === 'string' && remoteAssetsBaseRef) {
            remoteAssetsBaseRef.current = baseUrl
        }
        setRemoteAssetsManifestState(manifest)
        if (typeof baseUrl === 'string') {
            setRemoteAssetsBaseUrlState(baseUrl)
        }
        setAssetSource(entry, baseUrl ?? remoteAssetsBaseRef?.current)
    }, [remoteAssetsBaseRef, remoteAssetsRef])

    return {
        remoteAssetsRef,
        remoteAssetsBaseRef,
        remoteAssetsManifest,
        remoteAssetsBaseUrl,
        resetRemoteAssets,
        setRemoteAssetsManifest,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        upsertRemoteAssetEntry
    }
}

export default useAssetRestore
