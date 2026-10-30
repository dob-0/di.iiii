// @vitest-environment node
// Laser operations from the panel (2026-10-14): who may arm, Find cubes, Use these.
// Never a real cube: every address here is a 127.0.0.x fake on this machine.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dgram from 'node:dgram'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerLaserRoutes } = require('../routes/laserRoutes')
const { ARM_PHRASE } = require('./laserEngine')
const { sweep, findCubes, localNetworks, sweepTargets, explain } = require('./laserFind')
const { mergeConfig, validatePicked } = require('./laserConfig')
const { isSameMachineRequest } = require('../localRuntimeGuard')

const SERIAL_A = 'deadbeef0042'
const SERIAL_B = 'c0ffee000007'

// A GET_FULL_INFO answer laid out as the protocol spec's table says (64 bytes; lasercubeProtocol.js).
const infoAnswer = ({ serial = SERIAL_A, ip = [10, 0, 0, 51], temp = 31, name = 'LaserCube Ultra' } = {}) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77
    b[3] = 1
    b[4] = 7
    b.writeUInt32LE(30000, 10)
    b.writeUInt32LE(35000, 14)
    b.writeUInt16LE(5800, 19)
    b.writeUInt16LE(6000, 21)
    b[24] = temp
    b[25] = 2
    Buffer.from(serial, 'hex').copy(b, 26)
    Buffer.from(ip).copy(b, 32)
    b[37] = 3
    b.write(name, 38, 'latin1')
    return b
}

const fakeSockets = []
const fakeSocket = () => {
    const s = {
        sent: [],
        handlers: {},
        closed: false,
        send: (buf, port, ip, done) => { s.sent.push({ buf: Buffer.from(buf), port, ip }); done?.() },
        on: (ev, fn) => { s.handlers[ev] = fn },
        bind: () => {},
        close: () => { s.closed = true }
    }
    fakeSockets.push(s)
    return s
}

const ENV_KEYS = ['DI_ALLOW_LAN_DEVICES', 'TRUST_PROXY', 'DI_LASER_TEST_LOOPBACK', 'DI_LOCAL_NAME', 'HOST']
let savedEnv
let servers = []
beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    for (const k of ENV_KEYS) delete process.env[k]
    // The fakes stand on 127.0.0.x; a real machine never sets this (laserFind.js cubeAddressProblem).
    process.env.DI_LASER_TEST_LOOPBACK = '1'
    fakeSockets.length = 0
})
afterEach(async () => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k] }
    for (const s of servers) await new Promise((r) => s.close(r))
    servers = []
})

const startServer = async ({ config, findCubes } = {}) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-ops-'))
    if (config) {
        fs.mkdirSync(path.join(dataDir, 'laser'))
        fs.writeFileSync(path.join(dataDir, 'laser', 'laser.json'), JSON.stringify(config))
    }
    const app = express()
    app.set('trust proxy', 'loopback')
    const lasers = registerLaserRoutes(app, { dataDir, log: null, engineOptions: { createSocket: fakeSocket }, findCubes })
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    servers.push(server)
    const base = `http://127.0.0.1:${server.address().port}/laser/api`
    const call = async (method, route, body, headers = {}) => {
        const res = await fetch(`${base}${route}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        return { status: res.status, body: await res.json().catch(() => null) }
    }
    return { dataDir, lasers, call }
}

describe('who may arm', () => {
    it('a browser on this machine arms and disarms; the phrase is never in the state', async () => {
        const { call } = await startServer()
        const state = await call('GET', '/state')
        expect(state.status).toBe(200)
        expect(state.body).not.toHaveProperty('armPhrase')
        expect(JSON.stringify(state.body)).not.toContain(ARM_PHRASE)
        const wrong = await call('POST', '/arm', { armed: true, confirm: 'signed' })
        expect(wrong.status).toBe(403)
        expect(JSON.stringify(wrong.body)).not.toContain(ARM_PHRASE)
        expect((await call('POST', '/arm', { armed: true, confirm: ARM_PHRASE })).body).toMatchObject({ ok: true, armed: true })
        expect((await call('POST', '/arm', { armed: false })).body).toMatchObject({ ok: true, armed: false })
    })

    it.each([
        ['X-Forwarded-For from loopback (a front door on this machine)', { 'x-forwarded-for': '127.0.0.1' }],
        ['Forwarded', { forwarded: 'for=127.0.0.1;proto=https' }],
        ['X-Real-IP', { 'x-real-ip': '127.0.0.1' }],
        ['X-Forwarded-Host alone', { 'x-forwarded-host': 'local.thedi.studio' }],
        ['X-Forwarded-Proto alone', { 'x-forwarded-proto': 'https' }],
        ["the review's repro: X-Forwarded-Host + X-Forwarded-Proto + CF-Connecting-IP", { 'x-forwarded-host': 'local.thedi.studio', 'x-forwarded-proto': 'https', 'cf-connecting-ip': '203.0.113.9' }],
        ['Via', { via: '1.1 caddy' }]
    ])('a request through a proxy (%s) may not arm, send frames, find or set cubes', async (_, headers) => {
        const { call } = await startServer()
        for (const [route, body] of [['/arm', { armed: true, confirm: ARM_PHRASE }], ['/frame', { points: [[0, 0.5, 1, 0, 0]] }], ['/alive', {}], ['/find', {}], ['/config', { cubes: [{ serial: SERIAL_A, ip: '127.0.0.2' }] }]]) {
            const out = await call('POST', route, body, headers)
            expect(out.status, route).toBe(403)
            expect(out.body.error).toBe('same machine only')
        }
        // GET state and frames answer as before; the stops follow STOPS_FROM_REMOTE = false (N644.2):
        // disarm and blackout are refused the same way, one rule for both.
        expect((await call('GET', '/state', undefined, headers)).status).toBe(200)
        expect((await call('GET', '/frames', undefined, headers)).status).toBe(200)
        for (const [route, body] of [['/blackout', {}], ['/arm', { armed: false }]]) {
            const out = await call('POST', route, body, headers)
            expect(out.status, route).toBe(403)
            expect(out.body.error).toBe('same machine only')
        }
        expect((await call('GET', '/state')).body.armed).toBe(false)
    })

    it('a visitor from another address behind a local proxy is refused everywhere, as before', async () => {
        const { call } = await startServer()
        expect((await call('POST', '/arm', { armed: true, confirm: ARM_PHRASE }, { 'x-forwarded-for': '203.0.113.9' })).status).toBe(403)
        expect((await call('GET', '/state', undefined, { 'x-forwarded-for': '203.0.113.9' })).status).toBe(403)
    })

    it('TRUST_PROXY in the environment makes every request remote', async () => {
        process.env.TRUST_PROXY = 'loopback'
        const { call } = await startServer()
        expect((await call('POST', '/arm', { armed: true, confirm: ARM_PHRASE })).status).toBe(403)
    })

    it('DI_ALLOW_LAN_DEVICES=1 opens it to the network on purpose', async () => {
        process.env.DI_ALLOW_LAN_DEVICES = '1'
        const { call } = await startServer()
        const out = await call('POST', '/arm', { armed: true, confirm: ARM_PHRASE }, { 'x-forwarded-for': '203.0.113.9' })
        expect(out.body).toMatchObject({ ok: true, armed: true })
    })

    it('a peer that is not loopback is never the same machine', () => {
        expect(isSameMachineRequest({ socket: { remoteAddress: '10.42.0.5' }, headers: {} })).toBe(false)
        expect(isSameMachineRequest({ socket: { remoteAddress: '::1' }, headers: {} })).toBe(true)
        expect(isSameMachineRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-forwarded-for': '127.0.0.1' } })).toBe(false)
    })
})

describe('Use these: laser.json from the panel', () => {
    it('writes the file, disarms the armed engine first and reloads it without a restart; ids follow the serial', async () => {
        const config = { cubes: [{ id: 'cube-1', name: 'Left', ip: '127.0.0.9', serial: SERIAL_A, stillBeams: [{ x: 0.1, y: 0.5 }] }], zone: { xMin: -0.5, xMax: 0.5, yMin: 0, yMax: 1 }, dacRate: 20000 }
        const { call, dataDir } = await startServer({ config })
        expect((await call('GET', '/state')).body.cubes.map((c) => c.ip)).toEqual(['127.0.0.9'])
        const old = fakeSockets[0]
        old.handlers.message(infoAnswer(), { address: '127.0.0.9' })
        expect((await call('POST', '/arm', { armed: true, confirm: ARM_PHRASE })).body).toMatchObject({ ok: true, armed: true })

        // The DHCP server gave the same cube a new address; a second cube joins.
        const out = await call('POST', '/config', { cubes: [{ serial: SERIAL_B, ip: '127.0.0.11', name: 'Right' }, { serial: SERIAL_A, ip: '127.0.0.10', name: '' }] })
        expect(out.status).toBe(200)
        expect(out.body).toMatchObject({ ok: true, disarmed: true, wasArmed: true })
        expect(out.body.state.armed).toBe(false)
        // The old engine switched its cube off (0x80 0) and closed its socket.
        expect(old.sent.some((m) => m.ip === '127.0.0.9' && m.buf[0] === 0x80 && m.buf[1] === 0)).toBe(true)
        expect(old.closed).toBe(true)
        const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'laser', 'laser.json'), 'utf8'))
        expect(file.cubes).toEqual([
            { id: 'cube-2', name: 'Right', ip: '127.0.0.11', serial: SERIAL_B },
            { id: 'cube-1', name: 'Left', ip: '127.0.0.10', serial: SERIAL_A, stillBeams: [{ x: 0.1, y: 0.5 }] }
        ])
        expect(file.zone).toEqual(config.zone)
        expect(file.dacRate).toBe(20000)
        expect(fs.existsSync(path.join(dataDir, 'laser', 'laser.json.prev'))).toBe(true)
        const state = (await call('GET', '/state')).body
        expect(state.cubes.map((c) => [c.id, c.ip])).toEqual([['cube-2', '127.0.0.11'], ['cube-1', '127.0.0.10']])
        expect(state.armed).toBe(false)
    })

    it('refuses what is not a cube answer', async () => {
        const { call } = await startServer()
        expect((await call('POST', '/config', { cubes: [] })).status).toBe(400)
        expect((await call('POST', '/config', { cubes: [{ serial: 'zz', ip: '127.0.0.2' }] })).status).toBe(400)
        expect((await call('POST', '/config', { cubes: [{ serial: SERIAL_A, ip: '127.0.0.2.5' }] })).status).toBe(400)
        expect(validatePicked([{ serial: SERIAL_A, ip: '127.0.0.2' }, { serial: SERIAL_A, ip: '127.0.0.3' }]).ok).toBe(false)
    })

    it('a hand-written cube without a serial is matched once by its address', () => {
        const merged = mergeConfig({ cubes: [{ id: 'stage-left', ip: '127.0.0.5' }] }, [{ serial: SERIAL_A, ip: '127.0.0.5', name: '' }])
        expect(merged.cubes).toEqual([{ id: 'stage-left', name: 'stage-left', ip: '127.0.0.5', serial: SERIAL_A }])
    })
})

describe('Find cubes', () => {
    const fakes = []
    afterEach(() => { for (const f of fakes.splice(0)) f.close() })
    const bindFake = (address, port, answer) => new Promise((resolve, reject) => {
        const s = dgram.createSocket('udp4')
        s.heard = []
        s.on('message', (msg, rinfo) => {
            s.heard.push(Buffer.from(msg))
            const reply = answer(msg)
            if (reply) s.send(reply, rinfo.port, rinfo.address)
        })
        s.once('error', reject)
        s.bind(port, address, () => { fakes.push(s); resolve(s) })
    })

    it('asks only 0x77, and lists the cubes that answered with their model, serial, address, firmware and temperature', async () => {
        const a = await bindFake('127.0.0.2', 0, (m) => (m[0] === 0x77 ? infoAnswer({ serial: SERIAL_A, temp: 29 }) : null))
        const port = a.address().port
        const b = await bindFake('127.0.0.3', port, (m) => (m[0] === 0x77 ? infoAnswer({ serial: SERIAL_B, temp: 33, name: 'LaserCube 2W' }) : null))
        const noise = await bindFake('127.0.0.4', port, () => Buffer.from('not a cube'))
        const out = await sweep({ targets: ['127.0.0.2', '127.0.0.3', '127.0.0.4', '127.0.0.5'], port, waitMs: 300, gapMs: 0 })
        expect(out).toMatchObject({ ok: true, asked: 4 })
        expect(out.cubes).toEqual([
            expect.objectContaining({ serial: SERIAL_A, ip: '127.0.0.2', modelName: 'LaserCube Ultra', firmware: '1.7', temperature: 29, modelNumber: 3, maxDacRate: 35000 }),
            expect.objectContaining({ serial: SERIAL_B, ip: '127.0.0.3', modelName: 'LaserCube 2W', temperature: 33 })
        ])
        for (const f of [a, b, noise]) expect(f.heard.map((m) => [...m])).toEqual([[0x77]])
    })

    it('sweeps each local IPv4 /24 once, never loopback, link-local or its own address', () => {
        const nets = localNetworks({
            lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
            eth0: [{ family: 'IPv4', address: '10.42.0.20', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
            wifi: [{ family: 4, address: '192.168.88.7', internal: false }, { family: 'IPv4', address: '169.254.3.3', internal: false }],
            dup: [{ family: 'IPv4', address: '10.42.0.99', internal: false }]
        })
        expect(nets.map((n) => n.prefix)).toEqual(['10.42.0', '192.168.88'])
        const targets = sweepTargets(nets)
        expect(targets).toHaveLength(2 * 254 - 2)
        expect(targets).not.toContain('10.42.0.20')
        expect(targets).toContain('10.42.0.1')
        expect(targets).toContain('192.168.88.254')
    })

    it('a cube on the laser network is found although another network is a big silent /24 (stage, 2026-10-30)', async () => {
        // Virtual clock: the sweep's own timer is injected, so "when was it asked" is exact. The fake cube is only
        // reachable in the first 500 ms of the sweep (its ARP/route window); 253 silent wifi hosts at 2 ms each
        // take 506 ms (the cube at .196 then 896 ms), so one flat list (wifi first) asks the cube too late, one sweep per network asks it at once.
        const real = Buffer.from('7700000111020000ff0fb8880000b88800000370177017ff20028cbfea06ab3c0a2a01c4020a4c617365724375626520372e355720556c747261204d6b320000', 'hex')
        const queue = []
        let now = 0
        const later = (fn, ms) => { queue.push({ at: now + ms, fn }) }
        const asked = []
        const createSocket = () => {
            const s = { handlers: {}, on: (ev, fn) => { s.handlers[ev] = fn }, close: () => {} }
            s.bind = (_, cb) => queueMicrotask(cb)
            s.send = (buf, port, ip, cb) => {
                asked.push([ip, now])
                if (ip === '10.42.1.196' && now <= 500) setImmediate(() => s.handlers.message(real, { address: ip }))
                cb?.()
            }
            return s
        }
        const interfaces = {
            wifi: [{ family: 'IPv4', address: '10.158.133.9', internal: false }],
            eth0: [{ family: 'IPv4', address: '10.42.1.1', internal: false }]
        }
        // wifi listed first, as on the stage Mac: the old flat sweep asked its 253 silent hosts before the laser network
        const run = findCubes({ interfaces, createSocket, setTimeout: later, gapMs: 2, waitMs: 50 })
        // the laser network has the one answering host among 253 silent ones
        let settled = false
        run.then(() => { settled = true })
        while (!settled) {
            await new Promise((r) => setImmediate(r))
            if (queue.length) { queue.sort((a, b) => a.at - b.at); const next = queue.shift(); now = next.at; next.fn() }
        }
        const out = await run
        expect(out.ok).toBe(true)
        expect(out.cubes.map((c) => c.ip)).toEqual(['10.42.1.196'])
        expect(out.cubes[0]).toMatchObject({ firmware: '1.17', modelName: 'LaserCube 7.5W Ultra Mk2' })
        expect(out.asked).toBe(253 + 253)
        expect(asked.filter(([ip]) => ip.startsWith('10.158.133.'))).toHaveLength(253)
        // each network keeps its own 2 ms gap between packets
        const times = asked.filter(([ip]) => ip.startsWith('10.158.133.')).map(([, t]) => t)
        expect(times[1] - times[0]).toBe(2)
    })

    it('a firewall refusal is said as one, not as "no cubes"', async () => {
        const blocked = () => {
            const s = { handlers: {}, on: (ev, fn) => { s.handlers[ev] = fn }, bind: (_, cb) => cb(), close: () => {}, send: () => { const e = new Error('send EACCES'); e.code = 'EACCES'; throw e } }
            return s
        }
        const out = await sweep({ targets: ['127.0.0.2'], createSocket: blocked, waitMs: 10, gapMs: 0 })
        expect(out.ok).toBe(false)
        expect(out.code).toBe('EACCES')
        expect(out.error).toMatch(/firewall/i)
        expect(explain({ code: 'EPERM' })).toMatch(/Allow an app through the firewall/)
    })

    it('the route runs one search at a time and rate-limits the next', async () => {
        let calls = 0
        const { call } = await startServer({ findCubes: async () => { calls += 1; return { ok: true, asked: 253, cubes: [], networks: ['192.0.2.0/24 (eth0)'] } } })
        expect((await call('POST', '/find', {})).status).toBe(200)
        const again = await call('POST', '/find', {})
        expect(again.status).toBe(429)
        expect(again.body.retryAfterMs).toBeGreaterThan(0)
        expect(calls).toBe(1)
    })
})

// Review round 2 (2026-10-14): a web page in the same browser (CSRF) or a rebound name (DNS
// rebinding) must not reach a laser. node:http so the Host header can be set exactly.
describe('only this machine\'s own page may drive the lasers', () => {
    const http = require('node:http')
    const { ownPageRefusal, sameOriginAsHost } = require('../localRuntimeGuard')
    const { cubeAddressProblem, isPrivateIPv4 } = require('./laserFind')

    // The review's setup: the server's own cors() as a non-production server has it (any origin,
    // credentials), so the preflight passes and only the laser gate stands in the way.
    const startWithCors = async (opts) => {
        const cors = require('cors')
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-ops-'))
        if (opts?.config) {
            fs.mkdirSync(path.join(dataDir, 'laser'))
            fs.writeFileSync(path.join(dataDir, 'laser', 'laser.json'), JSON.stringify(opts.config))
        }
        const app = express()
        app.set('trust proxy', 'loopback')
        app.use(cors({ origin: true, credentials: true }))
        registerLaserRoutes(app, { dataDir, log: null, engineOptions: { createSocket: fakeSocket }, findCubes: async () => ({ ok: true, asked: 0, cubes: [] }) })
        const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
        servers.push(server)
        const port = server.address().port
        const raw = (method, route, body, headers = {}) => new Promise((resolve, reject) => {
            const data = body === undefined ? null : JSON.stringify(body)
            const req = http.request({ host: '127.0.0.1', port, method, path: `/laser/api${route}`, headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
                let text = ''
                res.on('data', (c) => { text += c })
                res.on('end', () => { let json = null; try { json = JSON.parse(text) } catch { /* empty */ } resolve({ status: res.statusCode, headers: res.headers, body: json }) })
            })
            req.on('error', reject)
            req.end(data || undefined)
        })
        return { port, raw }
    }
    const POSTS = [['/arm', { armed: true, confirm: ARM_PHRASE }], ['/arm', { armed: false }], ['/frame', { points: [[0, 0.5, 1, 0, 0]] }], ['/alive', {}], ['/find', {}], ['/config', { cubes: [{ serial: SERIAL_A, ip: '10.42.0.5' }] }], ['/blackout', {}]]

    it('the review\'s repro, CSRF: the preflight passes, but a POST from another website is refused on every route', async () => {
        const { raw } = await startWithCors()
        const pre = await raw('OPTIONS', '/arm', undefined, { origin: 'http://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' })
        expect(pre.status).toBe(204)
        for (const [route, body] of POSTS) {
            const out = await raw('POST', route, body, { origin: 'http://evil.example' })
            expect(out.status, `${route} ${JSON.stringify(body)}`).toBe(403)
            expect(out.body.error).toBe('cross-site request')
        }
        expect((await raw('GET', '/state')).body.armed).toBe(false)
    })

    it('the review\'s repro, DNS rebinding: a foreign Host is refused on every route, with or without an Origin', async () => {
        const { raw, port } = await startWithCors()
        for (const headers of [{ host: `evil.example:${port}` }, { host: `evil.example:${port}`, origin: `http://evil.example:${port}` }, { host: 'diiii.localhost.evil.example' }, { host: 'localhost.evil.example' }]) {
            for (const [route, body] of POSTS) {
                const out = await raw('POST', route, body, headers)
                expect(out.status, `${route} ${headers.host}`).toBe(403)
                expect(out.body.error).toBe('foreign host')
            }
        }
        expect((await raw('GET', '/state')).body.armed).toBe(false)
    })

    it.each([
        ['Origin "null" (a sandboxed frame or a file)', (p) => ({ origin: 'null' })],
        ['another port on the same name', (p) => ({ origin: `http://127.0.0.1:${p + 1}` })],
        ['https on the same name and port', (p) => ({ origin: `https://127.0.0.1:${p}` })],
        ['a sibling name under diiii.localhost', (p) => ({ host: 'diiii.localhost', origin: 'http://evil.diiii.localhost' })],
        ['a Referer from another site, no Origin', (p) => ({ referer: 'http://evil.example/page' })]
    ])('refuses a cross-site request: %s', async (_, make) => {
        const { raw, port } = await startWithCors()
        const out = await raw('POST', '/arm', { armed: true, confirm: ARM_PHRASE }, make(port))
        expect(out.status).toBe(403)
        expect(out.body.error).toBe('cross-site request')
    })

    it.each([
        ['127.0.0.1 with its own Origin', (p) => ({ origin: `http://127.0.0.1:${p}` })],
        ['localhost', (p) => ({ host: `localhost:${p}`, origin: `http://localhost:${p}` })],
        ['[::1]', (p) => ({ host: `[::1]:${p}`, origin: `http://[::1]:${p}` })],
        ['diiii.localhost on :80 (the door)', () => ({ host: 'diiii.localhost', origin: 'http://diiii.localhost' })],
        ['diiii.localhost:80 written out', () => ({ host: 'diiii.localhost:80', origin: 'http://diiii.localhost' })],
        ['a tree under diiii.localhost', () => ({ host: 'laser-ops.diiii.localhost', origin: 'http://laser-ops.diiii.localhost' })],
        ['a same-origin Referer, no Origin', (p) => ({ referer: `http://127.0.0.1:${p}/raw` })],
        ['curl on this machine: no Origin, no Referer', () => ({})]
    ])('arms and disarms from this machine\'s own page: %s', async (_, make) => {
        const { raw, port } = await startWithCors()
        expect((await raw('POST', '/arm', { armed: true, confirm: ARM_PHRASE }, make(port))).body).toMatchObject({ ok: true, armed: true })
        expect((await raw('POST', '/blackout', {}, make(port))).status).toBe(200)
        expect((await raw('POST', '/arm', { armed: false }, make(port))).body).toMatchObject({ ok: true, armed: false })
    })

    it('the install\'s DI_LOCAL_NAME and a named HOST are its own names', async () => {
        process.env.DI_LOCAL_NAME = 'studio.localhost'
        process.env.HOST = 'aylmo.lan'
        const { raw } = await startWithCors()
        expect((await raw('POST', '/blackout', {}, { host: 'studio.localhost', origin: 'http://studio.localhost' })).status).toBe(200)
        expect((await raw('POST', '/blackout', {}, { host: 'aylmo.lan:4000', origin: 'http://aylmo.lan:4000' })).status).toBe(200)
        expect((await raw('POST', '/blackout', {}, { host: 'other.localhost', origin: 'http://other.localhost' })).body.error).toBe('foreign host')
    })

    it('no Origin and no Referer is allowed only from a loopback peer', () => {
        expect(ownPageRefusal({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' } })).toBe(null)
        expect(ownPageRefusal({ socket: { remoteAddress: '::1' }, headers: { host: 'diiii.localhost' } })).toBe(null)
        expect(ownPageRefusal({ socket: { remoteAddress: '10.42.0.5' }, headers: { host: 'localhost' } }).error).toBe('no origin')
        expect(ownPageRefusal({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }).error).toBe('foreign host')
        expect(sameOriginAsHost('https://diiii.localhost', 'diiii.localhost:443')).toBe(true)
        expect(sameOriginAsHost('http://diiii.localhost', 'diiii.localhost:443')).toBe(false)
        expect(sameOriginAsHost('ftp://diiii.localhost', 'diiii.localhost')).toBe(false)
    })

    it('Use these: still beams follow the serial only; a box at a hand-written cube\'s old address does not inherit them', async () => {
        const hand = { cubes: [{ id: 'cube-2', name: 'Right', ip: '10.42.0.12', stillBeams: [{ x: 0.2, y: 0.5 }] }] }
        const merged = mergeConfig(hand, [{ serial: SERIAL_B, ip: '10.42.0.12', name: '' }])
        expect(merged.cubes).toEqual([{ id: 'cube-2', name: 'Right', ip: '10.42.0.12', serial: SERIAL_B }])
        expect(merged.dropped).toEqual([{ id: 'cube-2', serial: SERIAL_B, ip: '10.42.0.12', stillBeams: 1 }])
        // A cube in the file WITH a serial is never matched by address: another serial is a new cube.
        const known = { cubes: [{ id: 'cube-1', ip: '10.42.0.12', serial: SERIAL_A, stillBeams: [{ x: 0.2, y: 0.5 }] }] }
        expect(mergeConfig(known, [{ serial: SERIAL_B, ip: '10.42.0.12', name: '' }]).cubes).toEqual([{ id: 'cube-1', name: 'cube-1', ip: '10.42.0.12', serial: SERIAL_B }])
        // Through the route: the answer names what was dropped.
        const { call } = await startServer({ config: hand })
        const out = await call('POST', '/config', { cubes: [{ serial: SERIAL_B, ip: '10.42.0.12' }] })
        expect(out.status).toBe(200)
        expect(out.body.droppedStillBeams).toEqual([{ id: 'cube-2', serial: SERIAL_B, ip: '10.42.0.12', stillBeams: 1 }])
    })

    it('at run time, a box answering a cube\'s address with another serial gets none of its still beams', async () => {
        const { call } = await startServer({ config: { cubes: [{ id: 'cube-1', ip: '10.42.0.12', serial: SERIAL_A, stillBeams: [{ x: 0.2, y: 0.5 }] }] } })
        expect((await call('GET', '/state')).body.cubes[0]).toMatchObject({ stillBeams: 1, serialMismatch: false })
        fakeSockets[0].handlers.message(infoAnswer({ serial: SERIAL_B }), { address: '10.42.0.12' })
        expect((await call('GET', '/state')).body.cubes[0]).toMatchObject({ stillBeams: 0, serialMismatch: true })
        fakeSockets[0].handlers.message(infoAnswer({ serial: SERIAL_A }), { address: '10.42.0.12' })
        expect((await call('GET', '/state')).body.cubes[0]).toMatchObject({ stillBeams: 1, serialMismatch: false })
    })

    it('a cube address is one unicast host: broadcast, network, multicast and loopback are refused', async () => {
        delete process.env.DI_LASER_TEST_LOOPBACK
        for (const ip of ['255.255.255.255', '0.0.0.0', '0.1.2.3', '224.0.0.1', '239.255.255.250', '240.0.0.1', '10.42.0.255', '10.42.0.0', '192.168.1.255', '127.0.0.1', '127.0.0.2']) {
            expect(cubeAddressProblem(ip), ip).not.toBe(null)
            expect(validatePicked([{ serial: SERIAL_A, ip }]).ok, ip).toBe(false)
        }
        for (const ip of ['10.42.0.5', '192.168.88.30', '172.16.0.9']) expect(validatePicked([{ serial: SERIAL_A, ip }]).ok, ip).toBe(true)
        // The test flag opens 127.0.0.x, and only that.
        process.env.DI_LASER_TEST_LOOPBACK = '1'
        expect(cubeAddressProblem('127.0.0.2')).toBe(null)
        expect(cubeAddressProblem('127.0.1.2')).not.toBe(null)
        expect(cubeAddressProblem('127.0.0.255')).not.toBe(null)
        // laser.json too: a refused address is not used, and the state says why.
        delete process.env.DI_LASER_TEST_LOOPBACK
        const { call } = await startServer({ config: { cubes: [{ id: 'cube-1', ip: '255.255.255.255' }, { id: 'cube-2', ip: '127.0.0.1' }, { id: 'cube-3', ip: '10.42.0.7' }] } })
        const cubes = (await call('GET', '/state')).body.cubes
        expect(cubes.map((c) => c.ip)).toEqual([null, null, '10.42.0.7'])
        expect(cubes[0].addressRefused).toMatch(/broadcast/)
        expect(cubes[1].addressRefused).toMatch(/loopback/)
        expect(cubes[2].addressRefused).toBe(null)
    })

    it('Find cubes searches only private networks (RFC 1918) and lists what it skipped', () => {
        const nets = localNetworks({
            eth0: [{ family: 'IPv4', address: '10.42.0.1', internal: false }],
            wifi: [{ family: 'IPv4', address: '192.168.88.20', internal: false }],
            docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
            tailscale0: [{ family: 'IPv4', address: '100.67.142.5', internal: false }],
            uplink: [{ family: 'IPv4', address: '203.0.113.5', internal: false }],
            notprivate: [{ family: 'IPv4', address: '172.32.0.1', internal: false }],
            ll: [{ family: 'IPv4', address: '169.254.3.3', internal: false }]
        })
        expect(nets.map((n) => n.prefix)).toEqual(['10.42.0', '192.168.88', '172.17.0'])
        expect(nets.skipped.map((s) => [s.name, s.kind])).toEqual([
            ['tailscale0', 'Tailscale/CGNAT (100.64/10)'], ['uplink', 'public'], ['notprivate', 'public'], ['ll', 'link-local (169.254/16)']
        ])
        expect(isPrivateIPv4('172.31.255.1')).toBe(true)
        expect(isPrivateIPv4('100.64.0.1')).toBe(false)
    })
})
