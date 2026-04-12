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

export const verifyRemoteAssetAvailability = async (value = '') => {
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

export const getMissingAssetRefs = (assetRefs = new Map(), entries = []) => {
    const resolvedIds = new Set(
        entries
            .map(entry => entry?.meta?.id)
            .filter(Boolean)
    )
    return Array.from(assetRefs.values()).filter((meta) => meta?.id && !resolvedIds.has(meta.id))
}

export const formatMissingAssetList = (assets = []) => {
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

export const selectAssetsForServerPublish = async (entries = [], serverAssetBaseUrl = '') => {
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
    return targets
}
