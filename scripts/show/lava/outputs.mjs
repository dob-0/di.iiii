/**
 * outputs.mjs — the hub's output adapters: DMX (sACN / Art-Net unicast) and lasers (di's local engine, loopback HTTP).
 * Each has enable, sim (logs, sends nothing), and reports its own health. The lasers adapter never arms.
 */
import dgram from 'node:dgram'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { laserKey, laserPoints } from './mapping.mjs'

/** E1.31 data packet (ANSI E1.31-2018): root layer + framing + DMP. 512 slots from `bytes`. */
export const sacnPacket = ({ universe = 1, bytes, seq = 0, source = 'di lava hub', priority = 100, cid }) => {
    const buf = Buffer.alloc(638)
    buf.writeUInt16BE(0x0010, 0); buf.writeUInt16BE(0, 2)
    buf.write('ASC-E1.17\0\0\0', 4, 'latin1')
    buf.writeUInt16BE(0x7000 | (638 - 16), 16); buf.writeUInt32BE(4, 18)
    ;(cid || Buffer.from('64692d6c6176612d687562000000aa01', 'hex')).copy(buf, 22)
    buf.writeUInt16BE(0x7000 | (638 - 38), 38); buf.writeUInt32BE(2, 40)
    buf.write(source.slice(0, 63), 44, 'utf8')
    buf.writeUInt8(priority, 108); buf.writeUInt16BE(0, 109); buf.writeUInt8(seq & 255, 111); buf.writeUInt8(0, 112)
    buf.writeUInt16BE(universe, 113)
    buf.writeUInt16BE(0x7000 | (638 - 115), 115); buf.writeUInt8(2, 117); buf.writeUInt8(0xa1, 118)
    buf.writeUInt16BE(0, 119); buf.writeUInt16BE(1, 121); buf.writeUInt16BE(513, 123); buf.writeUInt8(0, 125)
    for (let i = 0; i < Math.min(512, bytes.length); i++) buf[126 + i] = bytes[i]
    return buf
}

/** ArtDmx packet. `universe` is the 15-bit port-address. */
export const artnetPacket = ({ universe = 0, bytes, seq = 0 }) => {
    const buf = Buffer.alloc(18 + 512)
    buf.write('Art-Net\0', 0, 'latin1'); buf.writeUInt16LE(0x5000, 8); buf.writeUInt16BE(14, 10)
    buf.writeUInt8(seq & 255, 12); buf.writeUInt8(0, 13); buf.writeUInt16LE(universe & 0x7fff, 14); buf.writeUInt16BE(512, 16)
    for (let i = 0; i < Math.min(512, bytes.length); i++) buf[18 + i] = bytes[i]
    return buf
}

/** "sacn:10.0.0.216" | "artnet:10.0.0.216" | "off" */
export const parseDmx = (s) => {
    if (!s || s === 'off') return { proto: 'off' }
    const m = /^(sacn|artnet):([\d.]+|[\w.-]+)(?::(\d+))?$/.exec(s)
    if (!m) throw new Error(`--dmx "${s}": use sacn:<ip>, artnet:<ip> or off`)
    return { proto: m[1], host: m[2], port: m[3] ? Number(m[3]) : m[1] === 'sacn' ? 5568 : 6454 }
}

export class DmxOut {
    constructor({ spec, sim = true, universe, log = () => {} }) {
        this.spec = spec; this.sim = sim; this.log = log
        this.universe = universe ?? (spec.proto === 'sacn' ? 1 : 0)
        this.seq = 0; this.sock = null; this.frames = 0; this.errors = 0; this.last = null; this.lastAt = null; this.lastBytes = null
    }
    get enabled() { return this.spec.proto !== 'off' }
    send(bytes12, nowMs = Date.now()) {
        if (!this.enabled) return false
        const bytes = new Uint8Array(512); bytes.set(bytes12.slice(0, 12))
        this.lastBytes = Array.from(bytes12.slice(0, 12)); this.lastAt = nowMs; this.frames++
        if (this.sim) { if (this.frames % 150 === 1) this.log(`[sim dmx ${this.spec.proto}] ${this.lastBytes.join(',')}`); return true }
        const pkt = (this.spec.proto === 'sacn' ? sacnPacket : artnetPacket)({ universe: this.universe, bytes, seq: this.seq++ })
        this.sock ||= dgram.createSocket('udp4')
        this.sock.send(pkt, this.spec.port, this.spec.host, (err) => { if (err) { this.errors++; this.last = err.message } })
        return true
    }
    blackout() { return this.send(new Uint8Array(12)) }
    close() { try { this.sock?.close() } catch { /* closed */ } this.sock = null }
    health() { return { enabled: this.enabled, sim: this.sim, proto: this.spec.proto, target: this.spec.host || null, universe: this.universe, frames: this.frames, errors: this.errors, lastError: this.last, lastBytes: this.lastBytes, lastMsAgo: this.lastAt ? Date.now() - this.lastAt : null } }
}

export const readLaserToken = (file = path.join(os.homedir(), '.di/data/laser/.token')) => {
    try { return fs.readFileSync(file, 'utf8').trim() } catch { return null }
}

const isLoopback = (base) => { try { const h = new URL(base).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h.endsWith('.localhost') } catch { return false } }

export class LaserOut {
    constructor({ enabled = true, sim = true, base = 'http://127.0.0.1:4000', token = null, fetchFn = globalThis.fetch, log = () => {}, cube = 'all' }) {
        if (!sim && !isLoopback(base)) throw new Error('laser base must be loopback (di local engine)')
        Object.assign(this, { enabled, sim, base: base.replace(/\/$/, ''), token, fetchFn, log, cube })
        this.reachable = null; this.armed = null; this.lastKey = null; this.frames = 0; this.alives = 0; this.errors = 0; this.lastError = null; this.lastFrameAt = 0; this.stopped = false
    }
    headers() { return { 'content-type': 'application/json', ...(this.token ? { 'x-laser-token': this.token } : {}) } }
    async post(route, body) {
        const r = await this.fetchFn(`${this.base}/laser/api/${route}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(1500) })
        const j = await r.json().catch(() => ({}))
        return { ok: r.ok && j.ok !== false, status: r.status, body: j }
    }
    fail(e) { this.errors++; this.lastError = String(e?.message || e).replace(this.token || '\u0000', '***'); if (this.reachable !== false) this.log(`[laser] unreachable: ${this.lastError} — stopped sending`); this.reachable = false }
    /** Health probe; the only GET. Resumes sending when the engine answers again. */
    async check() {
        if (!this.enabled || this.sim) return
        try {
            const r = await this.fetchFn(`${this.base}/laser/api/state`, { signal: AbortSignal.timeout(1500) })
            const j = await r.json()
            this.armed = !!j.armed
            if (!this.reachable) this.log('[laser] engine reachable')
            this.reachable = true; this.lastError = null
        } catch (e) { this.fail(e) }
    }
    /** POST /frame once per look change (quantised key), rate-capped to 4/s. */
    async look(view, nowMs = Date.now()) {
        if (!this.enabled || this.stopped) return false
        const key = laserKey(view)
        if (key === this.lastKey || nowMs - this.lastFrameAt < 250) return false
        this.lastFrameAt = nowMs
        if (this.sim) { this.lastKey = key; this.frames++; this.log(`[sim laser] frame ${key}`); return true }
        if (this.reachable === false) return false
        try {
            const r = await this.post('frame', { cube: this.cube, points: laserPoints(view) })
            if (!r.ok) throw new Error(`frame ${r.status} ${r.body?.error || ''}`)
            this.armed = !!r.body.armed; this.reachable = true; this.lastKey = key; this.frames++
            return true
        } catch (e) { this.fail(e); return false }
    }
    /** Keep-alive for the held frame (never a repeat of the same frame). */
    async alive() {
        if (!this.enabled || this.stopped || this.sim || this.reachable === false || this.lastKey == null) { if (this.sim && this.lastKey != null) this.alives++; return false }
        try { const r = await this.post('alive', { cube: this.cube }); if (!r.ok) throw new Error(`alive ${r.status}`); this.alives++; return true } catch (e) { this.fail(e); return false }
    }
    async blackout() {
        this.stopped = true
        if (!this.enabled) return false
        if (this.sim) { this.log('[sim laser] BLACKOUT'); return true }
        try { return (await this.post('blackout', {})).ok } catch (e) { this.fail(e); return false }
    }
    resume() { this.stopped = false; this.lastKey = null }
    health() { return { enabled: this.enabled, sim: this.sim, reachable: this.reachable, armed: this.armed, note: this.armed === false ? 'not armed (arming is a human step)' : undefined, stopped: this.stopped, frames: this.frames, alives: this.alives, errors: this.errors, lastError: this.lastError } }
}
