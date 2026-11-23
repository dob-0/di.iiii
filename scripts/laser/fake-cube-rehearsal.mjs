#!/usr/bin/env node
// A rehearsal of the laser engine against a FAKE LaserCube on the loopback (2026-10-14).
//
// What it does: starts a fake cube on 127.0.0.2 (UDP 45457 commands, 45458 data — the LaserCube
// ports) that answers the info question, empties its buffer on CLEAR_RINGBUFFER 0x8d like the protocol spec's table, keeps a 6000-point ring
// buffer played at 30 kpps, answers each data message with its free count and records every point
// and every output on/off with its arrival time. Then it runs the real engine (serverXR/src/laser/
// laserEngine.js, real sockets, real timers) against it and measures:
//   points a second reaching the cube, the longest lit and blank step the cube was sent (frame
//   switches included), time to dark on each stop (signal loss, still beam, disarm, shutdown) and
//   that the park-at-centre points arrive before output-off, the cube's output flag after a disarm,
//   and the colour level under the temperature limiter.
// Nothing leaves the machine: the cube address is 127.0.0.2. It never talks to a real cube and never
// touches an installed di. Run: node scripts/laser/fake-cube-rehearsal.mjs [--runs 5] [--json out.json]
import dgram from 'node:dgram'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createRingBuffer } from './fake-cube-buffer.mjs'

// The engine only talks to loopback cubes when this flag is set (laserFind.js); it is set for THIS process
// only, never on an installed di (this is why the script used to crash without it).
process.env.DI_LASER_TEST_LOOPBACK = '1'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { createLaserEngine, ARM_PHRASE } = require(path.join(root, 'serverXR/src/laser/laserEngine.js'))
const proto = require(path.join(root, 'serverXR/src/laser/lasercubeProtocol.js'))
const { generateShape, LASER_SHAPES } = await import(path.join(root, 'src/project/nodes/laser.shape/laserShapes.js'))

const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d }
const RUNS = Number(arg('--runs', 5))
const CUBE_IP = '127.0.0.2'
const RATE = 30000
const SIZE = 6000
const now = () => Number(process.hrtime.bigint()) / 1e6
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// THE FAKE CUBE
const fakeCube = async () => {
    const cube = { out: false, interlock: true, temp: 31, bufferAnswers: false, points: [], outputs: [], clears: [] }
    const ring = createRingBuffer({ rate: RATE, size: SIZE, now })
    ring.outputOn = () => cube.out
    cube.ring = ring
    Object.defineProperty(cube, 'overflow', { get: () => ring.overflow })
    const cmd = dgram.createSocket('udp4')
    const data = dgram.createSocket('udp4')
    const play = () => ring.play()
    const free = () => ring.free()
    const info = () => {
        const b = Buffer.alloc(64)
        b[0] = 0x77; b[3] = 1; b[4] = 7; b[5] = (cube.out ? 1 : 0) | (cube.interlock ? 2 : 0)
        b.writeUInt32LE(RATE, 10); b.writeUInt32LE(35000, 14); b.writeUInt16LE(free(), 19); b.writeUInt16LE(SIZE, 21)
        b[23] = 0; b.writeInt8(cube.temp, 24); b[25] = 2; Buffer.from([0xfa, 0xce, 0, 0, 0, 1]).copy(b, 26)
        Buffer.from([127, 0, 0, 2]).copy(b, 32); b[37] = 3; b.write('FAKE cube (rehearsal)', 38, 'latin1')
        return b
    }
    cmd.on('message', (m, r) => {
        const t = now()
        if (m[0] === 0x77) cmd.send(info(), r.port, r.address)
        if (m[0] === 0x78) cube.bufferAnswers = m[1] === 1
        if (m[0] === 0x80) { cube.out = m[1] === 1; cube.outputs.push({ t, on: cube.out }) }
        if (m[0] === 0x8d) { play(); cube.clears.push({ t, dropped: ring.clear() }) }
        if (m[0] === 0x8a) { const f = free(); cmd.send(Buffer.from([0x8a, 0, f & 0xff, f >> 8]), r.port, r.address) }
    })
    data.on('message', (m, r) => {
        const t = now()
        if (m[0] !== 0xa9) return
        const n = (m.length - 4) / 10
        play()
        for (let i = 0; i < n; i += 1) {
            const o = 4 + i * 10
            cube.points.push({ t, x: m.readUInt16LE(o), y: m.readUInt16LE(o + 2), r: m.readUInt16LE(o + 4), g: m.readUInt16LE(o + 6), b: m.readUInt16LE(o + 8) })
        }
        ring.feed(n)
        if (cube.bufferAnswers) { const f = free(); data.send(Buffer.from([0xa9, f & 0xff, f >> 8]), r.port, r.address) }
    })
    await new Promise((res) => cmd.bind(proto.PORT.CMD, CUBE_IP, res))
    await new Promise((res) => data.bind(proto.PORT.DATA, CUBE_IP, res))
    cube.close = () => { cmd.close(); data.close() }
    return cube
}

const field = (v) => (v / 0xfff) * 2 - 1
const lit = (p) => p.r || p.g || p.b
const steps = (pts) => {
    let maxLit = 0; let maxBlank = 0
    for (let i = 1; i < pts.length; i += 1) {
        const d = Math.max(Math.abs(field(pts[i].x) - field(pts[i - 1].x)), Math.abs(field(pts[i].y) - field(pts[i - 1].y)))
        if (lit(pts[i])) maxLit = Math.max(maxLit, d); else maxBlank = Math.max(maxBlank, d)
    }
    return { maxLit, maxBlank }
}
const offAfter = (cube, t0) => cube.outputs.find((o) => !o.on && o.t >= t0)
// From t0: when output-off arrived (time to dark); whether the park (blank points at the centre
// 0x800) arrived AFTER the stop's ring-buffer clear, so it is kept and the galvo walks to the centre
// — and whether it came before or after the off (UDP on two ports: no order is promised); how many
// lit points arrived after the off.
const stopTimes = (cube, t0) => {
    const off = offAfter(cube, t0)
    const clear = cube.clears.filter((c) => c.t >= t0 && (!off || c.t <= off.t + 50)).at(-1)
    const park = cube.points.find((p) => p.t >= t0 && (!clear || p.t >= clear.t) && !lit(p) && p.x === 0x800 && p.y === 0x800)
    return {
        offMs: off ? off.t - t0 : null,
        parkMs: park ? park.t - t0 : null,
        parkKept: Boolean(park),
        parkBeforeOff: Boolean(park && off && park.t <= off.t),
        litAfterOff: off ? cube.points.filter((p) => p.t > off.t && lit(p)).length : null
    }
}
const range = (xs) => ((xs = xs.filter((x) => x !== null)).length ? `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}` : 'n/a')

const cube = await fakeCube()
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-rehearsal-'))
fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify({ cubes: [{ id: 'cube-1', name: 'fake', ip: CUBE_IP }] }))
let engine = createLaserEngine({ dataDir: dir, log: { warn: () => {} } })
const armIt = async () => {
    for (let i = 0; i < 40 && !engine.state().cubes[0].info; i += 1) await wait(50)
    const r = engine.arm({ armed: true, confirm: ARM_PHRASE })
    if (!r.ok) throw new Error(`arm refused: ${r.error}`)
}
const hold = async (frameFor, ms, every = 40) => {
    const end = now() + ms
    let i = 0
    while (now() < end) { const f = frameFor(i); if (f) engine.setFrame('all', f); else engine.alive('all'); i += 1; await wait(every) }
}
const result = { runs: RUNS, stream: [], noFrame: [], still: [], disarm: [], shutdown: null, flagsAfterDisarm: null, temperature: null }
try {
    for (let run = 0; run < RUNS; run += 1) {
        await armIt()
        // Streaming: the eight shapes, a new one every 40 ms (frame switches, bridges), for 2 s.
        const t0 = now()
        const from = cube.points.length
        const ring0 = cube.ring.snapshot()
        await hold((i) => generateShape({ shape: LASER_SHAPES[i % 8], size: 0.3 + 0.2 * Math.sin(i), height: 0.5, points: 500 }), 2000)
        const got = cube.points.slice(from)
        const secs = (now() - t0) / 1000
        result.stream.push({ secs, pointsPerSecond: Math.round(got.length / secs), litPerSecond: Math.round(got.filter(lit).length / secs), ...steps(got), overflow: cube.overflow, underruns: cube.ring.snapshot().underruns - ring0.underruns, missing: cube.ring.snapshot().missing - ring0.missing })
        // Signal loss: no frame, no keep-alive.
        const tLoss = now()
        await wait(400)
        result.noFrame.push(stopTimes(cube, tLoss))
        // Still beam: a dot, kept alive.
        engine.setFrame('all', Array.from({ length: 60 }, () => [0.2, 0.5, 0, 1, 0]))
        const tStill = now()
        await hold(() => null, 400, 20)
        result.still.push(stopTimes(cube, tStill))
        // Disarm while a circle streams.
        engine.arm({ armed: false })
        await armIt()
        await hold(() => generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 500 }), 300)
        const tDisarm = now()
        engine.arm({ armed: false })
        await wait(100)
        result.disarm.push(stopTimes(cube, tDisarm))
    }
    // The cube's own flag after a disarm, through the engine's info poll.
    await wait(1200)
    const info = engine.state().cubes[0].info
    result.flagsAfterDisarm = { cubeOut: cube.out, statusFlags: info.statusFlags, outputEnabled: info.outputEnabled, interlockEnabled: info.interlockEnabled }
    // Temperature: the cube at 70 °C → 1 − (10/15) × 0.5 = 0.667 once the 15 s average (150 samples
    // at 100 ms) has filled with it; measured over the last second of 16 s.
    cube.temp = 70
    await wait(1200)
    await armIt()
    const tT = now()
    await hold(() => generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 500 }), 16000)
    const maxG = Math.max(...cube.points.filter((p) => p.t >= tT + 15000).map((p) => p.g))
    result.temperature = { cubeC: 70, maxGreen: maxG, scale: Math.round((maxG / 0xfff) * 1000) / 1000, state: engine.state().cubes[0].temperature }
    // Shutdown while streaming.
    const tDown = now()
    await engine.shutdown()
    await wait(100)
    result.shutdown = stopTimes(cube, tDown)
} finally {
    try { await engine.shutdown() } catch { /* closed */ }
    engine = null
    cube.close()
    fs.rmSync(dir, { recursive: true, force: true })
}
const s = result.stream
console.log(`runs ${RUNS} · fake cube ${CUBE_IP} at ${RATE} pps`)
console.log(`stream  points/s ${range(s.map((r) => r.pointsPerSecond))} (lit ${range(s.map((r) => r.litPerSecond))}) · max lit step ${Math.max(...s.map((r) => r.maxLit)).toFixed(4)} · max blank step ${Math.max(...s.map((r) => r.maxBlank)).toFixed(4)} (field units) · buffer overflow ${cube.overflow} · underruns ${range(s.map((r) => r.underruns))} (points missing ${range(s.map((r) => r.missing))})`)
for (const k of ['noFrame', 'still', 'disarm']) {
    const r = result[k]
    console.log(`${k.padEnd(8)} off ${range(r.map((x) => x.offMs))} ms · park ${range(r.map((x) => x.parkMs))} ms · park kept after the clear ${r.filter((x) => x.parkKept).length}/${r.length}, before the off ${r.filter((x) => x.parkBeforeOff).length}/${r.length} · lit after off ${r.reduce((n, x) => n + (x.litAfterOff || 0), 0)}`)
}
console.log(`ring-buffer clears heard ${cube.clears.length}; points dropped by them ${cube.clears.reduce((n, c) => n + c.dropped, 0)} (max ${Math.max(0, ...cube.clears.map((c) => c.dropped))} at once)`)
console.log(`shutdown off ${result.shutdown.offMs?.toFixed(1)} ms · park kept ${result.shutdown.parkKept}, before off ${result.shutdown.parkBeforeOff}`)
console.log(`after disarm: the cube's output ${result.flagsAfterDisarm.cubeOut ? 'ON' : 'off'}, byte 5 = ${result.flagsAfterDisarm.statusFlags}, di reads outputEnabled=${result.flagsAfterDisarm.outputEnabled}, interlock=${result.flagsAfterDisarm.interlockEnabled}`)
console.log(`temperature 70 °C: max green ${result.temperature.maxGreen}/4095 = ${result.temperature.scale} (want 0.667); state ${JSON.stringify(result.temperature.state)}`)
const out = arg('--json', null)
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2))
// Thresholds (ledger N1501.6, N1501.15): a run that misses one exits non-zero.
const MIN_PPS = Number(arg('--min-pps', 29500))
const MAX_MISSING_SHARE = Number(arg('--max-missing-share', 0.005)) // of the points a run sent
const misses = []
s.forEach((r, i) => {
    if (r.pointsPerSecond < MIN_PPS) misses.push(`run ${i + 1}: ${r.pointsPerSecond} points/s < ${MIN_PPS}`)
    if (r.overflow > 0) misses.push(`run ${i + 1}: buffer overflow ${r.overflow}`)
    if (r.missing > MAX_MISSING_SHARE * r.pointsPerSecond * r.secs) misses.push(`run ${i + 1}: ${r.missing} points missing (underruns ${r.underruns})`)
})
console.log(misses.length ? `FAIL\n${misses.join('\n')}` : `PASS: every run >= ${MIN_PPS} points/s, no overflow, missing <= ${MAX_MISSING_SHARE * 100} %`)
process.exit(misses.length ? 1 : 0)
