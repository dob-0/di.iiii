/**
 * The name beacon: "ponyo-k7q2 is at this address, port 443", said on the wifi.
 *
 * One small UDP broadcast, unsigned. It is a HINT, never trust: the follower
 * still reaches the address under the label's own name and checks the
 * certificate for that name, which a liar cannot present (design doc
 * docs/ai/team-sync-by-network-name.md §8). So a forged or stale beacon costs a
 * failed handshake, nothing more.
 *
 * Announce and listen live together so the share door (`di share`) and the
 * follower speak one shape: `{ v: 1, kind: 'di-name', label, port }`. The sender's
 * address is the packet's source address, never a field in it.
 */

const dgram = require('node:dgram')

const BEACON_PORT = 41767
const KIND = 'di-name'
// A label is `<handle>-<4 chars>`: lowercase letters, digits, one dash inside.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

const isLabel = (value) => typeof value === 'string' && LABEL.test(value) && !value.includes('.')

/** The packet for a label and a port, or null when either is not one. */
const encode = ({ label, port }) => {
    if (!isLabel(label) || !Number.isInteger(port) || port < 1 || port > 65535) return null
    return Buffer.from(JSON.stringify({ v: 1, kind: KIND, label, port }))
}

/** What a packet says, or null — anything else on the port is ignored, never thrown at. */
const decode = (buffer) => {
    try {
        const body = JSON.parse(String(buffer))
        if (body?.kind !== KIND || body.v !== 1 || !isLabel(body.label)) return null
        if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535) return null
        return { label: body.label, port: body.port }
    } catch { return null }
}

/**
 * Say it once, to the whole wifi. Resolves true when the datagram left.
 * `socketFactory` and `target` exist for tests; a real call needs neither.
 */
const announce = ({ label, port, beaconPort = BEACON_PORT, target = '255.255.255.255', socketFactory = dgram.createSocket } = {}) => new Promise((resolve) => {
    const packet = encode({ label, port })
    if (!packet) { resolve(false); return }
    const socket = socketFactory({ type: 'udp4', reuseAddr: true })
    const done = (sent) => { try { socket.close() } catch { /* already closed */ } resolve(sent) }
    socket.once('error', () => done(false))
    socket.bind(0, () => {
        try { socket.setBroadcast(true) } catch { /* a loopback test target needs none */ }
        socket.send(packet, beaconPort, target, (error) => done(!error))
    })
})

/**
 * Wait up to `timeoutMs` for a beacon from `label`. Resolves
 * `{ address, port }` at the first one, or null at the end of the wait (also
 * when the port cannot be opened: no beacon is "not heard", never a crash).
 */
const listen = ({ label, timeoutMs = 2000, beaconPort = BEACON_PORT, socketFactory = dgram.createSocket } = {}) => new Promise((resolve) => {
    if (!isLabel(label)) { resolve(null); return }
    let finished = false
    let timer = null
    const socket = socketFactory({ type: 'udp4', reuseAddr: true })
    const done = (heard) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        try { socket.close() } catch { /* already closed */ }
        resolve(heard)
    }
    socket.on('error', () => done(null))
    socket.on('message', (buffer, info) => {
        const body = decode(buffer)
        if (body && body.label === label && info?.address) done({ address: info.address, port: body.port })
    })
    timer = setTimeout(() => done(null), timeoutMs)
    try { socket.bind(beaconPort) } catch { done(null) }
})

module.exports = { BEACON_PORT, isLabel, encode, decode, announce, listen }
