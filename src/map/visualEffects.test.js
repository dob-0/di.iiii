import { describe, expect, it } from 'vitest'
import {
    chainIsAnimated, cssLook, effectCatalogue, effectChain, effectDef, effectParams,
    glPasses, glslFor, hasCssForm, newEffect, visualTakesShaders
} from './visualEffects.js'

describe('visual effects catalogue', () => {
    it('every effect has a shader, params with defaults in range, and uniforms that give two vec4s', () => {
        effectCatalogue().forEach((def) => {
            expect(glslFor(def.type)).toMatch(/vec4 effect\(vec2 uv\)/)
            def.params.forEach((spec) => {
                if (spec.kind === 'number') {
                    expect(spec.default).toBeGreaterThanOrEqual(spec.min)
                    expect(spec.default).toBeLessThanOrEqual(spec.max)
                }
            })
            const [pass] = glPasses([newEffect(def.type)], 12.5)
            expect(pass.a).toHaveLength(4)
            expect(pass.b).toHaveLength(4)
            pass.a.forEach((value) => expect(Number.isFinite(value)).toBe(true))
        })
    })

    it('a new effect carries its defaults and an id', () => {
        const effect = newEffect('kaleido')
        expect(effect.id).toBeTruthy()
        expect(effect).toMatchObject({ type: 'kaleido', on: true, params: { segments: 6, zoom: 1 } })
        expect(newEffect('nope')).toBeNull()
    })

    it('reads stored params through their spec: missing, wrong type and out of range all come back usable', () => {
        expect(effectParams({ type: 'pixelate', params: { size: 9999 } })).toEqual({ size: 240 })
        expect(effectParams({ type: 'pixelate', params: { size: 'big' } })).toEqual({ size: 24 })
        expect(effectParams({ type: 'flip', params: { mode: 'sideways' } })).toEqual({ mode: 'h' })
        expect(effectParams({ type: 'colorize', params: { colour: 'red' } }).colour).toBe('#ff2a55')
    })

    it('the chain is the clip effects then the composition effects, without bypassed or unknown ones', () => {
        const clip = [{ id: 'a', type: 'invert', on: true }, { id: 'b', type: 'blur', on: false }, { id: 'c', type: 'future', on: true }]
        const comp = [{ id: 'd', type: 'strobe', on: true }]
        expect(effectChain(clip, comp).map((effect) => effect.id)).toEqual(['a', 'd'])
        expect(effectChain(undefined, undefined)).toEqual([])
    })

    it('knows which chains move on their own', () => {
        expect(chainIsAnimated([{ type: 'invert', params: {} }])).toBe(false)
        expect(chainIsAnimated([{ type: 'hue', params: { speed: 30 } }])).toBe(true)
        expect(chainIsAnimated([{ type: 'strobe', params: {} }])).toBe(true)
    })

    it('a web link gets only the CSS effects, and they compose into one filter and one transform', () => {
        expect(visualTakesShaders({ source: { kind: 'url' } })).toBe(false)
        expect(visualTakesShaders({ source: { kind: 'html' } })).toBe(true)
        expect(hasCssForm('invert')).toBe(true)
        expect(hasCssForm('kaleido')).toBe(false)
        const look = cssLook([
            { type: 'invert', params: { amount: 1 } },
            { type: 'hue', params: { hue: 90, speed: 0 } },
            { type: 'kaleido', params: {} },
            { type: 'flip', params: { mode: 'h' } }
        ], 0)
        expect(look.filter).toBe('invert(1) hue-rotate(90.00deg)')
        expect(look.transform).toBe('scale(-1, 1)')
        expect(look.opacity).toBe(1)
    })

    it('strobe is on for its duty of each period, in wall-clock time', () => {
        const strobe = { type: 'strobe', params: { rate: 2, duty: 0.5, mode: 'white' } }
        expect(glPasses([strobe], 10.1)[0].a[0]).toBe(1)
        expect(glPasses([strobe], 10.3)[0].a[0]).toBe(0)
        expect(cssLook([strobe], 10.1).flash).toBe('#ffffff')
        expect(cssLook([strobe], 10.3).flash).toBe(null)
        expect(effectDef('blur').passes).toBe(2)
    })
})
