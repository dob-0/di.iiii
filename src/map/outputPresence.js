import { useEffect } from 'react'

// THE OUTPUT PAGE'S SIDE OF "IS IT OPEN" (Perform's output control,
// src/perform/outputWindows.js is the other side).
//
// A browser never tells the opener that a window it opened is still there once
// the opener has been reloaded, and `win.closed` is only readable while the
// opener holds the handle. So the output page answers on a BroadcastChannel:
//   ping  -> hello   (the control asks; every output page of the project answers)
//   close -> bye     (the control asks the page to close itself)
// and says hello on load and bye when it goes away. The channel is a courier,
// never the record: a control that hears nothing shows CLOSED.
export const outputWindowName = (projectId) => `di-map-out-${projectId}`
export const outputPresenceChannel = (projectId) => `di-map-out-presence-${projectId}`

// Pure, so the page's answers are testable without a browser.
export const answerPresence = (message, { post, close }) => {
    const kind = message?.kind
    if (kind === 'ping') post({ kind: 'hello' })
    else if (kind === 'close') {
        post({ kind: 'bye' })
        close()
    }
}

// Full screen the browser allows without a person: none. requestFullscreen needs a
// click or key press IN the output window (transient activation), so it is tried
// once on load (some browsers allow it for a window that was just opened by a
// click) and again on the first click or key. The projector is never asked
// anything it would show.
export const requestFullscreenOnce = (doc = document) => {
    const el = doc?.documentElement
    if (!el?.requestFullscreen || doc.fullscreenElement) return Promise.resolve(false)
    return Promise.resolve(el.requestFullscreen()).then(() => true, () => false)
}

export function useOutputPresence(projectId, { fullscreen = false, enabled = true } = {}) {
    useEffect(() => {
        if (!enabled || !projectId || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(outputPresenceChannel(projectId))
        const post = (message) => { try { channel.postMessage(message) } catch { /* closing */ } }
        channel.onmessage = (event) => answerPresence(event?.data, { post, close: () => window.close() })
        post({ kind: 'hello' })
        const bye = () => post({ kind: 'bye' })
        window.addEventListener('pagehide', bye)
        return () => {
            window.removeEventListener('pagehide', bye)
            bye()
            channel.close()
        }
    }, [projectId, enabled])

    useEffect(() => {
        if (!enabled || !fullscreen) return undefined
        requestFullscreenOnce()
        const onGesture = () => {
            requestFullscreenOnce().then((done) => { if (done) off() })
        }
        const off = () => {
            window.removeEventListener('pointerdown', onGesture)
            window.removeEventListener('keydown', onGesture)
        }
        window.addEventListener('pointerdown', onGesture)
        window.addEventListener('keydown', onGesture)
        return off
    }, [enabled, fullscreen])
}
