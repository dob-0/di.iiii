import { apiBaseUrl, hasServerApi } from '../services/apiClient.js'

// Anonymous usage beacon — "this happened, on this path" and nothing else.
// The server stores no IP, no user agent, no cookie, no id (see
// serverXR/src/routes/trackRoutes.js). document.referrer rides along because
// the request's own Referer header is always same-origin for a beacon, so
// it's the only place "came from reddit.com" exists; the server keeps the
// hostname only and drops same-origin values.
export function trackEvent(eventType, path = window.location.pathname) {
    try {
        if (!hasServerApi) return
        const body = JSON.stringify({ eventType, path, referrer: document.referrer || '' })
        const url = `${apiBaseUrl}/api/track`
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true
            }).catch(() => {})
        }
    } catch {
        // tracking must never break the app
    }
}
