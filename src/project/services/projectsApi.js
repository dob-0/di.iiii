import { apiBaseUrl, apiFetch } from '../../services/apiClient.js'

export const DEFAULT_PROJECT_SPACE_ID = 'main'

export const listProjects = async (spaceId = DEFAULT_PROJECT_SPACE_ID) => {
    const data = await apiFetch(`/api/spaces/${spaceId}/projects`)
    return data.projects || []
}

export const createProject = async (spaceId = DEFAULT_PROJECT_SPACE_ID, payload = {}) => {
    return apiFetch(`/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        body: payload
    })
}

export const getProject = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}`)
}

export const updateProject = async (projectId, payload = {}) => {
    return apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: payload
    })
}

export const deleteProject = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
    })
}

export const getProjectDocument = async (projectId) => {
    return apiFetch(`/api/projects/${projectId}/document`)
}

export const updateProjectDocument = async (projectId, document) => {
    return apiFetch(`/api/projects/${projectId}/document`, {
        method: 'PUT',
        body: document
    })
}

export const listProjectOps = async (projectId, since = null) => {
    const suffix = Number.isFinite(since) ? `?since=${since}` : ''
    return apiFetch(`/api/projects/${projectId}/ops${suffix}`)
}

export const submitProjectOps = async (projectId, baseVersion, ops = []) => {
    return apiFetch(`/api/projects/${projectId}/ops`, {
        method: 'POST',
        body: {
            baseVersion,
            ops
        }
    })
}

export const uploadProjectAsset = async (projectId, file, options = {}) => {
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

export const buildProjectEventsUrl = (projectId) => `${apiBaseUrl}/api/projects/${projectId}/events`

export const DEFAULT_BETA_SPACE_ID = DEFAULT_PROJECT_SPACE_ID
export const listBetaProjects = listProjects
export const createBetaProject = createProject
export const getBetaProject = getProject
export const updateBetaProject = updateProject
export const deleteBetaProject = deleteProject
export const getBetaProjectDocument = getProjectDocument
export const updateBetaProjectDocument = updateProjectDocument
export const listBetaProjectOps = listProjectOps
export const submitBetaProjectOps = submitProjectOps
export const uploadBetaProjectAsset = uploadProjectAsset
export const buildBetaProjectEventsUrl = buildProjectEventsUrl
