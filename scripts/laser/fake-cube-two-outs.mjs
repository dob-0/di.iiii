#!/usr/bin/env node
// A rehearsal of the TouchDesigner-style Laser Out against TWO FAKE LaserCubes (2026-10-14).
//
// Two fake cubes stand on 127.0.0.2 and 127.0.0.3 (UDP 45457 commands, 45458 data), each answering
// the info question with its own serial and recording output on/off and the points it is sent. The
// real laser routes (serverXR/src/routes/laserRoutes.js: real engine, real sockets, real timers, the
// real one-address probe) run on 127.0.0.1, and the script plays two Laser Outs over HTTP:
//   each Out resolves its own IP; a second Out on the same cube is refused; a wrong serial, a silent
//   address and a public address are said as such; the first ON takes the phrase and arms only that
//   Out's cube; the second Out's ON is one click; OFF stops one cube while the other keeps drawing;
//   disarm-all darkens both and the next ON asks the phrase again.
// Nothing leaves the machine. It never talks to a real cube and never touches an installed di.
// Run: node scripts/laser/fake-cube-two-outs.mjs [--json out.json]   (exit 1 on any failed check)
import dgram from 'node:dgram'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

process.env.DI_LASER_TEST_LOOPBACK = '1'
const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const express = require(path.join(root, 'serverXR/node_modules/express'))
const { registerLaserRoutes } = require(path.join(root, 'serverXR/src/routes/laserRoutes.js'))
const { ARM_PHRASE } = require(path.join(root, 'serverXR/src/laser/laserEngine.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i > 0 ? process.argv[i + 1] : null })()

const fakeCube = async (ip, serial) => {
    const cube = { ip, serial, out: false, outputs: [], points: 0, pointsWhileOff: 0 }
    const cmd = dgram.createSocket('udp4')
    const data = dgram.createSocket('udp4')
    const info = () => {
        const b = Buffer.alloc(64)
        b[0] = 0x77; b[3] = 1; b[4] = 7; b[5] = (cube.out ? 1 : 0) | 2
        b.writeUInt32LE(30000, 10); b.writeUInt32LE(35000, 14); b.writeUInt16LE(5800, 19); b.writeUInt16LE(6000, 21)
        b.writeInt8(31, 24); b[25] = 2; Buffer.from(serial, 'hex').copy(b, 26)
        Buffer.from(ip.split('.').map(Number)).copy(b, 32); b[37] = 3; b.write('FAKE cube (rehearsal)', 38, 'latin1')
        return b
    }
    cmd.on('message', (m, r) => {
        if (m[0] === 0x77) cmd.send(info(), r.port, r.address)
        if (m[0] === 0x80) { cube.out = m[1] === 1; cube.outputs.push(cube.out) }
        if (m[0] === 0x8a) cmd.send(Buffer.from([0x8a, 0, 0x70, 0x17]), r.port, r.address)
    })
    data.on('message', (m, r) => {
        if (m[0] !== 0xa9) return
        const n = Math.floor((m.length - 4) / 10)
        cube.points += n
        if (!cube.out) cube.pointsWhileOff += n
        data.send(Buffer.from([0x8a, 0, 0x70, 0x17]), r.port, r.address)
    })
    await new Promise((r) => cmd.bind(45457, ip, r))
    await new Promise((r) => data.bind(45458, ip, r))
    cube.close = () => { cmd.close(); data.close() }
    return cube
}

const A = await fakeCube('127.0.0.2', '8cbfea06ab30')
const B = await fakeCube('127.0.0.3', '8cbfea06aa5c')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-two-outs-'))
const app = express()
const lasers = registerLaserRoutes(app, { dataDir, log: { warn: () => {} } })
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
const base = `http://127.0.0.1:${server.address().port}/laser/api`
const call = async (route, body) => {
    const res = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
}

const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const circle = (r, n = 200) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), 0.5 + 0.3 * r * Math.sin((2 * Math.PI * i) / n), 1, 0, 0])
let keep = true
const holding = new Map()
const keepAlive = (async () => { while (keep) { for (const [out, cube] of holding) await call('/alive', { cube, out }); await wait(40) } })()

try {
    const ra = await call('/resolve', { ip: A.ip, out: 'out-left', name: 'Left' })
    const rb = await call('/resolve', { ip: B.ip, out: 'out-right', name: 'Right' })
    check('Out 1 resolves 127.0.0.2 to its cube', ra.body.status === 'answering' && ra.body.serial === A.serial, `${ra.body.cube?.id} serial ${ra.body.serial}`)
    check('Out 2 resolves 127.0.0.3 to another cube', rb.body.status === 'answering' && rb.body.serial === B.serial && rb.body.cube?.id !== ra.body.cube?.id, `${rb.body.cube?.id} serial ${rb.body.serial}`)
    const a = ra.body.cube.id
    const b = rb.body.cube.id
    const dup = await call('/resolve', { ip: A.ip, out: 'out-right' })
    check('a second Out on the same cube is refused', dup.status === 409 && /one Out per cube/.test(dup.body.error), dup.body.error)
    const wrong = await call('/resolve', { ip: B.ip, serial: A.serial, out: 'out-x' })
    check('a wrong serial is said as one', wrong.body.status === 'wrong-serial', wrong.body.error)
    const silent = await call('/resolve', { ip: '127.0.0.4', out: 'out-x' })
    check('a silent address is no answer', silent.body.status === 'no-answer', silent.body.error)
    const pub = await call('/resolve', { ip: '8.8.8.8', out: 'out-x' })
    check('a public address is refused before anything is sent', pub.status === 400 && pub.body.status === 'refused', pub.body.error)

    await call('/frame', { cube: a, points: circle(0.5), out: 'out-left' })
    await call('/frame', { cube: b, points: circle(0.3), out: 'out-right' })
    holding.set('out-left', a).set('out-right', b)
    const bare = await call('/arm', { armed: true, cube: a, out: 'out-left' })
    check('the first ON without the phrase is refused', bare.status === 403 && bare.body.needsPhrase, bare.body.error)
    const on1 = await call('/arm', { armed: true, cube: a, out: 'out-left', confirm: ARM_PHRASE })
    await wait(300)
    check('the first ON with the phrase arms only Out 1\'s cube', on1.body.ok && A.out && !B.out && A.points > 0 && B.points === 0, `A ${A.points} points, B ${B.points}`)
    const on2 = await call('/arm', { armed: true, cube: b, out: 'out-right' })
    await wait(300)
    check('Out 2\'s ON is one click (no phrase)', on2.body.ok && B.out && B.points > 0, `B ${B.points} points`)
    const aBefore = A.points
    const off2 = await call('/arm', { armed: false, cube: b, out: 'out-right' })
    const bAtOff = B.points
    await wait(300)
    check('OFF on Out 2 stops cube B; cube A keeps drawing', off2.body.ok && !B.out && B.points - bAtOff < 400 && A.points > aBefore + 1000, `A +${A.points - aBefore}, B +${B.points - bAtOff} after OFF (park only)`)
    const all = await call('/arm', { armed: false })
    await wait(100)
    check('Disarm all darkens both', all.body.ok && !A.out && !B.out, `outputs A ${A.outputs.at(-1)}, B ${B.outputs.at(-1)}`)
    const again = await call('/arm', { armed: true, cube: b, out: 'out-right' })
    check('after Disarm all the next ON asks the phrase again', again.status === 403 && again.body.needsPhrase, again.body.error)
    check('no cube got a lit stream while its output was off', A.pointsWhileOff < 400 && B.pointsWhileOff < 400, `A ${A.pointsWhileOff}, B ${B.pointsWhileOff} (park points only)`)
} finally {
    keep = false
    await keepAlive
    await lasers.close()
    server.close()
    A.close(); B.close()
}
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), checks }, null, 2))
process.exit(failed ? 1 : 0)
