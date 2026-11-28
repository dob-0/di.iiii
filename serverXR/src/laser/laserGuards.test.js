// @vitest-environment node
// The galvo and power guards (laserGuards.js) and how the engine uses them (2026-10-14).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { generateShape, LASER_SHAPES, MARK_SHAPES, MARK_MIN_SIZE, DOT_SHAPES } from '../../../src/project/nodes/laser.shape/laserShapes.js'

const require = createRequire(import.meta.url)
const { flattenLaserPaths } = require('../../../shared/laserFrame.cjs')
const proto = require('./lasercubeProtocol')
const g = require('./laserGuards')
const { createLaserEngine, applyZone, normaliseZone, stillBeams, dwellSpots, dotsAllowed, ARM_PHRASE } = require('./laserEngine')

const lit = (x, y) => [x, y, 0, 1, 0]
const dark = (x, y) => [x, y, 0, 0, 0]
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
const at = (rate) => g.pathPlan(g.DEFAULT_GUARDS, rate)
// Not still, or only dots that laser.json "dots": true lets through.
const okDots = (list) => !list.length || dotsAllowed(list)
// A seeded pseudo-random frame (mulberry32), lit and blank mixed, full-field jumps included.
const randomFrame = (seed, n) => {
    let a = seed
    const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    return Array.from({ length: n }, () => (rnd() < 0.7 ? lit(rnd() * 2 - 1, rnd() * 2 - 1) : dark(rnd() * 2 - 1, rnd() * 2 - 1)))
}
// Every step of a looping list: lit steps ≤ the lit limit, blank steps ≤ the blank limit.
const worstSteps = (pts) => g.stepStats(pts)

describe('the step limit (OpenLase on_speed / off_speed)', () => {
    it('no step is longer than the limit, lit or blank, at 30, 35 and 60 kpps — the loop back included', () => {
        for (const rate of [30000, 35000, 60000]) {
            const plan = at(rate)
            for (let seed = 1; seed <= 20; seed += 1) {
                const { points } = g.optimisePath(randomFrame(seed, 200), plan)
                const { maxLitStep, maxBlankStep } = worstSteps(points)
                expect(maxLitStep).toBeLessThanOrEqual(plan.litStep + 1e-9)
                expect(maxBlankStep).toBeLessThanOrEqual(plan.blankStep + 1e-9)
            }
        }
    })
    it('the limits are 2/80 lit and 2/20 blank at 30 kpps, and shrink as the rate grows', () => {
        expect(at(30000)).toMatchObject({ litStep: 0.025, blankStep: 0.1 })
        expect(at(60000).litStep).toBeCloseTo(0.0125, 9)
        expect(at(60000).blankStep).toBeCloseTo(0.05, 9)
    })
    it('keeps every point it was given, in order, endpoints exact', () => {
        const frame = randomFrame(7, 100)
        const { points } = g.optimisePath(frame, at(30000))
        let j = 0
        for (const p of points) if (j < frame.length && p.every((v, k) => v === frame[j][k])) j += 1
        expect(j).toBe(frame.length)
        expect(points[0]).toEqual(frame[0])
    })
    it('a full-field lit line of 2 units becomes 80 steps of 0.025; a full blank jump 20 steps of 0.1', () => {
        const plan = at(30000)
        const out = []
        const line = g.optimisePath([lit(-1, 0), lit(1, 0)], plan).points
        expect(line.filter((p) => p[1] === 0 && p[0] > -1 && p[0] < 1).length).toBe(79 * 2) // there and back
        out.push(...g.parkPath([1, 1], plan))
        expect(out.length).toBe(1 + 9 + plan.parkPoints) // 10 steps of 0.1 from 1 to 0
    })
    it('a single point stays a single point', () => {
        expect(g.optimisePath([lit(0.2, 0.5)], at(30000)).points).toEqual([lit(0.2, 0.5)])
        expect(g.optimisePath([], at(30000)).points).toEqual([])
    })
})

describe('corner hold (OpenLase corner dwell at 30°, lasy 0.6 rad a point)', () => {
    const plan = at(30000)
    it('a right angle holds 3 extra points, a reversal 6, a 30° turn 1, a 20° turn none', () => {
        const turn = (deg) => {
            const r = (deg * Math.PI) / 180
            return g.cornerHold([-0.5, 0], [0, 0], [0.5 * Math.cos(r), 0.5 * Math.sin(r)], plan)
        }
        expect(turn(90)).toBe(3)
        expect(turn(180)).toBe(6)
        expect(turn(30)).toBe(1)
        expect(turn(20)).toBe(0)
        expect(turn(0)).toBe(0)
    })
    it('scales with the rate: a right angle at 60 kpps holds 6 (the same time)', () => {
        expect(g.cornerHold([-0.5, 0], [0, 0], [0, 0.5], at(60000))).toBe(6)
    })
    it('a lit square: each corner is drawn 1 + 3 times', () => {
        const sq = [lit(0, 0), lit(0.4, 0), lit(0.4, 0.4), lit(0, 0.4)]
        const { points } = g.optimisePath(sq, plan)
        for (const c of sq) expect(points.filter((p) => p[0] === c[0] && p[1] === c[1]).length).toBe(4)
    })
    it('a point whose neighbour sits on it gets no extra (the author dwelt already)', () => {
        expect(g.cornerHold([0, 0], [0, 0], [0.5, 0], plan)).toBe(0)
    })
})

describe('start / end dwell and blanking delays (libLaserdockCore quality, TD Laser CHOP)', () => {
    const frame = [dark(-0.5, 0.5), lit(0, 0.5), lit(0.5, 0.5), dark(0.5, 0.8)]
    const counts = (rate) => {
        const { points } = g.optimisePath(frame, at(rate))
        const atStart = points.filter((p) => p[0] === -0.5 && p[1] === 0.5)
        const atEnd = points.filter((p) => p[0] === 0.5 && p[1] === 0.5)
        return {
            blankBeforeOn: atStart.filter((p) => !isLit(p)).length - 1, // the blank point itself
            litAtStart: atStart.filter(isLit).length,
            litAtEnd: atEnd.filter(isLit).length - 1, // the lit point itself
            blankAfterOff: atEnd.filter((p) => !isLit(p)).length
        }
    }
    it('at 30 kpps: 30 blank before colour on (1 ms), 2 lit start dwell, 2 + 9 lit at the end (0.3 ms), 0 blank after off (0.005 ms rounds to 0)', () => {
        expect(counts(30000)).toEqual({ blankBeforeOn: 30, litAtStart: 2, litAtEnd: 11, blankAfterOff: 0 })
    })
    it('at 60 kpps the same times are twice the points', () => {
        expect(counts(60000)).toEqual({ blankBeforeOn: 60, litAtStart: 4, litAtEnd: 22, blankAfterOff: 0 })
    })
    it('at 200 kpps the 0.005 ms after colour off is one point', () => {
        expect(counts(200000).blankAfterOff).toBe(1)
    })
    it('the lit start dwell takes the colour of the stroke it starts', () => {
        const { points } = g.optimisePath([dark(0, 0.5), [0.3, 0.5, 1, 0, 0]], at(30000))
        expect(points.filter((p) => p[0] === 0 && isLit(p)).every((p) => p[2] === 1 && p[3] === 0)).toBe(true)
    })
})

describe('the temperature limiter (Wicked ldLaserPowerLimiter)', () => {
    it('full power to 60 °C, then linear to 50 % at 75 °C, 50 % above', () => {
        expect([59, 60, 67.5, 75, 80].map((c) => g.powerScale(c))).toEqual([1, 1, 0.75, 0.5, 0.5])
        expect(g.powerScale(null)).toBe(1)
    })
    it('averages one sample per 100 ms over the last 150 samples', () => {
        const avg = g.createTempAverager()
        avg.sample(0, 40)
        avg.sample(50, 90) // inside the period: ignored
        expect(avg.average()).toBe(40)
        for (let i = 1; i <= 150; i += 1) avg.sample(i * 100, 70)
        expect(avg.count()).toBe(150)
        expect(avg.average()).toBe(70)
    })
    it('the engine scales every colour it streams and marks the cube hot at ≥ 75 °C', () => {
        const rig = armed(ONE, { temp: 75 })
        rig.engine.setFrame('all', [lit(0, 0.5), lit(0.2, 0.5)])
        rig.tick(20)
        const data = rig.data()
        const maxG = Math.max(...data.flatMap((b) => Array.from({ length: (b.length - 4) / 10 }, (_, i) => b.readUInt16LE(4 + i * 10 + 6))))
        expect(maxG).toBe(proto.toDeviceColour(0.5))
        expect(rig.engine.state().cubes[0].temperature).toMatchObject({ lastC: 75, averageC: 75, powerScale: 0.5, hot: true })
    })
})

// The engine on a fake socket (as laser.test.js), with the guards.
const ONE = { cubes: [{ id: 'cube-1', ip: '10.0.0.51' }] }
const infoAnswer = ({ out = 0, temp = 31, minor = 7, flagsByte = null, dac = 30000, max = 35000, free = 5800, size = 6000 } = {}) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77; b[3] = 1; b[4] = minor; b[5] = flagsByte ?? out
    b.writeUInt32LE(dac, 10); b.writeUInt32LE(max, 14); b.writeUInt16LE(free, 19); b.writeUInt16LE(size, 21)
    b.writeInt8(temp, 24); b[25] = 2; b[37] = 3; b.write('LaserCube', 38, 'latin1')
    return b
}
const armed = (config, info = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-guards-'))
    fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify(config))
    const sent = []
    const handlers = {}
    const socket = { send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), port, ip }); done?.() }, on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
    const clock = { t: 1000000 }
    const engine = createLaserEngine({ dataDir: dir, createSocket: () => socket, log: null, now: () => clock.t, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0 })
    for (const c of config.cubes) handlers.message(infoAnswer(info), { address: c.ip })
    expect(engine.arm({ armed: true, confirm: ARM_PHRASE }).ok).toBe(true)
    for (const c of config.cubes) handlers.message(Buffer.from([0x8a, 0, 0x70, 0x17]), { address: c.ip }) // the clear is confirmed (R2-1)
    const tick = (ms) => { clock.t += ms; for (const c of config.cubes) handlers.message(Buffer.from([0x80]), { address: c.ip }); engine.alive('all'); engine.tick() }
    return { engine, sent, tick, clock, handlers, data: () => sent.filter((s) => s.port === proto.PORT.DATA).map((s) => s.buf) }
}
const pointsOf = (bufs) => bufs.flatMap((b) => Array.from({ length: (b.length - 4) / 10 }, (_, i) => [0, 2, 4, 6, 8].map((k) => b.readUInt16LE(4 + i * 10 + k))))
// The order on the wire: 'park' for a data message whose every point is blank and whose last is the
// centre, 'data' for any other data message, then the command bytes.
const wire = (sent) => sent.map((s) => {
    if (s.port !== proto.PORT.DATA) return [...s.buf].join(',')
    const pts = pointsOf([s.buf])
    const last = pts.at(-1)
    return pts.every((p) => !p[2] && !p[3] && !p[4]) && last[0] === 0x800 && last[1] === 0x800 ? 'park' : 'data'
})

describe('every stop: buffer cleared, beam parked blank at the centre, THEN output-off (Helios practice; 0x8d per Wicked)', () => {
    const circle = generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 120 })
    const startedOn = (frame) => {
        const rig = armed(ONE)
        rig.engine.setFrame('all', frame)
        rig.tick(20)
        rig.sent.length = 0
        return rig
    }
    const parkSteps = (rig) => {
        const pts = pointsOf(rig.data()).map(([x, y]) => [(x / 0xfff) * 2 - 1, (y / 0xfff) * 2 - 1])
        return Math.max(...pts.slice(1).map((p, i) => cheb(p, pts[i])))
    }
    it('no frame for 200 ms', () => {
        const rig = startedOn(circle)
        rig.clock.t += 201
        rig.engine.tick()
        expect(wire(rig.sent)).toEqual(['141', '141', '138', 'park', '128,0', '128,0'])
        expect(parkSteps(rig)).toBeLessThanOrEqual(0.1 + 2 / 0xfff)
    })
    it('a still beam', () => {
        const rig = startedOn(Array.from({ length: 60 }, () => lit(0.2, 0.5)))
        for (let i = 0; i < 11; i += 1) rig.tick(20)
        const w = wire(rig.sent)
        expect(w.slice(w.indexOf('park') - 3)).toEqual(['141', '141', '138', 'park', '128,0', '128,0'])
    })
    it('the link lost', () => {
        const rig = startedOn(circle)
        rig.clock.t += 3100
        rig.engine.alive('all')
        rig.engine.tick()
        expect(wire(rig.sent)).toEqual(['141', '141', '138', 'park', '128,0', '128,0'])
    })
    it('disarm', () => {
        const rig = startedOn(circle)
        rig.engine.arm({ armed: false })
        expect(wire(rig.sent)).toEqual(['141', '141', 'park', '128,0', '128,0', '120,0'])
    })
    it('shutdown', async () => {
        const rig = startedOn(circle)
        await rig.engine.shutdown()
        expect(wire(rig.sent)).toEqual(['141', '141', 'park', '128,0', '128,0', '120,0'])
    })
})

describe('the status byte (GET_FULL_INFO byte 5) is flags, read as Wicked Lasers\' driver reads it', () => {
    it('2 on firmware 1.17 (the real cubes) is the interlock bit: output OFF (the 2026-10-14 reading that said "on")', () => {
        expect(proto.parseFullInfo(infoAnswer({ flagsByte: 2 }))).toMatchObject({ outputEnabled: false, interlockEnabled: true, statusFlags: 2 })
    })
    it('bit 0 is output enabled; ≥ 0.13: bit 2 warning, bit 3 over-temperature, bits 4-7 packet errors', () => {
        expect(proto.parseFullInfo(infoAnswer({ flagsByte: 0x3f }))).toMatchObject({ outputEnabled: true, interlockEnabled: true, temperatureWarning: true, overTemperature: true, packetErrors: 3 })
        expect(proto.parseFullInfo(infoAnswer({ flagsByte: 1 }))).toMatchObject({ outputEnabled: true, interlockEnabled: false })
    })
    it('firmware ≤ 0.12: bit 3 interlock, bit 4 warning, bit 5 over-temperature', () => {
        const old = (f) => { const b = infoAnswer({ flagsByte: f }); b[3] = 0; b[4] = 12; return proto.parseFullInfo(b) }
        expect(old(0x20)).toMatchObject({ outputEnabled: false, interlockEnabled: false, overTemperature: true })
        expect(old(0x08)).toMatchObject({ interlockEnabled: true, overTemperature: false })
    })
    it('the real cube\'s answer (Ultra MK2 fw 1.17, armed then disarmed, read 2026-10-14): firmware 1.17, output OFF, rate 35000', () => {
        // The first 12 bytes the coordinator read from 10.42.0.184; the rest of the 64 is not known here (zeros).
        const real = Buffer.alloc(64)
        Buffer.from('7700000111020000ff0fb888', 'hex').copy(real)
        expect(proto.parseFullInfo(real)).toMatchObject({ firmware: '1.17', outputEnabled: false, statusFlags: 2, interlockEnabled: true })
        expect(real.readUInt32LE(10) & 0xffff).toBe(35000) // b8 88 = 35000; bytes 12-13 not in the sample
    })
    it('the temperature is a signed byte', () => {
        expect(proto.parseFullInfo(infoAnswer({ temp: -10 })).temperature).toBe(-10)
    })
    it('disarm really sends 0x80 0x00 — twice — to the cube', () => {
        const rig = armed(ONE)
        rig.sent.length = 0
        rig.engine.arm({ armed: false })
        expect(rig.sent.filter((s) => s.port === proto.PORT.CMD).map((s) => [...s.buf])).toEqual([[0x8d], [0x8d], [0x80, 0], [0x80, 0], [0x78, 0]])
    })
})

describe('the Laser node\'s shapes, as the guards draw them, still pass the still-beam guard', () => {
    it('none is still at size 0.5, 0.1 and 0.05 (the sparkles: 0.5 and MARK_MIN_SIZE; 120 and 500 points, 30 and 35 kpps); every one is when collapsed', () => {
        for (const rate of [30000, 35000]) {
            const plan = at(rate)
            for (const shape of LASER_SHAPES) {
                for (const points of [120, 500]) {
                    for (const size of MARK_SHAPES.includes(shape) ? [0.5, MARK_MIN_SIZE] : [0.5, 0.1, 0.05]) {
                        const frame = g.optimisePath(applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points, plan).points
                        // A dot shape is dots only: a still beam unless laser.json says "dots": true, which lets it through.
                        if (DOT_SHAPES.includes(shape)) expect(okDots(stillBeams(frame)), `${shape} size ${size} × ${points} at ${rate}`).toBe(true)
                        else expect(stillBeams(frame), `${shape} size ${size} × ${points} at ${rate}`).toEqual([])
                    }
                    const collapsed = g.optimisePath(applyZone(generateShape({ shape, size: 0, height: 0.5, points }), normaliseZone()).points, plan).points
                    expect(stillBeams(collapsed).length, `${shape} collapsed`).toBeGreaterThan(0)
                }
            }
        }
    })
    const worstOf = (shapes, size) => Math.max(...shapes.flatMap((shape) => [120, 500].map((points) => dwellSpots(g.optimisePath(applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points, at(30000)).points, { minShare: 0 })[0].share)))
    it('keeps the measured headroom (worst share in one window at 30 kpps: 6.4 % / 21.7 % / 38.8 %; 2026-10-17: the galaxy at 0.1)', () => {
        const twelve = LASER_SHAPES.slice(0, 12)
        expect(worstOf(twelve, 0.5)).toBeCloseTo(0.064, 2)
        expect(worstOf(twelve, 0.1)).toBeCloseTo(0.217, 2)
        expect(worstOf(twelve, 0.05)).toBeCloseTo(0.388, 2)
    })
    // 2026-10-29: the minimal figures (arc … chevron, glint) and the sparkles. At 0.5 the bars put 7.3 % in one window
    // (a level line's end dwell and the hop to the next), more than the twelve's 6.4 % and far from the 50 % stop.
    it('the shapes added on 2026-10-29 keep the headroom: figures 7.3 % / 16.3 % / 32.0 %, sparkles 4.1 % and 7.7 % at their smallest', () => {
        const marks = ['sparkle', 'twinkle', 'spots']
        const figures = LASER_SHAPES.slice(12, 24).filter((s) => !marks.includes(s))
        expect(worstOf(figures, 0.5)).toBeCloseTo(0.073, 2)
        expect(worstOf(figures, 0.1)).toBeCloseTo(0.163, 2)
        expect(worstOf(figures, 0.05)).toBeCloseTo(0.32, 2)
        expect(worstOf(marks, 0.5)).toBeCloseTo(0.041, 2)
        expect(worstOf(marks, MARK_MIN_SIZE)).toBeCloseTo(0.077, 2)
    })
    // 2026-10-30: the scenes of lines, circles and dots (planets … morse). A dot is a small ring that shrinks into the
    // window with the picture; the lines and circles around it keep the frame a stroke, morse's dashes only from
    // MARK_MIN_SIZE (it is a mark shape). They move on the beat, so they are held at every quarter beat as well, as sent.
    const SCENES = LASER_SHAPES.slice(24, 32)
    it('the scenes keep the headroom: 6.1 % / 20.1 % / 33.5 %, morse 6.9 % and 15.1 % at its smallest', () => {
        expect(SCENES).toEqual(['planets', 'pendulum', 'bounce', 'radar', 'constellation', 'clock', 'horizon', 'morse'])
        const figures = SCENES.filter((s) => !MARK_SHAPES.includes(s))
        expect(worstOf(figures, 0.5)).toBeCloseTo(0.061, 2)
        expect(worstOf(figures, 0.1)).toBeCloseTo(0.201, 2)
        expect(worstOf(figures, 0.05)).toBeCloseTo(0.335, 2)
        expect(worstOf(['morse'], 0.5)).toBeCloseTo(0.069, 2)
        expect(worstOf(['morse'], MARK_MIN_SIZE)).toBeCloseTo(0.151, 2)
    })
    it('the scenes as sent are never still at any quarter beat over 16, and never put 40 % in one window', () => {
        const plan = at(30000)
        for (const shape of SCENES) {
            for (const size of MARK_SHAPES.includes(shape) ? [0.5, MARK_MIN_SIZE] : [0.5, 0.1, 0.05]) {
                for (let beat = 0; beat < 16; beat += 0.25) {
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape, size, height: 0.5, points: 300, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                    expect(stillBeams(frame), `${shape} ${size} beat ${beat}`).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, `${shape} ${size} beat ${beat}`).toBeLessThan(0.4)
                }
            }
        }
    })
    // 2026-10-31: unfold, one line that is a pulsing circle, a spiral, the square's edge and a circle again over 16 beats.
    // Every moment is one stroke (no blank move), and the spiral's eye never holds the beam: held at every eighth of a beat.
    it('unfold is one line at every moment of its loop, never still, never 40 % in one window', () => {
        expect(LASER_SHAPES[32]).toBe('unfold')
        const plan = at(30000)
        for (const size of [0.5, 0.1, 0.05]) {
            for (const points of [120, 900]) {
                for (let beat = 0; beat < 16; beat += 0.125) {
                    const drawn = generateShape({ shape: 'unfold', size, height: 0.5, points, beat })
                    expect(drawn.every((p) => p[2] > 0 || p[3] > 0 || p[4] > 0), `unfold ${size} × ${points} beat ${beat}: one stroke`).toBe(true)
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(drawn, { budget: null }).points, normaliseZone()).points, plan).points
                    expect(stillBeams(frame), `unfold ${size} × ${points} beat ${beat}`).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, `unfold ${size} × ${points} beat ${beat}`).toBeLessThan(0.4)
                }
            }
        }
    })
    // 2026-10-31: the patterns (lissajous … cube), lines and circles that move on the beat. Rain is a mark shape: its
    // dashes are dots below MARK_MIN_SIZE. At 0.05 the most in one window is count's single bar on the first beat, its
    // end dwells (36.3 %, the line's own 38.8 % above). Held at every quarter beat over 16 as sent, with 120 and 900 points.
    const PATTERNS = LASER_SHAPES.slice(33, 41)
    it('the patterns keep the headroom: 7.2 % / 18.7 % / 36.3 %, rain 5.6 % and 9.2 % at its smallest', () => {
        expect(PATTERNS).toEqual(['lissajous', 'helix', 'tunnel', 'echo', 'sides', 'count', 'rain', 'cube'])
        const figures = PATTERNS.filter((s) => !MARK_SHAPES.includes(s))
        expect(worstOf(figures, 0.5)).toBeCloseTo(0.072, 2)
        expect(worstOf(figures, 0.1)).toBeCloseTo(0.187, 2)
        expect(worstOf(figures, 0.05)).toBeCloseTo(0.363, 2)
        expect(worstOf(['rain'], 0.5)).toBeCloseTo(0.056, 2)
        expect(worstOf(['rain'], MARK_MIN_SIZE)).toBeCloseTo(0.092, 2)
    })
    it('the patterns as sent are never still at any quarter beat over 16, and never put 40 % in one window', () => {
        const plan = at(30000)
        for (const shape of PATTERNS) {
            for (const size of MARK_SHAPES.includes(shape) ? [0.5, MARK_MIN_SIZE] : [0.5, 0.1, 0.05]) {
                for (const points of [120, 900]) {
                    for (let beat = 0; beat < 16; beat += 0.25) {
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape, size, height: 0.5, points, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                        expect(stillBeams(frame), `${shape} ${size} × ${points} beat ${beat}`).toEqual([])
                        expect(dwellSpots(frame, { minShare: 0 })[0].share, `${shape} ${size} × ${points} beat ${beat}`).toBeLessThan(0.4)
                    }
                }
            }
        }
    })
    // 2026-11-01: weave (lines splitting into a grid) and venn (circles splitting and mixing), every eighth of a beat of
    // their 16-beat loops.
    it('weave and venn as sent are never still at any eighth of a beat, and never put 40 % in one window', () => {
        expect(LASER_SHAPES.slice(44, 46)).toEqual(['weave', 'venn'])
        const plan = at(30000)
        for (const shape of ['weave', 'venn']) {
            for (const size of [0.5, 0.1, 0.05]) {
                for (const points of [120, 900]) {
                    for (let beat = 0; beat < 16; beat += 0.125) {
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape, size, height: 0.5, points, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                        expect(stillBeams(frame), `${shape} ${size} × ${points} beat ${beat}`).toEqual([])
                        expect(dwellSpots(frame, { minShare: 0 })[0].share, `${shape} ${size} × ${points} beat ${beat}`).toBeLessThan(0.4)
                    }
                }
            }
        }
    })
    // 2026-11-06: the lava shapes (lava … drip), for the REA festival. Lines, blobs and dots that move all through the beat,
    // held at every eighth of a beat over 16 as sent, with 120 and 900 points and with their most copies, at 0.5 and 0.1
    // (lava, all blobs, is a mark shape: 0.5 and MARK_MIN_SIZE). Measured worst in one window: 7.2 % at 0.5, 25.9 % at 0.1.
    // At 0.05 (a picture about 3° across) crack, bubble and eruption fit in under three windows: crack 37.6 % at 120
    // points, 48.0 % at 500 and 54.8 % at 900 with a still frame now and then, bubble 48.0 % at 900, eruption with four
    // bombs 44.5 % at 900. There the engine's own 50 % stop blanks the cube, as it is there to; the first test in this
    // block still holds them never still at 0.05 with 120 and 500 points.
    it('the lava shapes as sent are never still at any eighth of a beat, and never put 40 % in one window', () => {
        const LAVA = ['lava', 'magma', 'eruption', 'bubble', 'crack', 'drip']
        expect(LASER_SHAPES.slice(46, 52)).toEqual(LAVA)
        const plan = at(30000)
        for (const shape of LAVA) {
            for (const size of MARK_SHAPES.includes(shape) ? [0.5, MARK_MIN_SIZE] : [0.5, 0.1]) {
                for (const [points, copies] of [[120, 0], [900, 0], [900, 6]]) {
                    for (let beat = 0; beat < 16; beat += 0.125) {
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape, size, height: 0.5, points, copies, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                        const label = `${shape} ${size} × ${points} ×${copies} beat ${beat}`
                        expect(stillBeams(frame), label).toEqual([])
                        expect(dwellSpots(frame, { minShare: 0 })[0].share, label).toBeLessThan(0.4)
                    }
                }
            }
        }
    })
    // 2026-11-06 evening: volcano, the lava story in one line with a drop and bombs, held over two of its 16-beat loops
    // (the bombs' heights change from loop to loop) at every eighth of a beat as sent, at 0.5 and 0.1 like the lava
    // shapes. Measured worst in one window at 30 kpps: 8.3 % at 0.5 (the drop falling), 29.4 % at 0.1 (the crater
    // bursting open). At 0.05 it is 40.0 % at 120 points, 48.4 % at 600 and 57.0 % at 900 with a still frame now and then, where
    // the engine's own 50 % stop blanks the cube, as it does for the other lava shapes there.
    it('volcano as sent is never still at any eighth of a beat over two loops, and never puts 40 % in one window', () => {
        expect(LASER_SHAPES[52]).toBe('volcano')
        const plan = at(30000)
        for (const size of [0.5, 0.1]) {
            for (const points of [120, 900]) {
                for (let beat = 0; beat < 32; beat += 0.125) {
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape: 'volcano', size, height: 0.5, points, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                    const label = `volcano ${size} × ${points} beat ${beat}`
                    expect(stillBeams(frame), label).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, label).toBeLessThan(0.4)
                }
            }
        }
    })
    // 2026-11-06 evening: strands (the owner's laser.html), one line wandering along a tangle of drifting sines: held at
    // every eighth of a beat over 16 as sent, its least and most tangled, slow and fast, at 0.5 and MARK_MIN_SIZE. A strand
    // is one stretch of line, not a figure across the picture, so a small picture can hold all of it in a few windows:
    // measured worst at 30 kpps, 12.8 % at 0.5, 24.0 % at 0.15, 42.1 % at 0.1, and at 0.05 72.0 % with still frames, where
    // the engine's own guards blank the cube, as they are there to.
    it('strands as sent is never still at any eighth of a beat, and never puts 40 % in one window', () => {
        expect(LASER_SHAPES[53]).toBe('strands')
        const plan = at(30000)
        for (const size of [0.5, MARK_MIN_SIZE]) {
            for (const [points, copies, speed] of [[120, 2, 0.25], [900, 0, 1], [900, 8, 2]]) {
                for (let beat = 0; beat < 16; beat += 0.125) {
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape: 'strands', size, height: 0.5, points, copies, beat: beat * speed, speed }), { budget: null }).points, normaliseZone()).points, plan).points
                    const label = `strands ${size} × ${points} ×${copies} speed ${speed} beat ${beat}`
                    expect(stillBeams(frame), label).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, label).toBeLessThan(0.4)
                }
            }
        }
    })
    // 2026-11-07, the owner's solid-light references: contour, draw, blade, coil, down and vortex, six line shapes that
    // flow, draw themselves, sweep and turn. Held at every eighth of a beat over 32 as sent (draw's round is 8 beats, blade's
    // turn 16, coil's 24 and 64: the guards see them all moving), with 120, 600 and 900 points and 5 copies, at 0.5, 0.25 and
    // 0.1. They are named by their place in the list, so a shape added after them does not move this. Measured worst in one
    // window at 30 kpps, over all six: 18.7 % at 0.5 (vortex: its dot has a quarter of the points), 22.8 % at 0.25 (vortex),
    // 33.5 % at 0.1 (draw, with its loop at its shortest). No still frame at any of them.
    it('contour, draw, blade, coil, down and vortex as sent are never still at any eighth of a beat, and never put 40 % in one window', () => {
        const SOLID = ['contour', 'draw', 'blade', 'coil', 'down', 'vortex']
        expect(LASER_SHAPES.slice(54, 60)).toEqual(SOLID)
        const plan = at(30000)
        const worst = { 0.5: 0, 0.25: 0, 0.1: 0 }
        for (const shape of SOLID) {
            for (const size of [0.5, 0.25, 0.1]) {
                for (const [points, copies] of [[120, 0], [600, 0], [900, 0], [600, 5]]) {
                    for (let beat = 0; beat < 32; beat += 0.125) {
                        const raw = generateShape({ shape, size, height: 0.5, points, copies, beat, colour: '#00e5ff', colour2: '#ff0020' })
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, normaliseZone()).points, plan).points
                        const label = `${shape} ${size} × ${points} ×${copies} beat ${beat}`
                        const share = dwellSpots(frame, { minShare: 0 })[0].share
                        expect(stillBeams(frame), label).toEqual([])
                        expect(share, label).toBeLessThan(0.4)
                        worst[size] = Math.max(worst[size], share)
                    }
                }
            }
        }
        expect(worst[0.5]).toBeLessThan(0.2)
        expect(worst[0.25]).toBeLessThan(0.24)
        expect(worst[0.1]).toBeLessThan(0.345)
    })
    // 2026-11-07: phyllotaxis and phyllolines, the owner's TouchDesigner Phyllotaxis ("can we have the sameeee"). Held at
    // every eighth of a beat over its whole 40-beat sweep, at Copies 1, 2 and 4, at the sizes the desk plays them (1, 0.8,
    // 0.6), through the whole field (her cubes' zone): never still, never more than the real cube's 2333-point pass at
    // 35 kpps (the dots: PHYLLO_MOST; the lines: PHYLLO_LINE_MOST). Measured: the most points 1867 (dots, Copies 2, size 1)
    // and 2033 (lines, Copies 2, 0.7); worst window 4.5 % (dots) and 6.2 % (lines).
    it('phyllotaxis and phyllolines are never still and always fit the real cube\'s pass, over their whole sweep', () => {
        expect(LASER_SHAPES.slice(60, 62)).toEqual(['phyllotaxis', 'phyllolines'])
        const plan = at(35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        const most = { phyllotaxis: 0, phyllolines: 0 }
        for (const shape of ['phyllotaxis', 'phyllolines']) {
            for (const copies of [1, 2, 4]) {
                for (const size of [1, 0.8, 0.6]) {
                    for (let beat = 0; beat < 40; beat += 0.125) {
                        const raw = generateShape({ shape, size, height: 0, points: 600, copies, beat, colour: '#0090ff' })
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, zone).points, plan).points
                        const label = `${shape} ×${copies} ${size} beat ${beat}`
                        if (shape === 'phyllotaxis') expect(okDots(stillBeams(frame)), label).toBe(true) // point dots: laser.json "dots"
                        else expect(stillBeams(frame), label).toEqual([])
                        expect(dwellSpots(frame, { minShare: 0 })[0].share, label).toBeLessThan(0.1)
                        expect(frame.length, label).toBeLessThanOrEqual(2333)
                        most[shape] = Math.max(most[shape], frame.length)
                    }
                }
            }
        }
        expect(most.phyllotaxis).toBeLessThan(2000)
        expect(most.phyllolines).toBeLessThan(2150)
    })
    // 2026-11-07: crossgrid ("add pattern cross grid"), level lines gliding down and upright ones gliding right. Its picture
    // repeats every beat (each line moves one place), so it is held at every 1/16 beat over two, at Copies 1, 2 and 4, Points
    // 120, 600 and 1992 and sizes 1, 0.5, 0.1 and 0.05, through the whole field (her cubes' zone) at 35 kpps: never still,
    // never over the real cube's 2333-point pass. Then through the desk's own look at full Displace + Wobble, which break the
    // edge lines where they leave the field, at every Copies over 8 beats (lookPointsAt's t is in ms). Measured: plain at
    // most 1667 points (Copies 2, 1992 points, size 1), worst window 32.2 % (size 0.05, 1992 points, Copies 1); bent at most
    // 2097 (Copies 4, 1992 points, size 1). Copies stops at 4: at 5 and 6, fully bent, it drew 2335 and 2549.
    it('crossgrid as sent is never still and always fits the real cube\'s pass, plain and at full Displace + Wobble', () => {
        expect(LASER_SHAPES[62]).toBe('crossgrid')
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const { normaliseLook } = require('./laserDesk')
        const plan = at(35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        const sent = (raw) => g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, zone).points, plan).points
        const most = { plain: 0, bent: 0 }
        let worst = 0
        for (const copies of [1, 2, 4]) {
            for (const points of [120, 600, 1992]) {
                for (const size of [1, 0.5, 0.1, 0.05]) {
                    for (let beat = 0; beat < 2; beat += 0.0625) {
                        const frame = sent(generateShape({ shape: 'crossgrid', size, height: 0, points, copies, beat, colour: '#ffffff' }))
                        const label = `crossgrid ${size} × ${points} ×${copies} beat ${beat}`
                        expect(stillBeams(frame), label).toEqual([])
                        expect(frame.length, label).toBeLessThanOrEqual(2333)
                        most.plain = Math.max(most.plain, frame.length)
                        worst = Math.max(worst, dwellSpots(frame, { minShare: 0 })[0].share)
                    }
                }
            }
        }
        const cube = { on: true, flipX: false, flipY: false, size: 1, x: 0, y: 0, order: 0, brightness: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }
        for (const copies of [1, 2, 3, 4]) {
            for (const points of [120, 1992]) {
                for (const size of [1, 0.1]) {
                    const look = normaliseLook({ shape: 'crossgrid', colour: '#ffffff', size, height: 0, x: 0, points, copies, displace: 1, wobble: 1 })
                    for (let t = 0; t < 4000; t += 31.25) {
                        const frame = sent(lookPointsAt(look, { t, clock: { bpm: 120, zero: 0 }, cube, master: 1 }))
                        const label = `crossgrid bent ${size} × ${points} ×${copies} t ${t}`
                        expect(stillBeams(frame), label).toEqual([])
                        expect(frame.length, label).toBeLessThanOrEqual(2333)
                        most.bent = Math.max(most.bent, frame.length)
                    }
                }
            }
        }
        expect(worst).toBeLessThan(0.335)
        expect(most.plain).toBeLessThan(1750)
        expect(most.bent).toBeLessThan(2200)
    })
    // 2026-11-07, the REA show: horse ("can you generate horse run animation in laser deck"), one closed outline galloping
    // a stride a beat. Held at every 1/32 beat over two strides at Points 120, 600, 900 and 1992 and sizes 1, 0.9, 0.5, 0.1
    // and 0.05 through the whole field at 35 kpps: never still, never over the real cube's 2333. Then through the desk's
    // look at full Displace + Wobble + Split. Measured: at most 1671 points plain (the shape keeps at most HORSE_MOST 1500),
    // worst window 37.7 % (size 0.05); bent at most 2172. Without the cap, 1992 points fully bent came to 2714.
    it('horse as sent is never still and always fits the real cube\'s pass, plain and fully bent', () => {
        expect(LASER_SHAPES[64]).toBe('horse')
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const { normaliseLook } = require('./laserDesk')
        const plan = at(35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        const sent = (raw) => g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, zone).points, plan).points
        const most = { plain: 0, bent: 0 }
        let worst = 0
        for (const points of [120, 600, 900, 1992]) {
            for (const size of [1, 0.9, 0.5, 0.1, 0.05]) {
                for (let beat = 0; beat < 2; beat += 0.03125) {
                    const frame = sent(generateShape({ shape: 'horse', size, height: 0, points, beat, colour: '#ff4000' }))
                    const label = `horse ${size} × ${points} beat ${beat}`
                    expect(stillBeams(frame), label).toEqual([])
                    expect(frame.length, label).toBeLessThanOrEqual(2333)
                    most.plain = Math.max(most.plain, frame.length)
                    worst = Math.max(worst, dwellSpots(frame, { minShare: 0 })[0].share)
                }
            }
        }
        const cube = { on: true, flipX: false, flipY: false, size: 1, x: 0, y: 0, order: 0, brightness: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }
        for (const points of [120, 900, 1992]) {
            for (const size of [1, 0.1]) {
                const look = normaliseLook({ shape: 'horse', colour: '#ff4000', size, height: 0, x: 0, points, displace: 1, wobble: 1, split: 1 })
                for (let t = 0; t < 4000; t += 31.25) {
                    const frame = sent(lookPointsAt(look, { t, clock: { bpm: 120, zero: 0 }, cube, master: 1 }))
                    const label = `horse bent ${size} × ${points} t ${t}`
                    expect(stillBeams(frame), label).toEqual([])
                    expect(frame.length, label).toBeLessThanOrEqual(2333)
                    most.bent = Math.max(most.bent, frame.length)
                }
            }
        }
        expect(worst).toBeLessThan(0.39)
        expect(most.plain).toBeLessThan(1750)
        expect(most.bent).toBeLessThan(2250)
    })
    // 2026-11-07: phyllochaos ("one point which is slow from up going down and then it becoming chaotic and too many dots",
    // a 30-beat loop). Held at every 1/16 beat over the whole loop at Points 100, 300, 600 and 1500 and sizes 1, 0.8, 0.5
    // and 0.25, through the whole field (her cubes' zone) at 35 kpps: the falling point (Point's ring, alone) and the ring
    // with its first seeds are never still; from CHAOS_LONE_UNTIL seeds on, a frame of only dots is always one the engine
    // lets play with laser.json "dots" (two or more, each at most 12 %); never over the real cube's 2333-point pass. Then
    // through the desk's look at full Displace and at full Wobble (each alone: both full crumple the lone ring into a
    // dwell, as they do Point's). Measured: at most 1814 points (Points 600, size 1, breaking up: about 19 redraws a second),
    // worst window 29.4 % (Points 1500, size 0.25, the ring with its first seeds); bent at most 1814.
    it('phyllochaos as sent is never a still beam the engine stops and always fits the real cube\'s pass, over its whole loop', () => {
        expect(LASER_SHAPES[63]).toBe('phyllochaos')
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const { normaliseLook } = require('./laserDesk')
        const plan = at(35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        const sent = (raw) => g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, zone).points, plan).points
        let most = 0
        let worst = 0
        for (const points of [100, 300, 600, 1500]) {
            for (const size of [1, 0.8, 0.5, 0.25]) {
                for (let beat = 0; beat < 30; beat += 1 / 16) {
                    const frame = sent(generateShape({ shape: 'phyllochaos', size, height: 0, points, beat, colour: '#0090ff' }))
                    const label = `phyllochaos ${size} × ${points} beat ${beat}`
                    expect(okDots(stillBeams(frame)), label).toBe(true)
                    expect(frame.length, label).toBeLessThanOrEqual(2333)
                    most = Math.max(most, frame.length)
                    worst = Math.max(worst, dwellSpots(frame, { minShare: 0 })[0].share)
                }
            }
        }
        let bent = 0
        for (const bend of [{ displace: 1 }, { wobble: 1 }]) {
            for (const size of [1, 0.5]) {
                const look = normaliseLook({ shape: 'phyllochaos', colour: '#0090ff', size, height: 0, x: 0, points: 600, ...bend })
                for (let t = 0; t < 15000; t += 1000 / 32) {
                    const frame = sent(lookPointsAt(look, { t, clock: { bpm: 120, zero: 0 } }))
                    expect(okDots(stillBeams(frame)), `phyllochaos ${JSON.stringify(bend)} ${size} t ${t}`).toBe(true)
                    bent = Math.max(bent, frame.length)
                }
            }
        }
        expect(most).toBeLessThan(1900)
        expect(worst).toBeLessThan(0.35)
        expect(bent).toBeLessThan(1900)
    })
    // Both bends at full squash the falling ring (Point's, alone) into a sliver whose time piles up in one window, as they
    // do Point's own. The engine stops a cube only after GUARD.STILL_HOLD_MS (200 ms) of still frames in a row, so at the
    // desk's 120 BPM the cube never goes dark: measured every 5 ms over the loop, the longest still run is 160 ms at size
    // 0.99 (80 at 0.5, none at 0.25). A slower BPM or Speed stretches it (× 120 / BPM): under about 96 BPM it may blank for a moment in the fall.
    it('phyllochaos at full Displace + Wobble is never still for the engine\'s 200 ms hold at 120 BPM', () => {
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const { normaliseLook } = require('./laserDesk')
        const plan = at(35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        for (const size of [0.99, 0.5]) {
            const look = normaliseLook({ shape: 'phyllochaos', colour: '#0090ff', size, height: 0, x: 0, points: 600, displace: 1, wobble: 1, wobbleBeats: 1 })
            let run = 0
            let longest = 0
            for (let t = 0; t < 6000; t += 5) { // the fall and the lone ring (beats 0–12)
                const frame = g.optimisePath(applyZone(flattenLaserPaths(lookPointsAt(look, { t, clock: { bpm: 120, zero: 0 } }), { budget: null }).points, zone).points, plan).points
                run = okDots(stillBeams(frame)) ? 0 : run + 5
                longest = Math.max(longest, run)
            }
            expect(longest, `size ${size}`).toBeLessThan(180)
        }
    })
    // 2026-11-01: point, one dot alone in the middle. All the frame is in it, so it is the shape nearest the 50 % stop: held
    // under 40 % at every point count, at 30 and 35 kpps, plain and through a corner pin like the owner's.
    it('point is never still and never puts 40 % in one window, at any size from 0.05, any points, plain or pinned', () => {
        expect(LASER_SHAPES[43]).toBe('point')
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        const pinned = { on: true, flipX: false, flipY: false, size: 1.05, x: 0, y: 0, order: 0, corners: [[-0.805, -1], [0.784, -1], [0.784, -0.34], [-0.788, -0.332]] }
        const plain = { ...pinned, size: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }
        for (const rate of [30000, 35000]) {
            for (const points of [16, 120, 300, 900, 1992]) {
                for (const size of [1, 0.5, 0.1, 0.05]) {
                    for (const cube of [plain, pinned]) {
                        const look = { shape: 'point', size, height: 0, x: 0, rotation: 0, spin: 0, level: 1, colour: '#ffffff', points, copies: 0, rainbow: false, cycle: 0, pulse: 0, pulseBeats: 1, sweep: 0, sweepBeats: 4, mirror: false, phase: 0, react: 0 }
                        const frame = g.optimisePath(applyZone(flattenLaserPaths(lookPointsAt(look, { t: 0, clock: { bpm: 120, zero: 0 }, cube, master: 1 }), { budget: null }).points, zone).points, at(rate)).points
                        const label = `point ${size} × ${points} at ${rate}${cube === pinned ? ', pinned' : ''}`
                        expect(stillBeams(frame), label).toEqual([])
                        expect(dwellSpots(frame, { minShare: 0 })[0].share, label).toBeLessThan(0.4)
                    }
                }
            }
        }
    })
    // 2026-11-01: heartbeat, a cardiogram's trace with sharp spikes (the guards hold the beam at each tip). Held at every
    // eighth of a beat over a sweep and more, at 1 to 8 beats across.
    it('heartbeat as sent is never still at any eighth of a beat, and never puts 40 % in one window', () => {
        expect(LASER_SHAPES[42]).toBe('heartbeat')
        const plan = at(30000)
        for (const size of [0.5, 0.1, 0.05]) {
            for (const copies of [0, 1, 8]) {
                for (let beat = 0; beat < 9; beat += 0.125) {
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape: 'heartbeat', size, height: 0.5, points: 600, copies, beat }), { budget: null }).points, normaliseZone()).points, plan).points
                    expect(stillBeams(frame), `heartbeat ${size} ×${copies} beat ${beat}`).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, `heartbeat ${size} ×${copies} beat ${beat}`).toBeLessThan(0.4)
                }
            }
        }
    })
    // 2026-11-01: dust, up to 28 dots each 0.046 of the field across at any size (just over the 0.032 window). Only dots, so every one must stay a stroke:
    // checked as sent, and as the desk draws it through a corner pin like the owner's (80 % wide, 33 % tall).
    it('dust as sent is never still at any quarter beat over 16 from MARK_MIN_SIZE up, nor through a narrowing corner pin; 28 dots fit the real cube', () => {
        expect(LASER_SHAPES[41]).toBe('dust')
        const plan = at(30000)
        for (const size of [1, 0.5, MARK_MIN_SIZE]) {
            for (const copies of [0, 28]) {
                for (let beat = 0; beat < 16; beat += 0.25) {
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(generateShape({ shape: 'dust', size, height: 0, points: 400, copies, beat }), { budget: null }).points, normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })).points, plan).points
                    expect(stillBeams(frame), `dust ${size} ×${copies} beat ${beat}`).toEqual([])
                    expect(dwellSpots(frame, { minShare: 0 })[0].share, `dust ${size} ×${copies} beat ${beat}`).toBeLessThan(0.1)
                }
            }
        }
        const { lookPointsAt } = require('../../../shared/laserLook.cjs')
        const cube = { on: true, flipX: false, flipY: false, size: 1.05, x: 0, y: 0, order: 0, corners: [[-0.805, -1], [0.784, -1], [0.784, -0.34], [-0.788, -0.332]] }
        const look = { shape: 'dust', size: 0.952, height: 0, x: 0, rotation: 0, spin: 0, level: 1, colour: '#ffffff', points: 400, copies: 28, rainbow: false, cycle: 0, pulse: 0, pulseBeats: 1, sweep: 0, sweepBeats: 4, mirror: false, phase: 0, react: 0 }
        const budget = g.frameBudget(35000, 6000)
        for (let beat = 0; beat < 16; beat += 0.25) {
            const drawn = lookPointsAt(look, { t: beat * 500, clock: { bpm: 120, zero: 0 }, cube, master: 1 })
            const r = g.optimisePath(applyZone(flattenLaserPaths(drawn, { budget: null }).points, normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })).points, at(35000), budget)
            expect(r.overBudget, `pinned dust beat ${beat}`).toBe(false)
            expect(stillBeams(r.points), `pinned dust beat ${beat}`).toEqual([])
        }
    })
    // As the desk and Laser Out send them: flattened, a blank point before every mark, so the frame's last mark never
    // joins its first into one stroke when the frame loops.
    it('the sparkles as sent are never still from MARK_MIN_SIZE up, at any half beat or turn; at 0.05 they are dots, which the engine stops', () => {
        const sent = (shape, size, beat, rotation) => applyZone(flattenLaserPaths(generateShape({ shape, size, height: 0.5, points: 300, rotation, beat }), { budget: null }).points, normaliseZone()).points
        for (const shape of MARK_SHAPES) {
            for (let beat = 0; beat < 24; beat += 0.5) {
                for (const rotation of [0, 0.0625, 0.125]) {
                    for (const size of [0.5, MARK_MIN_SIZE]) {
                        const frame = sent(shape, size, beat, rotation)
                        expect(stillBeams(frame), `${shape} ${size} beat ${beat} turn ${rotation}`).toEqual([])
                        expect(stillBeams(g.optimisePath(frame, at(35000)).points), `${shape} ${size} beat ${beat} turn ${rotation}, optimised`).toEqual([])
                    }
                }
                const dots = stillBeams(sent(shape, 0.05, beat, 0))
                expect(dots.length, `${shape} 0.05 beat ${beat}`).toBeGreaterThan(0)
                expect(dots.every((d) => d.kind === 'dot')).toBe(true)
            }
        }
    })
    it('the engine judges the optimised frame: a moving circle held 2 s is never stopped', () => {
        const rig = armed(ONE)
        rig.engine.setFrame('all', generateShape({ shape: 'star', size: 0.05, height: 0.5, points: 120 }))
        for (let i = 0; i < 100; i += 1) rig.tick(20)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
    })
})

describe('config and state', () => {
    it('defaults in code, laser.json guards for all, per cube over that; every value clamped into its safe range and named', () => {
        const rig = armed({ guards: { litStep: 0.02, startDwell: -3 }, cubes: [{ id: 'cube-1', ip: '10.0.0.51', guards: { blankStep: 0.05, tempEndC: 10 } }, { id: 'cube-2', ip: '10.0.0.52' }] })
        const [a, b] = rig.engine.state().cubes
        expect(a.guards).toMatchObject({ litStep: 0.02, blankStep: 0.05, startDwell: 1, tempEndC: 40, tempStartC: 35, validated: false })
        expect(a.guards.clamped).toEqual(expect.arrayContaining(['startDwell', 'tempEndC', 'tempStartC']))
        expect(b.guards).toMatchObject({ litStep: 0.02, blankStep: 0.1, startDwell: 1, clamped: ['startDwell'] })
    })
    it('laser.json cannot switch a guard off (review §5): the values that did are clamped to the loosest cited practice', () => {
        const off = g.normaliseGuards({ litStep: 2, blankStep: 2, cornerAngleDeg: 180, startDwell: 0, endDwell: 0, blankBeforeOnMs: 0, litBeforeOffMs: 0, tempStartC: 99, tempEndC: 100, tempMinScale: 1, tempSamples: 10000, tempPeriodMs: 10000 })
        expect(off).toMatchObject({ litStep: 2 / 60, blankStep: 0.1, cornerAngleDeg: 30, startDwell: 1, endDwell: 1, blankBeforeOnMs: 0.06, litBeforeOffMs: 0.1, tempStartC: 60, tempEndC: 75, tempMinScale: 0.5 })
        expect(off.tempSamples * off.tempPeriodMs).toBeLessThanOrEqual(30000)
        const dos = g.normaliseGuards({ litStep: 0.001, tempSamples: 1, tempPeriodMs: 10 })
        expect(dos.litStep).toBe(0.005)
        expect(dos.tempSamples * dos.tempPeriodMs).toBeGreaterThanOrEqual(1000)
        expect(g.normaliseGuards({ litStep: 'x' }).clamped).toEqual(['litStep'])
    })
    it('the state shows what the guards did to the frame being drawn', () => {
        const rig = armed(ONE)
        rig.engine.setFrame('all', [lit(-0.5, 0.5), lit(0.5, 0.5)])
        rig.tick(20)
        const { path: p } = rig.engine.state().cubes[0]
        expect(p).toMatchObject({ rate: 30000, pointsIn: 2 })
        expect(p.pointsOut).toBeGreaterThan(80)
        expect(p.maxLitStep).toBeLessThanOrEqual(0.025 + 1e-9)
        expect(rig.engine.state().guard.path).toMatchObject({ litStep: 0.025, blankStep: 0.1, referenceRate: 30000, validated: false })
    })
    it('SET_RATE (0x82) is never sent by default; with guards.sendSetRate and a laser.json dacRate it goes before the clear and output-on', () => {
        const cmdsOf = (rig) => rig.sent.filter((s) => s.port === proto.PORT.CMD && s.buf[0] !== 0x77).map((s) => [...s.buf])
        expect(cmdsOf(armed(ONE)).some((b) => b[0] === 0x82)).toBe(false)
        expect(cmdsOf(armed({ cubes: [{ id: 'cube-1', ip: '10.0.0.51', guards: { sendSetRate: true } }] })).some((b) => b[0] === 0x82)).toBe(false) // nothing asked
        const on = cmdsOf(armed({ dacRate: 30000, cubes: [{ id: 'cube-1', ip: '10.0.0.51', guards: { sendSetRate: true } }] }))
        expect(on).toEqual([[0x78, 1], [0x82, 0x30, 0x75, 0, 0], [0x8d], [0x8d], [0x8a], [0x80, 1]])
    })
})

// Round 2 (2026-10-14): the review of PR #931 (~/work/agent-reports-2026-10-14/laser-guards-review.md).
describe('round 2: the review\'s findings (reproduced first with the reviewer\'s scripts on ae1ba1ac)', () => {
    const zigzag = Array.from({ length: 2000 }, (_, i) => lit(i % 2 ? 1 : -1, (i / 2000) * 1)) // full-field strokes
    const hold = (rig, ms) => { for (let t = 0; t < ms; t += 20) rig.tick(20) }
    it('§1 the frame budget: 67 ms of points at the cube\'s rate, never above its buffer', () => {
        expect(g.frameBudget(30000)).toBe(2000)
        expect(g.frameBudget(35000, 6000)).toBe(2333)
        expect(g.frameBudget(35000, 1000)).toBe(800)
    })
    it('§1 a frame that the guards make longer than the budget is refused with a named stop, never sped up', () => {
        const opt = g.optimisePath(zigzag, at(30000), g.frameBudget(30000))
        expect(opt).toMatchObject({ points: null, overBudget: true })
        const rig = armed(ONE)
        rig.engine.setFrame('all', zigzag)
        rig.tick(20)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'frame-too-long' })
        expect(rig.engine.state().cubes[0].path).toMatchObject({ overBudget: true, budget: 2000, pointsOut: null })
        // A frame that fits brings it back.
        rig.engine.setFrame('all', generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 500 }))
        rig.tick(20)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
    })
    it('§1 a dark frame cuts the lit pass at once: no lit point after it', () => {
        const rig = armed(ONE)
        rig.engine.setFrame('all', generateShape({ shape: 'star', size: 0.9, height: 0.5, points: 1500 }))
        rig.tick(20)
        rig.engine.setFrame('all', [dark(0, 0.5)])
        rig.sent.length = 0
        hold(rig, 200)
        expect(pointsOf(rig.data()).filter((p) => p[2] || p[3] || p[4]).length).toBe(0)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
    })
    it('§2 six cubes × 2000-point frames: the work is done when the frame is posted, one tick takes < 20 ms', () => {
        const six = { cubes: Array.from({ length: 6 }, (_, i) => ({ id: `cube-${i + 1}`, ip: `10.0.0.${51 + i}` })) }
        const rig = armed(six)
        const circle2000 = generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 2000 })
        const ticks = []
        const posts = []
        for (let round = 0; round < 5; round += 1) {
            const t0 = performance.now()
            for (let i = 0; i < 6; i += 1) rig.engine.setFrame(`cube-${i + 1}`, i % 2 ? zigzag : circle2000.map(([x, y, r, gg, b]) => [x + round * 1e-4, y, r, gg, b]))
            posts.push(performance.now() - t0)
            const t1 = performance.now()
            rig.tick(20)
            ticks.push(performance.now() - t1)
        }
        expect(Math.max(...ticks), `ticks ${ticks.map((t) => t.toFixed(1)).join(', ')} ms`).toBeLessThan(20)
        expect(Math.max(...posts), `posts ${posts.map((t) => t.toFixed(1)).join(', ')} ms`).toBeLessThan(100)
    })
    it('§2 cubes at the same rate share one optimised frame', () => {
        const rig = armed({ cubes: [{ id: 'cube-1', ip: '10.0.0.51' }, { id: 'cube-2', ip: '10.0.0.52' }] })
        rig.engine.setFrame('all', generateShape({ shape: 'square', size: 0.5, height: 0.5, points: 120 }))
        rig.tick(20)
        const [a, b] = rig.engine.state().cubes
        expect(a.path).toEqual(b.path)
    })
    it('§3 still if EITHER the posted or the optimised frame is still: a spot plus one far point is stopped', () => {
        const spot = (n) => Array.from({ length: n }, () => lit(0.2, 0.5))
        for (const frame of [[...spot(40), dark(-0.8, 0.9)], [...spot(30), lit(-0.8, 0.9), lit(-0.6, 0.9)], [...spot(120), dark(0.9, 0.1)]]) {
            const rig = armed(ONE)
            rig.engine.setFrame('all', frame)
            hold(rig, 240)
            expect(rig.engine.state().cubes[0].stop, `${frame.length} points`).toMatchObject({ reason: 'still-beam' })
        }
    })
    it('§5 the path is planned at the rate the cube plays, not laser.json\'s dacRate; a disagreement is shown', () => {
        const rig = armed({ ...ONE, dacRate: 25000 })
        rig.engine.setFrame('all', [lit(-0.5, 0.5), lit(0.5, 0.5)])
        rig.tick(20)
        expect(rig.engine.state().cubes[0]).toMatchObject({ rate: 30000, rateMismatch: true, path: { rate: 30000 } })
    })
    it('R2-2 a cube whose over-temperature flag is set is refused at arm (nothing is sent to it); its warning takes the power to the minimum', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-guards-'))
        fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify(ONE))
        const sent = []
        const handlers = {}
        const socket = { send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), port, ip }); done?.() }, on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
        const engine = createLaserEngine({ dataDir: dir, createSocket: () => socket, log: null, now: () => 1000000, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0 })
        handlers.message(infoAnswer({ flagsByte: 0x08 }), { address: '10.0.0.51' })
        sent.length = 0
        const res = engine.arm({ armed: true, confirm: ARM_PHRASE })
        expect(res.ok).toBe(false)
        expect(sent.filter((x) => x.port === proto.PORT.CMD).map((x) => [...x.buf]).some((b) => b[0] === 0x80 && b[1] === 1)).toBe(false)
        expect(engine.state().cubes[0]).toMatchObject({ armed: false, stop: { reason: 'over-temperature' } })
        const warm = armed(ONE, { flagsByte: 0x04 })
        warm.engine.setFrame('all', [lit(0, 0.5), lit(0.2, 0.5)])
        warm.tick(20)
        const maxG = Math.max(...pointsOf(warm.data()).map((p) => p[3]))
        expect(maxG).toBe(proto.toDeviceColour(0.5))
    })
    it('§7 the temperature average starts fresh at every arm', () => {
        const rig = armed(ONE, { temp: 30 })
        hold(rig, 1000)
        expect(rig.engine.state().cubes[0].temperature.samples).toBeGreaterThan(5)
        rig.engine.arm({ armed: false })
        rig.engine.arm({ armed: true, confirm: ARM_PHRASE })
        expect(rig.engine.state().cubes[0].temperature.samples).toBe(0)
    })
    it('real-cube fixture: LaserCube Ultra Mk2 fw 1.17 (dacRate 35000, max 35000, rxBufferSize 6000): budget 2333 points, no Laser shape refused', () => {
        const info = { dac: 35000, max: 35000, free: 6000, size: 6000, minor: 17 }
        const parsed = proto.parseFullInfo(infoAnswer(info))
        expect(parsed).toMatchObject({ dacRate: 35000, maxDacRate: 35000, rxBufferSize: 6000, rxBufferFree: 6000 })
        expect(g.frameBudget(parsed.dacRate, parsed.rxBufferSize)).toBe(2333)
        expect(LASER_SHAPES.length).toBe(65)
        for (const shape of LASER_SHAPES) {
            const rig = armed(ONE, info)
            rig.engine.setFrame('all', generateShape({ shape, size: 0.5, height: 0.5, points: 1992 }))
            rig.tick(20)
            const st = rig.engine.state().cubes[0]
            expect(st.path?.overBudget, shape).toBeFalsy()
            expect(st.stop, shape).toBe(null)
        }
    })

})
