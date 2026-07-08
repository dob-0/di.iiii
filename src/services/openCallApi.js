import { apiFetch } from './apiClient.js'

export const listOpenCallApplications = async (callId, { status = '' } = {}) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const data = await apiFetch(`/api/open-calls/${encodeURIComponent(callId)}/applications${query}`)
    return data.applications || []
}

// patch: { status?, notes? }
export const updateOpenCallApplication = async (callId, applicationId, patch = {}) => {
    const data = await apiFetch(
        `/api/open-calls/${encodeURIComponent(callId)}/applications/${encodeURIComponent(applicationId)}`,
        { method: 'PATCH', body: patch }
    )
    return data.application || null
}
