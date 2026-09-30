import { describe, expect, it } from 'vitest'
import {
    DEFAULT_POOL_OPTIONS, POOL_ID_PREFIX, applyLightPool, cutoffWindow, emptyPool, lampScore, lightPoolOptions, lightPoolWanted,
    poolSettled, rankLamps, rayBoxExit, slotDrawing, solidAngle, stepLightPool
} from './lightPool.js'
import { beamCastsLight } from '../objectComponents/spotBeam.js'

const lamp = (id, intensity, extra = {}) => ({
    id,
    type: 'spotLight',
    name: id,
    components: {
        transform: { position: [0, 4, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { color: '#ffffff', intensity, distance: 30, angle: 0.3, penumbra: 0.2, decay: 2 },
        beam: { visible: true, haze: 0.6, only: true },
        ...extra
    }
})
const lamps = (levels) => Object.entries(levels).map(([id, i]) => lamp(id, i))
const opts = { slots: 2, minHoldMs: 1000, handoverMs: 400, margin: 0.15 }
const held = (state) => state.slots.map((s) => s.lamp)
const realLights = (entities) => entities.filter((e) => e.type === 'spotLight' && beamCastsLight(e.components.beam))

describe('the score', () => {
    it('is level × candela × the cone, deterministic, ties by id', () => {
        const ranked = rankLamps(lamps({ b: 100, a: 100, c: 50, d: 0 }))
        expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
        expect(ranked[3].score).toBe(0)
        expect(lampScore(lamp('x', 100))).toBeCloseTo(100 * solidAngle(0.3), 6)
        expect(rankLamps(lamps({ b: 100, a: 100 }))).toEqual(rankLamps(lamps({ a: 100, b: 100 })))
    })
    it('a wider cone at the same candela puts more light into the room', () => {
        const wide = lamp('w', 100); wide.components.light.angle = 0.6
        expect(lampScore(wide)).toBeGreaterThan(lampScore(lamp('n', 100)))
    })
    it('the room box: a beam that lands within the light\'s reach counts fully, beyond it not at all', () => {
        const bounds = { min: [-10, 0, -10], max: [10, 8, 10] }
        expect(rayBoxExit([0, 4, 0], [0, -1, 0], bounds)).toBe(4)
        expect(rayBoxExit([0, 40, 0], [0, -1, 0], bounds)).toBeNull()
        expect(cutoffWindow(4, 30)).toBeCloseTo(1, 2)
        expect(cutoffWindow(4, 3)).toBe(0)
        const near = lamp('near', 100); const far = lamp('far', 100); far.components.light.distance = 3
        expect(lampScore(near, { bounds })).toBeGreaterThan(0)
        expect(lampScore(far, { bounds })).toBe(0)
    })
    it('takes only rig lamps: a visible beam with a light, never a flash nor a pool slot', () => {
        const strobe = lamp('s', 100, { rigFlash: { kind: 'strobe', level: 1 } })
        const hidden = lamp('h', 100, { beam: { visible: false } })
        const pool = lamp(`${POOL_ID_PREFIX}0`, 100)
        expect(rankLamps([strobe, hidden, pool, lamp('ok', 1)]).map((r) => r.id)).toEqual(['ok'])
    })
})

describe('the pool step', () => {
    it('fills the slots with the brightest lamps and returns the same state when nothing changes', () => {
        const s1 = stepLightPool(null, lamps({ a: 10, b: 30, c: 20 }), 0, opts)
        expect(held(s1)).toEqual(['b', 'c'])
        const s2 = stepLightPool(s1, lamps({ a: 10, b: 30, c: 20 }), 100, opts)
        expect(s2).toBe(s1)
    })
    it('all levels zero: every slot empty, and the pool still has N entities at intensity 0', () => {
        const dark = lamps({ a: 0, b: 0, c: 0 })
        const s = stepLightPool(null, dark, 0, opts)
        expect(held(s)).toEqual([null, null])
        const out = applyLightPool(dark, s, 0, opts)
        const slots = out.filter((e) => e.id.startsWith(POOL_ID_PREFIX))
        expect(slots).toHaveLength(2)
        expect(slots.every((e) => e.components.light.intensity === 0)).toBe(true)
        expect(realLights(out)).toHaveLength(2)
    })
    it('fewer lamps than slots: the spare slots stay mounted, parked, at 0', () => {
        const one = lamps({ a: 10 })
        const s = stepLightPool(null, one, 0, opts)
        expect(held(s)).toEqual(['a', null])
        const out = applyLightPool(one, s, 1000, opts)
        expect(realLights(out)).toHaveLength(2)
        expect(out.find((e) => e.id === `${POOL_ID_PREFIX}1`).components.light.intensity).toBe(0)
        expect(out.find((e) => e.id === `${POOL_ID_PREFIX}1`).components.transform.position[1]).toBe(-1000)
    })
    it('the count of real lights is always N, whatever the document said', () => {
        const doc = [...lamps({ a: 10, b: 20, c: 30 }).map((e) => ({ ...e, components: { ...e.components, beam: { visible: true, haze: 0.6 } } })), lamp('d', 5)]
        expect(realLights(doc)).toHaveLength(3)
        const s = stepLightPool(null, doc, 0, opts)
        const out = applyLightPool(doc, s, 0, opts)
        expect(realLights(out)).toHaveLength(2)
        expect(out.filter((e) => e.id.startsWith(POOL_ID_PREFIX)).every((e) => e.components.beam.visible === false)).toBe(true)
        expect(out.filter((e) => !e.id.startsWith(POOL_ID_PREFIX) && e.type === 'spotLight').every((e) => e.components.beam.only === true)).toBe(true)
        expect(applyLightPool(out, s, 0, opts).filter((e) => e.id.startsWith(POOL_ID_PREFIX))).toHaveLength(2)
    })
    it('a slot copies its lamp\'s place, aim, colour and angle, and follows its intensity', () => {
        const a = lamp('a', 40); a.components.transform = { position: [1, 5, 2], rotation: [0.3, 0.2, 0], scale: [1, 1, 1] }; a.components.light.color = '#ff0000'; a.components.light.angle = 0.5
        const s = stepLightPool(null, [a], 0, opts)
        const slot = applyLightPool([a], s, 1000, opts).find((e) => e.id === `${POOL_ID_PREFIX}0`)
        expect(slot.components.transform.position).toEqual([1, 5, 2])
        expect(slot.components.transform.rotation).toEqual([0.3, 0.2, 0])
        expect(slot.components.light).toMatchObject({ color: '#ff0000', angle: 0.5, intensity: 40 })
        a.components.light.intensity = 12
        expect(applyLightPool([a], s, 1000, opts).find((e) => e.id === `${POOL_ID_PREFIX}0`).components.light.intensity).toBe(12)
    })
    it('hysteresis: a challenger within the margin never unseats; beyond it, only once the hold is over', () => {
        const s1 = stepLightPool(null, lamps({ a: 10, b: 30, c: 20 }), 0, opts)
        expect(held(s1)).toEqual(['b', 'c'])
        expect(stepLightPool(s1, lamps({ a: 22, b: 30, c: 20 }), 5000, opts)).toBe(s1)
        const s2 = stepLightPool(s1, lamps({ a: 40, b: 30, c: 20 }), 500, opts)
        expect(s2).toBe(s1) // locked: c took its slot at 0, hold is 1000
        const s3 = stepLightPool(s1, lamps({ a: 40, b: 30, c: 20 }), 1000, opts)
        expect(held(s3)).toEqual(['b', 'a'])
        expect(s3.slots[1]).toMatchObject({ lamp: 'a', from: 'c', since: 1000, fadeStart: 1000 })
    })
    it('a lamp that goes dark frees its slot at once, hold or not', () => {
        const s1 = stepLightPool(null, lamps({ a: 10, b: 30, c: 20 }), 0, opts)
        const s2 = stepLightPool(s1, lamps({ a: 10, b: 0, c: 20 }), 100, opts)
        expect(held(s2)).toEqual(['a', 'c'])
        expect(s2.slots[0].from).toBeNull()
        expect(slotDrawing(s2.slots[0], 100, 400)).toEqual({ lamp: 'a', envelope: 0 })
        expect(slotDrawing(s2.slots[0], 300, 400).envelope).toBeCloseTo(1, 6)
    })
    it('no slot changes lamp more than once per hold, however the scores flap', () => {
        let s = stepLightPool(null, lamps({ a: 10, b: 30, c: 20 }), 0, opts)
        const changes = []
        for (let now = 33; now <= 3000; now += 33) {
            const flap = Math.floor(now / 100) % 2 === 0 ? { a: 50, b: 30, c: 20 } : { a: 10, b: 30, c: 50 }
            const next = stepLightPool(s, lamps(flap), now, opts)
            next.slots.forEach((slot, k) => { if (slot.lamp !== s.slots[k].lamp) changes.push({ k, now }) })
            s = next
        }
        expect(changes.length).toBeGreaterThan(0)
        for (let i = 1; i < changes.length; i += 1) {
            const prev = changes.slice(0, i).reverse().find((c) => c.k === changes[i].k)
            if (prev) expect(changes[i].now - prev.now).toBeGreaterThanOrEqual(opts.minHoldMs)
        }
    })
    it('the hand-over is a dip, continuous in intensity, from the old lamp to the new', () => {
        const scene = lamps({ a: 40, b: 30, c: 20 })
        const s1 = stepLightPool(null, lamps({ a: 10, b: 30, c: 20 }), 0, opts)
        const s2 = stepLightPool(s1, scene, 2000, opts)
        expect(held(s2)).toEqual(['b', 'a'])
        let last = null
        for (let now = 2000; now <= 2400; now += 10) {
            const e = applyLightPool(scene, s2, now, opts).find((x) => x.id === `${POOL_ID_PREFIX}1`)
            const drawn = slotDrawing(s2.slots[1], now, opts.handoverMs)
            expect(drawn.lamp).toBe(now < 2200 ? 'c' : 'a')
            if (last !== null) expect(Math.abs(e.components.light.intensity - last)).toBeLessThanOrEqual(2.01)
            last = e.components.light.intensity
        }
        expect(last).toBe(40)
        expect(applyLightPool(scene, s2, 2000, opts).find((x) => x.id === `${POOL_ID_PREFIX}1`).components.light.intensity).toBe(20)
        expect(poolSettled(s2, 2399, 400)).toBe(false)
        expect(poolSettled(s2, 2400, 400)).toBe(true)
    })
    it('never has more slots than the shadow-safe ceiling', () => {
        expect(emptyPool(40).slots).toHaveLength(12)
        expect(lightPoolOptions({ lightPool: { slots: 40 } }).slots).toBe(12)
        expect(lightPoolOptions(undefined)).toMatchObject({ slots: DEFAULT_POOL_OPTIONS.slots, bounds: null })
    })
})

describe('the flag', () => {
    it('is off unless the document or the page query asks', () => {
        expect(lightPoolWanted({})).toBe(false)
        expect(lightPoolWanted({ mappingState: { lightPool: { enabled: false } } })).toBe(false)
        expect(lightPoolWanted({ mappingState: { lightPool: { enabled: true } } })).toBe(true)
        expect(lightPoolWanted({ search: '?lightPool=1' })).toBe(true)
        expect(lightPoolWanted({ search: '?x=2&lightPool=on' })).toBe(true)
        expect(lightPoolWanted({ search: '?lightPool=0' })).toBe(false)
    })
})

describe('review A5 fixes', () => {
    const one = { slots: 1, minHoldMs: 1000, handoverMs: 400, margin: 0.15 }
    const envAt = (scene, state, now) => {
        const slot = applyLightPool(scene, state, now, one).find((x) => x.id === `${POOL_ID_PREFIX}0`)
        return { lamp: slot.components.lightPool.lamp, i: slot.components.light.intensity }
    }
    it('A5-2: the incoming lamp going dark mid fade-out gives the slot back without a step', () => {
        let scene = lamps({ a: 100, b: 10 })
        let s = stepLightPool(null, scene, 0, one)
        expect(held(s)).toEqual(['a'])
        scene = lamps({ a: 10, b: 100 })
        s = stepLightPool(s, scene, 2000, one) // swap a -> b, dip starts
        const before = envAt(scene, s, 2100)
        expect(before.lamp).toBe('a')
        const dark = lamps({ a: 10, b: 0 })
        s = stepLightPool(s, dark, 2100, one)
        const after = envAt(dark, s, 2100)
        expect(after.lamp).toBe('a')
        expect(Math.abs(after.i - before.i)).toBeLessThanOrEqual(0.01 * 10 + 0.01)
        expect(envAt(dark, s, 2133).i).toBeGreaterThan(after.i)
    })
    it('A5-3: minHoldMs below handoverMs cannot re-let a slot mid-dip', () => {
        expect(lightPoolOptions({ lightPool: { minHoldMs: 0, handoverMs: 400 } }).minHoldMs).toBe(400)
        const o = { slots: 1, minHoldMs: 0, handoverMs: 400, margin: 0.15 }
        let s = stepLightPool(null, lamps({ a: 10 }), 0, o)
        s = stepLightPool(s, lamps({ a: 10, b: 50 }), 2000, o)
        expect(s.slots[0]).toMatchObject({ lamp: 'b', from: 'a', fadeStart: 2000 })
        const s2 = stepLightPool(s, lamps({ a: 10, b: 50, c: 500 }), 2100, o)
        expect(s2.slots[0].lamp).toBe('b') // c waits for the dip to finish
        const s3 = stepLightPool(s2, lamps({ a: 10, b: 50, c: 500 }), 2400, o)
        expect(s3.slots[0].lamp).toBe('c')
    })
    it('A5-4: a strobing lamp strobes its slot too', () => {
        const strobing = lamp('s', 100)
        strobing.components.beam = { visible: true, only: true, strobeHz: 5 }
        const scene = [strobing]
        const s = stepLightPool(null, scene, 0, one)
        const slot = applyLightPool(scene, s, 1000, one).find((x) => x.id === `${POOL_ID_PREFIX}0`)
        expect(slot.components.beam.strobeHz).toBe(5)
        expect(applyLightPool(lamps({ a: 10 }), stepLightPool(null, lamps({ a: 10 }), 0, one), 1000, one).find((x) => x.id === `${POOL_ID_PREFIX}0`).components.beam.strobeHz).toBeUndefined()
    })
})
