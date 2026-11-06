/**
 * osc.mjs — minimal OSC 1.0 (messages only; types f i s) and the show hub's OSC bridge.
 * In:  /lava/level f   /lava/event s   /show/mode s   /show/scene s
 * Out: the same addresses to every --osc-out host:port when the show state changes.
 * Both directions are rate-capped; a sim bridge logs instead of sending.
 */
import dgram from 'node:dgram'

const pad4 = (n) => (n + 4) & ~3
export const oscEncode = (address, args = []) => {
    const tags = ',' + args.map((a) => (a.t || (typeof a === 'string' ? 's' : 'f'))).join('')
    const parts = [Buffer.from(address + '\0'.repeat(pad4(address.length) - address.length)), Buffer.from(tags + '\0'.repeat(pad4(tags.length) - tags.length))]
    for (const a of args) {
        const v = a.v ?? a
        const t = a.t || (typeof v === 'string' ? 's' : 'f')
        if (t === 's') { const s = String(v); parts.push(Buffer.from(s + '\0'.repeat(pad4(s.length) - s.length))) }
        else { const b = Buffer.alloc(4); if (t === 'i') b.writeInt32BE(v | 0); else b.writeFloatBE(Number(v)); parts.push(b) }
    }
    return Buffer.concat(parts)
}

/** -> {address, args:[...]} or null (bundles and malformed packets are dropped). */
export const oscDecode = (buf) => {
    try {
        if (buf.length < 8 || buf[0] !== 0x2f) return null
        const str = (at) => { let e = buf.indexOf(0, at); if (e < 0) throw new Error('x'); return [buf.toString('utf8', at, e), pad4(e - at) + at] }
        const [address, p1] = str(0)
        if (p1 >= buf.length) return { address, args: [] }
        const [tags, p2] = str(p1)
        if (tags[0] !== ',') return null
        let p = p2
        const args = []
        for (const t of tags.slice(1)) {
            if (t === 'f') { args.push(buf.readFloatBE(p)); p += 4 }
            else if (t === 'i') { args.push(buf.readInt32BE(p)); p += 4 }
            else if (t === 's') { const [s, np] = str(p); args.push(s); p = np }
            else return null
        }
        return { address, args }
    } catch { return null }
}

/** Token bucket: `rate` messages a second, burst `burst`. */
export class Bucket {
    constructor(rate, burst = rate) { this.rate = rate; this.burst = burst; this.tokens = burst; this.at = null }
    take(nowMs) {
        if (this.at != null) this.tokens = Math.min(this.burst, this.tokens + ((nowMs - this.at) / 1000) * this.rate)
        this.at = nowMs
        if (this.tokens < 1) return false
        this.tokens -= 1
        return true
    }
}

export const parseTargets = (s) => (s ? String(s).split(',').filter(Boolean).map((t) => {
    const m = /^([\w.-]+):(\d{1,5})$/.exec(t.trim())
    if (!m) throw new Error(`--osc-out "${t}": use host:port`)
    return { host: m[1], port: Number(m[2]) }
}) : [])

export class OscBridge {
    constructor({ inPort = 9000, targets = [], sim = false, onMessage, log = () => {}, inRate = 100, outRate = 40 }) {
        Object.assign(this, { inPort, targets, sim, onMessage, log })
        this.inBucket = new Bucket(inRate, inRate)
        this.outBucket = new Bucket(outRate, outRate)
        this.lastByAddr = {}
        this.stats = { in: 0, inDropped: 0, inBad: 0, out: 0, outDropped: 0 }
        this.peers = new Map() // "ip:port" -> lastSeen ms
        this.sock = null; this.outSock = null
    }
    async start() {
        if (this.inPort == null) return null
        this.sock = dgram.createSocket('udp4')
        this.sock.on('message', (buf, rinfo) => {
            const now = Date.now()
            this.peers.set(rinfo.address, now)
            if (!this.inBucket.take(now)) { this.stats.inDropped++; return }
            const m = oscDecode(buf)
            if (!m) { this.stats.inBad++; return }
            this.stats.in++
            try { this.onMessage?.(m, rinfo, now) } catch (e) { this.log(`osc handler: ${e.message}`) }
        })
        this.sock.on('error', (e) => this.log(`osc in error: ${e.message}`))
        await new Promise((res, rej) => { this.sock.once('error', rej); this.sock.bind(this.inPort, '0.0.0.0', res) })
        return this.sock.address().port
    }
    /** force = never dropped (mode/kill changes). Level-type addresses are held to 20/s each. */
    send(address, args, nowMs = Date.now(), force = false) {
        if (!this.targets.length) return false
        const gap = address === '/lava/level' ? 50 : 0
        if (!force && (nowMs - (this.lastByAddr[address] ?? -1e9) < gap || !this.outBucket.take(nowMs))) { this.stats.outDropped++; return false }
        this.lastByAddr[address] = nowMs
        this.stats.out++
        if (this.sim) { this.log(`[sim osc out] ${address} ${JSON.stringify(args)}`); return true }
        this.outSock ||= dgram.createSocket('udp4')
        const pkt = oscEncode(address, args)
        for (const t of this.targets) this.outSock.send(pkt, t.port, t.host, () => {})
        return true
    }
    close() { try { this.sock?.close() } catch { /* closed */ } try { this.outSock?.close() } catch { /* closed */ } }
    health() { return { in: this.inPort == null ? 'off' : (this.sock ? this.sock.address().port : this.inPort), targets: this.targets.map((t) => `${t.host}:${t.port}`), sim: this.sim, ...this.stats, peers: [...this.peers].map(([ip, t]) => ({ ip, lastSeenMsAgo: Date.now() - t })) } }
}
