export function createSceneSyncService() {
    let eventSource = null

    const disconnect = () => {
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
        onReady
    } = {}) => {
        if (!eventsUrl) {
            disconnect()
            return
        }
        disconnect()
        const source = new EventSource(eventsUrl)
        eventSource = source

        const handlePatch = (event) => {
            if (!event?.data || typeof onPatch !== 'function') return
            try {
                onPatch(JSON.parse(event.data))
            } catch (error) {
                console.warn('Failed to parse scene patch event', error)
            }
        }

        const handleCursor = (event) => {
            if (!event?.data || typeof onCursor !== 'function') return
            try {
                onCursor(JSON.parse(event.data))
            } catch (error) {
                console.warn('Failed to parse cursor event', error)
            }
        }

        const handleReady = (event) => {
            if (!event?.data || typeof onReady !== 'function') return
            try {
                onReady(JSON.parse(event.data))
            } catch (error) {
                console.warn('Failed to parse ready event', error)
            }
        }

        source.addEventListener('scene-patch', handlePatch)
        source.addEventListener('scene-op', handlePatch)
        source.addEventListener('cursor-update', handleCursor)
        source.addEventListener('ready', handleReady)
        source.onerror = () => {
            // allow browser to retry automatically
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
