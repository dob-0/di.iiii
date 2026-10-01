/**
 * The calls the light, the invite and the join form make — all to THIS
 * install's own server (serverXR/src/routes/followRoutes.js).
 *
 * `readSyncStatus` is plain fetch, not apiFetch: the light asks on every
 * surface, and for a visitor the answer is "no" (403/404) — apiFetch would
 * count a network hiccup against the whole app (markServerUnavailable) for a
 * question nobody asked out loud. A "no" is not an error here; it is the
 * light staying off.
 */
import { apiBaseUrl, apiFetch, hasServerApi } from '../services/apiClient.js'

const spacePath = (space) => `/api/spaces/${encodeURIComponent(space)}`

/** @returns {Promise<{status: object|null, retryable: boolean}>} status null = no light (not allowed, not followed, or no answer) */
export const readSyncStatus = async (space, { signal } = {}) => {
    if (!hasServerApi || !space) return { status: null, retryable: false }
    try {
        const response = await fetch(`${apiBaseUrl}${spacePath(space)}/sync`, { credentials: 'include', signal, headers: { Accept: 'application/json' } })
        if (response.ok) return { status: await response.json(), retryable: true }
        // 401/403/404: not for this person, or not this kind of install. Ask rarely.
        return { status: null, retryable: false }
    } catch {
        return { status: null, retryable: true, unreachable: true }
    }
}

/** Make a join code for a space. @returns {Promise<{id, code, words, expiresAt, ttlSeconds, machine, addresses, lan}>} */
export const issueJoinCode = (space) => apiFetch(`${spacePath(space)}/join-codes`, { method: 'POST' })

export const revokeJoinCode = (space, id) => apiFetch(`${spacePath(space)}/join-codes/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const stopFollowing = (space) => apiFetch(`${spacePath(space)}/follow`, { method: 'DELETE' })

/** The server answers a refusal with { reason, error } — keep the words it chose. */
const asRefusal = (error) => {
    const refusal = new Error(error?.data?.error || error?.message || 'Could not join.')
    refusal.reason = error?.data?.reason || null
    refusal.retryAfterSeconds = error?.data?.retryAfterSeconds || null
    refusal.status = error?.status || null
    return refusal
}

export const previewJoin = async ({ address, code }) => {
    try {
        return await apiFetch('/api/follows/join/preview', { method: 'POST', body: { address, code } })
    } catch (error) { throw asRefusal(error) }
}

export const joinWithCode = async ({ address, code, into = false }) => {
    try {
        return await apiFetch('/api/follows/join', { method: 'POST', body: { address, code, into } })
    } catch (error) { throw asRefusal(error) }
}
