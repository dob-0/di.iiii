import { describe, expect, it } from 'vitest'
import { derive, pressMetrics, frameStats, bob, sensitivity, settleFrames, inputToFrame } from './metrics.mjs'

// A walker with the dev constants (accel 14 m/s², friction 10 m/s², vmax 5.2)
// integrated at a fixed 60 Hz, moving along -z and looking along -z.
function simulate({ vmax = 5.2, accel = 14, friction = 10, holdMs = 3000, tailMs = 2000, dt = 1000 / 60, bobAmp = 0 }) {
    const frames = []
    let v = 0, z = 0, phase = 0
    const tDown = 100, tUp = tDown + holdMs
    for (let t = 0; t <= tUp + tailMs; t += dt) {
        const pressed = t >= tDown && t < tUp
        const target = pressed ? vmax : 0
        const a = pressed ? accel : friction
        v += Math.max(-a * dt / 1000, Math.min(a * dt / 1000, target - v))
        z -= v * dt / 1000
        phase += dt / 1000 * v * 1.8
        frames.push({ t, px: 0, py: 1.6 + bobAmp * Math.sin(phase), pz: z, fx: 0, fy: 0, fz: -1 })
    }
    return { rows: derive(frames), tDown, tUp }
}

describe('movement-rig metrics', () => {
    it('recovers vmax, a linear ramp and the stop of the dev walker', () => {
        const { rows, tDown, tUp } = simulate({})
        const m = pressMetrics(rows, tDown, tUp)
        expect(m.vmax).toBeCloseTo(5.2, 2)
        // 90% of 5.2 at 14 m/s² = 334 ms, quantised to 60 Hz frames
        expect(m.t90).toBeGreaterThan(320)
        expect(m.t90).toBeLessThan(360)
        expect(m.rampShape).toBeCloseTo(0.556, 1)
        // 5.2 / 10 = 520 ms, 5.2² / 20 = 1.35 m
        expect(m.stopMs).toBeGreaterThan(480)
        expect(m.stopMs).toBeLessThan(540)
        expect(m.stopDist).toBeGreaterThan(1.25)
        expect(m.stopDist).toBeLessThan(1.4)
        expect(m.driftAfterRest).toBe(0)
        expect(m.stepCvPct).toBeLessThan(0.5)
    })

    it('measures head bob amplitude', () => {
        const { rows, tUp } = simulate({ bobAmp: 0.05 })
        const b = bob(rows, tUp - 700, tUp)
        expect(b.p2pCm).toBeGreaterThan(9)
        expect(b.p2pCm).toBeLessThanOrEqual(10.01)
        expect(b.hz).toBeGreaterThan(1.2)
        expect(b.hz).toBeLessThan(1.8)
    })

    it('frame stats count hitches', () => {
        const ts = []
        let t = 0
        for (let i = 0; i < 100; i++) { t += i === 50 ? 50 : 16.7; ts.push(t) }
        const s = frameStats(ts)
        expect(s.p50).toBeCloseTo(16.7, 1)
        expect(s.hitches).toBe(1)
        expect(s.max).toBe(50)
    })

    it('converts deg/count to cm/360 and Source-engine sens', () => {
        // CS2 sens 1 at 800 DPI is 0.022 deg/count → 51.95 cm/360
        const s = sensitivity(0.022)
        expect(s.cmPer360).toBeCloseTo(51.95, 1)
        expect(s.sourceSens).toBeCloseTo(1, 6)
        // the dev walker: 0.0117 rad = 0.6704 deg/count
        expect(sensitivity(0.0117 * 180 / Math.PI).cmPer360).toBeCloseTo(1.705, 2)
    })

    it('settle frames: 1 for an instant turn, more for a smoothed one', () => {
        const mk = (ys) => derive(ys.map((yaw, i) => ({ t: i * 16, px: 0, py: 0, pz: 0, fx: Math.sin(yaw), fy: 0, fz: Math.cos(yaw) })))
        expect(settleFrames(mk([0, 0, 0.5, 0.5, 0.5, 0.5]), 20)).toBe(1)
        expect(settleFrames(mk([0, 0, 0.25, 0.375, 0.4375, 0.5, 0.5, 0.5]), 20)).toBe(4)
    })

    it('input-to-frame latency finds the first changed frame', () => {
        const rows = derive([0, 16, 32, 48].map((t, i) => ({ t, px: i >= 2 ? 1 : 0, py: 0, pz: 0, fx: 0, fy: 0, fz: 1 })))
        expect(inputToFrame(rows, [20], (r) => r.x, 1e-6)).toEqual([12])
    })
})
