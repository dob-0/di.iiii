// Read-only status bridge for sandboxed code pages.
//
// A code page runs in a srcdoc iframe with no allow-same-origin (origin
// "null"), and the light desk sends no CORS headers, so the page cannot fetch
// the desk's status itself. The host (PresentationCanvas) does the GET for it
// on a fixed allowlist and posts the parsed JSON back.
//
// page -> host: { type: 'di-code-page-read', id, path }
// host -> page: { type: 'di-code-page-read-result', id, ok, status, body }

export const CODE_PAGE_READ_TYPE = 'di-code-page-read'
export const CODE_PAGE_READ_RESULT_TYPE = 'di-code-page-read-result'
export const CODE_PAGE_READ_ALLOWLIST = Object.freeze(['/light/api/summary', '/light/api/state', '/light/api/dmx'])
export const CODE_PAGE_READ_MAX_PER_SECOND = 10
export const CODE_PAGE_READ_TIMEOUT_MS = 5000

export function stripQuery(path) {
    const text = String(path ?? '')
    const cut = text.search(/[?#]/)
    return cut === -1 ? text : text.slice(0, cut)
}

export function isAllowedReadPath(path) {
    return typeof path === 'string' && CODE_PAGE_READ_ALLOWLIST.includes(stripQuery(path))
}

// At most `max` hits per rolling `windowMs`; extras are refused.
export function createReadLimiter({ max = CODE_PAGE_READ_MAX_PER_SECOND, windowMs = 1000, now = () => Date.now() } = {}) {
    let hits = []
    return function allow() {
        const t = now()
        hits = hits.filter((h) => t - h < windowMs)
        if (hits.length >= max) return false
        hits.push(t)
        return true
    }
}

async function readStatus(path, { fetchImpl, timeoutMs }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetchImpl(path, {
            method: 'GET',
            credentials: 'same-origin',
            signal: controller.signal
        })
        let body = null
        try {
            body = await response.json()
        } catch {
            body = null
        }
        return { ok: Boolean(response.ok), status: response.status, body }
    } catch (error) {
        return {
            ok: false,
            status: 0,
            body: null,
            error: error?.name === 'AbortError' ? 'timeout' : 'fetch failed'
        }
    } finally {
        clearTimeout(timer)
    }
}

// Returns a handler for window 'message' events. `getFrameWindow` gives the
// current iframe contentWindow; messages from any other source are ignored.
export function createCodePageReadBridge({
    getFrameWindow,
    fetchImpl = (...args) => globalThis.fetch(...args),
    limiter = createReadLimiter(),
    timeoutMs = CODE_PAGE_READ_TIMEOUT_MS
} = {}) {
    return async function handleMessage(event) {
        const frame = getFrameWindow?.()
        if (!frame || event?.source !== frame) return
        const data = event.data
        if (data?.type !== CODE_PAGE_READ_TYPE) return
        const id = typeof data.id === 'string' ? data.id : ''
        // target '*' is required: the iframe origin is null. Body is read-only status.
        const reply = (result) => {
            try {
                frame.postMessage({ type: CODE_PAGE_READ_RESULT_TYPE, id, body: null, ...result }, '*')
            } catch {
                // frame went away
            }
        }
        if (!limiter()) return reply({ ok: false, status: 429, error: 'rate limited' })
        if (!isAllowedReadPath(data.path)) return reply({ ok: false, status: 403, error: 'not allowed' })
        reply(await readStatus(stripQuery(data.path) + queryOf(data.path), { fetchImpl, timeoutMs }))
    }
}

function queryOf(path) {
    const text = String(path)
    const q = text.indexOf('?')
    if (q === -1) return ''
    const h = text.indexOf('#', q)
    return h === -1 ? text.slice(q) : text.slice(q, h)
}
