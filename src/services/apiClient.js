const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export const hasServerApi = Boolean(BASE)

export async function apiFetch(path, { method = 'GET', headers, body, json = true } = {}) {
    if (!hasServerApi) {
        throw new Error('API base URL is not configured')
    }
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    const init = { method, headers: headers ? { ...headers } : {} }
    if (body instanceof FormData) {
        init.body = body
    } else if (body !== undefined) {
        init.body = JSON.stringify(body)
        init.headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(url, init)
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

export const apiBaseUrl = BASE
