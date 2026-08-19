import './style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import RootApp from './RootApp.jsx'
import { ensureRuntimeConsole } from './services/runtimeConsole.js'
import { suppressNativeDrag } from './utils/suppressNativeDrag.js'
import { trackEvent } from './utils/track.js'

ensureRuntimeConsole()
suppressNativeDrag()

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
