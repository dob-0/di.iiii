import { apiBaseUrl, apiFetch } from '../../services/apiClient.js'

export const DEFAULT_BETA_SPACE_ID = 'main'

export const listBetaProjects = async (spaceId = DEFAULT_BETA_SPACE_ID) => {
    const data = await apiFetch(`/api/spaces/${spaceId}/projects`)
    return data.projects || []
}

export const createBetaProject = async (spaceId = DEFAULT_BETA_SPACE_ID, payload = {}) => {
    return apiFetch(`/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        body: payload
    })
}

export const getBetaProject = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}`)
}

export const updateBetaProject = async (projectId, payload = {}) => {
    return apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: payload
    })
}

export const deleteBetaProject = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
    })
}

export const getBetaProjectDocument = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}/document`)
}

export const updateBetaProjectDocument = async (projectId, document) => {
    return apiFetch(`/api/projects/${projectId}/document`, {
        method: 'PUT',
        body: document
    })
}

export const listBetaProjectOps = async (projectId, since = null) => {
    const suffix = Number.isFinite(since) ? `?since=${since}` : ''
    return apiFetch(`/api/projects/${projectId}/ops${suffix}`)
}

export const submitBetaProjectOps = async (projectId, baseVersion, ops = []) => {
    return apiFetch(`/api/projects/${projectId}/ops`, {
        method: 'POST',
        body: {
            baseVersion,
            ops
        }
    })
}

export const uploadBetaProjectAsset = async (projectId, file, options = {}) => {
    const formData = new FormData()
    if (options.assetId) {
        formData.append('assetId', options.assetId)
    }
    formData.append('asset', file, options.filename || file.name)
    const data = await apiFetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData
    })
    return data.asset
}

export const buildBetaProjectEventsUrl = (projectId) => `${apiBaseUrl}/api/projects/${projectId}/events`
