// EventSource auto-retries every ~3s, forever — a stopped local server (di
// down, laptop lid, venue wifi) got an uncapped request drip from every open
// tab. Same cap as sceneSyncService: after a few straight failures, close and
// sit out the 15s cooldown apiClient applies to an unavailable server, then
// reconnect with the same arguments. One success resets the count.
export const RECONNECT_ERRORS_BEFORE_COOLDOWN = 3
export const RECONNECT_COOLDOWN_MS = 15000
// A proxy in front of a restarted server can leave the stream open and silent
// (no end, no error: scripts/diagnose/sse-proxy-silent-after-upstream-dies.mjs),
// and a new stream while the server is down is answered 502, which the
// EventSource spec turns into readyState CLOSED with no browser retry. The
// server sends `ready` on connect and keep-alive comments JS cannot see, so
// this long without any event is "silent": the caller checks the server once.
export const SILENCE_MS = 20000
export const CLOSED_BACKOFF_BASE_MS = 1000
const EVENT_SOURCE_CLOSED = 2

export function createProjectSyncService() {
    let eventSource = null
    let cooldownTimer = null
    let errorCount = 0
    let lastConnectArgs = null
    let silenceTimer = null
    let closedCount = 0
    let lastMessageAt = 0

    const clearSilenceTimer = () => {
        if (silenceTimer) {
            clearTimeout(silenceTimer)
            silenceTimer = null
        }
    }

    const disconnect = () => {
        clearSilenceTimer()
        if (cooldownTimer) {
            clearTimeout(cooldownTimer)
            cooldownTimer = null
        }
        if (!eventSource) return
        const handlers = eventSource.__handlers
        if (handlers) {
            eventSource.removeEventListener('project-op', handlers.handleProjectOp)
            eventSource.removeEventListener('ready', handlers.handleReady)
        }
        eventSource.close()
        eventSource = null
    }

    const connect = ({
        eventsUrl,
        onProjectOp,
        onReady,
        onOpen,
        onError,
        onReadyError,
        onSilent
    } = {}) => {
        if (!eventsUrl) {
            disconnect()
            return
        }
        disconnect()
        lastConnectArgs = { eventsUrl, onProjectOp, onReady, onOpen, onError, onReadyError, onSilent }
        const source = new EventSource(eventsUrl)
        eventSource = source

        // Any event restarts the silence clock; when it runs out the caller is
        // asked once (onSilent) and the clock restarts, so at most one ask per
        // SILENCE_MS and only while nothing arrives.
        const armSilence = () => {
            clearSilenceTimer()
            if (typeof onSilent !== 'function') return
            silenceTimer = setTimeout(() => {
                silenceTimer = null
                if (eventSource !== source) return
                armSilence()
                try {
                    Promise.resolve(onSilent(source)).catch(() => {})
                } catch {
                    // a failed check is left to the normal reconnect
                }
            }, SILENCE_MS)
        }
        const heard = () => {
            lastMessageAt = Date.now()
            closedCount = 0
            armSilence()
        }
        armSilence()

        const handleProjectOp = (event) => {
            heard()
            if (!event?.data || typeof onProjectOp !== 'function') return
            try {
                onProjectOp(JSON.parse(event.data))
            } catch {
                // ignore
            }
        }

        const handleReady = (event) => {
            heard()
            if (!event?.data || typeof onReady !== 'function') return
            let parsed
            try {
                parsed = JSON.parse(event.data)
            } catch {
                return
            }
            // A rejected onReady means the post-connect catch-up failed while
            // the stream already reads 'connected'. Dropping it here made that
            // invisible, so hand it back to the caller.
            Promise.resolve(onReady(parsed)).catch((error) => {
                onReadyError?.(error)
            })
        }

        source.addEventListener('project-op', handleProjectOp)
        source.addEventListener('ready', handleReady)
        source.onopen = () => {
            errorCount = 0
            heard()
            onOpen?.()
        }
        source.onerror = () => {
            onError?.()
            if (source.readyState === EVENT_SOURCE_CLOSED) {
                // The browser gave up (a 502 while the server restarts): it
                // will not retry, so reconnect ourselves with a short backoff.
                const delay = Math.min(
                    CLOSED_BACKOFF_BASE_MS * 2 ** closedCount,
                    RECONNECT_COOLDOWN_MS
                )
                closedCount += 1
                errorCount = 0
                const closedArgs = lastConnectArgs
                disconnect()
                cooldownTimer = setTimeout(() => {
                    cooldownTimer = null
                    connect(closedArgs)
                }, delay)
                return
            }
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

        source.__handlers = { handleProjectOp, handleReady }
    }

    // Drops the current stream and opens a new one with the same arguments.
    const reconnect = () => {
        if (!lastConnectArgs || !eventSource) return
        connect(lastConnectArgs)
    }

    return {
        connect,
        disconnect,
        reconnect,
        get lastMessageAt() {
            return lastMessageAt
        },
        get currentSource() {
            return eventSource
        }
    }
}
