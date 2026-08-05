export function createProjectSyncService() {
    let eventSource = null

    const disconnect = () => {
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
        source.onopen = () => onOpen?.()
        source.onerror = () => onError?.()

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
