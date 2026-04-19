import { useEffect, useState } from 'react'
import { deleteAsset, getAssetBlob } from '../storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from '../services/assetSources.js'
import { isHtmlLikeMimeType } from '../utils/assetContentType.js'
import {
    getExpectedPlayableTopLevel,
    inferMimeTypeFromName,
    isGenericMimeType
} from '../utils/mediaAssetTypes.js'

const FRONTEND_ASSET_PATH_REGEX = /^\/assets\/[^/]+$/i

const isFrontendAssetFallbackUrl = (value = '') => {
    if (!value) return false
    try {
        const base = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'http://localhost'
        const url = new URL(value, base)
        const currentOrigin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : url.origin
        return url.origin === currentOrigin && FRONTEND_ASSET_PATH_REGEX.test(url.pathname)
    } catch {
        return FRONTEND_ASSET_PATH_REGEX.test(String(value))
    }
}

export function useAssetUrl(assetRef, options = {}) {
    const assetId = assetRef?.id
    const [objectUrl, setObjectUrl] = useState(null)
    const preferRemoteSource = options?.preferRemoteSource === true

    const directAssetUrl = typeof assetRef?.url === 'string' ? assetRef.url.trim() : ''
    const remoteUrl = (assetId ? getAssetSourceUrl(assetId) : null) || directAssetUrl || null
    const canPreferRemoteSource = preferRemoteSource && remoteUrl && !isFrontendAssetFallbackUrl(remoteUrl)
    const expectedTopLevelType = getExpectedPlayableTopLevel(assetRef)

    useEffect(() => {
        let revokedUrl = null
        let isCancelled = false
        const allowedTopLevels = expectedTopLevelType
            ? [expectedTopLevelType]
            : ['image', 'video', 'audio']

        if (canPreferRemoteSource) {
            setObjectUrl(remoteUrl)
            return () => {}
        }

        if (!assetId) {
            if (remoteUrl && !isFrontendAssetFallbackUrl(remoteUrl)) {
                setObjectUrl(remoteUrl)
            } else {
                setObjectUrl(null)
            }
            return () => {}
        }

        setObjectUrl(null)

        const applyBlob = (blob) => {
            if (isCancelled || !blob) return
            const resolvedType = blob.type || assetRef?.mimeType || inferMimeTypeFromName(assetRef?.name) || ''
            const blobTopLevel = (resolvedType || '').split('/')[0] || ''
            const acceptsGenericBinary = expectedTopLevelType && isGenericMimeType(resolvedType)
            const typeAllowed = blobTopLevel ? allowedTopLevels.includes(blobTopLevel) : true
            const typeMatches = !expectedTopLevelType || blobTopLevel === expectedTopLevelType
            if (isHtmlLikeMimeType(resolvedType) || (!acceptsGenericBinary && (!typeAllowed || !typeMatches))) {
                console.warn(`Asset ${assetId} unsupported MIME: ${resolvedType || 'unknown'}`)
                setObjectUrl(null)
                return false
            }
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl)
            }
            const normalizedBlob = acceptsGenericBinary
                ? new Blob([blob], { type: inferMimeTypeFromName(assetRef?.name) || blob.type })
                : blob
            revokedUrl = URL.createObjectURL(normalizedBlob)
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
            if (remoteUrl && !isFrontendAssetFallbackUrl(remoteUrl)) {
                setObjectUrl(remoteUrl)
                return
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
    }, [assetId, assetRef?.mimeType, assetRef?.name, canPreferRemoteSource, expectedTopLevelType, remoteUrl])

    return objectUrl
}
