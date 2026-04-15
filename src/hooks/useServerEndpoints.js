import { useCallback, useMemo } from 'react'
import { apiBaseUrl } from '../services/apiClient.js'
import { supportsServerSpaces } from '../services/serverSpaces.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

export function useServerEndpoints(spaceId) {
    const normalizedSpaceId = useMemo(() => normalizeSpaceId(spaceId) || spaceId || '', [spaceId])

    const serverBaseUrl = useMemo(() => {
        if (!supportsServerSpaces) return ''
        return (apiBaseUrl || '').replace(/\/+$/, '')
    }, [])

    const serverAssetBaseUrl = useMemo(() => {
        if (!normalizedSpaceId) return ''
        const path = `/api/spaces/${normalizedSpaceId}/assets`
        if (!supportsServerSpaces) return path
        return serverBaseUrl ? `${serverBaseUrl}${path}` : path
    }, [normalizedSpaceId, serverBaseUrl])

    const buildSpaceApiUrl = useCallback((suffix = '') => {
        if (!normalizedSpaceId) return ''
        const path = `/api/spaces/${normalizedSpaceId}${suffix}`
        if (!supportsServerSpaces) return path
        return serverBaseUrl ? `${serverBaseUrl}${path}` : path
    }, [normalizedSpaceId, serverBaseUrl])

    return { serverBaseUrl, serverAssetBaseUrl, buildSpaceApiUrl, normalizedSpaceId }
}

export default useServerEndpoints
