import { useEffect, useState } from 'react'
import { deleteAsset, getAssetBlob } from '../storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from '../services/assetSources.js'
import { isHtmlLikeMimeType } from '../utils/assetContentType.js'

export function useAssetUrl(assetRef, options = {}) {
    const assetId = assetRef?.id
    const [objectUrl, setObjectUrl] = useState(null)
    const preferRemoteSource = options?.preferRemoteSource === true

    const remoteUrl = assetId ? getAssetSourceUrl(assetId) : null
    const expectedTopLevelType = assetRef?.mimeType ? assetRef.mimeType.split('/')[0] : null

    useEffect(() => {
        let revokedUrl = null
        let isCancelled = false
        const allowedTopLevels = expectedTopLevelType
            ? [expectedTopLevelType]
            : ['image', 'video', 'audio']

        if (!assetId) {
            setObjectUrl(null)
            return () => {}
        }

        if (preferRemoteSource && remoteUrl) {
            setObjectUrl(remoteUrl)
            return () => {}
        }

        setObjectUrl(null)

        const applyBlob = (blob) => {
            if (isCancelled || !blob) return
            const resolvedType = blob.type || assetRef?.mimeType || ''
            const blobTopLevel = (resolvedType || '').split('/')[0] || ''
            const typeAllowed = blobTopLevel ? allowedTopLevels.includes(blobTopLevel) : true
            const typeMatches = !expectedTopLevelType || blobTopLevel === expectedTopLevelType
            if (isHtmlLikeMimeType(resolvedType) || !typeAllowed || !typeMatches) {
                console.warn(`Asset ${assetId} unsupported MIME: ${resolvedType || 'unknown'}`)
                setObjectUrl(null)
                return false
            }
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl)
            }
            revokedUrl = URL.createObjectURL(blob)
            setObjectUrl(revokedUrl)
            return true
        }

        const loadAsset = async () => {
            try {
                const blob = await getAssetBlob(assetId)
                if (blob) {
                    const accepted = applyBlob(blob)
                    if (accepted) {
                        return
                    }
                    try {
                        await deleteAsset(assetId)
                    } catch {
                        // ignore cache cleanup errors and continue to the remote source
                    }
                }
            } catch (error) {
                console.warn(`Failed to read asset blob ${assetId}`, error)
            }
            try {
                const streamed = await streamRemoteAsset(assetId)
                if (applyBlob(streamed)) {
                    return
                }
            } catch (error) {
                if (remoteUrl) {
                    console.warn(`Failed to stream asset ${assetId}`, error)
                }
            }
            setObjectUrl(null)
        }

        loadAsset()

        return () => {
            isCancelled = true
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl)
            }
        }
    }, [assetId, assetRef?.mimeType, assetRef?.name, expectedTopLevelType, preferRemoteSource, remoteUrl])

    return objectUrl
}
