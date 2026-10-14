// FIND CUBES — which LaserCubes answer on this machine's own networks (2026-10-14).
//
// The person at a jam must not need a terminal or a hand-written laser.json: Laser Out's
// "Find cubes" asks this module, picks from what answered, and laserConfig.js writes the file.
//
// What goes on the wire: ONLY the read-only info question, GET_FULL_INFO (0x77, one byte) to the
// command port 45457 — the same question the engine asks every second while disarmed. It is a
// read: no output, no points (lasercubeProtocol.js, the protocol spec it cites).
//
// Where: a UNICAST sweep, one question to every host address .1–.254 of each local IPv4 /24 this
// machine holds (os.networkInterfaces). Broadcast got no answer from the Ultra Mk2 cubes on aylmo's
// cable network (owner's brief, 2026-10-14), so it is not used. A /24 is swept even when the
// interface's own mask is wider: 254 one-byte packets is the bound that keeps the sweep short and
// polite on a venue network. Pure Node dgram — no shell, no arp, no ping — so it runs the same on
// Windows, macOS and Linux.
//
// Limits, said plainly: a cube on another /24 than the machine (a /16 venue LAN, a routed VLAN) is
// not found — the panel says which networks were swept. On Windows, the firewall lets the answers
// in because this socket asked first (stateful UDP), but a policy that blocks node.exe outright
// shows up as EACCES/EPERM and is reported as such, never as "no cubes".
'use strict'

const os = require('os')
const dgram = require('dgram')
const proto = require('./lasercubeProtocol')

const SWEEP_WAIT_MS = 1500
const SEND_GAP_MS = 2 // 254 packets in about half a second: no burst a small switch drops
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

const isIPv4 = (s) => {
    const m = IPV4.exec(String(s || ''))
    return Boolean(m) && m.slice(1).every((o) => Number(o) <= 255)
}

/**
 * Every local IPv4 /24 this machine holds (loopback, link-local 169.254 and duplicates left out). Pure
 * given the interface table. @returns {{ name: string, address: string, prefix: string }[]}
 */
const localNetworks = (interfaces = os.networkInterfaces()) => {
    const seen = new Set()
    const out = []
    for (const [name, list] of Object.entries(interfaces || {})) {
        for (const a of list || []) {
            const family = a?.family === 4 ? 'IPv4' : a?.family
            if (family !== 'IPv4' || a.internal || !isIPv4(a.address)) continue
            if (a.address.startsWith('169.254.') || a.address.startsWith('127.')) continue
            const prefix = a.address.split('.').slice(0, 3).join('.')
            if (seen.has(prefix)) continue
            seen.add(prefix)
            out.push({ name, address: a.address, prefix })
        }
    }
    return out
}

/** The addresses a sweep asks: .1–.254 of each network, the machine's own address left out. Pure. */
const sweepTargets = (networks) => {
    const own = new Set(networks.map((n) => n.address))
    const out = []
    for (const n of networks) for (let i = 1; i <= 254; i += 1) {
        const ip = `${n.prefix}.${i}`
        if (!own.has(ip)) out.push(ip)
    }
    return out
}

const PERMISSION = new Set(['EACCES', 'EPERM'])
const explain = (error) => {
    if (PERMISSION.has(error?.code)) {
        return `this computer refused to send the question (${error.code}): a firewall or security program is blocking di's network access. On Windows: Windows Security → Firewall → Allow an app through the firewall → allow Node.js / di on Private networks, then Find cubes again.`
    }
    if (error?.code === 'ENETUNREACH' || error?.code === 'EHOSTUNREACH') {
        return `no network route (${error.code}): is the cable in and the network up?`
    }
    return `the question could not be sent: ${error?.message || error}`
}

/**
 * Ask every target the info question once and collect the answers for `waitMs`.
 * @param {{ targets: string[], port?: number, waitMs?: number, gapMs?: number,
 *   createSocket?: () => object, setTimeout?: Function }} opts
 * @returns {Promise<{ ok: boolean, asked: number, cubes: object[], error?: string }>}
 */
const sweep = ({
    targets,
    port = proto.PORT.CMD,
    waitMs = SWEEP_WAIT_MS,
    gapMs = SEND_GAP_MS,
    createSocket = () => dgram.createSocket({ type: 'udp4' }),
    setTimeout: later = setTimeout
} = {}) => new Promise((resolve) => {
    const list = (targets || []).filter(isIPv4)
    const found = new Map()
    let socket = null
    let done = false
    let firstError = null
    const finish = (extra = {}) => {
        if (done) return
        done = true
        try { socket?.close() } catch { /* already closed */ }
        const cubes = [...found.values()].sort((a, b) => a.ip.localeCompare(b.ip, 'en', { numeric: true }))
        if (firstError && cubes.length === 0) resolve({ ok: false, asked: list.length, cubes, error: explain(firstError), code: firstError.code || null, ...extra })
        else resolve({ ok: true, asked: list.length, cubes, ...extra })
    }
    try {
        socket = createSocket()
    } catch (error) {
        firstError = error
        finish()
        return
    }
    socket.on('error', (error) => { firstError = firstError || error; finish() })
    socket.on('message', (msg, rinfo) => {
        const info = proto.parseFullInfo(msg)
        if (!info) return
        // Where the answer came from is the address to drive; the cube's own idea of its IP is kept beside it.
        const key = info.serial || rinfo.address
        found.set(key, {
            serial: info.serial,
            ip: rinfo.address,
            reportedIp: info.ip,
            modelName: info.modelName,
            modelNumber: info.modelNumber,
            firmware: info.firmware,
            temperature: info.temperature,
            connectionType: info.connectionType,
            maxDacRate: info.maxDacRate
        })
    })
    socket.bind(0, () => {
        const question = proto.getFullInfo()
        let i = 0
        const next = () => {
            if (done) return
            if (i >= list.length) { later(() => finish(), waitMs); return }
            const ip = list[i]
            i += 1
            try {
                socket.send(question, port, ip, (error) => { if (error) firstError = firstError || error })
            } catch (error) {
                firstError = firstError || error
            }
            if (gapMs > 0) later(next, gapMs)
            else next()
        }
        next()
    })
})

/**
 * Find cubes on this machine's networks (or on `targets`, for tests and a named network).
 * @returns {Promise<{ ok, asked, cubes, networks, error? }>}
 */
const findCubes = async ({ interfaces, targets, ...rest } = {}) => {
    const networks = targets ? [] : localNetworks(interfaces)
    const list = targets || sweepTargets(networks)
    if (list.length === 0) {
        const selfAssigned = Object.values(interfaces || os.networkInterfaces()).flat().some((a) => !a?.internal && String(a?.address || '').startsWith('169.254.'))
        const error = selfAssigned
            ? 'this computer has only a self-assigned address (169.254…): nothing on the cable hands out addresses. Use a router, or on Windows turn on Internet Connection Sharing for the Ethernet adapter, then Find cubes again.'
            : 'this computer has no IPv4 network to search: plug the cable into the switch with the cubes, wait for an address, then Find cubes again.'
        return { ok: false, asked: 0, cubes: [], networks, error }
    }
    const out = await sweep({ targets: list, ...rest })
    return { ...out, networks: networks.map((n) => `${n.prefix}.0/24 (${n.name})`) }
}

module.exports = { findCubes, sweep, localNetworks, sweepTargets, isIPv4, explain, SWEEP_WAIT_MS }
