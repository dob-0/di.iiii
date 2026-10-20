import { describe, expect, it } from 'vitest'
import { clampDt, damp, dampLambda, normalizeWheel, stepWalkVelocity, wheelNotches } from './navMath.js'

const W = { maxSpeed: 5.2, accel: 20, friction: 30 }
const settle = (input) => { let v = { speed: 0, strafe: 0 }; for (let i = 0; i < 120; i++) v = stepWalkVelocity(v, input, 1 / 60, W); return v }

describe('stepWalkVelocity', () => {
    it('walk diagonal is not faster than straight', () => {
        const d = settle({ forward: 1, strafe: 1 })
        expect(Math.hypot(d.speed, d.strafe)).toBeCloseTo(5.2, 6)
        expect(settle({ forward: 1, strafe: 0 }).speed).toBeCloseTo(5.2, 6)
    })
    it('clamps dt to 0.1 s so a stall does not jump', () => {
        const v = stepWalkVelocity({ speed: 0, strafe: 0 }, { forward: 1 }, 5, W)
        expect(v.speed).toBeCloseTo(20 * 0.1, 6)
    })
    it('friction brings it to rest', () => { expect(stepWalkVelocity({ speed: 0.0005, strafe: 0 }, {}, 1 / 60, W).speed).toBe(0) })
})
describe('clampDt', () => {
    it('bounds and sanitises', () => { expect(clampDt(2)).toBe(0.1); expect(clampDt(0.02)).toBe(0.02); expect(clampDt(NaN)).toBe(0); expect(clampDt(-1)).toBe(0) })
})
describe('damp', () => {
    it('is frame-rate independent', () => {
        const run = (fps) => { let v = 0; for (let i = 0; i < fps * 0.5; i++) v = damp(v, 1, 0.12, 1 / fps); return v }
        expect(Math.abs(run(30) - run(144))).toBeLessThan(1e-9)
        expect(run(60)).toBeCloseTo(1 - Math.exp(-0.5 / 0.12), 9)
    })
    it('dampLambda matches', () => { expect(dampLambda(0, 1, 5, 0.2)).toBeCloseTo(1 - Math.exp(-1), 12) })
})
describe('normalizeWheel', () => {
    it('is deltaMode aware', () => {
        expect(normalizeWheel({ deltaY: 100, deltaMode: 0 })).toBe(100)
        expect(normalizeWheel({ deltaY: 3, deltaMode: 1 })).toBe(48)
        expect(normalizeWheel({ deltaY: 1, deltaMode: 2 })).toBe(100)
        expect(normalizeWheel({ deltaY: 'x' })).toBe(0)
    })
    it('100 px = one notch, wheel up positive', () => {
        expect(wheelNotches({ deltaY: -100, deltaMode: 0 })).toBe(1)
        expect(wheelNotches({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(-0.1, 9)
    })
})
