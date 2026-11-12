import { describe, it, expect } from 'vitest'
import { pixelFactors, PATTERNS } from './pixelPolicy.js'
import { encodeDmx } from './dmxDecode.js'

const chart = [{ role: 'dimmer' }, ...Array.from({ length: 32 }, (_, i) => ['r', 'g', 'b'].map((c) => ({ role: `p${String(i + 1).padStart(2, '0')}${c}` }))).flat(), ...Array.from({ length: 16 }, (_, i) => ({ role: `cw${String(i + 1).padStart(2, '0')}` }))]

describe('pixel bars', () => {
    it('lights all 32 pixels in the look colour, whites 0, dimmer carries the level', () => {
        const out = encodeDmx(chart, { level: 1, colour: '#ff0000', pixels: pixelFactors('rig-magenta-room') })
        for (let i = 1; i <= 32; i++) { const n = String(i).padStart(2, '0'); expect([out[`p${n}r`], out[`p${n}g`], out[`p${n}b`]], n).toEqual([255, 0, 0]) }
        expect(out.cw01).toBe(0); expect(out.cw16).toBe(0); expect(out.dimmer).toBe(255)
    })
    it('a pattern shapes the pixels: a ramp goes from dark to bright along the bar', () => {
        expect(PATTERNS.ramp(0, 32)).toBeLessThan(PATTERNS.ramp(31, 32))
        const out = encodeDmx(chart, { level: 1, colour: '#ff0000', pixels: Array.from({ length: 32 }, (_, i) => PATTERNS.ramp(i, 32)) })
        expect(out.p01r).toBeLessThan(out.p32r); expect(out.p32r).toBe(255)
    })
    it('writes nothing per pixel without a colour or on a lamp with no pixel channels', () => {
        expect(Object.keys(encodeDmx(chart, { level: 1, pixels: [1] })).some((k) => /^p\d/.test(k))).toBe(false)
        expect(encodeDmx([{ role: 'dimmer' }], { level: 1, colour: '#ff0000', pixels: [1, 1] })).toEqual({ dimmer: 255 })
    })
    it('every factor stays in 0..1', () => { for (const f of Object.values(PATTERNS)) pixelFactors('x').concat(Array.from({ length: 32 }, (_, i) => f(i, 32))).forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }) })
})
