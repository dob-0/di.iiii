// @vitest-environment node
//
// The share door (serverXR/src/shareDoor.js): a runtime listener on the wifi address with the
// install's name certificate. What it promises — opens and closes with no restart, answers its own
// names only (421 otherwise), marks every request a share-door request so the owner grant is
// refused, moves the broker record with a signed PUT, and follows a changed address.
// The listener is plain http on 127.0.0.1 here; the certificate files are read and handed over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import shareDoor from './shareDoor.js'
import localOwner from './localOwner.js'

const { createShareDoor, defaultRouteAddress, hostIsOwnName, readName } = shareDoor
const loadBroker = () => import('../../scripts/di/brokerClient.mjs')

const NAME = 'dob-a3f9.di-studio.xyz'
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const cleanups = []
let dir

const writeName = (extra = {}) => {
    fs.writeFileSync(path.join(dir, 'name.json'), JSON.stringify({ label: 'dob-a3f9', zone: 'di-studio.xyz', name: NAME, claimedAt: 1, brokerUrl: 'https://broker.test', ...extra }))
    fs.writeFileSync(path.join(dir, 'cert.pem'), 'CERT')
    fs.writeFileSync(path.join(dir, 'key.pem'), 'KEY')
    fs.writeFileSync(path.join(dir, 'install.key'), privateKey.export({ type: 'pkcs8', format: 'pem' }))
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-share-')); writeName() })
afterEach(async () => {
    for (const c of cleanups.splice(0)) await c()
    fs.rmSync(dir, { recursive: true, force: true })
    vi.unstubAllGlobals()
})

// A main server that answers with what the door handed it.
const makeMain = () => {
    const main = new EventEmitter()
    main.on('request', (req, res) => res.end(JSON.stringify({ shareDoor: req.diShareDoor === true, owner: localOwner.isOwnerAtTheMachine(req, { isLocal: true }) })))
    return main
}
const fakeBroker = () => {
    const calls = []
    vi.stubGlobal('fetch', async (url, init) => { calls.push({ url, ...init }); return { status: 204 } })
    return calls
}
const makeBeacon = () => {
    const sent = []
    const socket = { on() {}, bind: (_p, cb) => cb(), setBroadcast() {}, send: (...a) => sent.push(JSON.parse(a[0].toString())), close() { socket.closed = true } }
    return { sent, socket, createSocket: () => socket }
}
const door = (over = {}) => {
    const beacon = makeBeacon()
    const d = createShareDoor({
        mainServer: makeMain(), ownPort: 4000, nameDir: dir, ports: [0], loadBroker,
        getAddress: async () => '127.0.0.1', createServer: () => http.createServer(),
        createSocket: beacon.createSocket, watchEveryMs: 3600000, beaconEveryMs: 3600000, ...over
    })
    cleanups.push(() => d.close())
    return { d, beacon }
}
const get = (port, host, at = '127.0.0.1') => new Promise((resolve, reject) => {
    const req = http.request({ agent: false, host: at, port, path: '/', headers: { host } }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c }); res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject); req.end()
})
const refused = (port) => new Promise((resolve) => { http.get({ agent: false, host: '127.0.0.1', port, path: '/' }).on('error', (e) => resolve(e.code)) })

describe('the name on disk', () => {
    it('reads what di name left', () => {
        const r = readName(dir)
        expect(r.info.name).toBe(NAME); expect(String(r.cert)).toBe('CERT'); expect(String(r.key)).toBe('KEY')
    })
    it('says no-name when a file is missing', () => {
        fs.rmSync(path.join(dir, 'key.pem'))
        expect(readName(dir).error).toBe('no-name')
    })
    it('knows its own names: the name and its subdomains, any port, nothing else', () => {
        expect(hostIsOwnName(NAME, NAME)).toBe(true)
        expect(hostIsOwnName(`${NAME}:8443`, NAME)).toBe(true)
        expect(hostIsOwnName(`show.${NAME}.`, NAME)).toBe(true)
        expect(hostIsOwnName(`evil-${NAME}`, NAME)).toBe(false)
        expect(hostIsOwnName(`${NAME}.evil.com`, NAME)).toBe(false)
        expect(hostIsOwnName('192.168.1.5', NAME)).toBe(false)
    })
})

describe('open and close, no restart', () => {
    it('opens a listener, answers, and closes it again', async () => {
        fakeBroker()
        const { d } = door()
        const opened = await d.open()
        expect(opened).toMatchObject({ ok: true, shared: true, name: NAME, address: '127.0.0.1' })
        expect(opened.port).toBeGreaterThan(0)
        expect((await get(opened.port, NAME)).status).toBe(200)
        await d.close()
        expect(await refused(opened.port)).toBe('ECONNREFUSED')
        expect(d.status()).toMatchObject({ shared: false, address: null, port: null })
    })
    it('serves 421 for a foreign Host and never reaches the app', async () => {
        fakeBroker()
        const { d } = door()
        const { port } = await d.open()
        const res = await get(port, 'localhost')
        expect(res.status).toBe(421)
        expect(res.body).toContain(NAME)
    })
    it('answers a subdomain of its own name', async () => {
        fakeBroker()
        const { d } = door()
        const { port } = await d.open()
        expect((await get(port, `show.${NAME}`)).status).toBe(200)
    })
    it('refuses without a name, and says why', async () => {
        fs.rmSync(path.join(dir, 'name.json'))
        const { d } = door()
        expect(await d.open()).toEqual({ ok: false, reason: 'no-name' })
        expect(d.status().shared).toBe(false)
    })
    it('refuses off the network', async () => {
        const { d } = door({ getAddress: async () => null })
        expect(await d.open()).toEqual({ ok: false, reason: 'no-network' })
    })
    it('opening twice is one door', async () => {
        fakeBroker()
        const { d } = door()
        const a = await d.open(); const b = await d.open()
        expect(b.port).toBe(a.port)
    })
    it('falls back to the next port when the first is taken', async () => {
        fakeBroker()
        const blocker = http.createServer(); await new Promise((r) => blocker.listen(0, '127.0.0.1', r))
        cleanups.push(() => blocker.close())
        const taken = blocker.address().port
        const { d } = door({ ports: [taken, 0] })
        const opened = await d.open()
        expect(opened.ok).toBe(true); expect(opened.port).not.toBe(taken)
    })
    it('hands the certificate files to the listener', async () => {
        fakeBroker()
        const seen = []
        const { d } = door({ createServer: (o) => { seen.push(o); return http.createServer() } })
        await d.open()
        expect(String(seen[0].cert)).toBe('CERT'); expect(String(seen[0].key)).toBe('KEY')
    })
    it('names the install while private, so the panel can offer Share', () => {
        const { d } = door()
        expect(d.status()).toMatchObject({ shared: false, name: NAME })
    })
})

describe('guests, always', () => {
    it('marks the request, and the owner grant is refused even from this machine’s own address', async () => {
        fakeBroker()
        const { d } = door()
        const { port } = await d.open()
        const body = JSON.parse((await get(port, NAME)).body)
        expect(body).toEqual({ shareDoor: true, owner: false })
    })
    it('the same address without the mark would have been the owner', () => {
        const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} }
        expect(localOwner.isOwnerAtTheMachine(req, { isLocal: true })).toBe(true)
        expect(localOwner.isOwnerAtTheMachine({ ...req, diShareDoor: true }, { isLocal: true })).toBe(false)
    })
    it('turns guest mode on while open and off again after', async () => {
        fakeBroker()
        const calls = []
        const { d } = door({ setGuests: (on) => { calls.push(on); return true } })
        await d.open(); await d.close()
        expect(calls).toEqual([true, false])
    })
    it('does not open when guest mode cannot be turned on', async () => {
        const { d } = door({ setGuests: () => false })
        expect(await d.open()).toEqual({ ok: false, reason: 'no-guest-secrets' })
        expect(d.status().shared).toBe(false)
    })
})

describe('the broker record and the beacon', () => {
    it('moves the record with a signed PUT on open, and back to 127.0.0.1 on close', async () => {
        const calls = fakeBroker()
        const { d } = door()
        await d.open(); await d.close()
        expect(calls.map((c) => [c.method, c.url, JSON.parse(c.body).address])).toEqual([
            ['PUT', 'https://broker.test/v1/labels/dob-a3f9/address', '127.0.0.1'],
            ['PUT', 'https://broker.test/v1/labels/dob-a3f9/address', '127.0.0.1']
        ])
    })
    it('signs method, path, time and body hash with the install key', async () => {
        const calls = fakeBroker()
        const { d } = door({ getAddress: async () => '127.0.0.1' })
        await d.open()
        const c = calls[0]
        const ts = c.headers['X-Di-Ts']
        const bodyHash = crypto.createHash('sha256').update(c.body).digest('hex')
        const message = Buffer.from(`PUT\n/v1/labels/dob-a3f9/address\n${ts}\n${bodyHash}`)
        expect(c.headers['X-Di-Label']).toBe('dob-a3f9')
        expect(crypto.verify(null, message, publicKey, Buffer.from(c.headers['X-Di-Sig'], 'base64url'))).toBe(true)
    })
    it('says so when the broker refuses, and stays open', async () => {
        vi.stubGlobal('fetch', async () => ({ status: 401 }))
        const { d } = door()
        const opened = await d.open()
        expect(opened.shared).toBe(true); expect(opened.error).toMatch(/broker did not take.*401/)
    })
    it('announces { label, port } and goes silent on close', async () => {
        fakeBroker()
        const { d, beacon } = door()
        const { port } = await d.open()
        expect(beacon.sent[0]).toEqual({ di: 1, label: 'dob-a3f9', port })
        await d.close()
        expect(beacon.socket.closed).toBe(true)
    })
})

describe('the address watch', () => {
    it('does nothing while the address is the same', async () => {
        fakeBroker()
        const { d } = door()
        const a = await d.open()
        await d.tick()
        expect(d.status().port).toBe(a.port)
    })
    it('rebinds, moves the record and re-announces when the address changes', async () => {
        const calls = fakeBroker()
        let address = '127.0.0.1'
        const { d, beacon } = door({ getAddress: async () => address })
        const a = await d.open()
        address = '127.0.0.2'
        await d.tick()
        expect(d.status().address).toBe('127.0.0.2')
        expect((await get(d.status().port, NAME, '127.0.0.2')).status).toBe(200)
        expect(await refused(a.port)).toBe('ECONNREFUSED')
        expect(JSON.parse(calls.at(-1).body).address).toBe('127.0.0.2')
        expect(beacon.sent.at(-1).port).toBe(d.status().port)
    })
    it('runs on its own interval while shared, and not after close', async () => {
        fakeBroker()
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        try {
            let n = 0
            const { d } = door({ getAddress: async () => { n += 1; return '127.0.0.1' }, watchEveryMs: 10000 })
            await d.open()
            const before = n
            await vi.advanceTimersByTimeAsync(20000)
            expect(n).toBeGreaterThan(before)
            await d.close()
            const after = n
            await vi.advanceTimersByTimeAsync(30000)
            expect(n).toBe(after)
        } finally { vi.useRealTimers() }
    })
})

describe('the wifi address', () => {
    it('is the one the default route leaves by', async () => {
        expect(await defaultRouteAddress({ probe: () => '192.168.15.53' })).toBe('192.168.15.53')
    })
    it('falls back to the first real interface, never docker or loopback', async () => {
        const interfaces = {
            lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
            docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
            wlan0: [{ address: '10.0.0.7', family: 'IPv4', internal: false }]
        }
        expect(await defaultRouteAddress({ probe: () => null, interfaces })).toBe('10.0.0.7')
    })
})
