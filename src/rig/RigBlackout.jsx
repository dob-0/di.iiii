import { useEffect, useState } from 'react'
import { apiBaseUrl } from '../services/apiClient.js'
import { subscribe } from './rigEvents.js'

// Lane D · sinks. A full-window black layer while the local rig says blackout is on. See
// docs/architecture/rig/PROTOCOL-1.md §2.4 and §7's lane D interface block.
//
// Sits above everything on the output surface but never eats a pointer event — the output
// (src/map/MapOutput.jsx) must stay controllable (fullscreen button, idle-cursor logic,
// whatever comes later) while it is showing black.
const OVERLAY_STYLE = {
    position: 'fixed',
    inset: 0,
    background: '#000',
    zIndex: 2147483000,
    pointerEvents: 'none'
}

// Mirrors serverXR/src/rig/sinks.js's own isSafeShowPageUrl — the server already refused
// anything unsafe as bad-args before a 'show-page' event could ever reach this component,
// but window.location.assign is a real navigation and gets its own check rather than
// trusting the wire.
function isSameOriginPath(url) {
    if (typeof url !== 'string' || !url) return false
    if (url.startsWith('//')) return false
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false
    return !url.includes('\\')
}

export default function RigBlackout() {
    const [blackout, setBlackout] = useState(false)

    useEffect(() => {
        // No overlay, no console spam beyond rigEvents.js's own one debug line: a hosted
        // site or a rig turned off (DI_RIG=0) answers 404/403 forever, and that must stay
        // silent here too.
        const unsubscribe = subscribe(apiBaseUrl, {
            onBlackout: (payload) => setBlackout(Boolean(payload?.on)),
            onReload: () => { window.location.reload() },
            onShowPage: (payload) => {
                const url = payload?.url
                if (isSameOriginPath(url)) window.location.assign(url)
            }
        })
        return unsubscribe
    }, [])

    if (!blackout) return null
    return <div className="rig-blackout" style={OVERLAY_STYLE} aria-hidden="true" />
}
