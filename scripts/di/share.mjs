/**
 * `di invite` and `di follow` — one space, two installs.
 *
 * All I/O for sharing a space with another artist's di.iiii. What it MEANS to
 * follow is decided in serverXR/src/follow (the engine that carries the ops);
 * this file only mints the key, checks the far side is really there, and writes
 * the follow down.
 *
 * The credential is a per-space sync key: editor role, scoped to exactly one
 * space, revocable by its owner. An install token would hand over the whole
 * machine, and there is no world in which lending someone a room should do
 * that.
 */

const TIMEOUT_MS = 8000

const request = async (url, { method = 'GET', token = null, body = null } = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const response = await fetch(url, {
            method,
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
        let payload = null
        try { payload = await response.json() } catch { payload = null }
        return { ok: response.ok, status: response.status, payload }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Where a di.iiii answers, given whatever a person typed.
 *
 * Someone will type the address they read off the other laptop's screen —
 * `https://local.thedi.studio` — and the API lives under /serverXR. Probe both
 * rather than make them care.
 */
export const resolveBase = async (input) => {
    const trimmed = String(input || '').trim().replace(/\/$/, '')
    if (!trimmed) return null
    const candidates = trimmed.endsWith('/serverXR')
        ? [trimmed]
        : [`${trimmed}/serverXR`, trimmed]
    for (const base of candidates) {
        const health = await request(`${base}/api/health`)
        if (health.ok) return base
    }
    return null
}

/** Mint a key for one space on THIS install, for someone else to follow with. */
export const mintInvite = async ({ base, spaceId, token, label = 'follow' }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys`, {
        method: 'POST',
        token,
        body: { label }
    })
    if (!answer.ok) return { ok: false, status: answer.status, reason: answer.payload?.error || answer.error || null }
    const key = answer.payload?.token || answer.payload?.key?.token || null
    if (!key) return { ok: false, status: answer.status, reason: 'the server minted no key' }
    return { ok: true, key }
}

/**
 * Is this a real di.iiii, does the space exist there, and does the key work?
 *
 * Checked before anything is written down, because a follow that was accepted
 * and then silently does nothing is worse than a refusal a person can read.
 */
export const checkFollowable = async ({ base, spaceId, key }) => {
    const health = await request(`${base}/api/health`)
    if (!health.ok) return { ok: false, reason: 'unreachable' }

    const ops = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/ops?since=0`, { token: key })
    if (ops.status === 404) return { ok: false, reason: 'missing' }
    if (ops.status === 401 || ops.status === 403) return { ok: false, reason: 'denied' }
    if (!ops.ok) return { ok: false, reason: 'unreachable' }
    return { ok: true, latestVersion: ops.payload?.latestVersion ?? null }
}

/** The identity of the di.iiii at a base — used to refuse following yourself. */
export const instanceOf = async (base) => {
    const health = await request(`${base}/api/health`)
    if (!health.ok) return null
    const { startedAt = null, port = null } = health.payload || {}
    return `${startedAt}:${port}`
}

/** Revoke a key minted by `di invite`. */
export const listInvites = async ({ base, spaceId, token }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys`, { token })
    return answer.ok ? (answer.payload?.keys || []) : []
}

export const revokeInvite = async ({ base, spaceId, keyId, token }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
        token
    })
    return answer.ok
}

/** Does this install already hold that space? */
export const localSpaceExists = async ({ base, spaceId, token = null }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}`, { token })
    return answer.ok
}

/**
 * Make the space here, so there is something for the ops to land in. Same route
 * the Spaces page uses; a space that already exists is left exactly as it is.
 */
export const createLocalSpace = async ({ base, spaceId, token = null, label = null }) => {
    if (await localSpaceExists({ base, spaceId, token })) return { ok: true, created: false }
    const answer = await request(`${base}/api/spaces`, {
        method: 'POST',
        token,
        body: { id: spaceId, label: label || spaceId }
    })
    if (!answer.ok) return { ok: false, created: false, reason: answer.payload?.error || answer.status }
    return { ok: true, created: true }
}
