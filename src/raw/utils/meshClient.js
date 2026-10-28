// The graph's line to the mesh: serverXR's plain-WebSocket hub at
// `${basePath}/mesh` (serverXR/src/meshHub.js), where every screen and phone
// in one group hears what the others publish. Until this file, every page that
// spoke to the hub pasted its own ~25-line client; this is the one Mesh In and
// Mesh Out share.
//
// What it owns, and nothing else:
//   - the address: group (the hub's `room`) and node id, as query parameters;
//   - the link state: connecting → up → down, and closed once let go;
//   - reconnect: 1 s, doubling to 10 s, back to 1 s once the link comes up;
//   - publish, which refuses (returns false) while the link is not up — a
//     value is never queued for later, because a stale value arriving late is
//     worse on a wall than a value that never came.
//
// Protocol (meshHub.js:13-22): the client sends
//   { type:'publish', channel, payload }; the hub fans out
//   { type:'mesh:event', channel, from, payload, meta, ts } to everyone else in
// the group (never back to the sender), plus peer:join / peer:leave with the
// member list. History replay is opt-in on the hub and this client never asks.

export const MESH_STATE = {
    CONNECTING: 'connecting',
    UP: 'up',
    DOWN: 'down',
    CLOSED: 'closed',
}

export const MESH_BACKOFF_FIRST_MS = 1000
export const MESH_BACKOFF_MAX_MS = 10000
// The hub's own caps (meshHub.js:51-53): ids and group names past 64 characters
// are cut there, so cut them here and the id we hold is the id the hub holds.
export const MESH_ID_MAX = 64
// A hub socket closed with this code refused our node id because a live socket
// already holds it (meshHub.js, "Node id in use") — usually our own previous
// socket, not yet reaped. Retrying with the same id would fail until TCP gives
// up on it, so a fresh id is minted instead.
export const MESH_CLOSE_ID_IN_USE = 4409

export const nextMeshBackoff = (previousMs) => {
    const previous = Number(previousMs)
    if (!Number.isFinite(previous) || previous <= 0) return MESH_BACKOFF_FIRST_MS
    return Math.min(MESH_BACKOFF_MAX_MS, previous * 2)
}

// `web-` and never `keeper-`: the hub reserves keeper-* for machines that prove
// the room secret (meshHub.js:36-41), so a browser must not wander into it.
export const createMeshNodeId = (random = Math.random) =>
    `web-${Math.floor(random() * 0xffffffff).toString(36).padStart(7, '0')}`

export const cleanMeshGroup = (group) => String(group ?? '').trim().slice(0, MESH_ID_MAX)

// The socket.io config (useSpaceSocket.js getSocketConfigForRuntime) already
// knows where serverXR is on this page — same origin in production, the Vite
// proxy in dev, a configured base elsewhere. The mesh sits beside socket.io on
// the same base path, so its address is that one with the last segment swapped.
export const meshSocketUrl = ({ serverUrl, path, group, nodeId }) => {
    if (!serverUrl) return ''
    let url
    try {
        url = new URL(serverUrl)
    } catch {
        return ''
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = String(path || '/serverXR/socket.io').replace(/\/socket\.io\/?$/, '')
    url.pathname = `${basePath.replace(/\/+$/, '')}/mesh`
    url.search = ''
    url.searchParams.set('room', cleanMeshGroup(group) || 'default')
    url.searchParams.set('node', String(nodeId || '').slice(0, MESH_ID_MAX))
    return url.toString()
}

export const parseMeshMessage = (raw) => {
    try {
        const message = JSON.parse(typeof raw === 'string' ? raw : String(raw))
        return message && typeof message === 'object' ? message : null
    } catch {
        return null
    }
}

// The checks the walls ran by hand before admitting a phone's value. Each is
// off until set; a check that is on and fails drops the event with a reason
// the node can show. A range is on when Min < Max, so the 0/0 a fresh node
// carries means "no range" rather than "only exactly zero".
export const checkMeshPayload = (payload, { min, max, allowed, maxLength } = {}) => {
    const low = Number(min)
    const high = Number(max)
    if (Number.isFinite(low) && Number.isFinite(high) && low < high) {
        const n = typeof payload === 'number' ? payload : Number.NaN
        if (!Number.isFinite(n)) return { ok: false, reason: 'not a number' }
        if (n < low || n > high) return { ok: false, reason: `outside ${low} to ${high}` }
    }
    const allowList = String(allowed ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
    if (allowList.length && !allowList.includes(String(payload))) {
        return { ok: false, reason: 'not an allowed value' }
    }
    const cap = Math.floor(Number(maxLength))
    if (cap > 0 && typeof payload === 'string' && payload.length > cap) {
        return { ok: false, reason: `longer than ${cap} characters` }
    }
    return { ok: true }
}

// One send per interval, the latest value winning: a value that arrives inside
// the interval is held and goes out when it closes, so a slider let go between
// ticks still lands where it stopped. Pure — the caller owns the clock.
export const createSendGate = (intervalMs) => {
    let lastSentAt = -Infinity
    return {
        // ms to wait before a send is allowed; 0 means send now
        waitFor(now) {
            return Math.max(0, lastSentAt + Number(intervalMs || 0) - now)
        },
        sent(now) {
            lastSentAt = now
        },
    }
}

export function createMeshClient({
    serverUrl,
    path,
    group,
    nodeId = createMeshNodeId(),
    WebSocketImpl = globalThis.WebSocket,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    onState,
    onEvent,
}) {
    let state = MESH_STATE.CONNECTING
    let socket = null
    let retryTimer = null
    let backoff = 0
    let members = []
    let currentNodeId = nodeId
    let lastClose = null

    const report = (next) => {
        state = next
        onState?.({ state, nodeId: currentNodeId, members, retryInMs: next === MESH_STATE.DOWN ? backoff : 0, lastClose })
    }

    const connect = () => {
        retryTimer = null
        if (state === MESH_STATE.CLOSED) return
        const url = meshSocketUrl({ serverUrl, path, group, nodeId: currentNodeId })
        if (!url || typeof WebSocketImpl !== 'function') {
            lastClose = { code: 0, reason: url ? 'this browser has no WebSocket' : 'no server address' }
            report(MESH_STATE.DOWN)
            return
        }
        report(MESH_STATE.CONNECTING)
        let ws
        try {
            ws = new WebSocketImpl(url)
        } catch (err) {
            lastClose = { code: 0, reason: err?.message || 'could not open' }
            scheduleRetry()
            return
        }
        socket = ws
        ws.onopen = () => {
            if (socket !== ws) return
            backoff = 0
            lastClose = null
            report(MESH_STATE.UP)
        }
        ws.onmessage = (event) => {
            if (socket !== ws) return
            const message = parseMeshMessage(event?.data)
            if (!message) return
            if ((message.type === 'peer:join' || message.type === 'peer:leave' || message.type === 'room:list')
                && Array.isArray(message.members)) {
                members = message.members
                report(state)
                return
            }
            if (message.type === 'mesh:event') onEvent?.(message)
        }
        ws.onclose = (event) => {
            if (socket !== ws) return
            socket = null
            lastClose = { code: Number(event?.code) || 0, reason: String(event?.reason || '') }
            if (lastClose.code === MESH_CLOSE_ID_IN_USE) currentNodeId = createMeshNodeId()
            scheduleRetry()
        }
        // 'error' is always followed by 'close'; the retry lives there.
        ws.onerror = () => {}
    }

    function scheduleRetry() {
        if (state === MESH_STATE.CLOSED) return
        backoff = nextMeshBackoff(backoff)
        members = []
        report(MESH_STATE.DOWN)
        retryTimer = setTimer(connect, backoff)
    }

    connect()

    return {
        get state() { return state },
        get nodeId() { return currentNodeId },
        get members() { return members },
        publish(channel, payload) {
            if (state !== MESH_STATE.UP || !socket) return false
            try {
                socket.send(JSON.stringify({ type: 'publish', channel: String(channel), payload }))
                return true
            } catch {
                return false
            }
        },
        close() {
            if (retryTimer !== null) clearTimer(retryTimer)
            retryTimer = null
            const ws = socket
            socket = null
            state = MESH_STATE.CLOSED
            try {
                ws?.close()
            } catch {
                /* already gone */
            }
        },
    }
}
