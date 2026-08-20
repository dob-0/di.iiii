const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])
const SAFE_CLIENT_API_TOKEN_PATTERN = /^[A-Za-z0-9._~+/\-=]{16,}$/

export const normalizeClientApiToken = (value = '') => {
    const normalized = String(value || '').trim().replace(/^bearer\s+/i, '')
    if (!normalized) {
        return ''
    }

    // Ignore malformed values so a bad deploy token does not crash fetch()
    // with an invalid Authorization header before the request is sent.
    if (!SAFE_CLIENT_API_TOKEN_PATTERN.test(normalized)) {
        return ''
    }

    return normalized
}

export const normalizeSessionApiToken = (value = '') => String(value || '').trim().replace(/^bearer\s+/i, '')

const getHostnameFromOrigin = (origin = '') => {
    if (!origin) return ''
    try {
        return new URL(origin).hostname
    } catch {
        return ''
    }
}

const shouldUseRelativeDevBase = (configuredBase = '', { isDev = false, locationHostname = '' } = {}) => {
    if (!isDev || !configuredBase) {
        return false
    }

    try {
        const url = new URL(configuredBase)
        return LOOPBACK_HOSTS.has(url.hostname) || (locationHostname && url.hostname === locationHostname)
    } catch {
        return false
    }
}

const toBasePath = (value = '') => {
    if (!value) return ''
    try {
        const url = new URL(value, 'http://localhost')
        return url.pathname.replace(/\/+$/, '') || '/'
    } catch {
        return value
    }
}

const resolveRawBase = ({
    configuredBase = '',
    isDev = false,
    locationHostname = ''
} = {}) => {
    if (configuredBase) {
        if (shouldUseRelativeDevBase(configuredBase, { isDev, locationHostname })) {
            return toBasePath(configuredBase)
        }
        return configuredBase
    }
    return '/serverXR'
}

const SERVER_UNAVAILABLE_COOLDOWN_MS = 15000
let serverUnavailableUntil = 0

const normalizeLoopbackBase = (baseUrl = '', { locationOrigin = '', locationHostname = '' } = {}) => {
    if (!baseUrl) {
        return baseUrl
    }
    try {
        if (!locationOrigin && !/^[a-z]+:\/\//i.test(baseUrl)) {
            return baseUrl
        }
        const url = new URL(baseUrl, locationOrigin || 'http://localhost')
        if (
            LOOPBACK_HOSTS.has(url.hostname)
            && LOOPBACK_HOSTS.has(locationHostname)
            && url.hostname !== locationHostname
        ) {
            url.hostname = locationHostname
        }
        if (!locationOrigin && !/^[a-z]+:\/\//i.test(baseUrl)) {
            return `${url.pathname}${url.search}${url.hash}`
        }
        return url.toString().replace(/\/+$/, '')
    } catch {
        return baseUrl
    }
}

export const getApiBaseUrlForRuntime = ({
    configuredBase = '',
    isDev = false,
    locationOrigin = '',
    locationHostname = ''
} = {}) => {
    const resolvedHostname = locationHostname || getHostnameFromOrigin(locationOrigin)
    const rawBase = resolveRawBase({
        configuredBase: String(configuredBase || '').trim(),
        isDev,
        locationHostname: resolvedHostname
    }).replace(/\/+$/, '')

    return normalizeLoopbackBase(rawBase, {
        locationOrigin,
        locationHostname: resolvedHostname
    })
}

export const apiBaseUrl = getApiBaseUrlForRuntime({
    configuredBase: import.meta.env.VITE_API_BASE_URL || '',
    isDev: Boolean(import.meta.env.DEV),
    locationOrigin: typeof window !== 'undefined' ? window.location.origin : '',
    locationHostname: typeof window !== 'undefined' ? window.location.hostname : ''
})
export const hasServerApi = Boolean(apiBaseUrl)

export const getServerUnavailableRetryDelay = () => Math.max(0, serverUnavailableUntil - Date.now())

export const isServerTemporarilyUnavailable = () => getServerUnavailableRetryDelay() > 0

export const clearServerUnavailable = () => {
    serverUnavailableUntil = 0
}

export const markServerUnavailable = (cooldownMs = SERVER_UNAVAILABLE_COOLDOWN_MS) => {
    serverUnavailableUntil = Date.now() + Math.max(0, Number(cooldownMs) || 0)
    return getServerUnavailableRetryDelay()
}

export const isServerNetworkError = (error) => {
    if (!error) return false
    const message = String(error?.message || error)
    return (
        error instanceof TypeError
        || /Failed to fetch/i.test(message)
        || /NetworkError/i.test(message)
        || /Load failed/i.test(message)
    )
}

const createServerUnavailableError = (message, cause = null) => {
    const error = new Error(message)
    error.isServerUnavailable = true
    error.retryAfterMs = getServerUnavailableRetryDelay()
    if (cause) {
        error.cause = cause
    }
    return error
}

const createHttpError = async (response) => {
    const text = await response.text()
    let message = text || `Request failed with status ${response.status}`
    let data = null
    if (text) {
        try {
            data = JSON.parse(text)
            if (data?.error) {
                message = data.error
            }
        } catch {
            // ignore
        }
    }
    const error = new Error(message)
    error.status = response.status
    if (data) {
        error.data = data
    }
    return error
}

export async function apiFetch(path, {
    method = 'GET',
    headers,
    body,
    json = true,
    signal = undefined
} = {}) {
    if (!hasServerApi) {
        throw new Error('API base URL is not configured')
    }
    if (isServerTemporarilyUnavailable()) {
        throw createServerUnavailableError('ServerXR is temporarily unavailable.')
    }
    const url = path.startsWith('http') ? path : `${apiBaseUrl}${path}`
    const init = {
        method,
        credentials: 'include',
        headers: headers || {},
        ...(signal !== undefined ? { signal } : {})
    }
    if (body instanceof FormData) {
        init.body = body
    } else if (body !== undefined) {
        init.body = JSON.stringify(body)
        init.headers['Content-Type'] = 'application/json'
    }
    let response
    try {
        response = await fetch(url, init)
        clearServerUnavailable()
    } catch (error) {
        if (isServerNetworkError(error)) {
            markServerUnavailable()
            throw createServerUnavailableError('ServerXR is unreachable. Check that the server is running and CORS allows this origin.', error)
        }
        throw error
    }
    if (!response.ok) {
        throw await createHttpError(response)
    }
    if (!json) {
        return response
    }
    return response.json()
}

// Module-level echo of the session's `local` flag (a `di up` install on the
// visitor's own machine, server-side DI_LOCAL). For code that must decide
// synchronously at mount time — the XR store picks its controller-model
// source once — after the session has resolved at least once. Defaults to
// false, i.e. hosted behavior.
let lastSessionWasLocal = false
export const isLocalInstallSession = () => lastSessionWasLocal

export const getApiSession = async (opts = {}) => {
    const data = await apiFetch('/api/auth/session', opts)
    lastSessionWasLocal = Boolean(data?.local)
    return data
}

export const loginApiSession = async (token) => apiFetch('/api/auth/session', {
    method: 'POST',
    body: { token: normalizeSessionApiToken(token) }
})

// The estate map is infrastructure topology and this repo is public, so the file
// is never in it — the server reads it from ESTATE_MAP_PATH and hands it to
// admins only. A 404 here is the normal state on any host that has not been
// given the file, not a fault.
export const getEstateMap = async (opts = {}) => apiFetch('/api/estate/map', opts)

export const logoutApiSession = async () => apiFetch('/api/auth/session', {
    method: 'DELETE',
    json: false
})

export const getApiAuthProviders = async () => apiFetch('/api/auth/providers')

// Carries where the person is standing (path + query, so an ?invite= token
// survives the round-trip) — the OAuth callback returns them there instead
// of dropping every sign-in on the landing page.
export const getOAuthUrl = (provider) => {
    const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : ''
    const suffix = returnTo && returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    return `${apiBaseUrl}/api/auth/${provider}${suffix}`
}

export const getAiConnectionStatus = async (provider) =>
    apiFetch(`/api/integrations/ai/status?provider=${encodeURIComponent(provider)}`)

export const connectAiKey = async (provider, apiKey, label) => apiFetch('/api/integrations/ai/connect', {
    method: 'POST',
    body: { provider, apiKey, label }
})

export const disconnectAiKey = async (provider) => apiFetch('/api/integrations/ai/disconnect', {
    method: 'POST',
    body: { provider }
})

// Operator-only agent board (Ops Graph → Agents). 404s everywhere except a
// local dev serverXR over loopback — callers treat that as "unavailable".
export const getAgentBoard = async () => apiFetch('/api/agent-board')

export const getAgentBoardSession = async (sessionId) => (
    apiFetch(`/api/agent-board/session/${encodeURIComponent(sessionId)}`)
)
