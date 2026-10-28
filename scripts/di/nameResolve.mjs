/**
 * The CLI's twin of serverXR/src/follow/nameResolver.js + beacon.js: where is the
 * install called `ponyo-k7q2`? beacon on this wifi, then DNS of `<label>.<zone>`,
 * then the last address that worked; every route probed under the name before it
 * is believed. Kept in step by scripts/di/nameResolveParity.test.js, because the
 * packed CLI (`cli/`) cannot import the server (`serverXR/`). Edit both together.
 */

import dgram from 'node:dgram'
import dns from 'node:dns'
import net from 'node:net'



export const BEACON_PORT = 41767
const KIND = 'di-name'
// A label is `<handle>-<4 chars>`: lowercase letters, digits, one dash inside.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

export const isLabel = (value) => typeof value === 'string' && LABEL.test(value) && !value.includes('.')

/** The packet for a label and a port, or null when either is not one. */
export const encode = ({ label, port }) => {
    if (!isLabel(label) || !Number.isInteger(port) || port < 1 || port > 65535) return null
    return Buffer.from(JSON.stringify({ v: 1, kind: KIND, label, port }))
}

/** What a packet says, or null — anything else on the port is ignored, never thrown at. */
export const decode = (buffer) => {
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
export const announce = ({ label, port, beaconPort = BEACON_PORT, target = '255.255.255.255', socketFactory = dgram.createSocket } = {}) => new Promise((resolve) => {
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
export const listenBeacon = ({ label, timeoutMs = 2000, beaconPort = BEACON_PORT, socketFactory = dgram.createSocket } = {}) => new Promise((resolve) => {
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




export const DEFAULT_ZONE = 'l.thedi.studio'
export const ROUTES = ['beacon', 'dns', 'last']

/** A bare label: no scheme, no dot, no slash, no port — the only form that means "a network name". */
export const isLabelInput = (value) => isLabel(String(value ?? '').trim())

export const nameOf = (label, zone = DEFAULT_ZONE) => `${label}.${zone}`

/** `https://<label>.<zone>` with the port only when it is not 443 — the name the certificate is checked for. */
export const baseOf = (label, zone, port = 443) => `https://${nameOf(label, zone)}${port && port !== 443 ? `:${port}` : ''}`

/** The zone: a config value. Env, then the install's own name file, then the default. */
export const zoneFrom = ({ env = process.env, own = null } = {}) => String(env.DI_NAME_ZONE || own?.zone || DEFAULT_ZONE).trim().toLowerCase()

const lookupDns = (name) => new Promise((resolve) => {
    dns.lookup(name, { family: 4 }, (error, address) => resolve(error ? null : address))
})

// A record that points at this very machine is the broker's "not shared" marker.
const isLoopback = (address) => /^127\./.test(String(address)) || address === '::1'

/**
 * @param {object} p
 * @param {string} p.label
 * @param {string} [p.zone]
 * @param {number} [p.port]            443 unless the follow stored another
 * @param {{address: string, port?: number}|null} [p.last]   stored with the follow
 * @param {(o: {label: string}) => Promise<{address: string, port: number}|null>} [p.listen]
 * @param {(name: string) => Promise<string|null>} [p.lookup]
 * @param {(c: {address: string, port: number, name: string, route: string}) => Promise<boolean>} [p.probe]
 * @param {string[]} [p.skip]          routes not to try (offline tests, `--no-beacon`)
 * @returns {Promise<{ok: true, address: string, port: number, route: string, name: string, base: string} | {ok: false, tried: string[]}>}
 */
export const resolveName = async ({ label, zone = DEFAULT_ZONE, port = 443, last = null, listen = listenBeacon, lookup = lookupDns, probe = null, skip = [], beaconMs = 2000 }) => {
    const name = nameOf(label, zone)
    const tried = []
    const attempt = async (route, address, usePort) => {
        if (!address || !net.isIP(address)) return null
        tried.push(route)
        const candidate = { address, port: usePort, name, route }
        if (probe && !(await probe(candidate))) return null
        return { ok: true, address, port: usePort, route, name, base: baseOf(label, zone, usePort) }
    }
    const steps = {
        beacon: async () => {
            const heard = await listen({ label, timeoutMs: beaconMs })
            return heard ? attempt('beacon', heard.address, heard.port) : null
        },
        dns: async () => {
            const address = await lookup(name)
            return address && !isLoopback(address) ? attempt('dns', address, last?.port || port) : null
        },
        last: async () => (last?.address ? attempt('last', last.address, last.port || port) : null)
    }
    for (const route of ROUTES) {
        if (skip.includes(route)) continue
        const found = await steps[route]()
        if (found) return found
    }
    return { ok: false, tried }
}

