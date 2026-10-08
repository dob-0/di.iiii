import { describe, expect, it } from 'vitest'
import { FLY_DEFAULTS, flyStart, flyStep, forwardFromYawPitch, speedForScene } from './flyMotion.js'

const P = { ...FLY_DEFAULTS, baseSpeed: 10 }
const run = (input, seconds, fps, state = flyStart([0, 0, 0], P), params = P) => {
    let s = state
    const n = Math.round(seconds * fps)
    for (let i = 0; i < n; i++) s = flyStep(s, input, 1 / fps, params)
    return s
}
const len = (v) => Math.hypot(...v)

describe('flyStep', () => {
    it('flies where the camera looks (yaw 0 = -Z) and up along world Y', () => {
        const s = run({ forward: true, yaw: 0, pitch: 0 }, 2, 60)
        expect(s.pos[2]).toBeLessThan(-15)
        expect(Math.abs(s.pos[0])).toBeLessThan(1e-9)
        const u = run({ up: true }, 2, 60)
        expect(u.pos[1]).toBeGreaterThan(15)
        const pitched = run({ forward: true, yaw: 0, pitch: Math.PI / 4 }, 2, 60)
        expect(pitched.pos[1]).toBeGreaterThan(10)
    })
    it('accepts a look vector of any length and strafes to the right of it', () => {
        const s = run({ right: true, look: [0, 0, -5] }, 2, 60)
        expect(s.pos[0]).toBeGreaterThan(15)
        expect(forwardFromYawPitch(0, 0)[2]).toBeCloseTo(-1, 12)
    })
    it('covers the same distance at 30 and 144 fps within 1 %', () => {
        const a = run({ forward: true, yaw: 0.7, pitch: 0.2 }, 1, 30).pos
        const b = run({ forward: true, yaw: 0.7, pitch: 0.2 }, 1, 144).pos
        expect(Math.abs(len(a) - len(b)) / len(b)).toBeLessThan(0.01)
    })
    it('is finite and still on dt = 0, negative, NaN; clamps a huge dt', () => {
        const s0 = flyStart([1, 2, 3], P)
        for (const dt of [0, -1, NaN, Infinity]) {
            const s = flyStep(s0, { forward: true }, dt, P)
            if (dt === Infinity) continue
            expect(s.pos).toEqual([1, 2, 3])
        }
        const big = flyStep(s0, { forward: true }, 1e9, P)
        const clamped = flyStep(s0, { forward: true }, P.maxDt, P)
        expect(big.pos).toEqual(clamped.pos)
        const bad = flyStep({ pos: [NaN, 0, 0], vel: [0, NaN, 0], speed: NaN }, {}, 0.016, P)
        expect(bad.pos.concat(bad.vel).every(Number.isFinite)).toBe(true)
    })
    it('does not mutate its arguments', () => {
        const s = flyStart([0, 0, 0], P)
        const copy = JSON.stringify(s)
        flyStep(s, { forward: true }, 0.016, P)
        expect(JSON.stringify(s)).toBe(copy)
    })
    it('stops smoothly: speed only falls, never reverses, ends at rest', () => {
        let s = run({ forward: true }, 2, 60)
        let prev = len(s.vel)
        expect(prev).toBeGreaterThan(9)
        const z0 = s.pos[2]
        for (let i = 0; i < 120; i++) {
            s = flyStep(s, {}, 1 / 60, P)
            const v = len(s.vel)
            expect(v).toBeLessThanOrEqual(prev + 1e-12)
            expect(s.vel[2]).toBeLessThanOrEqual(0)
            prev = v
        }
        expect(s.vel).toEqual([0, 0, 0])
        const stopDist = z0 - s.pos[2]
        expect(stopDist).toBeGreaterThan(0)
        expect(stopDist).toBeLessThan(P.baseSpeed * 0.2) // roll-out is about speed * stopTime
    })
    it('diagonal is not faster than straight', () => {
        const straight = run({ forward: true, yaw: 0 }, 2, 60)
        const diag = run({ forward: true, right: true, up: true, yaw: 0 }, 2, 60)
        expect(len(diag.vel)).toBeCloseTo(len(straight.vel), 6)
        expect(len(diag.pos)).toBeLessThanOrEqual(len(straight.pos) + 1e-9)
    })
    it('opposite keys cancel, analogue magnitude below 1 is kept', () => {
        expect(run({ forward: true, back: true }, 1, 60).pos).toEqual([0, 0, 0])
        const half = run({ forward: 0.5 }, 2, 60)
        expect(len(half.vel)).toBeCloseTo(5, 0)
    })
    it('sprint multiplies the cruise speed', () => {
        const n = run({ forward: true }, 3, 60)
        const sp = run({ forward: true, sprint: true }, 3, 60)
        expect(len(sp.vel) / len(n.vel)).toBeCloseTo(P.sprintFactor, 2)
    })
    it('wheel scales speed by wheelStep per notch and clamps to the range', () => {
        const at = (wheel, dt = 0.016) => flyStep(flyStart([0, 0, 0], P), { wheel }, dt, P).speed
        expect(at(2)).toBeCloseTo(10 * P.wheelStep ** 2, 9)
        expect(at(-1)).toBeCloseTo(10 / P.wheelStep, 9)
        expect(at(1e4)).toBe(10 * P.maxSpeedFactor)
        expect(at(-1e4)).toBeCloseTo(10 * P.minSpeedFactor, 9)
        expect(at(3, 0)).toBeGreaterThan(10) // the wheel counts even on a zero frame
    })
})

describe('speedForScene', () => {
    it('crosses the scene in crossSeconds', () => {
        expect(speedForScene(50)).toBeCloseTo(100 / FLY_DEFAULTS.crossSeconds, 9)
        expect(speedForScene(50, { crossSeconds: 4 })).toBeCloseTo(25, 9)
    })
    it('clamps and survives bad radii', () => {
        expect(speedForScene(0.01)).toBe(FLY_DEFAULTS.minBaseSpeed)
        expect(speedForScene(1e9)).toBe(FLY_DEFAULTS.maxBaseSpeed)
        for (const r of [NaN, -3, 0, undefined, Infinity]) expect(speedForScene(r)).toBe(FLY_DEFAULTS.baseSpeed)
    })
})
