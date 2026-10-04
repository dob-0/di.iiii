import { describe, expect, it } from 'vitest'
import { FOOTPRINT_TEXELS, footprintLamps, injectFootprints, packFootprints } from './lampFootprints.js'

const lamp = (id, over = {}) => ({
    id, type: 'spotLight',
    components: {
        transform: { position: [1, 6, 2], rotation: [Math.PI, 0, 0] },
        light: { color: '#ff0000', intensity: 600, distance: 24, angle: 0.13, penumbra: 0.5 },
        beam: { visible: true, only: true },
        fixture: { type: 'up-pl5403' },
        ...over
    }
})
const slot = (lampId, envelope) => ({ id: 'rig-pool-0', type: 'spotLight', components: { light: { intensity: 600 }, lightPool: { slot: 0, lamp: lampId, envelope } } })

describe('lamp footprints', () => {
    it('takes every lit rig lamp, never a pool slot, an authored spot, a dark or a hidden lamp', () => {
        const ids = footprintLamps([
            lamp('a'), lamp('dark', { light: { intensity: 0 } }), lamp('hidden', { runtime: { visible: false } }),
            { id: 'authored', type: 'spotLight', components: { light: { intensity: 5 } } }, slot('x', 1)
        ]).map((l) => l.entity.id)
        expect(ids).toEqual(['a'])
    })
    it('leaves out the light a pool slot carries, scaled by its envelope, so a hand-over never doubles', () => {
        expect(footprintLamps([lamp('a'), slot('a', 1)])).toEqual([])
        expect(footprintLamps([lamp('a'), slot('a', 0.25)])[0].intensity).toBeCloseTo(450)
    })
    it('packs position, aim, cone and linear colour × intensity, three texels a lamp', () => {
        const { data, count } = packFootprints([lamp('a')], 4)
        expect(count).toBe(1)
        expect(data.length).toBe(4 * FOOTPRINT_TEXELS * 4)
        expect([...data.slice(0, 4)]).toEqual([1, 6, 2, 24])
        const aim = data.slice(4, 7)
        expect(Math.hypot(...aim)).toBeCloseTo(1)
        expect(data[7]).toBeLessThan(data[11]) // outer edge cos < inner edge cos
        expect(data[8]).toBeCloseTo(600) // red, linear, × intensity
        expect(data[9]).toBeCloseTo(0)
    })
    it('adds the loop to a lit shader once, bound by a uniform, and leaves an unlit one alone', () => {
        const uniforms = { uFootprints: { value: null }, uFootprintCount: { value: 0 } }
        const lit = { uniforms: {}, fragmentShader: 'void main() {\n#include <lights_fragment_end>\n}' }
        expect(injectFootprints(lit, uniforms)).toBe(true)
        expect(lit.fragmentShader).toMatch(/fpI < uFootprintCount/)
        expect(lit.uniforms.uFootprintCount).toBe(uniforms.uFootprintCount)
        expect(injectFootprints(lit, uniforms)).toBe(false)
        const unlit = { uniforms: {}, fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' }
        expect(injectFootprints(unlit, uniforms)).toBe(false)
    })
})
