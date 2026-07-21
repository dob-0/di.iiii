import { OPEN_JAM_PROJECT_ID } from './studioRouting.js'

// Minimal "jam mode" for the communal open-jam project: same floating-window
// UI, but only the common tools — one Create window (file upload + a few
// simple shapes), no Code/World/Share/Projects windows, no Drive/Commons
// imports. Someone who scanned a QR at an event should be able to add a
// visual without meeting the full editor first. An "All tools" toggle (in
// the control cluster) opts this device back into the full editor.

export const isJamProject = (projectId) => projectId === OPEN_JAM_PROJECT_ID

export const JAM_ALL_TOOLS_KEY = 'di.studio.jamAllTools'

export function loadJamAllTools() {
    try {
        return window.localStorage.getItem(JAM_ALL_TOOLS_KEY) === '1'
    } catch {
        return false
    }
}

export function saveJamAllTools(enabled) {
    try {
        if (enabled) window.localStorage.setItem(JAM_ALL_TOOLS_KEY, '1')
        else window.localStorage.removeItem(JAM_ALL_TOOLS_KEY)
    } catch {
        // storage unavailable (private mode) — choice just won't persist
    }
}
