import { apiFetch } from './apiClient.js'

// The guest book: programs that reached the API, as daily aggregates
// (serverXR/src/appVisitorStore.js). Admin-only on the server.
export const getAppVisitors = async () => apiFetch('/api/admin/app-visitors')

export const setAppVisitorBlocked = async (agent, blocked) => apiFetch(
    `/api/admin/app-visitors/blocks/${encodeURIComponent(agent)}`,
    { method: 'PUT', body: { blocked: Boolean(blocked) } }
)
