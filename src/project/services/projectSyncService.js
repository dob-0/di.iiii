// EventSource auto-retries every ~3s, forever — a stopped local server (di
// down, laptop lid, venue wifi) got an uncapped request drip from every open
// tab. Same cap as sceneSyncService: after a few straight failures, close and
// sit out the 15s cooldown apiClient applies to an unavailable server, then
// reconnect with the same arguments. One success resets the count.
export const RECONNECT_ERRORS_BEFORE_COOLDOWN = 3
export const RECONNECT_COOLDOWN_MS = 15000

export function createProjectSyncService() {
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
        onReadyError
    } = {}) => {
        if (!eventsUrl) {
            disconnect()
            return
        }
        disconnect()
        lastConnectArgs = { eventsUrl, onProjectOp, onReady, onOpen, onError, onReadyError }
        const source = new EventSource(eventsUrl)
        eventSource = source

        const handleProjectOp = (event) => {
            if (!event?.data || typeof onProjectOp !== 'function') return
            try {
                onProjectOp(JSON.parse(event.data))
            } catch {
                // ignore
            }
        }

        const handleReady = (event) => {
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

        source.__handlers = { handleProjectOp, handleReady }
    }

    return {
        connect,
        disconnect,
        get currentSource() {
            return eventSource
        }
    }
}
