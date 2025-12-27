import { useEffect, useState } from 'react'
import { getAssetBlob } from '../storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from '../services/assetSources.js'

export function useAssetUrl(assetRef) {
    const assetId = assetRef?.id
    const [objectUrl, setObjectUrl] = useState(null)

    const remoteUrl = assetId ? getAssetSourceUrl(assetId) : null
    const expectedTopLevelType = assetRef?.mimeType ? assetRef.mimeType.split('/')[0] : null
    const allowedTopLevels = expectedTopLevelType
        ? [expectedTopLevelType]
        : ['image', 'video', 'audio']

    useEffect(() => {
        let revokedUrl = null
        let isCancelled = false

        if (!assetId) {
            setObjectUrl(null)
            return () => {}
        }

        setObjectUrl(null)

        const applyBlob = (blob) => {
            if (isCancelled || !blob) return
            const resolvedType = blob.type || assetRef?.mimeType || ''
            const blobTopLevel = (resolvedType || '').split('/')[0] || ''
            const typeAllowed = blobTopLevel ? allowedTopLevels.includes(blobTopLevel) : true
            const typeMatches = !expectedTopLevelType || blobTopLevel === expectedTopLevelType
            if (!typeAllowed || !typeMatches) {
                console.warn(`Asset ${assetId} unsupported MIME: ${resolvedType || 'unknown'}`)
                setObjectUrl(null)
                return
            }
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl)
            }
            revokedUrl = URL.createObjectURL(blob)
            setObjectUrl(revokedUrl)
        }

        const loadAsset = async () => {
            try {
                const blob = await getAssetBlob(assetId)
                if (blob) {
                    applyBlob(blob)
                    return
                }
            } catch (error) {
                console.warn(`Failed to read asset blob ${assetId}`, error)
            }
            if (remoteUrl) {
                try {
                    const streamed = await streamRemoteAsset(assetId)
                    applyBlob(streamed)
                    return
                } catch (error) {
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
    }, [assetId, assetRef?.mimeType, assetRef?.name, expectedTopLevelType, remoteUrl])

    return objectUrl
}
