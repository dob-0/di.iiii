// lite-vs-full-gpu.cjs: the pure parts of the Lite / Full GPU measurement (the page-side code needs a real GPU and
// is exercised by the run itself). What is checked here is what the printed numbers are computed from.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { spotLightCone } from '../../src/objectComponents/spotBeam.js'

const require = createRequire(import.meta.url)
const { falloff, coneSr, stats, docFor, quantile, lumY, waitCool } = require('./lite-vs-full-gpu.cjs')
const DEG = Math.PI / 180

describe('three\'s spot cone, in numbers', () => {
    it('the falloff is 1 on the axis, 0 at the cutoff, and three\'s smoothstep between', () => {
        const cone = { angle: 20 * DEG, penumbra: 0.5 }
        expect(falloff(0, cone)).toBe(1)
        expect(falloff(20 * DEG, cone)).toBe(0)
        expect(falloff(10 * DEG, cone)).toBe(1) // the penumbra starts at cutoff · (1 − 0.5)
        const mid = falloff(15 * DEG, cone)
        expect(mid).toBeGreaterThan(0)
        expect(mid).toBeLessThan(1)
    })
    it('the lumens of a cone: a hard cone is 2π(1 − cos θ); the rig\'s fit carries twice a PAR\'s raw cone', () => {
        const hard = { angle: 10 * DEG, penumbra: 0 }
        expect(coneSr(hard)).toBeCloseTo(2 * Math.PI * (1 - Math.cos(10 * DEG)), 3)
        // the PL5403 at the maker's 15 deg beam, as the room draws it and as the pool slot was drawn before the fix
        const raw = { angle: 7.5 * DEG, penumbra: 0.5 }
        const fitted = spotLightCone(raw)
        expect(coneSr(fitted) / coneSr(raw)).toBeGreaterThan(1.99)
        expect(coneSr(fitted) / coneSr(raw)).toBeLessThan(2.01)
    })
})

describe('the numbers the run prints', () => {
    it('lumY: the share of a lamp\'s candela the lux probe sees (Rec.709 luminance of the linear colour)', () => {
        expect(lumY('ffffff')).toBeCloseTo(1, 6)
        expect(lumY('000000')).toBe(0)
        // the PL5403 slot's warm white #e8e4dc read 0.7778 of E = I/d² on the GPU (2026-10-10)
        expect(lumY('e8e4dc')).toBeCloseTo(0.7778, 3)
        expect(lumY('ff0000')).toBeCloseTo(0.2126, 4)
    })
    it('stats: nearest-rank quantiles, and an empty list is n 0', () => {
        expect(stats([])).toEqual({ n: 0 })
        const s = stats([5, 1, 3, 2, 4, 100, NaN])
        expect(s).toMatchObject({ n: 6, min: 1, max: 100, median: 3, p95: 100, p99: 100 })
        expect(quantile([1, 2, 3, 4], 0.5)).toBe(2)
    })
    it('docFor: one cue holds the look, in the browser\'s copy; the groups named are held at 0', () => {
        const doc = { entities: [{ id: 'rig-show', components: { rigLooks: { looks: [{ id: 'peak', levels: { 'a/up-b380f': 1, 'b/up-pl5403': 0.8 } }] } } }], mappingState: { cues: [{ id: 'x' }], loop: false } }
        const out = docFor(doc, { look: 'peak', zeroWords: ['b380f'] }, 1000)
        expect(out.mappingState.cues).toHaveLength(1)
        expect(out.mappingState.cues[0]).toMatchObject({ id: 'held-peak', lightLook: 'rig-peak', hold: 3600, fade: 0 })
        expect(out.mappingState.showEpoch).toBe(500)
        expect(out.mappingState.loop).toBe(true)
        expect(out.entities[0].components.rigLooks.looks[0].levels).toEqual({ 'a/up-b380f': 0, 'b/up-pl5403': 0.8 })
        // without words nothing is zeroed
        const same = docFor({ entities: [], mappingState: {} }, { look: 'dark' }, 1000)
        expect(same.mappingState.cues[0].lightLook).toBe('rig-dark')
    })
})

describe('the heat rule between conditions', () => {
    it('waits while the package is above the limit, then says it is cool', async () => {
        const temps = [97, 93, 88, 84]
        const waits = []
        const out = await waitCool(85, 600, { temp: () => temps.shift(), pause: async (ms) => { waits.push(ms) }, say: () => {} })
        expect(waits).toEqual([15000, 15000, 15000])
        expect(out).toMatchObject({ limit: 85, start: 97, now: 84, ok: true })
    })
    it('does not wait when it is already cool, and gives up (ok false) when it never cools', async () => {
        const cool = await waitCool(85, 600, { temp: () => 70, pause: async () => { throw new Error('must not wait') }, say: () => {} })
        expect(cool).toMatchObject({ start: 70, now: 70, ok: true, waited_s: 0 })
        // never cools: maxWaitS 0 means one look and out
        const hot = await waitCool(85, 0, { temp: () => 95, pause: async () => {}, say: () => {} })
        expect(hot.ok).toBe(false)
        expect(hot.now).toBe(95)
        // no sensor: do not block the run
        expect((await waitCool(85, 600, { temp: () => null, pause: async () => {}, say: () => {} })).ok).toBe(true)
    })
})
