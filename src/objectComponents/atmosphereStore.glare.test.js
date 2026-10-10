import { describe, expect, it } from 'vitest'
import { holdGlareVeil, setBloomActive } from './atmosphereStore.js'
import { hazeUniformsFor } from './hazeUniforms.js'

describe('the glare veil: bloom stands in for it, the measurement mode holds it off', () => {
    it('is on without bloom, off with bloom', () => {
        const gl = {}
        setBloomActive(gl, false)
        expect(hazeUniformsFor(gl).uGlareOn.value).toBe(1)
        setBloomActive(gl, true)
        expect(hazeUniformsFor(gl).uGlareOn.value).toBe(0)
    })
    it('stays off while held, whatever bloom does, and comes back when released', () => {
        const gl = {}
        holdGlareVeil(gl, true)
        setBloomActive(gl, false) // HdrBloom with the glow off (the measurement mode turns it off)
        expect(hazeUniformsFor(gl).uGlareOn.value).toBe(0)
        holdGlareVeil(gl, false)
        expect(hazeUniformsFor(gl).uGlareOn.value).toBe(1)
    })
})
