'use strict'
// Handlers that wire the policy into Electron. Electron objects come in as
// arguments, so the tests can pass fakes.

const { isAllowedUrl, isPermissionGranted, canOpenExternal } = require('./policy')

const createPermissionHandlers = (allowed) => ({
    request: (webContents, permission, callback, details) => {
        const requesting = (details && details.requestingUrl) || webContents.getURL()
        callback(isPermissionGranted(permission, requesting, allowed))
    },
    check: (webContents, permission, requestingOrigin) =>
        isPermissionGranted(permission, requestingOrigin, allowed)
})

// Screen share. `getSources` is desktopCapturer.getSources; `choose` asks the
// person when there is more than one source (null = cancelled).
const createDisplayMediaHandler = ({ allowed, getSources, choose }) => async (request, callback) => {
    if (!isAllowedUrl(request.securityOrigin, allowed)) return callback(null)
    try {
        const sources = await getSources({ types: ['screen', 'window'] })
        if (!sources.length) return callback(null)
        const picked = sources.length === 1 ? sources[0] : await choose(sources)
        return callback(picked ? { video: picked } : null)
    } catch {
        // For example the person closed the PipeWire picker on Linux.
        return callback(null)
    }
}

// The system browser opens only for a person, not for a script: an open needs
// an input event in this webContents within INPUT_WINDOW_MS (the input is used
// up by the open), and at most 1 per second and 5 per minute. A refused open
// is logged once per host.
const INPUT_WINDOW_MS = 2000
const GESTURE_INPUTS = new Set(['mouseDown', 'mouseUp', 'rawKeyDown', 'keyDown', 'char', 'touchStart', 'touchEnd'])

const createExternalGate = ({ openExternal, now = Date.now, log = (line) => process.stderr.write(`${line}\n`) }) => {
    let lastInput = -Infinity
    const opened = []
    const logged = new Set()
    const refuse = (url, why) => {
        let host = 'invalid'
        try { host = new URL(String(url)).host || new URL(String(url)).protocol } catch { /* keep "invalid" */ }
        if (logged.has(host)) return
        if (logged.size < 50) logged.add(host)
        log(`di.iiii: refused to open ${host} in the system browser (${why})`)
    }
    return {
        noteInput: (input) => { if (input && GESTURE_INPUTS.has(input.type)) lastInput = now() },
        open: (url) => {
            const t = now()
            if (t - lastInput > INPUT_WINDOW_MS) return refuse(url, 'no recent click or key')
            while (opened.length && t - opened[0] >= 60000) opened.shift()
            if (opened.length && t - opened[opened.length - 1] < 1000) return refuse(url, 'more than 1 per second')
            if (opened.length >= 5) return refuse(url, 'more than 5 per minute')
            opened.push(t)
            lastInput = -Infinity
            openExternal(url)
        }
    }
}

// The main frame and every window opened from it stay on di origins; the rest
// goes to the system browser (or is dropped when its scheme is not web or
// mail). A subframe is not touched: it loads as in a browser tab, and the
// page's own CSP governs what it may embed.
// Electron 45 passes one details event: details.url, details.isMainFrame
// (WebContentsWillNavigateEventParams / WebContentsWillRedirectEventParams).
const attachNavigationGuards = (webContents, { allowed, openExternal, now, log }) => {
    const gate = createExternalGate({ openExternal, now, log })
    webContents.on('input-event', (event, input) => gate.noteInput(input))
    const guard = (details) => {
        if (!details.isMainFrame) return
        if (isAllowedUrl(details.url, allowed)) return
        details.preventDefault()
        if (canOpenExternal(details.url)) gate.open(details.url)
    }
    webContents.on('will-navigate', guard)
    webContents.on('will-redirect', guard)
    webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url, allowed)) return { action: 'allow' }
        if (canOpenExternal(url)) gate.open(url)
        return { action: 'deny' }
    })
}

module.exports = { createExternalGate, createPermissionHandlers, createDisplayMediaHandler, attachNavigationGuards }
