// The courier between the deck page and the controller window (K2Window.jsx).
//
// The deck page is the ONLY page that talks to MIDI. It publishes on one BroadcastChannel; the
// window never asks for MIDI access and only reads. Messages (all plain objects, `type` first):
//
//   window -> deck   { type: 'ask' }        "send me the snapshot" (on open, and again every ASK_MS)
//                    { type: 'bye' }        the window is going away
//   deck -> window   { type: 'snapshot', controller, consoleId, consoleName,
//                      labels: { control: short job }, lines: { control: full readout line },
//                      lights: { control: 'red' | 'amber' | 'green' | 'off' },
//                      values: { control: 0..127 }, held: { control: true }, at }
//                    { type: 'events', events: [{ control, value, held? }] }   one batch per frame at most
//
// Cost while nobody listens: none. The channel is made on the first ensure() (the Device press, or
// the first request the page hears), push() returns at once until a window has asked, and bye
// switches it off again. No deck render, no timer, no allocation per MIDI event in that state.
import { controlKey } from './k2Monitor.js'
import { XONE_K2_CONTROLS, XONE_K2_LEDS } from './xoneK2.js'

export const K2_WINDOW_CHANNEL = 'di-k2-controller-window-v1'
export const K2_WINDOW_NAME = 'di-k2-controller-window'
export const ASK_MS = 2000
export const WAIT_MS = 1000
// Browsers slow the timers of a hidden page (one tick a second, later one a minute), so the deck is called
// lost only after six asks' time, and a late tick never judges (see createK2Feed).
export const LOST_MS = ASK_MS * 6
export const SILENT_MS = ASK_MS * 4

const nameByKey = new Map(XONE_K2_CONTROLS.map((item) => [controlKey(item.kind, item.number), item.control]))
export const controlNameOf = (control) => nameByKey.get(controlKey(control?.kind, control?.number)) || ''

/** A monitor snapshot (keys like "cc:16") as { values: { control: n }, held: { control: true } } by control name. */
export const namedValues = (snap = {}) => {
    const values = {}
    const held = {}
    for (const item of XONE_K2_CONTROLS) {
        const key = controlKey(item.kind, item.number)
        if (Number.isFinite(snap.values?.[key])) values[item.control] = snap.values[key]
        if (snap.held?.[key]) held[item.control] = true
    }
    return { values, held }
}

/** The light colour of every control the app drives: { control: 'red' | 'amber' | 'green' | 'off' } from ledsFor(). */
export const lightsOf = (leds = []) => {
    const velocity = new Map(leds.map((led) => [led.note, led.velocity]))
    const out = {}
    for (const item of XONE_K2_CONTROLS) {
        const notes = XONE_K2_LEDS[item.number]
        if (item.kind !== 'note' || !notes || !velocity.has(notes.red)) continue
        out[item.control] = ['red', 'amber', 'green'].find((colour) => velocity.get(notes[colour]) > 0) || 'off'
    }
    return out
}

/** The window's picture of the controller from a snapshot plus the events after it. */
export const emptyState = () => ({ values: {}, held: {}, flash: {} })
export const stateFromSnapshot = (snapshot) => ({ values: { ...(snapshot?.values || {}) }, held: { ...(snapshot?.held || {}) }, flash: {} })
/** Events -> state (new object). A turn of an encoder is a flash; a pot / fader keeps its value; a note sets held. */
export const applyEvents = (state, events = []) => {
    const next = { values: { ...state.values }, held: { ...state.held }, flash: { ...state.flash } }
    for (const event of events) {
        if (!event?.control) continue
        next.values[event.control] = event.value
        next.flash[event.control] = true
        if (typeof event.held === 'boolean') {
            if (event.held) next.held[event.control] = true
            else delete next.held[event.control]
        }
    }
    return next
}

/**
 * The deck side. `source()` returns the snapshot parts (everything but `type`); it is called only
 * while a window listens. `frame(cb)` is requestAnimationFrame (a fake in tests).
 */
export function createK2Publisher({ source, makeChannel = () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(K2_WINDOW_CHANNEL) : null), frame = (cb) => requestAnimationFrame(cb), cancelFrame = (id) => cancelAnimationFrame(id), now = () => Date.now() } = {}) {
    let channel = null
    let listening = false
    let lastAsk = -Infinity
    let pending = []
    let frameId = null
    let snapshotDue = false

    const post = (message) => { try { channel?.postMessage(message) } catch { /* a closed channel: nothing to tell */ } }
    const sendSnapshot = () => {
        let parts
        try { parts = source() } catch { parts = null }
        if (parts) post({ type: 'snapshot', ...parts, at: now() })
    }
    const flush = () => {
        frameId = null
        if (!listening) { pending = []; snapshotDue = false; return }
        if (snapshotDue) { snapshotDue = false; sendSnapshot() }
        if (pending.length) { const events = pending; pending = []; post({ type: 'events', events }) }
    }
    const schedule = () => { if (frameId === null) frameId = frame(flush) }

    const ensure = () => {
        if (channel) return true
        channel = makeChannel()
        if (!channel) return false
        channel.onmessage = (event) => {
            const type = event?.data?.type
            if (type === 'ask') { listening = true; lastAsk = now(); sendSnapshot() }
            else if (type === 'bye') { listening = false; pending = [] }
        }
        return true
    }

    return {
        ensure,
        isListening: () => listening,
        hasChannel: () => channel !== null,
        /** One control event from the device: { control, value, held? }. Free while no window listens. */
        push(event) {
            if (!listening) return
            // a window that closed without saying bye stops asking: after SILENT_MS the deck stops publishing
            if (now() - lastAsk > SILENT_MS) { listening = false; pending = []; return }
            if (!event?.control) return
            pending.push(event)
            schedule()
        },
        /** Labels, lights or the console changed: send a fresh snapshot with the next frame. Free while no window listens. */
        changed() {
            if (!listening) return
            snapshotDue = true
            schedule()
        },
        dispose() {
            if (frameId !== null) { try { cancelFrame(frameId) } catch { /* nothing to cancel */ } frameId = null }
            listening = false
            pending = []
            if (channel) { try { channel.close() } catch { /* already closed */ } channel = null }
        }
    }
}

/** The deck's MIDI control -> the event the window takes: null for a control the sheet does not know. */
export const eventOf = (control) => {
    const name = controlNameOf(control)
    if (!name) return null
    return control.kind === 'note' ? { control: name, value: control.value, held: Boolean(control.press) } : { control: name, value: control.value }
}

/**
 * The window side: asks, listens, calls onSnapshot / onEvents, and says lost / found.
 * onStatus('waiting' | 'live'). Recovers by itself when either page reloads: it keeps asking.
 */
export function createK2Feed({ onSnapshot, onEvents, onStatus, makeChannel = () => new BroadcastChannel(K2_WINDOW_CHANNEL), now = () => Date.now(), setTimer = (fn, ms) => setInterval(fn, ms), clearTimer = (id) => clearInterval(id), doc = globalThis.document } = {}) {
    const channel = makeChannel()
    let lastHeard = -Infinity
    let status = ''
    const setStatus = (next) => { if (next !== status) { status = next; onStatus?.(next) } }
    channel.onmessage = (event) => {
        const data = event?.data
        if (data?.type === 'snapshot') { lastHeard = now(); setStatus('live'); onSnapshot?.(data) }
        else if (data?.type === 'events' && Array.isArray(data.events)) { lastHeard = now(); onEvents?.(data.events) }
    }
    const ask = () => { try { channel.postMessage({ type: 'ask' }) } catch { /* closed */ } }
    // silence is judged from the time of the last answer; a tick that came late (a hidden page's slowed timer)
    // asks again but does not judge, because the answer to that very ask has not had time to arrive
    const check = () => { if (now() - lastHeard > LOST_MS) setStatus('waiting') }
    let lastTick = now()
    const tick = () => {
        const late = now() - lastTick > ASK_MS * 2
        lastTick = now()
        ask()
        if (!late) check()
    }
    // a window brought back to the front asks at once and gives the deck a fresh span to answer
    const onVisible = () => { if (doc?.visibilityState === 'visible') { lastTick = now(); ask() } }
    try { doc?.addEventListener?.('visibilitychange', onVisible) } catch { /* no document */ }
    ask()
    const waitTimer = setTimer(() => { if (lastHeard === -Infinity) setStatus('waiting') }, WAIT_MS)
    const askTimer = setTimer(tick, ASK_MS)
    return {
        ask,
        close() {
            clearTimer(waitTimer)
            clearTimer(askTimer)
            try { doc?.removeEventListener?.('visibilitychange', onVisible) } catch { /* no document */ }
            try { channel.postMessage({ type: 'bye' }) } catch { /* closed */ }
            try { channel.close() } catch { /* closed */ }
        }
    }
}
