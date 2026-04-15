const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])
const API_TOKEN = (import.meta.env.VITE_API_TOKEN || '').trim()

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

export async function apiFetch(path, { method = 'GET', headers, body, json = true } = {}) {
    if (!hasServerApi) {
        throw new Error('API base URL is not configured')
    }
    if (isServerTemporarilyUnavailable()) {
        throw createServerUnavailableError('ServerXR is temporarily unavailable.')
    }
    const url = path.startsWith('http') ? path : `${apiBaseUrl}${path}`
    const authHeaders = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
    const init = { method, headers: { ...authHeaders, ...(headers ? { ...headers } : {}) } }
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
        throw error
    }
    if (!json) {
        return response
    }
    return response.json()
}
