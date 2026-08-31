// The graph's hand on a lighting rig — a vizzz node (an ESP32 that turns
// Art-Net/HTTP into DMX512) reached over plain HTTP on the local network.
//
// Two different fetches, because the firmware is honest about only half of
// CORS: its JSON routes (/status) answer with Access-Control-Allow-Origin so
// they can be READ cross-origin, but its command routes (/set, /master,
// /blackout) return bare 204s. Commands therefore go out as no-cors simple
// GETs — the device acts, the page cannot read the answer, and the status
// poll is what tells the truth about whether anyone is listening.

export const RIG_STATUS = {
    UNSET: 'unset',
    BLOCKED: 'blocked',
    CHECKING: 'checking',
    ANSWERING: 'answering',
    UNREACHABLE: 'unreachable',
}

// '192.168.1.40' → 'http://192.168.1.40'; scheme and trailing slash tolerated.
export const rigBaseUrl = (host) => {
    const trimmed = String(host ?? '').trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

// A https page may not fetch http — the browser drops the request before it
// leaves. That makes the hosted editor structurally unable to reach a rig on
// the LAN; the local one (`di up`, npm run dev) is the surface that can.
export const isRigBlocked = (base, pageProtocol) =>
    pageProtocol === 'https:' && /^http:\/\//i.test(base)

// Graph wires carry 0..1 (the LFO/Range convention); DMX carries bytes.
export const toDmxByte = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.round(Math.min(1, Math.max(0, n)) * 255)
}

export async function readRigStatus(base, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await fetchImpl(`${base}/status`, { signal })
        if (!res?.ok) return { ok: false }
        const body = await res.json()
        return {
            ok: true,
            name: String(body?.name ?? ''),
            universe: Number(body?.uni ?? 0),
        }
    } catch {
        return { ok: false }
    }
}

export const sendRigCommand = (base, path, { fetchImpl = fetch } = {}) => {
    // Fire and forget: an opaque response carries no verdict, and awaiting one
    // would only let a slow rig back-pressure the graph.
    try {
        fetchImpl(`${base}${path}`, { mode: 'no-cors' }).catch(() => {})
    } catch {
        /* an unreachable rig is the poll's story to tell */
    }
}

// One sender per command lane. An oscillator wired into a value port ticks
// with the frame rate; an ESP32's web server does not want 60 requests a
// second. Leading send goes out at once, followers coalesce — the LATEST
// wins, never a stale middle value.
export const createThrottledSender = (send, intervalMs = 100, timers = globalThis) => {
    let last = 0
    let pending = null
    let timer = null
    const flush = () => {
        timer = null
        if (pending === null) return
        const path = pending
        pending = null
        last = Date.now()
        send(path)
    }
    const push = (path) => {
        const wait = intervalMs - (Date.now() - last)
        if (wait <= 0 && timer === null) {
            last = Date.now()
            send(path)
            return
        }
        pending = path
        if (timer === null) timer = timers.setTimeout(flush, Math.max(wait, 0))
    }
    push.cancel = () => {
        if (timer !== null) timers.clearTimeout(timer)
        timer = null
        pending = null
    }
    return push
}
