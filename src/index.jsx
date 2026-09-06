import './style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import RootApp from './RootApp.jsx'
import { ensureRuntimeConsole } from './services/runtimeConsole.js'
import { suppressNativeDrag } from './utils/suppressNativeDrag.js'
import { trackEvent } from './utils/track.js'
import { watchPreviewPaint } from './utils/previewMode.js'
import { getInitialSpaceIdFromLocation } from './utils/spaceRouting.js'

ensureRuntimeConsole()
suppressNativeDrag()

// `?preview=1` inside a frame: tell the host the moment this surface has
// painted, so the space grid's boot queue frees the slot then instead of on
// the iframe's `load` (which fires long before an SPA has anything to show).
// Mounted here rather than in a component so every embeddable route — the
// published viewer, a code page, the generic <App /> a space without a project
// falls back to — reports without knowing it does.
try {
    watchPreviewPaint({ spaceId: getInitialSpaceIdFromLocation() })
} catch { /* a thumbnail that cannot report must still render */ }

// One anonymous 'view' per page load (no SPA route tracking on purpose).
// The 'signup' marker must be read HERE: AuthReturnNotice strips ?auth=ok in
// its mount effect, and AuthGate is lazy-loaded — reading it anywhere inside
// the React tree races that strip. No new-vs-returning signal exists in the
// OAuth redirect, so 'signup' counts every completed sign-in (known overcount).
trackEvent('view')
try {
    if (new URLSearchParams(window.location.search).get('auth') === 'ok') {
        trackEvent('signup')
    }
} catch { /* tracking must never break the app */ }

ReactDOM.createRoot(document.querySelector('#root')).render(
    <React.StrictMode>
        <RootApp />
    </React.StrictMode>
)
