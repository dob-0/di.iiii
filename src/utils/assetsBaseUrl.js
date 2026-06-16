const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const resolveUrl = (value = '') => {
    if (!value || typeof window === 'undefined' || !window.location?.origin) {
        return null
    }
    try {
        return new URL(value, window.location.origin)
    } catch {
        return null
    }
}

export const preferLocalAssetsBaseUrl = ({
    sceneBaseUrl = '',
    serverAssetBaseUrl = '',
    forceServerAssetsBase = false
} = {}) => {
    if (forceServerAssetsBase && serverAssetBaseUrl) {
        return serverAssetBaseUrl
    }
    if (!sceneBaseUrl) {
        return serverAssetBaseUrl || ''
    }
    if (!serverAssetBaseUrl) {
        return sceneBaseUrl
    }

    const currentUrl = resolveUrl(window.location?.href || '')
    const sceneUrl = resolveUrl(sceneBaseUrl)
    const serverUrl = resolveUrl(serverAssetBaseUrl)
    if (!currentUrl || !sceneUrl || !serverUrl) {
        return sceneBaseUrl || serverAssetBaseUrl || ''
    }

    if (
        LOOPBACK_HOSTS.has(currentUrl.hostname)
        && LOOPBACK_HOSTS.has(serverUrl.hostname)
        && sceneUrl.origin !== serverUrl.origin
    ) {
        return serverAssetBaseUrl
    }

    return sceneBaseUrl || serverAssetBaseUrl || ''
}

export default preferLocalAssetsBaseUrl
