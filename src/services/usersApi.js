import { apiFetch } from './apiClient.js'

export const listUsers = async () => {
    const data = await apiFetch('/api/users')
    return data.users || []
}

// patch: { spaces?: string[], isUnrestricted?: boolean, role?: string }
export const updateUser = async (userId, patch = {}) => {
    const data = await apiFetch(`/api/users/${userId}`, { method: 'PATCH', body: patch })
    return data.user || null
}
