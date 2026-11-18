'use strict'
// Handlers that wire the policy into Electron. Electron objects come in as
// arguments, so the tests can pass fakes.

const { isAllowedUrl, isPermissionGranted, canOpenExternal, originOf } = require('./policy')

// 'media' is camera and microphone (screen share has its own handler below).
// It is asked once per origin and per kind with a native dialog that names the
// origin; the answer is kept in `mediaStore`. The check handler answers only
// from a stored yes. Without a store or a dialog, media is refused.
const MEDIA_KIND = Object.freeze({ video: 'camera', audio: 'microphone' })
const mediaKinds = (types) => {
    const kinds = (types || []).map((type) => MEDIA_KIND[type])
    return kinds.length && kinds.every(Boolean) ? [...new Set(kinds)] : null
}

const createPermissionHandlers = (allowed, { mediaStore = null, askMedia = null } = {}) => {
    const pending = new Map()
    // One dialog per origin and kind, however many calls arrive meanwhile.
    const answer = (origin, kind) => {
        const stored = mediaStore.get(origin, kind)
        if (stored !== undefined) return Promise.resolve(stored)
        const key = `${origin}\n${kind}`
        if (!pending.has(key)) {
            pending.set(key, Promise.resolve()
                .then(() => askMedia(origin, kind))
                .then((yes) => { mediaStore.set(origin, kind, Boolean(yes)); return Boolean(yes) })
                .catch(() => false)
                .finally(() => pending.delete(key)))
        }
        return pending.get(key)
    }
    return {
        request: (webContents, permission, callback, details) => {
            const requesting = (details && details.requestingUrl) || webContents.getURL()
            if (permission !== 'media') return callback(isPermissionGranted(permission, requesting, allowed))
            const origin = originOf(requesting)
            const kinds = mediaKinds(details && details.mediaTypes)
            if (!mediaStore || !askMedia || !kinds || !isAllowedUrl(requesting, allowed)) return callback(false)
            return Promise.all(kinds.map((kind) => answer(origin, kind))).then((all) => callback(all.every(Boolean)))
        },
        check: (webContents, permission, requestingOrigin, details) => {
            if (permission !== 'media') return isPermissionGranted(permission, requestingOrigin, allowed)
            const origin = originOf((details && details.securityOrigin) || requestingOrigin)
            if (!mediaStore || !origin || !allowed.has(origin)) return false
            const type = details && details.mediaType
            const kinds = type === 'video' || type === 'audio' ? [MEDIA_KIND[type]] : ['camera', 'microphone']
            return kinds.every((kind) => mediaStore.get(origin, kind) === true)
        }
    }
}

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
