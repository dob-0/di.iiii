// @vitest-environment node
// The TouchDesigner-style Laser Out (2026-10-14): each Out names its cube by IP, the server checks
// it with the info question and keys it by serial, one Out per cube, and ON/OFF per cube with the
// sign-off phrase once per run. Never a real cube: every address here is a 127.0.0.x fake.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerLaserRoutes } = require('../routes/laserRoutes')
const { ARM_PHRASE, CLAIM_TTL_MS } = require('./laserEngine')
const { outAddressProblem } = require('./laserFind')
const proto = require('./lasercubeProtocol')

const A = { ip: '127.0.0.2', serial: '8cbfea06ab30' }
const B = { ip: '127.0.0.3', serial: '8cbfea06aa5c' }
const LIT = [[0, 0.5, 1, 0, 0], [0.3, 0.6, 1, 0, 0], [-0.3, 0.7, 0, 1, 0]]

const infoAnswer = (serial) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77; b[3] = 1; b[4] = 7
    b.writeUInt32LE(30000, 10); b.writeUInt32LE(35000, 14); b.writeUInt16LE(5800, 19); b.writeUInt16LE(6000, 21)
    b[24] = 31; b[25] = 2
    Buffer.from(serial, 'hex').copy(b, 26)
    b.write('LaserCube Ultra', 38, 'latin1')
    return b
}

const sockets = []
const fakeSocket = () => {
    const s = { sent: [], handlers: {}, send: (buf, port, ip, done) => { s.sent.push({ buf: Buffer.from(buf), port, ip }); done?.() }, on: (ev, fn) => { s.handlers[ev] = fn }, bind: () => {}, close: () => {} }
    sockets.push(s)
    return s
}
const outputs = (ip) => sockets.flatMap((s) => s.sent).filter((m) => m.ip === ip && m.buf[0] === proto.CMD.SET_OUTPUT).map((m) => m.buf[1])

let clock
let servers = []
let savedFlag
beforeEach(() => {
    savedFlag = process.env.DI_LASER_TEST_LOOPBACK
    process.env.DI_LASER_TEST_LOOPBACK = '1'
    sockets.length = 0
    clock = 1_000_000
})
afterEach(async () => {
    if (savedFlag === undefined) delete process.env.DI_LASER_TEST_LOOPBACK; else process.env.DI_LASER_TEST_LOOPBACK = savedFlag
    for (const s of servers) await new Promise((r) => s.close(r))
    servers = []
})

// Two fake cubes answer the probe; anything else is silence.
const cubesOnNet = { [A.ip]: A.serial, [B.ip]: B.serial }
const probeCube = async (ip) => {
    const serial = cubesOnNet[ip]
    if (!serial) return null
    const info = proto.parseFullInfo(infoAnswer(serial))
    const entry = { serial, ip, modelName: info.modelName, firmware: info.firmware }
    Object.defineProperty(entry, 'info', { value: info, enumerable: false })
    return entry
}

const start = async (config) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-out-'))
    if (config) { fs.mkdirSync(path.join(dataDir, 'laser')); fs.writeFileSync(path.join(dataDir, 'laser', 'laser.json'), JSON.stringify(config)) }
    const app = express()
    const lasers = registerLaserRoutes(app, { dataDir, log: null, probeCube, engineOptions: { createSocket: fakeSocket, now: () => clock, setInterval: () => null, clearInterval: () => {} } })
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    servers.push(server)
    const base = `http://127.0.0.1:${server.address().port}/laser/api`
    const call = async (route, body) => {
        const res = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: res.status, body: await res.json() }
    }
    return { dataDir, lasers, call }
}

describe('a Laser Out names its cube by IP', () => {
    it('two Outs, two IPs: each resolves to its own cube, keyed by serial, written to laser.json', async () => {
        const { call, dataDir } = await start()
        const a = await call('/resolve', { ip: A.ip, out: 'out-a', name: 'Left' })
        expect(a.body).toMatchObject({ ok: true, status: 'answering', serial: A.serial, modelName: 'LaserCube Ultra' })
        const b = await call('/resolve', { ip: B.ip, out: 'out-b' })
        expect(b.body).toMatchObject({ ok: true, status: 'answering', serial: B.serial })
        expect(a.body.cube.id).not.toBe(b.body.cube.id)
        const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'laser', 'laser.json'), 'utf8'))
        expect(file.cubes).toEqual([
            { id: 'cube-1', name: 'Left', ip: A.ip, serial: A.serial },
            { id: 'cube-2', name: 'cube-2', ip: B.ip, serial: B.serial }
        ])
        const state = (await call('/state')).body
        expect(state.cubes.find((c) => c.id === a.body.cube.id)).toMatchObject({ ip: A.ip, claimedBy: 'out-a', armed: false })
    })

    it('says no answer, wrong serial, and refuses what is not a private unicast address', async () => {
        const { call } = await start()
        expect((await call('/resolve', { ip: '127.0.0.4', out: 'o' })).body).toMatchObject({ ok: false, status: 'no-answer' })
        expect((await call('/resolve', { ip: B.ip, serial: A.serial, out: 'o' })).body).toMatchObject({ ok: false, status: 'wrong-serial', serial: B.serial, expected: A.serial })
        for (const ip of ['8.8.8.8', '192.168.1.255', '10.0.0.0', '224.0.0.1', '255.255.255.255', 'cube', '']) {
            const out = await call('/resolve', { ip, out: 'o' })
            expect(out.status, ip).toBe(400)
            expect(out.body.status).toBe('refused')
        }
        expect(outAddressProblem('192.168.1.51')).toBeNull()
        expect(outAddressProblem('10.0.0.7')).toBeNull()
        expect(outAddressProblem('172.20.0.7')).toBeNull()
        expect(outAddressProblem('100.100.0.7')).toMatch(/not a private/)
        delete process.env.DI_LASER_TEST_LOOPBACK
        expect(outAddressProblem('127.0.0.2')).toMatch(/loopback/)
    })

    it('one sender per cube: a second Out on the same cube is refused with a clear message, until the first lets go', async () => {
        const { call } = await start()
        const a = await call('/resolve', { ip: A.ip, out: 'out-a' })
        const second = await call('/resolve', { ip: A.ip, out: 'out-b' })
        expect(second.status).toBe(409)
        expect(second.body.error).toMatch(/already driven by another Laser Out — one Out per cube/)
        const frame = await call('/frame', { cube: a.body.cube.id, points: LIT, out: 'out-b' })
        expect(frame.status).toBe(400)
        expect(frame.body.error).toMatch(/one Out per cube/)
        expect((await call('/frame', { cube: a.body.cube.id, points: LIT })).status).toBe(400)
        expect((await call('/arm', { armed: true, cube: a.body.cube.id, out: 'out-b', confirm: ARM_PHRASE })).body.error).toMatch(/one Out per cube/)
        // The first Out goes quiet longer than the claim: the cube is free for the second.
        clock += CLAIM_TTL_MS + 1
        expect((await call('/resolve', { ip: A.ip, out: 'out-b' })).body).toMatchObject({ ok: true, status: 'answering' })
    })
})

describe('ON/OFF per Laser Out', () => {
    it('the first ON asks the phrase, then one click per Out arms only that Out\'s cube; OFF is one click; disarm-all asks again', async () => {
        const { call } = await start()
        const a = (await call('/resolve', { ip: A.ip, out: 'out-a' })).body.cube.id
        const b = (await call('/resolve', { ip: B.ip, out: 'out-b' })).body.cube.id

        const bare = await call('/arm', { armed: true, cube: a, out: 'out-a' })
        expect(bare.status).toBe(403)
        expect(bare.body).toMatchObject({ ok: false, needsPhrase: true })
        expect((await call('/arm', { armed: true, cube: a, out: 'out-a', confirm: 'yes' })).status).toBe(403)
        expect(outputs(A.ip)).not.toContain(1)

        expect((await call('/arm', { armed: true, cube: a, out: 'out-a', confirm: ARM_PHRASE })).body).toMatchObject({ ok: true, cubeArmed: true, signedOff: true })
        expect(outputs(A.ip)).toContain(1)
        expect(outputs(B.ip)).not.toContain(1)
        let state = (await call('/state')).body
        expect(state.signedOff).toBe(true)
        expect(JSON.stringify(state)).not.toContain(ARM_PHRASE)
        expect(state.cubes.find((c) => c.id === a).armed).toBe(true)
        expect(state.cubes.find((c) => c.id === b).armed).toBe(false)

        // One click for the second Out: no phrase, only its cube.
        expect((await call('/arm', { armed: true, cube: b, out: 'out-b' })).body).toMatchObject({ ok: true, cubeArmed: true })
        expect(outputs(B.ip)).toContain(1)

        // OFF is one click and touches only that cube.
        const offsA = outputs(A.ip).length
        expect((await call('/arm', { armed: false, cube: b, out: 'out-b' })).body).toMatchObject({ ok: true, cubeArmed: false })
        expect(outputs(B.ip).at(-1)).toBe(0)
        expect(outputs(A.ip).length).toBe(offsA)
        state = (await call('/state')).body
        expect(state.cubes.find((c) => c.id === a).armed).toBe(true)

        // Disarm-all switches everything off and ends the run's sign-off.
        expect((await call('/arm', { armed: false })).body).toMatchObject({ ok: true, armed: false })
        expect(outputs(A.ip).at(-1)).toBe(0)
        expect((await call('/state')).body.signedOff).toBe(false)
        expect((await call('/arm', { armed: true, cube: b, out: 'out-b' })).body).toMatchObject({ ok: false, needsPhrase: true })
    })

    it('OFF is never refused, whoever asks; ON is refused for a cube that has not answered', async () => {
        const { call, lasers } = await start({ cubes: [{ id: 'cube-1', ip: '127.0.0.9', serial: 'aaaaaaaaaaaa' }] })
        expect((await call('/arm', { armed: true, cube: 'cube-1', confirm: ARM_PHRASE })).body.error).toMatch(/not answered/)
        expect(lasers.getEngine().state().signedOff).toBe(false)
        expect((await call('/arm', { armed: false, cube: 'cube-1', out: 'anyone' })).body).toMatchObject({ ok: true })
    })

    it('an ON cube cannot be moved to another address from under its Out', async () => {
        const { call } = await start()
        const a = (await call('/resolve', { ip: A.ip, out: 'out-a' })).body.cube.id
        await call('/arm', { armed: true, cube: a, out: 'out-a', confirm: ARM_PHRASE })
        // The other cube's address, typed into the same Out while A is ON: B is another serial — fine,
        // but A's own serial now answering elsewhere would be a move, refused while ON.
        cubesOnNet['127.0.0.5'] = A.serial
        try {
            const moved = await call('/resolve', { ip: '127.0.0.5', out: 'out-a' })
            expect(moved.status).toBe(409)
            expect(moved.body.error).toMatch(/is ON at 127\.0\.0\.2: switch it OFF/)
        } finally {
            delete cubesOnNet['127.0.0.5']
        }
    })
})
