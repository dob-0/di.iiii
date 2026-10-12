import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'
import { BEER_LAMBERT_MARK, beerLambertFog, fogFactorAt, installBeerLambertFog, sigmaOfFog } from './beerLambertFog.js'

describe('beerLambertFog: surfaces dimmed by exp(−σd), the beams\' own law', () => {
    it('keeps exp(−σd) of a surface\'s light, where the old 60…250 m fog kept all of it at 60 m', () => {
        const fog = beerLambertFog(0.02)
        expect(sigmaOfFog(fog.near, fog.far)).toBeCloseTo(0.02, 12)
        // the light that reaches the eye = 1 − fogFactor
        expect(1 - fogFactorAt(60, fog.near, fog.far)).toBeCloseTo(Math.exp(-1.2), 9) // ≈ 0.30
        expect(1 - fogFactorAt(60, 60, 250)).toBe(1) // three's smoothstep fog, the dev document's
        // σ from the kit's estimate: 2.7·10⁻⁴ /m — a wall 60 m away keeps 98.4 %
        const kit = beerLambertFog(2.7e-4)
        expect(1 - fogFactorAt(60, kit.near, kit.far)).toBeCloseTo(Math.exp(-2.7e-4 * 60), 9)
        expect(beerLambertFog(0)).toBe(null)
    })

    it('composes with SmartView\'s stand-back: one offset on near and far starts the haze later, same σ', () => {
        const fog = beerLambertFog(0.01)
        const off = 25
        expect(sigmaOfFog(fog.near + off, fog.far + off)).toBeCloseTo(0.01, 12)
        expect(fogFactorAt(20, fog.near + off, fog.far + off)).toBe(0)
        expect(1 - fogFactorAt(off + 100, fog.near + off, fog.far + off)).toBeCloseTo(Math.exp(-1), 9)
    })

    it('patches three\'s fog chunks once, with the true distance carried from the vertex to the fragment', () => {
        const chunks = { fog_fragment: ShaderChunk.fog_fragment, fog_pars_fragment: '', fog_pars_vertex: '', fog_vertex: '' }
        expect(installBeerLambertFog(chunks)).toBe(true)
        expect(installBeerLambertFog(chunks)).toBe(false)
        expect(chunks.fog_fragment.startsWith(BEER_LAMBERT_MARK)).toBe(true)
        expect(chunks.fog_fragment).toMatch(/fogFar < fogNear/)
        expect(chunks.fog_fragment).toMatch(/length\( vFogView \)/)
        // three's own laws are still there for every other fog
        expect(chunks.fog_fragment).toMatch(/smoothstep\( fogNear, fogFar, vFogDepth \)/)
        expect(chunks.fog_fragment).toMatch(/fogDensity \* fogDensity/)
        for (const k of ['fog_pars_fragment', 'fog_pars_vertex']) expect(chunks[k]).toMatch(/varying vec3 vFogView;/)
        expect(chunks.fog_vertex).toMatch(/vFogView = mvPosition\.xyz;/)
    })
})
