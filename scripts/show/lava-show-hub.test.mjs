import { describe, it, expect } from 'vitest'
import dgram from 'node:dgram'
import { WebSocket } from 'ws'
import { parseControl, effectiveView, sceneView, normRole, MASTER_MAX } from './lava/showState.mjs'
import { oscEncode, oscDecode, Bucket, OscBridge } from './lava/osc.mjs'
import { createHub } from './lava-hub.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))
const mkHub = async (extra = {}) => {
    const posts = []
    const fetchFn = async (url) => { posts.push(url.split('/laser/api/')[1]); return { ok: true, status: 200, json: async () => ({ ok: true, armed: false }) } }
    const hub = await createHub({ port: 0, host: '127.0.0.1', quiet: true, oscIn: 'off', fetchFn, token: 't', ...extra })
    return { hub, posts, base: `http://127.0.0.1:${hub.port}` }
}
const state = async (base) => (await fetch(`${base}/api/state`)).json()

describe('show state rules', () => {
    it('roles, control validation and master clamp at 0.8', () => {
        expect(normRole('game')).toBe('tablet-game'); expect(normRole('nonsense')).toBe('viewer'); expect(normRole('operator')).toBe('operator')
        expect(parseControl({ master: 5 }).master).toBe(MASTER_MAX)
        expect(parseControl({ mode: 'party' }).error).toBeTruthy()
        expect(parseControl({ scene: 'nope' }).error).toBeTruthy()
        expect(parseControl({ claim: { output: 'laser', holder: 'none' } }).claim.holder).toBeNull()
        expect(parseControl({ claim: { output: 'x', holder: 'a' } }).error).toBeTruthy()
        expect(parseControl({ outputs: { laser: { on: 'yes' } } }).error).toBeTruthy()
    })
    it('scenes: eruption pulses stay under 3 Hz, safe is never dark, loop overrides the game', () => {
        let rises = 0, prev = 0
        for (let t = 0; t < 10; t += 0.05) { const b = sceneView('eruption', t).burn; if (b > 0.9 && prev <= 0.9) rises++; prev = b }
        expect(rises / 10).toBeLessThan(3)
        expect(sceneView('safe', 5).lava).toBeGreaterThan(0)
        expect(sceneView('game', 1)).toBeNull()
        const v = effectiveView({ mode: 'loop', scene: 'eruption', sceneT0: 0 }, 5000, () => ({ lava: 1, burn: 1, mode: 'live' }))
        expect(v.source).toBe('loop'); expect(v.burn).toBe(0)
    })
})

describe('OSC', () => {
    it('encodes and decodes f, i, s and drops junk and bundles', () => {
        const m = oscDecode(oscEncode('/lava/level', [0.5]))
        expect(m.address).toBe('/lava/level'); expect(m.args[0]).toBeCloseTo(0.5)
        expect(oscDecode(oscEncode('/show/mode', ['kill']))).toEqual({ address: '/show/mode', args: ['kill'] })
        expect(oscDecode(oscEncode('/x', [{ t: 'i', v: 7 }])).args[0]).toBe(7)
        expect(oscDecode(Buffer.from('#bundle\0aaaaaaaa'))).toBeNull(); expect(oscDecode(Buffer.from('xx'))).toBeNull()
    })
    it('token bucket caps the rate', () => {
        const b = new Bucket(10, 10); let ok = 0
        for (let t = 0; t < 1000; t += 1) if (b.take(t)) ok++
        expect(ok).toBeLessThanOrEqual(21)
    })
    it('out is rate capped per address; a mode change always goes out', () => {
        const out = new OscBridge({ inPort: null, targets: [{ host: '127.0.0.1', port: 9 }], sim: true })
        let sent = 0
        for (let t = 0; t < 1000; t += 5) if (out.send('/lava/level', [0.5], t)) sent++
        expect(sent).toBeLessThanOrEqual(21)
        expect(out.send('/show/mode', ['kill'], 1001, true)).toBe(true)
    })
})

describe('show hub: claims, control, devices, OSC (loopback only)', () => {
    it('default claim is NONE: nothing is sent to lasers or DMX until /control claims', async () => {
        const rx = dgram.createSocket('udp4'); const got = []; rx.on('message', (m) => got.push(m))
        await new Promise((r) => rx.bind(0, '127.0.0.1', r))
        const { hub, posts, base } = await mkHub({ dmx: `sacn:127.0.0.1:${rx.address().port}`, lasers: 'on' })
        await sleep(400)
        expect(got.length).toBe(0); expect(posts.filter((p) => p === 'frame' || p === 'alive')).toEqual([])
        const st = await state(base)
        expect(st.show.outputs.laser.claim).toBeNull(); expect(st.show.outputs.dmx.claim).toBeNull()
        await post(`${base}/api/control`, { claim: { output: 'dmx', holder: 'PONYO desk' } })
        await sleep(200); expect(got.length).toBe(0) // the desk holds it: the hub sends nothing
        expect((await state(base)).show.outputs.dmx.claim).toBe('PONYO desk')
        await post(`${base}/api/control`, { claim: { output: 'dmx', holder: 'hub' }, master: 0.5 })
        await sleep(300); expect(got.length).toBeGreaterThan(3)
        expect(Math.max(...got.map((p) => Math.max(...p.subarray(126, 138))))).toBeLessThanOrEqual(Math.round(255 * 0.5))
        await post(`${base}/api/control`, { outputs: { dmx: { on: false } } })
        await sleep(100); got.length = 0; await sleep(200); expect(got.length).toBe(0)
        await post(`${base}/api/control`, { claim: { output: 'laser', holder: 'hub' } })
        await sleep(400); expect(posts).toContain('frame'); expect(posts).not.toContain('arm')
        await hub.close(); rx.close()
    })
    it('control API: validation, master clamp, scene, mode loop/kill/resume; pages served', async () => {
        const { hub, base } = await mkHub()
        expect((await post(`${base}/api/control`, { mode: 'party' })).status).toBe(400)
        const r = await post(`${base}/api/control`, { master: 9, scene: 'eruption', mode: 'loop' })
        expect(r.body.show.master).toBe(0.8); expect(r.body.show.scene).toBe('eruption'); expect(r.body.show.mode).toBe('loop')
        expect((await post(`${base}/api/control`, { mode: 'kill' })).body.show.mode).toBe('kill')
        expect((await (await fetch(`${base}/health`)).json()).ok).toBe(false)
        expect((await post(`${base}/resume`, {})).body.killed).toBe(false)
        expect((await state(base)).show.mode).toBe('loop')
        for (const p of ['/', '/control', '/status']) expect(await (await fetch(base + p)).text()).toContain('Show')
        await hub.close()
    })
    it('kill keeps streaming DMX zeros while the hub holds DMX (no sACN source timeout), and sends nothing while a desk holds it', async () => {
        const rx = dgram.createSocket('udp4'); const got = []; rx.on('message', (m) => got.push(m))
        await new Promise((r) => rx.bind(0, '127.0.0.1', r))
        const { hub, base } = await mkHub({ dmx: `sacn:127.0.0.1:${rx.address().port}` })
        await post(`${base}/api/control`, { claim: { output: 'dmx', holder: 'hub' } }); await sleep(200)
        await post(`${base}/kill`, {}); await sleep(100); got.length = 0; await sleep(400)
        expect(got.length).toBeGreaterThan(5)
        expect(got.every((p) => p.subarray(126, 138).every((b) => b === 0))).toBe(true)
        await post(`${base}/api/control`, { claim: { output: 'dmx', holder: 'PONYO desk' } }); await sleep(100); got.length = 0; await sleep(300)
        expect(got.length).toBe(0)
        await hub.close(); rx.close()
    })
    it('devices join with roles, show in the registry, operator controls over WS, others cannot', async () => {
        const { hub, base } = await mkHub()
        const open = (q) => new Promise((res) => { const w = new WebSocket(`ws://127.0.0.1:${hub.port}/ws?${q}`); w.on('open', () => res(w)) })
        const op = await open('role=operator&name=Emily'); const view = await open('role=viewer'); const desk = await open('role=lights-desk&name=PONYO')
        const errs = []; view.on('message', (d) => { const j = JSON.parse(String(d)); if (j.type === 'error') errs.push(j.error) })
        const shows = []; op.on('message', (d) => { const j = JSON.parse(String(d)); if (j.type === 'show') shows.push(j) })
        await sleep(100)
        const st = await state(base)
        expect(st.devices.map((d) => d.role).sort()).toEqual(['lights-desk', 'operator', 'viewer'])
        expect(st.devices.find((d) => d.role === 'operator').name).toBe('Emily'); expect(st.devices[0].ip).toBe('127.0.0.1')
        view.send(JSON.stringify({ type: 'control', control: { scene: 'calm' } })); await sleep(100)
        expect(errs[0]).toMatch(/operator/); expect((await state(base)).show.scene).toBe('game')
        op.send(JSON.stringify({ type: 'control', control: { scene: 'calm' } })); await sleep(250)
        expect((await state(base)).show.scene).toBe('calm')
        expect(shows.at(-1).show.scene).toBe('calm') // the broadcast reached the operator
        desk.send(JSON.stringify({ event: 'win', lava: 1 })); await sleep(100)
        expect(hub.state.mode).toBe('ready') // only the tablet may send game events
        desk.close(); await sleep(150)
        expect((await state(base)).devices.length).toBe(2)
        op.close(); view.close(); await hub.close()
    })
    it('OSC in drives the show; OSC out mirrors it (loopback receiver)', async () => {
        const rx = dgram.createSocket('udp4'); const msgs = []; rx.on('message', (m) => msgs.push(oscDecode(m)))
        await new Promise((r) => rx.bind(0, '127.0.0.1', r))
        const { hub, base } = await mkHub({ oscIn: '0', oscOut: `127.0.0.1:${rx.address().port}` })
        const tx = dgram.createSocket('udp4')
        const sendOsc = (a, args) => tx.send(oscEncode(a, args), hub.oscPort, '127.0.0.1')
        sendOsc('/lava/level', [0.7]); sendOsc('/show/scene', ['rising']); sendOsc('/show/mode', ['loop']); sendOsc('/bogus', [1])
        await sleep(400)
        const st = await state(base)
        expect(st.show.scene).toBe('rising'); expect(st.show.mode).toBe('loop')
        expect(hub.state.lava).toBeCloseTo(0.7)
        expect(st.devices.some((d) => d.role === 'osc')).toBe(true)
        const addrs = msgs.map((m) => m.address)
        expect(addrs).toContain('/show/scene'); expect(addrs).toContain('/show/mode'); expect(addrs).toContain('/lava/level')
        sendOsc('/show/mode', ['kill']); await sleep(200)
        expect((await (await fetch(`${base}/health`)).json()).killed).toBe(true)
        expect(msgs.some((m) => m.address === '/show/mode' && m.args[0] === 'kill')).toBe(true)
        tx.close(); rx.close(); await hub.close()
    })
})
