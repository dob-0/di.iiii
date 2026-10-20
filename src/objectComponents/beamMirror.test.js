import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { FLOOR_Y, createBeamAirMaterial, createBeamMirrorMaterial, mirrorBlur, mirrorMatrix } from './beamAirMaterial.js'
import { WEAR_GLSL } from '../project/viewport/surfaces.js'

describe('a beam reflected in the floor', () => {
    it('is the beam mirrored through the floor plane', () => {
        const beam = new Matrix4().makeTranslation(3, 7, -2)
        const p = new Vector3(0, -2, 0).applyMatrix4(mirrorMatrix(new Matrix4(), beam))
        // the point 5 m above the floor, 2 m down the throw, lands 5 m below it
        expect(p.x).toBeCloseTo(3)
        expect(p.y).toBeCloseTo(2 * FLOOR_Y - 5)
        expect(p.z).toBeCloseTo(-2)
    })

    it('stays crisp where the beam meets the floor and fades with height on rough concrete', () => {
        const R = 0.2
        expect(mirrorBlur(R, 0, 0.6)).toBeCloseTo(1)
        const low = mirrorBlur(R, 0.5, 0.6)
        const high = mirrorBlur(R, 6, 0.6)
        expect(high).toBeLessThan(low)
        expect(high).toBeLessThan(0.15)
        // a polished lane carries more of it than dusty concrete
        expect(mirrorBlur(R, 3, 0.35)).toBeGreaterThan(2 * mirrorBlur(R, 3, 0.85))
    })

    it('carries the floor\'s wear into its shader, and its finish as uniforms', () => {
        const m = createBeamMirrorMaterial(createBeamAirMaterial('core'), { reflect: 0.4, roughness: 0.6, variation: 0.25, scale: 0.35 }, WEAR_GLSL)
        expect(m.fragmentShader).toContain('float surfWear(vec2 p, float s)')
        expect(m.fragmentShader).not.toContain('// SURFACE_WEAR')
        expect(m.defines.BEAM_MIRROR).toBe(1)
        expect(m.uniforms.uReflect.value).toBe(0.4)
        expect(m.uniforms.uSurfRough.value).toBe(0.6)
        // the mirror's own camera, not the beam's
        expect(m.uniforms.uCamLocal).not.toBe(createBeamAirMaterial('core').uniforms.uCamLocal)
    })

    it('still builds without a floor finish (a smooth floor)', () => {
        const m = createBeamMirrorMaterial(createBeamAirMaterial('core'))
        expect(m.fragmentShader).toContain('float surfWear(vec2 p, float s)')
        expect(m.uniforms.uSurfVar.value).toBe(0)
    })
})
