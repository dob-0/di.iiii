import { apiFetch, hasServerApi, apiBaseUrl } from './apiClient.js'
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
            isPublic: updates.isPublic,
            kind: updates.kind,
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

export const getSpaceGithubLink = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`)
    return data.link || null
}

export const connectSpaceGithub = async (spaceId, { owner, repo, projectId, ref, entry } = {}) => {
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`, {
        method: 'POST',
        body: { owner, repo, projectId, ref, entry }
    })
}

export const disconnectSpaceGithub = async (spaceId) => {
    await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`, { method: 'DELETE' })
}

export const getServerConfig = async () => {
    const data = await apiFetch('/api/config')
    return data.config || {}
}

export const patchServerConfig = async (updates = {}) => {
    const data = await apiFetch('/api/config', { method: 'PATCH', body: updates })
    return data.config || {}
}

export const listServerSpaceAssets = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets`)
    return data.assets || []
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

export const importDriveAssets = async (spaceId, url) => {
    if (!spaceId) throw new Error('space id required')
    if (!url) throw new Error('drive url required')
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-drive`, {
        method: 'POST',
        body: { url }
    })
    return data
}

// Asset commons — publicly shared assets, reusable across all spaces ---------

export const setAssetShared = async (spaceId, assetId, shared, license = '') => {
    if (!spaceId) throw new Error('space id required')
    if (!assetId) throw new Error('asset id required')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/${assetId}/share`, {
        method: 'POST',
        body: { public: Boolean(shared), license }
    })
}

export const listCommonsAssets = async ({ q = '' } = {}) => {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : ''
    const data = await apiFetch(`/api/commons/assets${suffix}`)
    return data.assets || []
}

export const importCommonsAssets = async (spaceId, assetIds) => {
    if (!spaceId) throw new Error('space id required')
    const ids = Array.isArray(assetIds) ? assetIds.filter(Boolean) : []
    if (!ids.length) throw new Error('select at least one asset')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-commons`, {
        method: 'POST',
        body: { assetIds: ids }
    })
}

// "Connect your Drive" (per-user OAuth) --------------------------------------

export const getDriveConnectUrl = () => `${apiBaseUrl}/api/integrations/google-drive/connect`

export const getDriveStatus = async () =>
    apiFetch('/api/integrations/google-drive/status')

export const listDriveFiles = async ({ q = '', folderId = '' } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (folderId) params.set('folderId', folderId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return apiFetch(`/api/integrations/google-drive/files${suffix}`)
}

export const disconnectDrive = async () =>
    apiFetch('/api/integrations/google-drive/disconnect', { method: 'POST' })

export const importDriveSelection = async (spaceId, fileIds) => {
    if (!spaceId) throw new Error('space id required')
    const ids = Array.isArray(fileIds) ? fileIds.filter(Boolean) : []
    if (!ids.length) throw new Error('select at least one file')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-drive-account`, {
        method: 'POST',
        body: { fileIds: ids }
    })
}
