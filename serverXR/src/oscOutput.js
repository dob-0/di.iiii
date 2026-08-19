// Outbound OSC-over-UDP egress — makes the client's device.osc.out nodes real.
// The browser can't send UDP, so the Seed editor's device-egress hook emits
// 'control-value' over the already-open Socket.IO connection and this module
// forwards each message as a single OSC packet to the target (TouchDesigner,
// Resolume, anything with an OSC input) on the LAN.
//
// Optional module in the meshHub mold: one initialize call from index.js,
// gated by OSC_OUTPUT_ENABLED (default off) so production Docker stays inert.
// Targets are restricted to loopback/private-range IPv4 unless
// OSC_ALLOW_ANY_HOST=true — a browser-fed UDP sender must not double as an
// open relay to arbitrary internet hosts.

const dgram = require('dgram')
const logger = require('./logger')

const MAX_ARGS = 16
const MAX_STRING_ARG_LENGTH = 256

// OSC 1.0 strings are null-terminated and padded to a 4-byte boundary.
const oscString = (value) => {
    const raw = Buffer.from(String(value), 'ascii')
    const padded = Buffer.alloc(raw.length + 4 - (raw.length % 4))
    raw.copy(padded)
    return padded
}

// Every number goes out as float32 — a fader mid-drag is a float and its
// endpoints are integers; a stable typetag is kinder to OSC In mappings
// than one that flips between ,i and ,f.
const encodeOscMessage = (address, args = []) => {
    const safeArgs = args.slice(0, MAX_ARGS)
    const typeTags = `,${safeArgs.map((arg) => (typeof arg === 'string' ? 's' : 'f')).join('')}`
    const parts = [oscString(address), oscString(typeTags)]
    for (const arg of safeArgs) {
        if (typeof arg === 'string') {
            parts.push(oscString(arg.slice(0, MAX_STRING_ARG_LENGTH)))
        } else {
            const buf = Buffer.alloc(4)
            const num = Number(arg)
            buf.writeFloatBE(Number.isFinite(num) ? num : 0)
            parts.push(buf)
        }
    }
    return Buffer.concat(parts)
}

const isPrivateHost = (host) => {
    const trimmed = String(host || '').trim().toLowerCase()
    if (trimmed === 'localhost') return true
    const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!match) return false
    const octets = match.slice(1).map(Number)
    if (octets.some((n) => n > 255)) return false
    const [a, b] = octets
    if (a === 127 || a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
}

const normalizeAddress = (address) => {
    const trimmed = String(address || '').trim()
    if (!trimmed.startsWith('/')) return null
    return trimmed
}

function initializeOscOutput(config) {
    const socket = dgram.createSocket('udp4')
    socket.on('error', (error) => logger.warn('[OSC] UDP socket error:', error))
    const allowAnyHost = Boolean(config?.osc?.allowAnyHost)

    const send = (host, port, address, args) => {
        const targetPort = Number(port)
        if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) return false
        if (!allowAnyHost && !isPrivateHost(host)) return false
        const oscAddress = normalizeAddress(address)
        if (!oscAddress) return false
        const packet = encodeOscMessage(oscAddress, Array.isArray(args) ? args : [])
        socket.send(packet, targetPort, String(host).trim(), (error) => {
            if (error) logger.warn(`[OSC] Send to ${host}:${targetPort} failed:`, error.message)
        })
        return true
    }

    const handleControlValue = (data = {}) =>
        send(data.targetHost, data.targetPort, data.address, data.args)

    logger.info('[OSC] Outbound OSC/UDP egress enabled')
    return {
        send,
        handleControlValue,
        close: () => socket.close()
    }
}

module.exports = { initializeOscOutput, encodeOscMessage, isPrivateHost }
