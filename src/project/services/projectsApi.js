import { apiBaseUrl, apiFetch } from '../../services/apiClient.js'
import { createServerSpace } from '../../services/serverSpaces.js'

export const DEFAULT_PROJECT_SPACE_ID = 'main'

const autoProvisionSpaceRequests = new Map()

const isMissingSpaceError = (error) => (
    Number(error?.status) === 404
    && /space not found/i.test(String(error?.data?.error || error?.message || ''))
)

const ensureProjectSpaceExists = async (spaceId = DEFAULT_PROJECT_SPACE_ID) => {
    const normalizedSpaceId = String(spaceId || DEFAULT_PROJECT_SPACE_ID).trim()
    if (!normalizedSpaceId) return null
    if (autoProvisionSpaceRequests.has(normalizedSpaceId)) {
        return autoProvisionSpaceRequests.get(normalizedSpaceId)
    }
    const request = (async () => {
        try {
            return await createServerSpace({
                label: normalizedSpaceId,
                slug: normalizedSpaceId,
                isPermanent: false
            })
        } catch (error) {
            if (Number(error?.status) === 409) {
                return null
            }
            throw error
        } finally {
            autoProvisionSpaceRequests.delete(normalizedSpaceId)
        }
    })()
    autoProvisionSpaceRequests.set(normalizedSpaceId, request)
    return request
}

const withAutoProvisionedSpace = async (spaceId, runRequest) => {
    try {
        return await runRequest()
    } catch (error) {
        if (!isMissingSpaceError(error)) {
            throw error
        }
        await ensureProjectSpaceExists(spaceId)
        return runRequest()
    }
}

export const listProjects = async (spaceId = DEFAULT_PROJECT_SPACE_ID) => {
    const data = await withAutoProvisionedSpace(spaceId, () => apiFetch(`/api/spaces/${spaceId}/projects`))
    return data.projects || []
}

export const createProject = async (spaceId = DEFAULT_PROJECT_SPACE_ID, payload = {}) => {
    return withAutoProvisionedSpace(spaceId, () => apiFetch(`/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        body: payload
    }))
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

// ── Shelves, state and the trash (2026-09-10) ───────────────────────────────
// A collection is a shelf inside a space: the container that did not exist
// between "a space" and "a project", which is why one space held 74 of them.

export const listCollections = async (spaceId = DEFAULT_PROJECT_SPACE_ID) => {
    const data = await apiFetch(`/api/spaces/${spaceId}/collections`)
    return data.collections || []
}

export const createCollection = async (spaceId, label) => {
    const data = await apiFetch(`/api/spaces/${spaceId}/collections`, { method: 'POST', body: { label } })
    return data.collection
}

export const renameCollection = async (collectionId, label) => {
    const data = await apiFetch(`/api/collections/${collectionId}`, { method: 'PATCH', body: { label } })
    return data.collection
}

// Deleting a shelf never deletes the work on it; the answer says how much came
// loose so a surface can say so out loud.
export const deleteCollection = async (collectionId) =>
    apiFetch(`/api/collections/${collectionId}`, { method: 'DELETE' })

export const reorderCollections = async (spaceId, ids = []) =>
    apiFetch(`/api/spaces/${spaceId}/collections/order`, { method: 'PUT', body: { ids } })

export const reorderProjects = async (spaceId, ids = []) =>
    apiFetch(`/api/spaces/${spaceId}/projects/order`, { method: 'PUT', body: { ids } })

// One call for both, because they are one gesture: putting a thing somewhere,
// and saying what it is.
export const setProjectShelf = async (projectId, changes = {}) => {
    const data = await apiFetch(`/api/projects/${projectId}/shelf`, { method: 'PATCH', body: changes })
    return data.project
}

export const listTrash = async (spaceId = null) => {
    const data = await apiFetch(`/api/trash${spaceId ? `?space=${encodeURIComponent(spaceId)}` : ''}`)
    return { projects: data.projects || [], ttlMs: data.ttlMs || 0 }
}

export const restoreProject = async (projectId) => {
    const data = await apiFetch(`/api/projects/${projectId}/restore`, { method: 'POST' })
    return data.project
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

// Content-address the file locally so identical bytes can skip the upload.
// Returns '' when hashing is unavailable (non-secure context, odd File impl);
// the server hashes on receipt either way.
export const hashFileSha256 = async (file) => {
    if (!globalThis.crypto?.subtle?.digest || typeof file?.arrayBuffer !== 'function') return ''
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    } catch {
        return ''
    }
}

export const getProjectAssetMeta = async (projectId, assetId) => {
    const data = await apiFetch(`/api/projects/${projectId}/assets/${assetId}/meta`)
    return data.asset
}

export const uploadProjectAsset = async (projectId, file, options = {}) => {
    const assetId = options.assetId || await hashFileSha256(file)
    const name = options.filename || file.name
    // dedupe only on sha256-shaped ids: legacy uuid ids don't pin the bytes,
    // so an existing id there must still overwrite-upload as before
    if (/^[a-f0-9]{64}$/i.test(assetId)) {
        try {
            const existing = await getProjectAssetMeta(projectId, assetId)
            if (existing) return { ...existing, ...(name ? { name } : {}) }
        } catch {
            // missing asset, older server without /meta, transient failure —
            // fall through and let the real upload succeed or surface the error
        }
    }
    const formData = new FormData()
    if (assetId) {
        formData.append('assetId', assetId)
    }
    formData.append('asset', file, name)
    const data = await apiFetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData
    })
    return data.asset
}

export const deleteProjectAsset = async (projectId, assetId) =>
    apiFetch(`/api/projects/${projectId}/assets/${assetId}`, { method: 'DELETE' })

export const buildProjectEventsUrl = (projectId) => `${apiBaseUrl}/api/projects/${projectId}/events`

export const buildProjectAssetUrl = (projectId, assetId) => `${apiBaseUrl}/api/projects/${projectId}/assets/${assetId}`
