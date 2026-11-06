import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import dgram from 'node:dgram'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { clamp, OutputLimiter, SilenceFader, timedLoop } from './lava/safety.mjs'
import { LavaState, dmxChannels, laserKey, laserPoints, lavaColor } from './lava/mapping.mjs'
import { inject, stripEmitter } from './lava/inject.mjs'
import { sacnPacket, artnetPacket, parseDmx, LaserOut } from './lava/outputs.mjs'
import { createHub } from './lava-hub.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GAME = fs.readFileSync(path.join(HERE, 'lava/lava-floor.html'), 'utf8')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('safety layer', () => {
    it('clamps and neutralises non-finite values', () => {
        expect(clamp(2)).toBe(1); expect(clamp(-1)).toBe(0); expect(clamp(NaN)).toBe(0); expect(clamp('x')).toBe(0)
    })
    it('caps the output at 40 Hz', () => {
        const l = new OutputLimiter({ maxHz: 1000, master: 1 })
        let sent = 0
        for (let t = 0; t < 1000; t += 5) if (l.limit([0.5], t)) sent++
        expect(sent).toBeLessThanOrEqual(41)
        expect(l.stats.rateDropped).toBeGreaterThan(100)
    })
    it('applies the master cap and the slew limit', () => {
        const l = new OutputLimiter({ master: 0.5, slew: 0.1 })
        expect(l.limit([1], 0)[0]).toBeCloseTo(0.5)
        const l2 = new OutputLimiter({ master: 1, slew: 0.1 })
        l2.limit([0], 0)
        expect(l2.limit([1], 100)[0]).toBeCloseTo(0.1)
    })
    it('never flashes faster than 3 Hz, even for a 10 Hz square wave', () => {
        const l = new OutputLimiter({ master: 1, slew: 1 })
        const lum = []
        for (let t = 0; t < 4000; t += 25) { const v = Math.floor(t / 50) % 2 ? 1 : 0; const o = l.limit([v], t); if (o) lum.push([t, o[0]]) }
        // count reversals per sliding second in the OUTPUT
        let dir = 0, rev = []
        for (let i = 1; i < lum.length; i++) {
            const d = Math.sign(lum[i][1] - lum[i - 1][1]); if (!d) continue
            if (dir && d !== dir) rev.push(lum[i][0]); dir = d
        }
        for (const t of rev) expect(rev.filter((x) => x >= t && x < t + 1000).length).toBeLessThanOrEqual(6)
        expect(l.stats.flashHeld).toBeGreaterThan(0)
    })
    it('fades to the timed loop after 2 s of silence over 3 s, never dark', () => {
        const f = new SilenceFader()
        f.seen(0)
        const live = { lava: 1, burn: 1, mode: 'play' }
        expect(f.mix(live, 1900).weight).toBe(1)
        const mid = f.mix(live, 3500)
        expect(mid.weight).toBeCloseTo(0.5); expect(mid.mode).toBe('fading')
        const end = f.mix(live, 6000)
        expect(end.mode).toBe('loop'); expect(end.burn).toBe(0)
        for (let t = 0; t < 80000; t += 1000) expect(timedLoop(t).lava).toBeGreaterThan(0.1)
        expect(new SilenceFader().mix(live, 5).mode).toBe('loop') // never heard: loop, not dark
    })
})

describe('event -> output mapping', () => {
    it('tracks game events', () => {
        const s = new LavaState()
        s.apply({ event: 'start', lava: 0.1, hearts: 5 }, 0); expect(s.mode).toBe('play')
        s.apply({ event: 'burn', lava: 0.4, hearts: 4 }, 1000)
        expect(s.burn(1000)).toBe(1); expect(s.burn(1300)).toBeCloseTo(0.5); expect(s.burn(2000)).toBe(0)
        s.apply({ event: 'win' }, 0); expect(s.mode).toBe('won')
        s.apply({ event: 'dead' }, 0); expect(s.mode).toBe('dead')
        s.apply({ event: 'restart' }, 0); expect(s.mode).toBe('ready'); expect(s.lava).toBe(0)
        expect(s.apply('junk', 0)).toBe(false)
    })
    it('lava palette runs deep red -> orange -> yellow-white', () => {
        const a = lavaColor(0), b = lavaColor(0.55), c = lavaColor(1)
        expect(a[0]).toBeLessThan(0.5); expect(b[0]).toBe(1); expect(c[1]).toBeGreaterThan(0.8)
    })
    it('DMX: 12 channels in range, fixtures differ by phase, burn blooms red', () => {
        const ch = dmxChannels({ lava: 0.5, burn: 0, mode: 'play' }, 3)
        expect(ch).toHaveLength(12); expect(ch.every((v) => v >= 0 && v <= 1)).toBe(true)
        expect(ch[0]).not.toBeCloseTo(ch[3], 3)
        const b = dmxChannels({ lava: 0.5, burn: 1, mode: 'play' }, 3)
        expect([b[0], b[1], b[2]]).toEqual([1, 0, 0])
    })
    it('laser: points are [x,y,r,g,b] in range; look key changes by level and burn only', () => {
        const pts = laserPoints({ lava: 0.7, burn: 0, mode: 'play' })
        expect(pts.length).toBeGreaterThan(40); expect(pts.length).toBeLessThan(500)
        for (const p of pts) { expect(p).toHaveLength(5); expect(Math.abs(p[0])).toBeLessThanOrEqual(1); expect(Math.abs(p[1])).toBeLessThanOrEqual(1); expect(p.slice(2).every((v) => v >= 0 && v <= 1)).toBe(true) }
        expect(laserKey({ lava: 0.71, burn: 0, mode: 'play' })).toBe(laserKey({ lava: 0.69, burn: 0, mode: 'play' }))
        expect(laserKey({ lava: 0.7, burn: 1, mode: 'play' })).not.toBe(laserKey({ lava: 0.7, burn: 0, mode: 'play' }))
        expect(laserPoints({ lava: 0.7, burn: 1, mode: 'play' }).at(-1).slice(2)).toEqual([1, 0, 0])
    })
})

describe('emitter injection', () => {
    it('adds only the injected block; stripping gives back the owner\'s file byte for byte', () => {
        const out = inject(GAME)
        expect(out).not.toBe(GAME)
        expect(stripEmitter(out)).toBe(GAME)
        const hooks = out.split('\n').filter((l) => l.startsWith('/*LH*/'))
        expect(hooks).toHaveLength(8)
        for (const ev of ['step', 'burn', 'ignite', 'start', 'win', 'dead', 'restart', 'beat']) expect(out).toContain(`__lh("${ev}"`)
    })
    it('the emitted script parses', () => {
        const m = /<!--LH-BEGIN--><script>([\s\S]*?)<\/script>/.exec(inject(GAME))
        expect(() => new Function(m[1])).not.toThrow()
    })
})

describe('adapters', () => {
    it('sACN and Art-Net packets have the right framing', () => {
        const b = new Uint8Array(12).fill(7)
        const s = sacnPacket({ universe: 1, bytes: b, seq: 3 })
        expect(s.length).toBe(638); expect(s.toString('latin1', 4, 12)).toBe('ASC-E1.1'); expect(s.readUInt16BE(113)).toBe(1); expect(s[111]).toBe(3); expect(s[125]).toBe(0); expect(s[126]).toBe(7); expect(s[138]).toBe(0)
        const a = artnetPacket({ universe: 0, bytes: b })
        expect(a.toString('latin1', 0, 7)).toBe('Art-Net'); expect(a.readUInt16LE(8)).toBe(0x5000); expect(a[18]).toBe(7)
        expect(parseDmx('sacn:10.0.0.216')).toEqual({ proto: 'sacn', host: '10.0.0.216', port: 5568 })
        expect(() => parseDmx('bogus')).toThrow()
    })
    it('laser: refuses a non-loopback base, posts frame once per look then alive, reports unreachable', async () => {
        expect(() => new LaserOut({ sim: false, base: 'http://10.0.0.5:4000' })).toThrow()
        const calls = []
        let down = false
        const fetchFn = async (url, init) => {
            if (down) throw new Error('ECONNREFUSED')
            calls.push([url.split('/laser/api/')[1], init?.headers?.['x-laser-token'], init?.body && JSON.parse(init.body)])
            return { ok: true, status: 200, json: async () => ({ ok: true, armed: false }) }
        }
        const l = new LaserOut({ sim: false, base: 'http://127.0.0.1:4000', token: 'SECRET', fetchFn })
        const view = { lava: 0.5, burn: 0, mode: 'play' }
        expect(await l.look(view, 1000)).toBe(true)
        expect(await l.look(view, 2000)).toBe(false) // same look: no re-POST
        await l.alive(); await l.alive()
        expect(calls.map((c) => c[0])).toEqual(['frame', 'alive', 'alive'])
        expect(calls[0][1]).toBe('SECRET'); expect(calls[0][2].cube).toBe('all')
        expect(l.health().armed).toBe(false)
        down = true
        await l.alive()
        expect(l.health().reachable).toBe(false)
        const n = calls.length
        await l.look({ lava: 0.9, burn: 0, mode: 'play' }, 5000); await l.alive()
        expect(calls.length).toBe(n) // stopped sending
        expect(JSON.stringify(l.health())).not.toContain('SECRET')
    })
})

describe('hub (loopback only, never the real network)', () => {
    it('serves game with emitter, surface, health; relays game events; kill blacks out; DMX goes to a fake receiver', async () => {
        const rx = dgram.createSocket('udp4')
        const got = []
        rx.on('message', (m) => got.push(m))
        await new Promise((r) => rx.bind(0, '127.0.0.1', r))
        const posts = []
        const fetchFn = async (url, init) => { posts.push(url.split('/laser/api/')[1]); return { ok: true, status: 200, json: async () => ({ ok: true, armed: false }) } }
        const hub = await createHub({ port: 0, host: '127.0.0.1', quiet: true, dmx: `sacn:127.0.0.1:${rx.address().port}`, lasers: 'on', fetchFn, token: 't', master: 0.8, claim: 'laser,dmx', oscIn: 'off' })
        const base = `http://127.0.0.1:${hub.port}`
        const game = await (await fetch(`${base}/game`)).text()
        expect(game).toContain('window.__lh'); expect(stripEmitter(game)).toBe(GAME)
        expect((await (await fetch(`${base}/surface`)).text())).toContain('<canvas')
        const surf = new WebSocket(`ws://127.0.0.1:${hub.port}/ws?role=surface`)
        const gm = new WebSocket(`ws://127.0.0.1:${hub.port}/ws?role=game`)
        await Promise.all([new Promise((r) => surf.on('open', r)), new Promise((r) => gm.on('open', r))])
        const relayed = new Promise((r) => surf.on('message', (d) => r(JSON.parse(String(d)))))
        gm.send(JSON.stringify({ event: 'burn', lava: 0.6, step: 3, tile: [1, 2], hearts: 4, t: 1 }))
        expect((await relayed).event).toBe('burn')
        await sleep(400)
        const h = await (await fetch(`${base}/health`)).json()
        expect(h.mode).toBe('live'); expect(h.state.mode).toBe('ready'); expect(h.outputs.lasers.armed).toBe(false)
        expect(posts).toContain('frame'); expect(posts).toContain('alive')
        expect(got.length).toBeGreaterThan(3)
        expect(got[0].length).toBe(638)
        expect(Math.max(...got.map((p) => Math.max(...p.subarray(126, 138))))).toBeLessThanOrEqual(Math.round(255 * 0.8))
        expect((await (await fetch(`${base}/status`)).text())).toContain('KILL')
        got.length = 0
        await fetch(`${base}/kill`, { method: 'POST' })
        expect(posts).toContain('blackout')
        await sleep(200)
        const last = got.at(-1)
        expect(last).toBeDefined(); expect(Array.from(last.subarray(126, 138)).every((v) => v === 0)).toBe(true)
        got.length = 0; await sleep(200)
        expect(got.length).toBe(0) // killed: nothing more sent
        expect(posts).not.toContain('arm')
        gm.close(); surf.close(); await hub.close(); rx.close()
    })
})
