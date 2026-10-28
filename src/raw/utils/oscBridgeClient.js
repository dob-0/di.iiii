// The graph's hand on the other machines of a show: OSC through this machine's
// di.iiii (serverXR/src/osc, mounted at /osc), and DMX In through the lighting
// desk's input (/light/api/input/levels). A page cannot open a UDP socket, so
// every byte goes through the local server; a hosted di.iiii has none (404),
// and the panels say so in words instead of sitting blank.

import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'
import { DESK_STATUS } from './dmxRigClient.js'

export const BRIDGE_STATUS = {
    CHECKING: 'checking',
    ANSWERING: 'answering',
    ABSENT: 'absent',          // 404 — a hosted di.iiii has no local bridge
    FORBIDDEN: 'forbidden',    // 403 — the local-runtime LAN rule, or another site
    UNREACHABLE: 'unreachable',
    REFUSED: 'refused',        // 400 — the bridge said why (bad host, bad address)
}

export const NO_BRIDGE_TEXT = 'No local bridge: OSC needs di.iiii running on this machine (di up) — a web page cannot send or hear UDP by itself'
export const BRIDGE_FORBIDDEN_TEXT = 'This di.iiii answers OSC for a browser on its own machine only — di up --lan opens it to this network'
export const BRIDGE_UNREACHABLE_TEXT = 'No answer from this machine’s di.iiii — is it still running?'

const { getBasePrefix } = createBasePathHelpers(
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
)
const currentOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

// App-level like the desk and the lasers: /osc beside the app, moving with a base path.
export const oscApiBase = (origin = currentOrigin(), basePrefix = getBasePrefix()) =>
    new URL(joinPath('/', basePrefix, '/osc/api'), origin).toString().replace(/\/+$/, '')

// A dev server without the /osc proxy, or any SPA fallback, answers index.html
// with a 200: that is no bridge, not an empty one.
const answeredJson = (res) => /^application\/json\b/i.test(res?.headers?.get?.('content-type') || '')

const statusOf = (res) => {
    if (res?.status === 404) return BRIDGE_STATUS.ABSENT
    if (res?.status === 403) return BRIDGE_STATUS.FORBIDDEN
    if (res?.status === 400) return BRIDGE_STATUS.REFUSED
    if (!res?.ok) return BRIDGE_STATUS.UNREACHABLE
    if (!answeredJson(res)) return BRIDGE_STATUS.ABSENT
    return BRIDGE_STATUS.ANSWERING
}

export const bridgeStatusText = (status) => ({
    [BRIDGE_STATUS.ABSENT]: NO_BRIDGE_TEXT,
    [BRIDGE_STATUS.FORBIDDEN]: BRIDGE_FORBIDDEN_TEXT,
    [BRIDGE_STATUS.UNREACHABLE]: BRIDGE_UNREACHABLE_TEXT,
}[status] || '')

const postJson = (fetchImpl, url, body, signal) => fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
})

// Listen on `port` (the bridge opens it on the first ask) and read every
// message after number `since` matching `pattern`.
export async function readOscIn(base, { port, pattern = '', since = 0 }, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await postJson(fetchImpl, `${base}/in`, { port, pattern, since }, signal)
        const status = statusOf(res)
        if (status !== BRIDGE_STATUS.ANSWERING && status !== BRIDGE_STATUS.REFUSED) return { status, messages: [] }
        const body = await res.json()
        if (status === BRIDGE_STATUS.REFUSED || body?.ok === false) {
            return { status: BRIDGE_STATUS.REFUSED, error: String(body?.error || 'refused'), messages: [] }
        }
        return {
            status,
            messages: Array.isArray(body?.messages) ? body.messages : [],
            seq: Number(body?.seq) || 0,
            missed: Number(body?.missed) || 0,
            bind: body?.bind || '',
            refused: Number(body?.refused) || 0,
        }
    } catch (error) {
        if (error?.name === 'AbortError') return { status: BRIDGE_STATUS.CHECKING, messages: [] }
        return { status: BRIDGE_STATUS.UNREACHABLE, messages: [] }
    }
}

export async function readBridgeState(base, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await fetchImpl(`${base}/state`, { signal })
        return { status: statusOf(res) }
    } catch {
        return { status: BRIDGE_STATUS.UNREACHABLE }
    }
}

export async function sendOsc(base, { host, port, address, args, numbers }, { fetchImpl = fetch } = {}) {
    try {
        const res = await postJson(fetchImpl, `${base}/out`, { host, port, address, args, numbers })
        const status = statusOf(res)
        if (status !== BRIDGE_STATUS.ANSWERING && status !== BRIDGE_STATUS.REFUSED) return { ok: false, status }
        const body = await res.json()
        if (!body?.ok) return { ok: false, status: BRIDGE_STATUS.REFUSED, error: String(body?.error || 'refused') }
        return { ok: true, status, to: String(body.to || '') }
    } catch {
        return { ok: false, status: BRIDGE_STATUS.UNREACHABLE }
    }
}

// A graph value as OSC arguments: a list is one argument per item, nothing is
// no argument at all (a bare "/go" is a whole QLab command), an object that is
// not a list goes as its JSON text. Numbers stay numbers; the bridge sends them
// as float32 unless the node asks for int32.
export const oscArgsOf = (value) => {
    if (value === undefined || value === null) return []
    const one = (v) => {
        if (v === null || v === undefined) return null
        if (typeof v === 'number') return Number.isFinite(v) ? v : null
        if (typeof v === 'boolean' || typeof v === 'string') return v
        try { return JSON.stringify(v) } catch { return String(v) }
    }
    return (Array.isArray(value) ? value : [value]).map(one)
}

// The first argument of a received message, as a graph value: numbers and
// words as they are, T/F as true/false, nil and nothing as null.
export const firstValue = (message) => {
    const arg = message?.args?.[0]
    if (!arg) return null
    return arg.value ?? null
}

export const describeArgs = (message) => (message?.args || [])
    .map((a) => (typeof a.value === 'number' ? String(Math.round(a.value * 1000) / 1000) : JSON.stringify(a.value)))
    .join(' ')

// ---------------------------------------------------------------------------
// DMX In: one channel of one universe of the desk's input.
// ---------------------------------------------------------------------------

// The node counts universes from 1, as the desk's interface and every console
// do; the desk's API counts from 0 (0 = U1 = Art-Net 0:0:0 = sACN universe 1).
export const deskUniverseOf = (universe) => Math.max(0, Math.round(Number(universe) || 1) - 1)
export const dmxChannelOf = (channel) => Math.min(512, Math.max(1, Math.round(Number(channel) || 1)))

// A byte as the 0..1 the graph's wires carry (DMX Out's toDmxByte, inverted).
export const levelOf = (levels, channel) => {
    const byte = Number(levels?.[dmxChannelOf(channel) - 1])
    return Number.isFinite(byte) ? Math.min(1, Math.max(0, byte / 255)) : null
}

export async function readDeskInputLevels(deskBase, deskUniverse, { fetchImpl = fetch, signal } = {}) {
    try {
        const res = await fetchImpl(`${deskBase}/input/levels?universe=${deskUniverse}`, { signal })
        if (res?.status === 404) return { status: DESK_STATUS.ABSENT }
        if (res?.status === 403) return { status: DESK_STATUS.FORBIDDEN }
        if (!res?.ok) return { status: DESK_STATUS.UNREACHABLE }
        if (!answeredJson(res)) return { status: DESK_STATUS.ABSENT }
        const body = await res.json()
        if (typeof body?.state !== 'string') return { status: DESK_STATUS.UNREACHABLE }
        return {
            status: DESK_STATUS.ANSWERING,
            state: body.state,
            levels: Array.isArray(body.levels) ? body.levels : null,
            ageMs: Number.isFinite(body.ageMs) ? body.ageMs : null,
        }
    } catch (error) {
        if (error?.name === 'AbortError') return { status: DESK_STATUS.CHECKING }
        return { status: DESK_STATUS.UNREACHABLE }
    }
}

const percent = (v) => `${Math.round(v * 100)}%`

// What the desk's input state means for this node, in words. `held` is the
// node's own last value (null when it has never read one).
export const dmxInStateText = ({ state, universe, channel, value, held }) => {
    const where = `universe ${universe}, channel ${channel}`
    if (state === 'off') return 'The desk’s input is off — switch it on under Setup → Input on the desk'
    if (state === 'not-listened') return `The desk does not listen to universe ${universe} — add it under Setup → Input`
    if (state === 'waiting') return `Listening to ${where} — nothing has arrived yet`
    if (state === 'live') return `${where}: ${Math.round((value ?? 0) * 255)} (${percent(value ?? 0)})`
    if (state === 'held') return `Signal lost — the desk holds its last frame: ${percent(value ?? 0)}`
    if (state === 'lost') {
        return held === null || held === undefined
            ? `Signal lost on universe ${universe} — nothing to hold`
            : `Signal lost on universe ${universe} — holding the last value, ${percent(held)}`
    }
    return ''
}
