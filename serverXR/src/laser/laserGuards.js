// THE GALVO AND POWER GUARDS — what every frame goes through before it reaches a LaserCube (2026-10-14).
//
// Why: a LaserCube draws whatever points it is sent. Its firmware documents one protection only, a
// 76 °C over-temperature cut-off that does not restart by itself (Wicked Lasers' LaserCube manual,
// laserdockdocs ultra-mk2-pro-manual; libLaserdockCore ldHardwareFilter.cpp:140). Every host program
// that drives these cubes, or galvos in general, smooths the path ON THE HOST: OpenLase (libol),
// Wicked Lasers' own libLaserdockCore (through its OpenLase renderer), ofxLaser, nannou's lasy and
// TouchDesigner's Laser CHOP. di sent shapes raw until now. This module is that host-side layer,
// built from those projects' published practice. Evidence, with file:line and licences:
// ~/work/agent-reports-2026-10-14/laser-guards-{touchdesigner,wicked-nannou,ofx-openlase-helios}.md.
// No code was copied (OpenLase and libLaserdockCore are GPL); the numbers and methods are cited.
//
// THE METHOD, in the order it runs (optimisePath):
//   1. STEP LIMIT (OpenLase libol.c:468-469, 494-495, 727-728): a move longer than the limit is split
//      into equal steps, so no two consecutive points are farther apart than it. Distance is measured
//      per axis (Chebyshev, max |dx|,|dy|) as OpenLase does: X and Y are two separate galvos. The lit
//      and the blank limit differ. The frame loops, so the move from its last point back to its first
//      is split too. A colour belongs to the move INTO its point (ILDA practice; laserFrame.cjs): the
//      steps of a move take the colour of the point they lead to.
//   2. CORNER HOLD (OpenLase get_dwell libol.c:415-447 picks corner vs curve dwell at 30°; ofxLaser
//      Polyline.cpp:89-101 splits at 30°; lasy lib.rs:185-219 adds one point per 0.6 rad of turn):
//      at a lit vertex whose turn is ≥ CORNER_ANGLE_DEG, ceil(turn / 0.6 rad) extra copies of the vertex
//      at 30 kpps — a right angle gets 3, which is libLaserdockCore's "quality" corner_dwell 3
//      (ldRendererOpenlase.cpp:342-346). A vertex whose neighbour sits on it already dwells (the
//      author put the copies there) and gets no extra.
//   3. START AND END DWELL on every lit stretch (libLaserdockCore "quality" start_dwell 2, end_dwell 2
//      at 30 kpps, ldRendererOpenlase.cpp:342-346).
//   4. BLANKING DELAYS (TouchDesigner Laser CHOP as the owner's working TD project sets it,
//      docs.derivative.ca/Laser_CHOP): before colour on, the beam waits blank on the start point
//      1 ms (preblankoff; lasy's blank_delay_points 10 at its 10 kpps default is the same 1 ms);
//      after colour on 0 ms (postblankoff); before colour off it stays lit on the end point 0.3 ms
//      (preblankon); after colour off it waits blank 0.005 ms (postblankon). Milliseconds become
//      points at the cube's rate, rounded (0.005 ms is 0 points at 30 kpps).
//   RATE: the step limits and the point counts are tuned at REFERENCE_RATE 30 kpps (libLaserdockCore
//   ldAbstractRenderer.cpp:31 DEFAULT_RATE 30000; the step numbers below are libLaserdockCore's).
//   A cube run faster gets smaller steps and more dwell points so the galvo speed and the dwell TIMES
//   stay the same — the scaling ofxLaser uses (Laser.cpp:1818, 30000/pps × speed).
//
// THE NUMBERS (DEFAULT_GUARDS), all UNVALIDATED until measured on a real cube with a scope or a camera:
//   litStep 2/80 field units a point at 30 kpps   libLaserdockCore ldRendererOpenlase.cpp:282-297
//                                                  on_speed 2/80 (OpenLase units: 2 = full width,
//                                                  the same as di's -1…1 field); OpenLase svg2ild.py
//                                                  uses 2/90 at 48 kHz
//   blankStep 2/20 field units a point at 30 kpps  OpenLase svg2ild.py:24-26 off_speed 2/20; lasy
//                                                  distance_per_point 0.1 (lib.rs:185-219). Wicked uses
//                                                  2/80 for blank moves too (the slower, safer side);
//                                                  2/20 is the wider practice, kept as the default.
//   cornerAngleDeg 30, cornerRadPerPoint 0.6       as in 2. above
//   startDwell 2, endDwell 2 (points at 30 kpps)   as in 3. above
//   blankBeforeOnMs 1, litAfterOnMs 0,
//   litBeforeOffMs 0.3, blankAfterOffMs 0.005      as in 4. above
//   parkPoints 10                                  blank points held at the centre on a stop; the same
//                                                  10 blank points di's stop sent since 2026-10-09
//   TEMPERATURE (libLaserdockCore ldHardwareFilter.cpp:67-142, class ldLaserPowerLimiter): the cube's
//   temperature (GET_FULL_INFO byte 24, °C, signed — LaserDockNetworkDevice.cpp:436) is sampled every
//   100 ms into a moving average of 150 samples (15 s); from 60 °C the brightness of every point
//   scales linearly down to 50 % at 75 °C and stays at 50 % above. At ≥ 75 °C the cube is marked hot
//   in the state. The firmware cut-off is 76 °C (ldHardwareFilter.cpp:140).
//   STOP (Helios DAC firmware main.c:260-272: a stop outputs "a blanked and centered point"): every
//   stop sends blank points that walk to the centre at the blank step and park there, BEFORE the
//   output-off. (parkPath)
//
// Config: defaults here; laser.json "guards": {...} for all cubes, and per cube "guards": {...}.
// Every key is optional; a bad value falls back. The effective numbers are in /laser/api/state.
'use strict'

const REFERENCE_RATE = 30000

const DEFAULT_GUARDS = Object.freeze({
    litStep: 2 / 80,
    blankStep: 2 / 20,
    cornerAngleDeg: 30,
    cornerRadPerPoint: 0.6,
    startDwell: 2,
    endDwell: 2,
    blankBeforeOnMs: 1,
    litAfterOnMs: 0,
    litBeforeOffMs: 0.3,
    blankAfterOffMs: 0.005,
    parkPoints: 10,
    tempStartC: 60,
    tempEndC: 75,
    tempMinScale: 0.5,
    tempSamples: 150,
    tempPeriodMs: 100,
    sendSetRate: false,
    validated: false,
    clamped: []
})

// THE SAFE RANGES a laser.json value is clamped to (round 2, 2026-10-14, review of PR #931 §5): a
// value may only make a guard STRICTER than the loosest practice cited in the header, never switch it
// off. A value outside its range is clamped to the nearest edge and named in `clamped` (shown in the
// state, logged by the engine). The loose edges, each the loosest cited value:
//   litStep ≤ 2/60   OpenLase ugoira_player.py:105 on_speed 2/60 (the fastest lit speed in the sources)
//   blankStep ≤ 2/20 OpenLase svg2ild.py off_speed, lasy 0.1 (the default is already the loosest)
//   cornerAngleDeg ≤ 30, cornerRadPerPoint ≤ 0.6, startDwell/endDwell ≥ 1  (the cited defaults)
//   blankBeforeOnMs ≥ 0.06 (OpenLase switch_on_dwell 3 at 48 kHz), litBeforeOffMs ≥ 0.1 (switch_off 6 at 48 kHz)
//   tempStartC ≤ 60, tempEndC ≤ 75 (Wicked's limiter), start ≤ end − 5, tempMinScale ≤ 0.5
//   the average window (tempSamples × tempPeriodMs) 1…30 s (Wicked: 15 s)
// The strict edges keep the optimiser's work bounded (the frame budget in the engine refuses a frame
// that does not fit; a step below 0.005 would refuse almost every figure).
const SAFE = Object.freeze({
    litStep: [0.005, 2 / 60], blankStep: [0.01, 2 / 20], cornerAngleDeg: [10, 30], cornerRadPerPoint: [0.2, 0.6],
    startDwell: [1, 10], endDwell: [1, 10], blankBeforeOnMs: [0.06, 5], litAfterOnMs: [0, 5],
    litBeforeOffMs: [0.1, 5], blankAfterOffMs: [0, 5], parkPoints: [5, 100],
    tempStartC: [30, 60], tempEndC: [40, 75], tempMinScale: [0.1, 0.5], tempSamples: [10, 300], tempPeriodMs: [50, 200]
})
const TEMP_WINDOW_MS = Object.freeze([1000, 30000])

/**
 * Guards from config over a base, every key clamped into SAFE; `clamped` lists the keys that were.
 * Pure.
 */
const normaliseGuards = (over, base = DEFAULT_GUARDS) => {
    const g = { ...base }
    const clamped = []
    const clamp = (k, v) => {
        const [lo, hi] = SAFE[k]
        const c = v < lo ? lo : v > hi ? hi : v
        if (c !== v && !clamped.includes(k)) clamped.push(k)
        return c
    }
    if (over && typeof over === 'object') {
        for (const k of Object.keys(SAFE)) {
            if (over[k] === undefined || over[k] === null) continue
            const v = Number(over[k])
            if (Number.isFinite(v)) g[k] = clamp(k, v)
            else if (!clamped.includes(k)) clamped.push(k)
        }
        if (typeof over.sendSetRate === 'boolean') g.sendSetRate = over.sendSetRate
    }
    if (g.tempStartC > g.tempEndC - 5) { g.tempStartC = Math.max(SAFE.tempStartC[0], g.tempEndC - 5); clamped.push('tempStartC') }
    const windowMs = g.tempSamples * g.tempPeriodMs
    if (windowMs < TEMP_WINDOW_MS[0] || windowMs > TEMP_WINDOW_MS[1]) {
        g.tempSamples = Math.round(Math.min(Math.max(windowMs, TEMP_WINDOW_MS[0]), TEMP_WINDOW_MS[1]) / g.tempPeriodMs)
        clamped.push('tempSamples')
    }
    g.startDwell = Math.round(g.startDwell); g.endDwell = Math.round(g.endDwell); g.tempSamples = Math.round(g.tempSamples)
    g.validated = false
    g.clamped = [...new Set([...(base.clamped || []), ...clamped])]
    return Object.freeze(g)
}

// THE FRAME BUDGET (round 2, review §1): one pass of an optimised frame may take at most
// FRAME_MAX_MS — 2000 points at 30 kpps, the longest pass di streamed before the guards
// (FRAME_MAX_POINTS at the reference rate) — and never more than the cube's ring buffer minus the
// margin the engine keeps. A frame over it is REFUSED (a named stop), never sped up: a looser step
// would undo the guard. Bounds both the optimiser's work and how long a replaced frame can play.
const FRAME_MAX_MS = (2000 / REFERENCE_RATE) * 1000
const frameBudget = (rate, rxBufferSize = null, margin = 200) => {
    const byTime = Math.floor((rate * FRAME_MAX_MS) / 1000 + 1e-9)
    return rxBufferSize > margin ? Math.min(byTime, rxBufferSize - margin) : byTime
}

/** The guards in points and field units at one rate (points a second). Pure. */
const pathPlan = (guards, rate = REFERENCE_RATE) => {
    const r = rate > 0 ? rate : REFERENCE_RATE
    const k = REFERENCE_RATE / r
    const atRate = (n) => Math.max(0, Math.round(n / k))
    const ms = (v) => Math.max(0, Math.round((v * r) / 1000))
    return Object.freeze({
        rate: r,
        litStep: guards.litStep * k,
        blankStep: guards.blankStep * k,
        cornerRad: (guards.cornerAngleDeg * Math.PI) / 180,
        cornerRadPerPoint: guards.cornerRadPerPoint,
        cornerScale: 1 / k,
        startDwell: atRate(guards.startDwell),
        endDwell: atRate(guards.endDwell),
        blankBeforeOn: ms(guards.blankBeforeOnMs),
        litAfterOn: ms(guards.litAfterOnMs),
        litBeforeOff: ms(guards.litBeforeOffMs),
        blankAfterOff: ms(guards.blankAfterOffMs),
        parkPoints: Math.max(1, Math.round(guards.parkPoints))
    })
}

const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
const EPS = 1e-9

/** Extra points a lit vertex holds for its turn (2. above), at the plan's rate. Pure. */
const cornerHold = (prev, p, next, plan) => {
    const ax = p[0] - prev[0]; const ay = p[1] - prev[1]
    const bx = next[0] - p[0]; const by = next[1] - p[1]
    const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by)
    if (la < EPS || lb < EPS) return 0
    const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))))
    if (turn < plan.cornerRad - EPS) return 0
    return Math.max(0, Math.round(Math.ceil(turn / plan.cornerRadPerPoint - EPS) * plan.cornerScale))
}

/** The steps strictly between a and b, none longer than `step` (Chebyshev), in colour `rgb`. */
const between = (out, a, b, step, rgb) => {
    const n = Math.ceil(cheb(a, b) / step - EPS)
    for (let j = 1; j < n; j += 1) {
        const f = j / n
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, rgb[0], rgb[1], rgb[2]])
    }
}
const holdAt = (out, p, rgb, count) => { for (let i = 0; i < count; i += 1) out.push([p[0], p[1], rgb[0], rgb[1], rgb[2]]) }
const BLANK = Object.freeze([0, 0, 0])
const rgbOf = (p) => [p[2], p[3], p[4]]

/**
 * The frame as the cube should draw it: step-limited, corners held, every lit stretch dwelt and
 * blank-delayed (the method in the header). The frame loops: the last point leads to the first.
 * Over `maxPoints` it stops early and returns { points: null, overBudget: true } (the engine refuses
 * the frame). Pure; O(min(points out, maxPoints)).
 * @returns {{ points: number[][], stats: { in: number, out: number, maxLitStep: number, maxBlankStep: number } }}
 */
const optimisePath = (points, plan, maxPoints = Infinity) => {
    const n = Array.isArray(points) ? points.length : 0
    const out = []
    for (let i = 0; i < n; i += 1) {
        if (out.length > maxPoints) return { points: null, overBudget: true, stats: { in: n, out: out.length, maxLitStep: null, maxBlankStep: null } }
        const p = points[i]
        const next = points[(i + 1) % n]
        const prev = points[(i - 1 + n) % n]
        const litIn = isLit(p)
        const litOut = isLit(next)
        out.push([p[0], p[1], p[2], p[3], p[4]])
        if (!litIn && litOut) {
            holdAt(out, p, BLANK, plan.blankBeforeOn)
            holdAt(out, p, rgbOf(next), plan.litAfterOn + plan.startDwell)
        } else if (litIn && !litOut) {
            holdAt(out, p, rgbOf(p), plan.endDwell + plan.litBeforeOff)
            holdAt(out, p, BLANK, plan.blankAfterOff)
        } else if (litIn && litOut) {
            holdAt(out, p, rgbOf(p), cornerHold(prev, p, next, plan))
        }
        if (n > 1) between(out, p, next, litOut ? plan.litStep : plan.blankStep, litOut ? rgbOf(next) : BLANK)
    }
    if (out.length > maxPoints) return { points: null, overBudget: true, stats: { in: n, out: out.length, maxLitStep: null, maxBlankStep: null } }
    return { points: out, overBudget: false, stats: { in: n, out: out.length, ...stepStats(out) } }
}

/** The longest lit and blank step of a looping list of points (Chebyshev). Pure. */
const stepStats = (pts) => {
    let maxLitStep = 0
    let maxBlankStep = 0
    for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        const d = cheb(a, b)
        if (isLit(b)) { if (d > maxLitStep) maxLitStep = d } else if (d > maxBlankStep) maxBlankStep = d
    }
    return { maxLitStep, maxBlankStep }
}

/**
 * From where the beam is to a new frame's first point: blank, step-limited, then the blank wait
 * before colour on. [] when the two are within one lit step (a figure that continues). Pure.
 */
const bridgePath = (from, to, plan) => {
    if (!from || !to || cheb(from, to) <= plan.litStep + EPS) return []
    const out = [[from[0], from[1], 0, 0, 0]]
    between(out, from, to, plan.blankStep, BLANK)
    holdAt(out, to, BLANK, Math.max(1, plan.blankBeforeOn))
    return out
}

/** A stop's points: colour off where the beam is, a blank walk to the centre, parked there. Pure. */
const parkPath = (from, plan) => {
    const start = from || [0, 0]
    const out = [[start[0], start[1], 0, 0, 0]]
    between(out, start, [0, 0], plan.blankStep, BLANK)
    holdAt(out, [0, 0], BLANK, plan.parkPoints)
    return out
}

/** Brightness for an averaged temperature (ldLaserPowerLimiter::onUpdateAverager). Pure. */
const powerScale = (averageC, guards = DEFAULT_GUARDS) => {
    if (typeof averageC !== 'number' || !Number.isFinite(averageC) || averageC < guards.tempStartC) return 1
    const f = Math.min((averageC - guards.tempStartC) / (guards.tempEndC - guards.tempStartC), 1)
    return 1 - f * (1 - guards.tempMinScale)
}

/** The moving average the limiter reads: one sample per period at most, the last `samples` kept. */
const createTempAverager = ({ samples = DEFAULT_GUARDS.tempSamples, periodMs = DEFAULT_GUARDS.tempPeriodMs } = {}) => {
    const buf = []
    let lastAt = null
    let sum = 0
    return {
        sample (t, temperature) {
            if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return
            if (lastAt !== null && t - lastAt < periodMs) return
            lastAt = t
            buf.push(temperature)
            sum += temperature
            if (buf.length > samples) sum -= buf.shift()
        },
        average: () => (buf.length ? sum / buf.length : null),
        count: () => buf.length
    }
}

/** A frame's colours scaled (the temperature limiter); the same array when the scale is 1. Pure. */
const scaleColour = (points, scale) => (scale >= 1 ? points : points.map(([x, y, r, g, b]) => [x, y, r * scale, g * scale, b * scale]))

module.exports = {
    REFERENCE_RATE, DEFAULT_GUARDS, SAFE, FRAME_MAX_MS, frameBudget, normaliseGuards, pathPlan, optimisePath, cornerHold, stepStats,
    bridgePath, parkPath, powerScale, createTempAverager, scaleColour
}
