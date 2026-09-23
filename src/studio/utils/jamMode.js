import { useSyncExternalStore } from 'react'
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

// "⚒ All tools" for EVERY project (the layers decision, 2026-09-23, unit 2).
// A project opens bare and each tool arrives as the project grows; this is the
// one thing a person may set against that — every window and every name on the
// bar from the start, on every project, kept in this browser. Never stored in a
// project, never on the server. The open jam keeps its own key above and is
// untouched by this one.
export const ALL_TOOLS_KEY = 'di.studio.allTools'
const ALL_TOOLS_EVENT = 'di:all-tools'

export function loadAllTools() {
    try {
        return window.localStorage.getItem(ALL_TOOLS_KEY) === '1'
    } catch {
        return false
    }
}

export function saveAllTools(enabled) {
    try {
        if (enabled) window.localStorage.setItem(ALL_TOOLS_KEY, '1')
        else window.localStorage.removeItem(ALL_TOOLS_KEY)
    } catch {
        // storage unavailable (private mode) — the choice lasts this page only
    }
    // The bar reads the same choice; tell it in this tab (a `storage` event only
    // reaches the OTHER tabs).
    try {
        window.dispatchEvent(new Event(ALL_TOOLS_EVENT))
    } catch {
        // no window (tests without a DOM) — nothing to tell
    }
}

const subscribeAllTools = (onChange) => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener('storage', onChange)
    window.addEventListener(ALL_TOOLS_EVENT, onChange)
    return () => {
        window.removeEventListener('storage', onChange)
        window.removeEventListener(ALL_TOOLS_EVENT, onChange)
    }
}

// The live answer, for any surface: Studio's shell and the one bar.
export function useAllTools() {
    return useSyncExternalStore(subscribeAllTools, loadAllTools, () => false)
}
