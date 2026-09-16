// UDP half of PROTOCOL-1.md §6: broadcast "I'm here" on the LAN, and answer
// other members' broadcasts by introducing ourselves properly over HTTP
// (sayHello, injected by core) the first time we hear a new id. This module
// never decides what "known" means — it asks members.js and does what §6
// says for each answer.
//
// NOTE for the lead (lane A): rig/protocol.js's sign/verify (§7 interfaces)
// isn't on this branch, so this file carries its own tiny HMAC helpers below.
// Same construction (HMAC-SHA256 hex, timing-safe compare) — worth deduping
// into rig/protocol.js once both branches land, so there is one signer for
// both the HTTP `x-di-rig-sig` header and this UDP `sig` field.
//
// NOTE on §6's "known id" / "unknown id" split: taken literally, "known id"
// = any id already in members.js's store, which would make the 10s sayHello
// debounce pointless — the very first discovery-only upsert files the id, so
// every later packet would already read as "known" and sayHello would only
// ever fire once, permanently, with no debounce window to speak of. Read
// instead as "known" = confirmed by an actual hello (`entry.via === 'hello'`)
// so a not-yet-mutual pairing keeps nudging sayHello every 10s until the real
// hello lands; once via is 'hello', discovery only ever refreshes lastSeen.


const MAX_PACKET_BYTES = 1024
const SAY_HELLO_DEBOUNCE_MS = 10000

// One signer for the whole rig: the HTTP x-di-rig-sig header and this packet's
// sig are the same HMAC, so they live once, in protocol.js.
const { sign, verify } = require('./protocol')


// Directed broadcast for one interface: network address with every host bit
// forced to 1. Computed per-octet from address + netmask alone, which is all
// os.networkInterfaces() ever promises for an IPv4 entry.
//   192.168.88.231 / 255.255.255.0 -> 192.168.88.255
//   10.0.0.5       / 255.255.0.0   -> 10.0.255.255
const broadcastAddress = (address, netmask) => {
    const a = String(address || '').split('.').map(Number)
    const m = String(netmask || '').split('.').map(Number)
    if (a.length !== 4 || m.length !== 4 || a.some(Number.isNaN) || m.some(Number.isNaN)) return null
    return a.map((octet, i) => octet | (~m[i] & 0xff)).join('.')
}

// §6: every up, non-internal IPv4 interface. os.networkInterfaces() doesn't
// expose a separate "link is up" flag — an interface only appears with an
// address when it's up — so presence in this list IS the up check.
const listBroadcastTargets = (interfaces) => {
    const targets = []
    const ifaces = interfaces() || {}
    for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
            if (!info || info.internal) continue
            if (info.family !== 'IPv4' && info.family !== 4) continue
            const target = broadcastAddress(info.address, info.netmask)
            if (target) targets.push(target)
        }
    }
    return targets
}

const createDiscovery = ({
    identity,
    release,
    room = null,
    port,
    base,
    scheme = 'http',
    tls = null,
    key,
    udpPort = 47600,
    members,
    sayHello,
    interfaces = () => require('node:os').networkInterfaces(),
    dgram = require('node:dgram'),
    logger,
    now = Date.now,
    intervalMs = 5000
} = {}) => {
    let socket = null
    let timer = null
    let bindErrorLogged = false
    const lastHelloSentAt = new Map() // id -> when we last POSTed hello to them off a broadcast

    const stats = {
        sent: 0,
        sendErrors: 0,
        received: 0,
        malformed: 0,
        otherRoom: 0,
        badSig: 0,
        bindError: 0,
        socketErrors: 0,
        sayHelloErrors: 0
    }

    const buildPacket = () => ({
        rig: 1,
        t: 'here',
        id: identity.id,
        name: identity.name,
        release,
        room,
        port,
        base,
        scheme,
        ...(tls ? { tls } : {}),
        sentAt: now()
    })

    const sendPacket = () => {
        const packet = buildPacket()
        if (key) {
            // Sign the packet exactly as it stands before `sig` is attached —
            // the receiver reconstructs this same string by stripping `sig`
            // back off, so key order must never change between build and send.
            packet.sig = sign(key, JSON.stringify(packet))
        }
        const json = JSON.stringify(packet)
        const buf = Buffer.from(json, 'utf8')
        if (buf.length > MAX_PACKET_BYTES) {
            logger?.warn?.('rig discovery: outbound packet over 1 KB, dropping send')
            return
        }
        for (const target of listBroadcastTargets(interfaces)) {
            socket.send(buf, 0, buf.length, udpPort, target, (err) => {
                if (err) {
                    stats.sendErrors++
                    logger?.warn?.('rig discovery: send failed', err)
                } else {
                    stats.sent++
                }
            })
        }
    }

    // §6: introduce ourselves to a new id once, not once per broadcast —
    // a member's discovery packet repeats every intervalMs, and hello can
    // be slow or in flight, so this is time-debounced independent of
    // members.js (which may already show the id as "known" after the first
    // minimal upsert below).
    const maybeSayHello = (id, address, helloPort, helloBase, reach) => {
        const t = now()
        const last = lastHelloSentAt.get(id)
        if (last !== undefined && t - last < SAY_HELLO_DEBOUNCE_MS) return
        lastHelloSentAt.set(id, t)
        Promise.resolve()
            .then(() => sayHello(address, helloPort, helloBase, reach))
            .catch((err) => {
                stats.sayHelloErrors++
                logger?.warn?.('rig discovery: sayHello failed', err)
            })
    }

    const handleMessage = (msg, rinfo) => {
        stats.received++
        if (Buffer.byteLength(msg) > MAX_PACKET_BYTES) {
            stats.malformed++
            return
        }

        let packet
        try {
            packet = JSON.parse(msg.toString('utf8'))
        } catch {
            stats.malformed++
            return
        }
        if (!packet || typeof packet !== 'object' || typeof packet.id !== 'string' || !packet.id) {
            stats.malformed++
            return
        }
        if (packet.id === identity.id) return // our own broadcast, looped back

        const packetRoom = packet.room !== undefined ? packet.room : null
        const packetScheme = packet.scheme === 'https' ? 'https' : 'http'
        const packetTls = typeof packet.tls === 'string' && packet.tls.length <= 253 ? packet.tls : null
        const ourRoom = room !== undefined ? room : null
        if (packetRoom !== ourRoom) {
            stats.otherRoom++
            return
        }

        if (key) {
            const { sig, ...rest } = packet
            if (!verify(key, JSON.stringify(rest), sig)) {
                stats.badSig++
                return
            }
        }

        const existing = members.get(packet.id)
        if (existing && existing.via === 'hello') {
            // A real hello has already made this pairing mutual — a discovery
            // packet from here on only proves they're still alive, it never
            // overwrites what that hello told us.
            members.upsert({ machine: { id: packet.id } }, { via: 'discovery' })
            return
        }

        // Either a brand new id, or one we've only ever heard secondhand from
        // discovery — keep introducing ourselves (debounced) until a real
        // hello lands and confirms the pairing both ways.
        members.upsert({
            machine: { id: packet.id, name: packet.name },
            release: packet.release,
            room: packetRoom,
            http: { port: packet.port, base: packet.base, scheme: packetScheme, tls: packetTls }
        }, { address: rinfo.address, via: 'discovery' })

        maybeSayHello(packet.id, rinfo.address, packet.port, packet.base, { scheme: packetScheme, tls: packetTls })
    }

    const tick = () => {
        sendPacket()
        members.expire()
    }

    const start = () => {
        if (socket) return // idempotent

        socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

        socket.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                stats.bindError++
                if (!bindErrorLogged) {
                    bindErrorLogged = true
                    logger?.error?.(`rig discovery: UDP port ${udpPort} already in use, discovery disabled`, err)
                }
                return
            }
            // Any other socket error is best-effort telemetry — discovery is
            // a nicety, never worth crashing the server over.
            stats.socketErrors++
            logger?.warn?.('rig discovery: socket error', err)
        })

        socket.on('message', (msg, rinfo) => {
            try {
                handleMessage(msg, rinfo)
            } catch (err) {
                // §4 rule 6: a malformed packet is counted, never thrown —
                // this catch is the backstop for anything the checks above miss.
                stats.malformed++
                logger?.warn?.('rig discovery: error handling packet', err)
            }
        })

        socket.on('listening', () => {
            try {
                socket.setBroadcast(true)
            } catch (err) {
                stats.socketErrors++
                logger?.warn?.('rig discovery: setBroadcast failed', err)
            }
            tick()
            timer = setInterval(tick, intervalMs)
        })

        socket.bind(udpPort)
    }

    const stop = () => {
        if (timer) {
            clearInterval(timer)
            timer = null
        }
        if (socket) {
            try {
                socket.close()
            } catch {
                // already closing/closed — stop() is idempotent by contract
            }
            socket = null
        }
        bindErrorLogged = false // a future start() after the real fix should log again
    }

    return { start, stop, stats: () => ({ ...stats }) }
}

module.exports = { createDiscovery, broadcastAddress, sign, verify }
