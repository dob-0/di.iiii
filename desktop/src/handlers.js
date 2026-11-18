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

// The main frame and every window opened from it stay on di origins; the rest
// goes to the system browser (or is dropped when its scheme is not web or
// mail). A subframe is not touched: it loads as in a browser tab, and the
// page's own CSP governs what it may embed.
// Electron 45 passes one details event: details.url, details.isMainFrame
// (WebContentsWillNavigateEventParams / WebContentsWillRedirectEventParams).
const attachNavigationGuards = (webContents, { allowed, openExternal }) => {
    const guard = (details) => {
        if (!details.isMainFrame) return
        if (isAllowedUrl(details.url, allowed)) return
        details.preventDefault()
        if (canOpenExternal(details.url)) openExternal(details.url)
    }
    webContents.on('will-navigate', guard)
    webContents.on('will-redirect', guard)
    webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url, allowed)) return { action: 'allow' }
        if (canOpenExternal(url)) openExternal(url)
        return { action: 'deny' }
    })
}

module.exports = { createPermissionHandlers, createDisplayMediaHandler, attachNavigationGuards }
