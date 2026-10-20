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
// machine holds in private space, RFC 1918 (os.networkInterfaces; localNetworks says what is skipped). Broadcast got no answer from the Ultra Mk2 cubes on aylmo's
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

const octets = (ip) => String(ip).split('.').map(Number)

/** RFC 1918 private space: 10/8, 172.16/12, 192.168/16. */
const isPrivateIPv4 = (ip) => {
    if (!isIPv4(ip)) return false
    const [a, b] = octets(ip)
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** What kind of network an interface address is on, for the sweep's "skipped" list. Pure. */
const networkKind = (ip) => {
    const [a, b] = octets(ip)
    if (isPrivateIPv4(ip)) return 'private'
    if (a === 100 && b >= 64 && b <= 127) return 'Tailscale/CGNAT (100.64/10)'
    if (a === 169 && b === 254) return 'link-local (169.254/16)'
    if (a === 127) return 'loopback'
    return 'public'
}

// The test flag: DI_LASER_TEST_LOOPBACK=1 lets tests stand fake cubes on 127.0.0.x. Never set on a
// machine that drives real cubes; read at call time so a test can set it and unset it.
const loopbackCubesAllowed = () => process.env.DI_LASER_TEST_LOOPBACK === '1'

/**
 * Why `ip` cannot be a real cube's address, or null when it can. A cube is one unicast host:
 * broadcast (255.255.255.255, x.x.x.255), network (0.0.0.0/8, x.x.x.0), multicast (224/4, and the
 * reserved 240/4) and loopback (127/8) are refused. x.x.x.0 and .255 are refused on every mask: the
 * sweep only ever finds .1–.254, so a cube outside that range was typed, not found. 127.0.0.x is
 * allowed only under the test flag. Pure apart from the flag.
 */
const cubeAddressProblem = (ip) => {
    if (!isIPv4(ip)) return `"${String(ip ?? '').slice(0, 40)}" is not an IPv4 address`
    const [a, , , d] = octets(ip)
    if (a === 127) {
        if (loopbackCubesAllowed() && ip.startsWith('127.0.0.') && d >= 1 && d <= 254) return null
        return `${ip} is this computer itself (loopback), not a cube`
    }
    if (a >= 224 && a <= 239) return `${ip} is a multicast address, not one cube`
    if (a >= 240) return `${ip} is a broadcast or reserved address, not one cube`
    if (a === 0) return `${ip} is a network address, not one cube`
    if (d === 255) return `${ip} is a broadcast address, not one cube`
    if (d === 0) return `${ip} is a network address, not one cube`
    return null
}

/**
 * Why `ip` cannot be typed into a Laser Out, or null when it can: one unicast host
 * (cubeAddressProblem) AND in private space (RFC 1918) — a cube is never on the public internet,
 * and a typo must not send the info question to a stranger. 127.0.0.x only under the test flag.
 */
const outAddressProblem = (ip) => {
    const problem = cubeAddressProblem(ip)
    if (problem) return problem
    if (String(ip).startsWith('127.')) return null
    if (!isPrivateIPv4(ip)) return `${ip} is not a private address (10…, 172.16–31…, 192.168…): a cube is on the local network`
    return null
}

/**
 * Every local IPv4 /24 this machine holds in PRIVATE space (RFC 1918: 10/8, 172.16/12, 192.168/16).
 * Everything else is left out and listed in `skipped` (review round 2, 2026-10-14): the Tailscale/
 * CGNAT range 100.64/10 (on aylmo that was 254 packets to tailnet peers), link-local 169.254/16,
 * loopback and public addresses (a VPS or a venue uplink: 254 packets to strangers). Pure given the
 * interface table. @returns {{ name: string, address: string, prefix: string }[]} with a `skipped`
 * property: { name, address, kind }[]
 */
const localNetworks = (interfaces = os.networkInterfaces()) => {
    const seen = new Set()
    const out = []
    const skipped = []
    for (const [name, list] of Object.entries(interfaces || {})) {
        for (const a of list || []) {
            const family = a?.family === 4 ? 'IPv4' : a?.family
            if (family !== 'IPv4' || a.internal || !isIPv4(a.address)) continue
            if (!isPrivateIPv4(a.address)) { skipped.push({ name, address: a.address, kind: networkKind(a.address) }); continue }
            const prefix = a.address.split('.').slice(0, 3).join('.')
            if (seen.has(prefix)) continue
            seen.add(prefix)
            out.push({ name, address: a.address, prefix })
        }
    }
    Object.defineProperty(out, 'skipped', { value: skipped, enumerable: false })
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
        const entry = {
            serial: info.serial,
            ip: rinfo.address,
            reportedIp: info.ip,
            modelName: info.modelName,
            modelNumber: info.modelNumber,
            firmware: info.firmware,
            temperature: info.temperature,
            connectionType: info.connectionType,
            maxDacRate: info.maxDacRate
        }
        // The whole answer, for a Laser Out's address check (the engine arms on it); not in the JSON.
        Object.defineProperty(entry, 'info', { value: info, enumerable: false })
        found.set(key, entry)
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

const skippedOf = (networks) => (networks.skipped || []).map((s) => `${s.address} (${s.name}): ${s.kind}, not searched`)

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
            : 'this computer has no private IPv4 network (10…, 172.16–31…, 192.168…) to search: plug the cable into the switch with the cubes, wait for an address, then Find cubes again.'
        return { ok: false, asked: 0, cubes: [], networks, skipped: skippedOf(networks), error }
    }
    const out = await sweep({ targets: list, ...rest })
    return { ...out, networks: networks.map((n) => `${n.prefix}.0/24 (${n.name})`), skipped: skippedOf(networks) }
}

module.exports = { findCubes, sweep, outAddressProblem, localNetworks, sweepTargets, isIPv4, isPrivateIPv4, networkKind, cubeAddressProblem, explain, SWEEP_WAIT_MS }
