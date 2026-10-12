// look motion: the room's port of the desk's FX maths (serverXR/src/lighting/fx.js) must agree with it, every mode,
// at fixed `now` values, within 1/255; two viewers with different local clocks and the same server offset see the same frame.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { motionLevel, motionPlan, motionFrame, serverNowOf, FX_MODES, FX_SPATIAL } from './lookMotion.js'

const require = createRequire(import.meta.url)
const fx = require('../../serverXR/src/lighting/fx.js')

// 24 fixed instants: round numbers, odd numbers, a beat edge, big server-clock-sized values.
const NOWS = [0, 1, 24, 25, 26, 249, 250, 499, 500, 777, 1000, 1234, 2500, 3333, 5001, 7777, 12345, 60000, 99999, 123456,
    1791551530919, 1791551531437, 1791551532001, 1791551539999]
// A rig of 18 fixtures with a stage plan: x, y over the desk's world -1..2.
const FIXTURES = Array.from({ length: 18 }, (_, i) => ({ id: `f${i}`, universe: 1, address: 1 + i * 10, x: -0.8 + (i % 6) * 0.5, y: -0.5 + Math.floor(i / 6) * 0.9 }))

describe('look motion parity with fx.js', () => {
    it('lists the same modes and spatial words', () => {
        expect(FX_MODES).toEqual(fx.FX_MODES)
        expect(FX_SPATIAL).toEqual(fx.FX_SPATIAL)
    })
    it('every mode, every spatial, 24 instants, 18 fixtures: within 1/255', () => {
        let max = 0
        let count = 0
        for (const mode of fx.FX_MODES) {
            for (const spatial of fx.FX_SPATIAL) {
                for (const bpm of [20, 60, 124, 300]) {
                    const cfg = { mode, bpm, depth: 255, enabled: true, spatial, exclude: [], epoch: 0 }
                    const order = fx.fxOrder(FIXTURES)
                    for (const now of NOWS) {
                        FIXTURES.forEach((f) => {
                            const i = order.get(f.id)
                            const want = fx.fxLevel(cfg, f, i, FIXTURES.length, now)
                            const got = motionLevel(cfg, f, i, FIXTURES.length, now)
                            max = Math.max(max, Math.abs(want - got))
                            count++
                        })
                    }
                }
            }
        }
        console.log(`PARITY: ${fx.FX_MODES.length} modes x ${fx.FX_SPATIAL.length} spatial x 4 bpm x ${NOWS.length} instants x ${FIXTURES.length} fixtures = ${count} comparisons; max difference ${max}/255 (limit 1/255)`)
        expect(count).toBeGreaterThan(0)
        expect(max).toBeLessThanOrEqual(1)
    })
    for (const mode of fx.FX_MODES) {
        it(`mode ${mode}: matches fx.js at ${NOWS.length} instants (depth 255 and 128)`, () => {
            let max = 0
            for (const depth of [255, 128]) {
                const cfg = { mode, bpm: 120, depth, enabled: true, spatial: 'x', exclude: [], epoch: 0 }
                const order = fx.fxOrder(FIXTURES)
                for (const now of NOWS) for (const f of FIXTURES) {
                    max = Math.max(max, Math.abs(fx.fxLevel(cfg, f, order.get(f.id), FIXTURES.length, now) - motionLevel(cfg, f, order.get(f.id), FIXTURES.length, now)))
                }
            }
            expect(max).toBeLessThanOrEqual(1)
        })
    }
    it('strobe never goes faster than 3 Hz, at any bpm', () => {
        for (const bpm of [20, 120, 300]) {
            const cfg = { mode: 'strobe', bpm, depth: 255 }
            let rises = 0
            let prev = 0
            for (let t = 0; t < 10000; t += 25) {
                const v = motionLevel(cfg, null, 0, 1, t)
                if (v > 128 && prev <= 128) rises++
                prev = v
            }
            expect(rises / 10).toBeLessThanOrEqual(3)
        }
    })
})

const lamp = (i, x, z, universe = 1) => ({ id: `l${i}`, type: 'spotLight', components: { transform: { position: [x, 5, z] }, light: { intensity: 100 }, beam: { haze: 0.4 }, fixture: { type: 'up-pl5403', universe, address: 1 + i * 8 } } })
const ROOM = Array.from({ length: 12 }, (_, i) => lamp(i, -6 + (i % 6) * 2.4, 2 + Math.floor(i / 6) * 14))

describe('look motion in the room', () => {
    const look = { id: 'x', motion: { mode: 'comet', bpm: 120, depth: 255, spatial: 'x', kinds: ['up-pl5403'] } }
    it('is the same frame for two viewers whose local clocks differ by 3 s but share the server offset', () => {
        const plan = motionPlan({ entities: ROOM, look })
        const serverNow = 1791551539000
        const offsetA = 120 // viewer A: local clock is 120 ms behind the server
        const offsetB = 3120 // viewer B: local clock is 3 s further behind
        for (const epoch of [0, 1791551530500]) {
            const a = motionFrame(plan, serverNowOf(serverNow - offsetA, offsetA), epoch)
            const b = motionFrame(plan, serverNowOf(serverNow - offsetB, offsetB), epoch)
            expect([...b.entries()]).toEqual([...a.entries()])
        }
    })
    it('a viewer who ignores the offset is on a different beat (the test can fail)', () => {
        const plan = motionPlan({ entities: ROOM, look })
        const serverNow = 1791551539000
        const right = motionFrame(plan, serverNow, 0)
        const wrong = motionFrame(plan, serverNow - 3120 + 0, 0)
        expect([...wrong.entries()]).not.toEqual([...right.entries()])
    })
    it('only the lit lamps of the kinds take part; others are not in the frame', () => {
        const mixed = [...ROOM, { ...lamp(99, 0, 0), components: { ...lamp(99, 0, 0).components, fixture: { type: 'up-hk1915', universe: 1, address: 900 } } }]
        const plan = motionPlan({ entities: mixed, look, levelOf: (id) => (id === 'l3' ? 0 : 1) })
        expect(plan.lamps.map((l) => l.id)).not.toContain('l3')
        expect(plan.lamps.map((l) => l.id)).not.toContain('l99')
        expect(plan.lamps).toHaveLength(11)
    })
})
