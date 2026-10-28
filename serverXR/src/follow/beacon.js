/**
 * The share beacon: an install on a wifi says "<label> is at port N", and
 * another install looking for that label hears it. UDP broadcast, unsigned.
 *
 * It is only a HINT. It gives an address and a port; whether that machine is
 * the one named is decided by its certificate for `<label>.<zone>`, which a
 * liar on the wifi cannot present (docs/ai/team-sync-by-network-name.md §8, §12).
 * No internet, no DNS: a certificate check needs neither.
 *
 * Shape on the wire (JSON, one datagram): { v: 1, kind: 'share', label, port }.
 * Both halves live here so the install that announces and the one that listens
 * cannot drift apart.
 */
const dgram = require('node:dgram')

const BEACON_PORT = 47821
const ANNOUNCE_EVERY_MS = 2000
const LISTEN_MS = 2000
const LABEL_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const encode = ({ label, port }) => Buffer.from(JSON.stringify({ v: 1, kind: 'share', label, port }))

/** @returns {{label: string, port: number} | null} null for anything that is not a share announcement. */
const parse = (buffer) => {
    let body
    try { body = JSON.parse(Buffer.from(buffer).toString('utf8')) } catch { return null }
    if (!body || body.v !== 1 || body.kind !== 'share') return null
    if (typeof body.label !== 'string' || body.label.length > 63 || !LABEL_PATTERN.test(body.label)) return null
    const port = Number(body.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return { label: body.label, port }
}

const newSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true })

/**
 * Listen for `label` for up to `timeoutMs`. Resolves with where it said it is
 * (the address the datagram came from, the port it announced), or null.
 * Never rejects: no socket, no bind, no answer all read as "not heard".
 */
const listen = ({ label, timeoutMs = LISTEN_MS, port = BEACON_PORT, createSocket = newSocket } = {}) => new Promise((resolve) => {
    let socket = null
    let timer = null
    let done = false
    const finish = (value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        try { socket?.close() } catch { /* already closed */ }
        resolve(value)
    }
    try { socket = createSocket() } catch { return resolve(null) }
    socket.on('error', () => finish(null))
    socket.on('message', (message, from) => {
        const heard = parse(message)
        if (heard && heard.label === label) finish({ address: from.address, port: heard.port })
    })
    timer = setTimeout(() => finish(null), timeoutMs)
    try { socket.bind(port) } catch { finish(null) }
})

/**
 * Announce `label` at `port` every few seconds until stopped. A failed send is
 * dropped: the next one is two seconds away, and nothing here may take the
 * server with it.
 * @returns {{ stop: () => void }}
 */
const announce = ({ label, port, to = '255.255.255.255', beaconPort = BEACON_PORT, everyMs = ANNOUNCE_EVERY_MS, createSocket = newSocket } = {}) => {
    let socket = null
    try {
        socket = createSocket()
        socket.on('error', () => {})
        socket.bind(0, () => { try { socket.setBroadcast(true) } catch { /* sends will fail quietly */ } })
    } catch { return { stop() {} } }
    const send = () => { try { socket.send(encode({ label, port }), beaconPort, to) } catch { /* next one */ } }
    const timer = setInterval(send, everyMs)
    timer.unref?.()
    send()
    return { stop() { clearInterval(timer); try { socket.close() } catch { /* closed */ } } }
}

module.exports = { BEACON_PORT, LABEL_PATTERN, encode, parse, listen, announce }
