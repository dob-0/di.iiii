import { useCallback, useEffect, useState } from 'react'
import { buildMapOutputPath } from '../map/mapRouting.js'
import { outputPresenceChannel, outputWindowName } from '../map/outputPresence.js'

// THE OUTPUT WINDOW, AS A THING THE PERFORM DESK CAN OPEN, CLOSE AND ASK ABOUT.
// Design and the multi-output plan: docs/ai/sessions/feat-perform-output-control.md.

export const POLL_MS = 1000
const PING_WAIT_MS = 400
// A recovered window (no handle) is asked again every poll; silent for this long = gone.
const SILENT_MS = POLL_MS * 3 + PING_WAIT_MS

// ---- screens (Window Management API, Chromium) ----------------------------------

export const canPlaceOnScreen = (win = typeof window !== 'undefined' ? window : null) =>
    Boolean(win && typeof win.getScreenDetails === 'function')

const describeScreen = (s, index) => ({
    index,
    label: s.label || `Screen ${index + 1}`,
    width: Math.round(s.width),
    height: Math.round(s.height),
    left: Math.round(s.availLeft ?? s.left ?? 0),
    top: Math.round(s.availTop ?? s.top ?? 0),
    primary: Boolean(s.isPrimary)
})

// The screen this page is on: always known, needs no permission.
export const currentScreen = (win = window) => describeScreen(win.screen || { width: 1920, height: 1080 }, 0)

// Asks the browser. Chromium shows "Manage windows on all your displays" the first
// time. Resolves { screens, reason }: reason is '' when the list is real, otherwise
// the plain sentence to show.
export async function loadScreens(win = window) {
    if (!canPlaceOnScreen(win)) {
        return { screens: [currentScreen(win)], reason: 'This browser cannot place a window on a screen. The output opens where the browser puts it; drag it to the projector once.' }
    }
    try {
        const details = await win.getScreenDetails()
        return { screens: details.screens.map(describeScreen), reason: '' }
    } catch {
        return { screens: [currentScreen(win)], reason: 'Screen access was not given, so the output opens where the browser puts it. Allow "manage windows on all your displays" and press List screens again.' }
    }
}

// Which of the listed screens the document's saved choice means: index first (what the
// list shows and the select stores), then label (survives a re-plug), then size.
// null when nothing fits.
export const pickScreen = (screens = [], want = null) => {
    if (!want || !screens.length) return null
    if (Number.isInteger(want.index) && screens[want.index]) return screens[want.index]
    if (want.label) {
        const byLabel = screens.find((s) => s.label === want.label)
        if (byLabel) return byLabel
    }
    if (Array.isArray(want.size)) return screens.find((s) => s.width === want.size[0] && s.height === want.size[1]) || null
    return null
}

// The screen the Screen select shows: the listed one the saved choice means, or, before
// "List screens" (or when that screen is unplugged), the saved choice itself as an
// entry marked `saved` (its size comes from the document; it has no position).
export const resolveScreen = (screens = [], want = null) => {
    const listed = pickScreen(screens, want)
    if (listed) return listed
    if (!want || !(Number.isInteger(want.index) || want.label)) return null
    const [width, height] = Array.isArray(want.size) ? want.size : [0, 0]
    const index = Number.isInteger(want.index) ? want.index : screens.length
    return { index, label: want.label || `Screen ${index + 1}`, width, height, left: 0, top: 0, primary: false, saved: true }
}

// The Screen select's entries: the listed screens, plus the saved one when it is not among them.
export const screenChoices = (screens = [], want = null) => {
    const picked = resolveScreen(screens, want)
    return picked?.saved && !screens.some((s) => s.index === picked.index) ? [...screens, picked] : screens
}

// The size "Match the screen" offers: the PICKED screen's, else the one this tool window is on.
export const matchTarget = (screens = [], want = null) => {
    const picked = resolveScreen(screens, want)
    const target = picked && picked.width > 0 && picked.height > 0 ? picked : screens[0]
    return target ? [target.width, target.height] : null
}

// window.open features for a chosen screen: the window starts on that screen at its size.
export const featuresForScreen = (screen) => (screen
    ? `popup=yes,left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}`
    : '')

export const screenToDoc = (screen) => (screen ? { label: screen.label, index: screen.index, size: [screen.width, screen.height] } : null)

// ---- the picture size ------------------------------------------------------------

// "Match the screen": the mapping's output AND every surface's resolution become the
// screen's size, in one op batch (a surface left at the 1280x720 default would be
// drawn at 1280x720 and stretched on a 1920x1080 screen).
export const matchScreenOps = (mapping, size) => {
    const [width, height] = size.map((n) => Math.max(1, Math.round(n)))
    const output = mapping?.output || {}
    return [
        { type: 'setMappingState', payload: { patch: { output: { ...output, width, height } } } },
        ...(mapping?.surfaces || []).map((surface) => ({
            type: 'setMappingSurface',
            payload: { surfaceId: surface.id, patch: { resolution: [width, height] } }
        }))
    ]
}

// The output block with the window settings changed (the rest of `output` kept).
export const withOutputWindow = (output = {}, patch = {}) => {
    const next = { ...(output.window || {}), ...patch }
    for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === null || next[key] === false) delete next[key]
    const { window: _old, ...rest } = output
    return Object.keys(next).length ? { ...rest, window: next } : rest
}

// ---- the controller ----------------------------------------------------------------

// One per project. State: { open, via, blocked } — `via` is 'handle' (we opened it and
// hold it) or 'ping' (found alive on the channel after a reload).
export function createOutputController({
    spaceId,
    projectId,
    open = (...args) => window.open(...args),
    createChannel = (name) => new BroadcastChannel(name),
    now = () => Date.now(),
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = (id) => clearInterval(id),
    setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
    clearTimeoutFn = (id) => clearTimeout(id)
}) {
    let state = { open: false, via: null, blocked: false }
    let handle = null
    let lastHello = 0
    let timer = null
    let started = false
    let closing = null
    const listeners = new Set()
    const channel = (() => { try { return createChannel(outputPresenceChannel(projectId)) } catch { return null } })()

    const set = (patch) => {
        const next = { ...state, ...patch }
        if (next.open === state.open && next.via === state.via && next.blocked === state.blocked) return
        state = next
        listeners.forEach((fn) => fn(state))
    }
    const post = (message) => { try { channel?.postMessage(message) } catch { /* closed */ } }
    const stopTimer = () => { if (timer !== null) { clearTimer(timer); timer = null } }
    const gone = () => { handle = null; stopTimer(); set({ open: false, via: null }) }

    const tick = () => {
        if (handle) {
            // The handle is the truth while we hold it: a hand-closed window reads closed.
            if (handle.closed) gone()
            return
        }
        post({ kind: 'ping' })
        if (state.open && now() - lastHello > SILENT_MS) gone()
    }
    const startTimer = () => { if (timer === null) timer = setTimer(tick, POLL_MS) }

    if (channel) {
        channel.onmessage = (event) => {
            const kind = event?.data?.kind
            if (kind === 'hello') {
                lastHello = now()
                if (!handle) { set({ open: true, via: 'ping', blocked: false }); startTimer() }
            } else if (kind === 'bye') {
                if (closing) { clearTimeoutFn(closing); closing = null }
                if (!handle || handle.closed) gone()
            }
        }
    }

    return {
        getState: () => state,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        // After a reload of the tool: is an output page of this project alive?
        recover() {
            if (started || handle) return
            started = true
            post({ kind: 'ping' })
            // No hello in PING_WAIT_MS = closed (the state already is).
            setTimeoutFn(() => { if (!state.open) stopTimer() }, PING_WAIT_MS)
        },
        open({ features = '' } = {}) {
            if (state.open) return state.via === 'handle' && handle ? handle : null
            const opened = open(buildMapOutputPath(spaceId, projectId), outputWindowName(projectId), features || undefined)
            if (!opened) { set({ blocked: true }); return null }
            try { opened.opener = null } catch { /* a cross-origin window: nothing to cut */ }
            handle = opened
            lastHello = now()
            set({ open: true, via: 'handle', blocked: false })
            startTimer()
            return opened
        },
        close() {
            if (handle) {
                try { handle.close() } catch { /* already gone */ }
                gone()
                return
            }
            if (!state.open) return
            // Recovered after a reload: ask the page itself. If it stays, say so (blocked).
            post({ kind: 'close' })
            closing = setTimeoutFn(() => { closing = null; set({ blocked: true }) }, PING_WAIT_MS)
        },
        destroy() {
            stopTimer()
            if (closing) clearTimeoutFn(closing)
            listeners.clear()
            try { channel?.close() } catch { /* closed */ }
        }
    }
}

// ---- React ------------------------------------------------------------------------

const CLOSED = { open: false, via: null, blocked: false }

export function useOutputWindow(spaceId, projectId) {
    const [controller, setController] = useState(null)
    const [state, setState] = useState(CLOSED)
    useEffect(() => {
        const next = createOutputController({ spaceId, projectId })
        setController(next)
        setState(next.getState())
        const off = next.subscribe(setState)
        next.recover()
        return () => { off(); next.destroy() }
    }, [spaceId, projectId])
    const open = useCallback((options) => controller?.open(options) || null, [controller])
    const close = useCallback(() => controller?.close(), [controller])
    return { ...state, isOpen: state.open, open, close }
}
