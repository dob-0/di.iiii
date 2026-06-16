import { apiFetch, hasServerApi } from './apiClient.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

export const supportsServerSpaces = hasServerApi

const resolveServerSpaceId = (spaceId = '') => normalizeSpaceId(spaceId) || String(spaceId || '').trim()

export const listServerSpaces = async () => {
    const data = await apiFetch('/api/spaces')
    return data.spaces || []
}

export const getServerSpace = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`)
    return data.space || null
}

export const createServerSpace = async ({ label, slug, isPermanent = false } = {}) => {
    const data = await apiFetch('/api/spaces', {
        method: 'POST',
        body: { label, permanent: isPermanent, slug }
    })
    return data.space
}

export const updateServerSpace = async (spaceId, updates = {}) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`, {
        method: 'PATCH',
        body: {
            label: updates.label,
            permanent: updates.isPermanent,
            allowEdits: updates.allowEdits,
            publishedProjectId: updates.publishedProjectId
        }
    })
    return data.space
}

export const deleteServerSpace = async (spaceId) => {
    await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`, { method: 'DELETE' })
}

export const touchServerSpace = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/touch`, { method: 'POST' })
    return data.space
}

export const getServerScene = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/scene`)
    return {
        scene: data.scene,
        version: data.version ?? 0
    }
}

export const getServerSceneOps = async (spaceId, since) => {
    const query = Number.isFinite(since) ? `?since=${since}` : ''
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/ops${query}`)
    return {
        ops: data.ops || [],
        latestVersion: data.latestVersion ?? 0
    }
}

export const submitSceneOps = async (spaceId, baseVersion, ops = []) => {
    if (!spaceId) throw new Error('space id required')
    const payload = {
        baseVersion: Number.isFinite(baseVersion) ? baseVersion : 0,
        ops
    }
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/ops`, {
        method: 'POST',
        body: payload
    })
}

export const overwriteServerScene = async (spaceId, sceneData) => {
    if (!spaceId) throw new Error('space id required')
    if (!sceneData || typeof sceneData !== 'object') {
        throw new Error('scene data required')
    }
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/scene`, {
        method: 'PUT',
        body: sceneData
    })
}

export const uploadServerAsset = async (spaceId, file, options = {}) => {
    if (!spaceId) throw new Error('space id required')
    if (!file) throw new Error('file required')
    const formData = new FormData()
    if (options.assetId) {
        formData.append('assetId', options.assetId)
    }
    if (options.filename) {
        formData.append('asset', file, options.filename)
    } else {
        formData.append('asset', file)
    }
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets`, {
        method: 'POST',
        body: formData
    })
    return data
}
