// look motion: the room's port of the desk's FX maths (serverXR/src/lighting/fx.js) must agree with it, every mode,
// at fixed `now` values, within 1/255; two viewers with different local clocks and the same server offset see the same frame.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { motionLevel, motionPlan, motionFrame, serverNowOf, deskMotionOf, FX_MODES, FX_SPATIAL } from './lookMotion.js'
import { normalizeRigLooks, MOTION_MODES, MOTION_SPATIAL } from '../shared/projectSchema.js'

const require = createRequire(import.meta.url)
const fx = require('../../serverXR/src/lighting/fx.js')
const srv = require('../../serverXR/src/lighting/lookMotion.js')
const cjs = require('../../shared/projectSchema.cjs')
const { Engine, makeFixture } = require('../../serverXR/src/lighting/engine.js')
const { sanitizeLook, sanitizeLayer, kindAllows } = require('../../serverXR/src/lighting/looks.js')

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

// ---- the desk plays the same motion in DMX (serverXR/src/lighting/lookMotion.js) ----------------------------------------
const deskIdOf = (e) => `d-${e.id}`

describe('desk = room: a look\'s motion on the wire', () => {
    it('lists the same words as the schema (both copies) and sanitises a config to the same numbers', () => {
        expect(srv.MOTION_MODES).toEqual(MOTION_MODES)
        expect(srv.MOTION_SPATIAL).toEqual(MOTION_SPATIAL)
        expect(FX_MODES.filter((m) => m !== 'none')).toEqual(MOTION_MODES)
        for (const mode of MOTION_MODES) for (const spatial of MOTION_SPATIAL) {
            const raw = { mode, spatial, bpm: 66, depth: 200, kinds: ['up-pl5403'], still: 0.3 }
            const look = { id: 'a', aims: {}, colours: {}, motion: raw }
            const a = normalizeRigLooks({ looks: [look] }).looks[0].motion
            expect(a).toEqual(raw)
            expect(cjs.normalizeRigLooks({ looks: [look] }).looks[0].motion).toEqual(a)
            expect(srv.sanitizeMotionConfig(raw)).toEqual(a)
        }
        expect(srv.sanitizeMotionConfig({ mode: 'wobble' })).toBeNull()
        expect(srv.sanitizeMotion({ mode: 'breathe' })).toBeNull() // nothing to move = no motion
        expect(srv.sanitizeMotion({ mode: 'breathe', bpm: 9999, units: [{ id: 'a', x: '0.25' }, { id: 'a' }, { id: 7 }] })).toEqual({ mode: 'breathe', bpm: 300, depth: 255, spatial: 'patch', kinds: [], still: 0, units: [{ id: 'a', x: 0.25, y: 0 }] })
    })
    it(`${MOTION_MODES.length} modes x 3 spatial x 2 epochs x ${NOWS.length} instants x 12 lamps: the desk's frame is the room's within 1/255`, () => {
        let max = 0
        let count = 0
        const centre = [1, 0, 3]
        for (const mode of MOTION_MODES) for (const spatial of ['patch', 'x', 'radial-']) {
            const look = { id: 'L', motion: { mode, bpm: 66, depth: 200, spatial, kinds: ['up-pl5403'], still: 0 } }
            const plan = motionPlan({ entities: ROOM, look, centre })
            const desk = srv.sanitizeMotion(deskMotionOf({ entities: ROOM, look, idOf: deskIdOf, centre }))
            expect(desk.units.map((u) => u.id)).toEqual(plan.lamps.map((l) => deskIdOf(l)))
            expect(desk.units.map((u) => [u.x, u.y])).toEqual(plan.lamps.map((l) => [l.x, l.y]))
            for (const epoch of [0, 1791551530500]) for (const now of NOWS) {
                const room = motionFrame(plan, epoch + now, epoch)
                const wire = srv.motionLevels(desk, epoch + now, epoch)
                for (const [id, m] of room) { max = Math.max(max, Math.abs(m * 255 - wire.get(deskIdOf({ id })))); count++ }
            }
        }
        console.log(`DESK PARITY: ${count} comparisons; max difference ${max}/255 (limit 1/255)`)
        expect(count).toBe(MOTION_MODES.length * 3 * 2 * NOWS.length * 12)
        expect(max).toBeLessThanOrEqual(1)
    })
    it('units: the lit lamps of the kinds above `still` only; a lamp not on the desk is no unit; no units = no motion', () => {
        const look = { id: 'L', motion: { mode: 'pulse', bpm: 120, depth: 255, spatial: 'patch', kinds: ['up-pl5403'], still: 0.3 } }
        const m = deskMotionOf({ entities: ROOM, look, levelOf: (id) => (id === 'l3' ? 0.3 : 1), idOf: deskIdOf })
        expect(m.units.map((u) => u.id)).not.toContain('d-l3')
        expect(m.units).toHaveLength(11)
        expect(m.kinds).toEqual(['up-pl5403'])
        expect(m.still).toBe(0.3)
        expect(deskMotionOf({ entities: ROOM, look, idOf: () => null })).toBeNull()
        expect(deskMotionOf({ entities: ROOM, look: { id: 'x' }, idOf: deskIdOf })).toBeNull()
    })
})

// A desk with one wash (dimmer + rgb), a cue layer (LTP, fired at FIRED) holding look B at dimmer 200 over it; A is the look it
// replaced. The wire's dimmer at `now`, and the engine's own multiplier for cross-checks.
const FIRED = 1000
const FROM_FIRED = 400
const UNIT = [{ id: 'w1', x: 0.2, y: 0.5 }]
const motionOf = (mode, o = {}) => ({ mode, bpm: 66, depth: 200, spatial: 'patch', kinds: ['wash'], still: 0, units: UNIT, ...o })
const wireOf = ({ motion = null, from = null, fadeMs = 0, level = 1, fx = null } = {}) => {
    const f = makeFixture({ id: 'w1', profile: 'drgb', address: 1, universe: 0, values: { dimmer: 255, r: 255, g: 255, b: 255 } })
    const looks = [
        sanitizeLook({ id: 'B', steps: [{ values: { w1: { dimmer: 200 } } }], fixtures: ['w1'], ...(motion ? { motion } : {}) }),
        sanitizeLook({ id: 'A', steps: [{ values: { w1: { dimmer: 200 } } }], fixtures: ['w1'], ...(from ? { motion: from } : {}) })
    ]
    const layer = sanitizeLayer({ id: 'c', lookId: 'B', level, merge: 'ltp' })
    layer.firedAt = FIRED
    layer.fadeMs = fadeMs
    layer.fromLookId = from ? 'A' : null
    layer.fromFiredAt = from ? FROM_FIRED : null
    const e = new Engine({ master: 255, blackout: false, fixtures: [f], raw: {}, scenes: [], activeScene: null, chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 }, looks, layers: [layer], fx: fx || { mode: 'none', enabled: false, bpm: 120, depth: 255, spatial: 'patch', exclude: [], epoch: 0 } })
    return { at: (now) => e.render(e.state, now).get(0)[0], state: e.state }
}
const expectDimmer = (m) => Math.round((200 * m) / 255)
const risesPerSecond = (at, seconds = 10) => {
    let rises = 0
    let prev = 0
    for (let ms = 0; ms < seconds * 1000; ms += 25) { const v = at(FIRED + ms); if (v > 100 && prev <= 100) rises++; prev = v }
    return rises / seconds
}

describe('the desk engine plays a look\'s motion', () => {
    it('a look without motion renders byte for byte as before (motionFrame null), at every instant', () => {
        const { at, state } = wireOf()
        expect(srv.motionFrame(state, FIRED + 333, kindAllows)).toBeNull()
        for (const ms of [0, 25, 333, 1818, 5000]) expect(at(FIRED + ms)).toBe(200)
    })
    it('breathe 66 bpm depth 200: at the fire the floor (200 x 55/255 = 43), full at half the period, fx.js\'s curve every frame', () => {
        const { at, state } = wireOf({ motion: motionOf('breathe') })
        expect(at(FIRED)).toBe(43)
        expect(at(FIRED + 1818)).toBe(200) // period = 4 beats of 909 ms = 3636 ms; the peak is half way
        const seen = new Set()
        for (let ms = 0; ms <= 2000; ms += 25) {
            const v = at(FIRED + ms)
            const want = expectDimmer(srv.motionLevels(state.looks[0].motion, FIRED + ms, FIRED).get('w1'))
            expect(Math.abs(v - want)).toBeLessThanOrEqual(1)
            seen.add(v)
        }
        expect(seen.size).toBeGreaterThan(20)
        expect(at(FIRED + 10 * 3636)).toBe(43) // ten periods later it is back on the beat: the epoch is the fire, not 1970
    })
    it('the beat is the layer\'s firedAt: two desks fired 500 ms apart read the same dimmer 500 ms apart', () => {
        const a = wireOf({ motion: motionOf('pulse') })
        const b = wireOf({ motion: motionOf('pulse') })
        b.state.layers[0].firedAt = FIRED + 500
        for (const ms of [0, 100, 455, 900, 1300]) expect(b.at(FIRED + 500 + ms)).toBe(a.at(FIRED + ms))
    })
    it('strobe: never more than 3 flashes a second on the wire, at any bpm, and with the global strobe on top of it', () => {
        for (const bpm of [20, 120, 300]) {
            const { at } = wireOf({ motion: motionOf('strobe', { bpm, depth: 255 }) })
            const r = risesPerSecond(at)
            expect(r).toBeGreaterThan(2)
            expect(r).toBeLessThanOrEqual(3)
        }
        const stacked = wireOf({ motion: motionOf('strobe', { bpm: 120, depth: 255 }), fx: { mode: 'strobe', enabled: true, bpm: 300, depth: 255, spatial: 'patch', exclude: [], epoch: 0 } })
        expect(risesPerSecond(stacked.at)).toBeLessThanOrEqual(3)
        // The global FX still rides a look that does not strobe: a breathe under a global pulse is both, multiplied.
        const both = wireOf({ motion: motionOf('breathe'), fx: { mode: 'pulse', enabled: true, bpm: 120, depth: 255, spatial: 'patch', exclude: [], epoch: 0 } })
        const breatheOnly = wireOf({ motion: motionOf('breathe') })
        const m = fx.fxLevel(both.state.fx, both.state.fixtures[0], 0, 1, FIRED + 1818) / 255
        expect(Math.abs(both.at(FIRED + 1818) - Math.round(breatheOnly.at(FIRED + 1818) * m))).toBeLessThanOrEqual(1)
    })
    it('a crossfade fades the motion too: in over fadeMs from a still look, out of the look it replaced on its own beat', () => {
        const inward = wireOf({ motion: motionOf('breathe'), fadeMs: 1000 })
        expect(inward.at(FIRED)).toBe(200) // t = 0: no motion yet
        const half = srv.motionLevels(inward.state.looks[0].motion, FIRED + 500, FIRED).get('w1')
        expect(Math.abs(inward.at(FIRED + 500) - expectDimmer(255 + (half - 255) * 0.5))).toBeLessThanOrEqual(1)
        expect(inward.at(FIRED + 1000)).toBe(wireOf({ motion: motionOf('breathe') }).at(FIRED + 1000)) // t = 1: the look alone
        const outward = wireOf({ from: motionOf('pulse', { bpm: 120, depth: 255 }), fadeMs: 1000 })
        const old = srv.motionLevels(outward.state.looks[1].motion, FIRED + 250, FROM_FIRED).get('w1')
        expect(Math.abs(outward.at(FIRED + 250) - expectDimmer(old + (255 - old) * 0.25))).toBeLessThanOrEqual(1)
        expect(outward.at(FIRED + 1000)).toBe(200)
        expect(outward.at(FIRED + 2000)).toBe(200)
    })
    it('the layer\'s fader scales the depth: at half level the swing is half; a lamp not in the units is untouched', () => {
        const full = wireOf({ motion: motionOf('breathe') })
        const half = wireOf({ motion: motionOf('breathe'), level: 0.5 })
        const m = srv.motionLevels(full.state.looks[0].motion, FIRED, FIRED).get('w1')
        expect(full.at(FIRED)).toBe(expectDimmer(m))
        expect(half.at(FIRED)).toBe(Math.round((100 * (255 - (255 - m) * 0.5)) / 255)) // the LTP look at half level is 100
        const other = wireOf({ motion: motionOf('strobe', { units: [{ id: 'elsewhere', x: 0, y: 0 }] }) })
        for (const ms of [0, 175, 350]) expect(other.at(FIRED + ms)).toBe(200)
    })
})
