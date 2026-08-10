// EventSource auto-retries every ~3s, forever — a stopped local server (di
// down, laptop lid, venue wifi) got an uncapped request drip from every open
// tab. After a few straight failures the stream now closes and sits out the
// same 15s cooldown apiClient applies to an unavailable server
// (SERVER_UNAVAILABLE_COOLDOWN_MS), then reconnects itself with the same
// arguments. One success resets the count.
export const RECONNECT_ERRORS_BEFORE_COOLDOWN = 3
export const RECONNECT_COOLDOWN_MS = 15000

export function createSceneSyncService() {
    let eventSource = null
    let cooldownTimer = null
    let errorCount = 0
    let lastConnectArgs = null

    const disconnect = () => {
        if (cooldownTimer) {
            clearTimeout(cooldownTimer)
            cooldownTimer = null
        }
        if (!eventSource) return
        const handlers = eventSource.__handlers
        if (handlers) {
            eventSource.removeEventListener('scene-patch', handlers.handlePatch)
            eventSource.removeEventListener('scene-op', handlers.handlePatch)
            eventSource.removeEventListener('cursor-update', handlers.handleCursor)
            eventSource.removeEventListener('ready', handlers.handleReady)
        }
        eventSource.close()
        eventSource = null
    }

    const connect = ({
        eventsUrl,
        onPatch,
        onCursor,
        onReady,
        onOpen,
        onError
    } = {}) => {
        if (!eventsUrl) {
            disconnect()
            return
        }
        disconnect()
        lastConnectArgs = { eventsUrl, onPatch, onCursor, onReady, onOpen, onError }
        const source = new EventSource(eventsUrl)
        eventSource = source

        const handlePatch = (event) => {
            if (!event?.data || typeof onPatch !== 'function') return
            try {
                onPatch(JSON.parse(event.data))
            } catch {
                // ignore
            }
        }

        const handleCursor = (event) => {
            if (!event?.data || typeof onCursor !== 'function') return
            try {
                onCursor(JSON.parse(event.data))
            } catch {
                // ignore
            }
        }

        const handleReady = (event) => {
            if (!event?.data || typeof onReady !== 'function') return
            try {
                onReady(JSON.parse(event.data))
            } catch {
                // ignore
            }
        }

        source.addEventListener('scene-patch', handlePatch)
        source.addEventListener('scene-op', handlePatch)
        source.addEventListener('cursor-update', handleCursor)
        source.addEventListener('ready', handleReady)
        source.onopen = () => {
            errorCount = 0
            onOpen?.()
        }
        source.onerror = () => {
            onError?.()
            errorCount += 1
            if (errorCount < RECONNECT_ERRORS_BEFORE_COOLDOWN) {
                // the browser's own ~3s retry is fine for a blip
                return
            }
            errorCount = 0
            const args = lastConnectArgs
            disconnect()
            cooldownTimer = setTimeout(() => {
                cooldownTimer = null
                connect(args)
            }, RECONNECT_COOLDOWN_MS)
        }

        source.__handlers = { handlePatch, handleCursor, handleReady }
    }

    const send = ({ url, payload, cursor, clientId }) => {
        if (!url) return Promise.resolve()
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload, cursor, clientId })
        }).catch(() => {})
    }

    return {
        connect,
        disconnect,
        send,
        get currentSource() {
            return eventSource
        }
    }
}
