import { describe, expect, it } from 'vitest'
import { EFFECT_TYPE_IDS, MAX_EFFECTS, addEffect, createDeck, effectMainParams, effectNumericParams, normalizeDeck, normalizeEffects } from './vjDeck.js'
import { TOP_OPERATORS, resolveTopParams } from './topOperators.js'
import { checkShader } from './topEngine.js'

describe('Blocks effect', () => {
    const op = TOP_OPERATORS['top.blocks']

    it('is registered right after Glitch, labelled Blocks, and the stack has room for every kind', () => {
        expect(op.label).toBe('Blocks')
        expect(EFFECT_TYPE_IDS.indexOf('top.blocks')).toBe(EFFECT_TYPE_IDS.indexOf('top.glitch') + 1)
        expect(MAX_EFFECTS).toBeGreaterThanOrEqual(EFFECT_TYPE_IDS.length)
    })

    it('has amount, size, rate first (the three hardware knobs), then shift and hold', () => {
        expect(effectMainParams('top.blocks').map((p) => p.name)).toEqual(['amount', 'size', 'rate', 'shift', 'hold'])
        expect(effectNumericParams('top.blocks')).toHaveLength(5)
        for (const name of ['amount', 'shift', 'hold', 'size']) {
            const p = op.params.find((q) => q.name === name)
            expect([p.min, p.max]).toEqual([0, 1])
        }
    })

    it('compiles as GLSL source, is animated, reads its own last frame and has no random source', () => {
        expect(checkShader(op.fragment)).toBeNull()
        expect(op.animated).toBe(true)
        expect(op.fragment).toContain('uniform sampler2D self;')
        expect(op.fragment).not.toMatch(/rand\(|Math/)
        expect(op.fragment).toContain('>= p_amount')
    })

    it('adds to a deck and survives normalise; unknown params fall back to defaults', () => {
        const deck = addEffect(createDeck({ layers: 1, columns: 1 }), 0, 'top.blocks')
        expect(normalizeDeck(deck).layers[0].effects[0].type).toBe('top.blocks')
        expect(normalizeEffects([{ type: 'top.blocks', params: { amount: 5, rate: 'x' } }])[0].params).toMatchObject({ amount: 1, rate: 6 })
    })
})

describe('Silhouette drift and flash', () => {
    const op = TOP_OPERATORS['top.silhouette']

    it('both are new, default 0, range 0..1, and shown with the other main knobs', () => {
        for (const name of ['drift', 'flash']) {
            const p = op.params.find((q) => q.name === name)
            expect(p.value).toBe(0)
            expect([p.min, p.max]).toEqual([0, 1])
            expect(effectMainParams('top.silhouette').map((q) => q.name)).toContain(name)
        }
    })

    it('an old saved Silhouette (no drift, no flash) resolves to the same old values plus zeros', () => {
        const old = { threshold: 0.3, soft: 0.1, invert: 1, colour: '#ff0000', back: '#00ff00' }
        expect(resolveTopParams('top.silhouette', old)).toEqual({ ...old, drift: 0, flash: 0 })
        const [fx] = normalizeEffects([{ type: 'top.silhouette', params: old }])
        expect(fx.params).toEqual({ ...old, drift: 0, flash: 0 })
    })

    it('its shader compiles, declares both uniforms and only acts on them when above 0', () => {
        expect(checkShader(op.fragment)).toBeNull()
        expect(op.fragment).toContain('uniform float p_drift;')
        expect(op.fragment).toContain('uniform float p_flash;')
        expect(op.fragment).toContain('if (p_drift > 0.0)')
        expect(op.fragment).toContain('p_flash > 0.0 &&')
        expect(op.fragment).toContain('time * p_flash * 12.0')
    })
})
