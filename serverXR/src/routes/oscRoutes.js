const dgram = require('node:dgram')
const { encodeMessage } = require('../osc')
const { requireLocalRuntime, hasLocalRuntime, isLanAllowed } = require('../localRuntimeGuard')

// ONE SOCKET PER TARGET, refcounted, not one per request.
//
// Opening a UDP socket per message works and is what you write first, but a
// graph sending a fader at 60fps then opens 60 sockets a second, and every one
// of them takes an ephemeral port for as long as the OS holds it. The di.jet
// link (src/raw/utils/dijetLink.js) already solved this shape for WebSockets;
// this is the same idea with the same reasoning.
const sockets = new Map()

const socketKey = (host, port) => `${host}:${port}`

const acquireSocket = (host, port) => {
    const key = socketKey(host, port)
    const existing = sockets.get(key)
    if (existing) {
        existing.refs += 1
        existing.lastUsedAt = Date.now()
        return existing
    }
    const socket = dgram.createSocket('udp4')
    // A UDP socket has no peer, so 'error' here means a local failure (a
    // permissions problem, an unroutable address). Unhandled it takes the
    // process down — which on a show machine means di.iiii dies mid-cue.
    socket.on('error', () => {})
    const entry = { socket, refs: 1, key, lastUsedAt: Date.now() }
    sockets.set(key, entry)
    return entry
}

// Sockets are kept, not closed per send: the next message to the same desk is
// usually milliseconds away. They are swept when idle so a graph that has moved
// on does not hold ports forever.
const IDLE_MS = 60_000

const sweepIdleSockets = (now = Date.now()) => {
    for (const [key, entry] of sockets) {
        if (entry.refs > 0) continue
        if (now - entry.lastUsedAt < IDLE_MS) continue
        try { entry.socket.close() } catch { /* already closed */ }
        sockets.delete(key)
    }
}

const send = (host, port, buffer) => new Promise((resolve, reject) => {
    const entry = acquireSocket(host, port)
    entry.socket.send(buffer, port, host, (error) => {
        entry.refs -= 1
        entry.lastUsedAt = Date.now()
        if (error) reject(error)
        else resolve(buffer.length)
    })
})

// A hostname would need a DNS lookup on the send path and can resolve to
// anything; a show runs on numbers. Names are allowed but the failure is the
// caller's to see, so we do not pre-resolve.
const isUsablePort = (port) => Number.isInteger(port) && port > 0 && port < 65536

const closeAllSockets = () => {
    for (const [key, entry] of sockets) {
        try { entry.socket.close() } catch { /* already closed */ }
        sockets.delete(key)
    }
}

function registerOscRoutes(router) {
    // What this host can do. The browser answers for webcam/mic/midi on its own
    // side; this is the half only a machine can answer, and it is the query
    // that lets a node say "needs a local di.iiii" instead of going quietly
    // dark — the silent-failure class this codebase keeps paying for.
    router.get('/api/local/capabilities', (req, res) => {
        const local = hasLocalRuntime()
        res.json({
            local,
            // Named individually rather than as one boolean because they will
            // not arrive together: osc is here, ndi and process are not.
            capabilities: { osc: local, ndi: false, process: false },
            lanAllowed: isLanAllowed(),
            generatedAt: new Date().toISOString()
        })
    })

    router.post('/api/local/osc', requireLocalRuntime, async (req, res, next) => {
        try {
            const { host, port, address, args = [], numberAs } = req.body || {}
            const targetHost = String(host || '127.0.0.1')
            const targetPort = Number(port)
            if (!isUsablePort(targetPort)) {
                res.status(400).json({ error: `port must be 1-65535 — got ${JSON.stringify(port)}` })
                return
            }
            let buffer
            try {
                buffer = encodeMessage(address, args, { numberAs: numberAs === 'int' ? 'int' : 'float' })
            } catch (error) {
                // A bad address is the author's mistake and they need the
                // reason, not a 500 that reads as "di.iiii is broken".
                res.status(400).json({ error: error.message })
                return
            }
            const bytes = await send(targetHost, targetPort, buffer)
            sweepIdleSockets()
            res.json({ sent: bytes, host: targetHost, port: targetPort, address })
        } catch (error) {
            if (error?.code) {
                res.status(502).json({ error: `could not send to the target: ${error.code}` })
                return
            }
            next(error)
        }
    })
}

module.exports = { registerOscRoutes, __closeAllSockets: closeAllSockets, __sockets: sockets }
