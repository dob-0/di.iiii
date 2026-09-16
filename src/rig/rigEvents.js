// Lane D · sinks. Client side of serverXR/src/rig/events.js's SSE stream. See
// docs/architecture/rig/PROTOCOL-1.md §7's lane D interface block.

// subscribe(baseUrl, { onBlackout, onReload, onShowPage }) opens
// `${baseUrl}/api/rig/events` and forwards the three event kinds that route emits.
// Reconnection is EventSource's own job (it auto-retries every ~3s on error, forever) —
// this deliberately does not add a cooldown on top of it the way
// src/services/sceneSyncService.js does for scene sync: a rig with no local runtime
// (a hosted diiii.xyz, or `di up` with DI_RIG=0) answers 404 for this route FOREVER, and
// RigBlackout.jsx must stay silent through that, not build up its own reconnect state
// machine for a stream that will never open.
export function subscribe(baseUrl, { onBlackout, onReload, onShowPage } = {}) {
    if (typeof EventSource !== 'function') return () => {}

    const url = `${String(baseUrl || '').replace(/\/+$/, '')}/api/rig/events`
    const source = new EventSource(url)
    let loggedOnce = false

    const parse = (event) => {
        if (!event || !event.data) return {}
        try {
            return JSON.parse(event.data)
        } catch {
            return {}
        }
    }

    const handleBlackout = (event) => { onBlackout?.(parse(event)) }
    const handleReload = (event) => { onReload?.(parse(event)) }
    const handleShowPage = (event) => { onShowPage?.(parse(event)) }
    // One quiet debug line, never a console flood: EventSource retries on every kind of
    // failure (404 from a hosted site, rig off, network blip) and fires onerror each time.
    const handleError = () => {
        if (loggedOnce) return
        loggedOnce = true
        console.debug('[rig] /api/rig/events unavailable (no local runtime, or the rig is off)')
    }

    source.addEventListener('blackout', handleBlackout)
    source.addEventListener('reload', handleReload)
    source.addEventListener('show-page', handleShowPage)
    source.onerror = handleError

    return () => {
        source.removeEventListener('blackout', handleBlackout)
        source.removeEventListener('reload', handleReload)
        source.removeEventListener('show-page', handleShowPage)
        source.close()
    }
}
