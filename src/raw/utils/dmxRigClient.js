// The graph's hand on a lighting rig. Two rigs answer to the same node:
//
//   'desk'  — di.iiii's OWN lighting desk, at /light on a local di.iiii. The
//             default for a new node: the graph is a project, and the desk is
//             where that project's rig, scenes and FX already live.
//   'vizzz' — a box on the LAN (an ESP32 that turns Art-Net/HTTP into DMX512),
//             reached over plain HTTP. The original behaviour; see below.
//
// The vizzz half:
//
// Two different fetches, because the firmware is honest about only half of
// CORS: its JSON routes (/status) answer with Access-Control-Allow-Origin so
// they can be READ cross-origin, but its command routes (/set, /master,
// /blackout) return bare 204s. Commands therefore go out as no-cors simple
// GETs — the device acts, the page cannot read the answer, and the status
// poll is what tells the truth about whether anyone is listening.

import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

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

// ---------------------------------------------------------------------------
// The desk lane — di.iiii's own lighting desk (serverXR/src/lighting), reached
// at /light/api on a LOCAL di.iiii.
//
// Same node, a different rig. None of the vizzz CORS story applies here: the
// desk is served by the page's own origin, so every command is a plain POST
// whose answer may be read — which is what lets a scene recall know it missed
// and go and look the name up.
// ---------------------------------------------------------------------------

export const RIG_KINDS = { DESK: 'desk', VIZZZ: 'vizzz' }

// Graphs authored before the desk existed carry no `rig` at all. They were
// written against a box on the LAN, so a node that already names a host keeps
// meaning vizzz; one that names nothing starts on the desk, which is where a
// new node now belongs. Nothing already authored changes behaviour.
export const resolveRigKind = (values) => {
    const declared = String(values?.rig ?? '').trim().toLowerCase()
    if (declared === RIG_KINDS.DESK || declared === RIG_KINDS.VIZZZ) return declared
    return String(values?.host ?? '').trim() ? RIG_KINDS.VIZZZ : RIG_KINDS.DESK
}

export const DESK_STATUS = {
    CHECKING: 'checking',
    ANSWERING: 'answering',
    ABSENT: 'absent',        // 404 — a hosted di.iiii has no desk to mount
    FORBIDDEN: 'forbidden',  // 403 — the local-runtime LAN rule
    UNREACHABLE: 'unreachable',
}

// The two refusals worth a sentence rather than a shrug. 404 is not a fault:
// it is the deployed server correctly declining to admit the route exists.
export const DESK_ABSENT_TEXT = 'The lighting desk lives on a local di.iiii — run di up or npm run dev'
export const DESK_FORBIDDEN_TEXT = 'The desk answers a browser on its own machine only — set DI_ALLOW_LAN_DEVICES=1 to open it to this network'

// App-level, not lane-level: the desk is mounted at /light beside the app, and
// there is no /serverXR prefix and no bare /api on this lane. Under a base
// path (a di.iiii served from a subdirectory) it moves with the app.
const { getBasePrefix } = createBasePathHelpers(
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
)

const currentOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

export const deskApiBase = (origin = currentOrigin(), basePrefix = getBasePrefix()) =>
    new URL(joinPath('/', basePrefix, '/light/api'), origin).toString().replace(/\/+$/, '')

// The interface itself — what "Open the desk" opens.
export const deskHomeUrl = (origin = currentOrigin(), basePrefix = getBasePrefix()) =>
    new URL(joinPath('/', basePrefix, '/light/'), origin).toString()

// One command builder per rig, so the panel's effects stay the same shape in
// both modes and only the payload differs.
export const DESK_COMMANDS = {
    master: (value) => ({ path: '/master', body: { master: toDmxByte(value) } }),
    level: (channel, value) => ({ path: '/raw', body: { universe: 0, channel, value: toDmxByte(value) } }),
    // The desk's blackout is a STATE, not the vizzz pulse: it stays on until
    // something turns it off, so the falling edge has to be sent too.
    blackout: (on) => ({ path: '/master', body: { blackout: Boolean(on) } }),
    recall: (id) => ({ path: '/scenes/recall', body: { id } }),
}

export const VIZZZ_COMMANDS = {
    master: (value) => `/master?v=${toDmxByte(value)}`,
    level: (channel, value) => `/set?ch=${channel}&v=${toDmxByte(value)}`,
    blackout: () => '/blackout',
}

export async function sendDeskCommand(base, command, { fetchImpl = fetch } = {}) {
    try {
        const res = await fetchImpl(`${base}${command?.path ?? ''}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(command?.body ?? {}),
        })
        if (!res?.ok) return { ok: false, httpStatus: res?.status ?? 0 }
        // A recall of an id the desk does not hold answers 200 {ok:false} —
        // the HTTP status on its own would call that a success.
        let payload = null
        try { payload = await res.json() } catch { payload = null }
        return { ok: payload?.ok !== false, httpStatus: res.status ?? 200, body: payload }
    } catch {
        return { ok: false, httpStatus: 0 }
    }
}

// A 200 is not proof of a desk. On a hosted tier the edge serves the app's own
// index.html for any address it does not know, so /light/api/summary answers 200
// with HTML — and the panel then said "the desk is not answering", which implies a
// desk exists somewhere and is sulking. An HTML answer means NO DESK HERE, the
// same as a 404, and the panel says the true thing: this is a local-only lane.
const answeredJson = (res) => /^application\/json\b/i.test(res?.headers?.get?.('content-type') || '')

export async function readDeskSummary(base, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await fetchImpl(`${base}/summary`, { signal })
        if (res?.status === 404) return { ok: false, status: DESK_STATUS.ABSENT }
        if (res?.status === 403) return { ok: false, status: DESK_STATUS.FORBIDDEN }
        if (!res?.ok) return { ok: false, status: DESK_STATUS.UNREACHABLE }
        if (!answeredJson(res)) return { ok: false, status: DESK_STATUS.ABSENT }
        return { ok: true, status: DESK_STATUS.ANSWERING, summary: await res.json() }
    } catch {
        return { ok: false, status: DESK_STATUS.UNREACHABLE }
    }
}

export async function readDeskScenes(base, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await fetchImpl(`${base}/scenes/summary`, { signal })
        if (!res?.ok || !answeredJson(res)) return { ok: false, scenes: [] }
        const payload = await res.json()
        return { ok: true, scenes: Array.isArray(payload?.scenes) ? payload.scenes : [] }
    } catch {
        return { ok: false, scenes: [] }
    }
}

// The Scene wire carries what a person would type: an id, or the name they
// gave the scene on the desk. An unknown word is sent as-is — the desk is the
// authority on its own library, and its answer is what triggers the re-look.
export const resolveSceneId = (scenes, wanted) => {
    const want = String(wanted ?? '').trim()
    if (!want) return ''
    const list = Array.isArray(scenes) ? scenes : []
    if (list.some((scene) => String(scene?.id ?? '') === want)) return want
    const lower = want.toLowerCase()
    const named = list.find((scene) => String(scene?.name ?? '').trim().toLowerCase() === lower)
    return named ? String(named.id) : want
}

// One sentence a person can act on: how big the rig is, what is on it, and
// whether anything is actually leaving the machine.
export const deskStatusText = (summary) => {
    const fixtures = Number(summary?.fixtures ?? 0)
    const scenes = Number(summary?.scenes ?? 0)
    const parts = [`Desk: ${fixtures} fixture${fixtures === 1 ? '' : 's'}, ${scenes} scene${scenes === 1 ? '' : 's'}`]
    if (summary?.blackout) parts.push('blackout')
    const scene = String(summary?.activeSceneName || summary?.activeScene || '').trim()
    if (scene) parts.push(summary?.fading ? `${scene} (fading)` : scene)
    if (summary?.fx?.enabled && summary.fx.mode) parts.push(String(summary.fx.mode))
    if (summary?.chase?.enabled) parts.push(`chase ${Number(summary.chase.index ?? 0) + 1}/${Number(summary.chase.count ?? 0)}`)
    const output = summary?.output
    parts.push(!output?.enabled ? 'output OFF' : output.connected ? 'output on' : 'output on, no driver')
    return parts.join(' · ')
}
