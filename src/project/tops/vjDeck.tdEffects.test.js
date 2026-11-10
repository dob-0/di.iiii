import { describe, expect, it } from 'vitest'
import { BLEND_MODES, EFFECT_TYPE_IDS, addEffect, createDeck, effectMainParams, expandDeck, layerEffectMixNodeId, layerEffectNodeId, masterEffectNodeId, normalizeEffects, setBlend, setClip, trigger } from './vjDeck.js'
import { TOP_OPERATORS, resolveTopParams } from './topOperators.js'
import { checkShader } from './topEngine.js'

const NEW = ['top.displace', 'top.hsvadj', 'top.mirror', 'top.key', 'top.lookup', 'top.slope', 'top.glow']
const playing = () => trigger(setClip(createDeck({ layers: 1, columns: 1 }), 0, 0, { kind: 'asset', asset: 'a1' }), 0, 0)
const expand = (deck) => expandDeck({ id: 'D', type: 'vj.deck', values: { deck } }, [])

describe('TouchDesigner look effects', () => {
    it.each(NEW)('%s is offered by the deck, main params exist on the operator', (type) => {
        expect(EFFECT_TYPE_IDS).toContain(type)
        expect(effectMainParams(type).length).toBe(Object.values(TOP_OPERATORS[type].params).length)
        expect(checkShader(TOP_OPERATORS[type].fragment), type).toBeNull()
    })

    it.each(NEW)('%s declares one uniform per param and keeps every default in range', (type) => {
        const operator = TOP_OPERATORS[type]
        const declared = [...operator.fragment.matchAll(/uniform\s+(?:float|vec3)\s+p_(\w+)\s*;/g)].map((m) => m[1]).sort()
        expect(declared).toEqual(operator.params.map((p) => p.name).sort())
        for (const p of operator.params) {
            if (!p.colour) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max) }
        }
    })

    it.each(NEW)('%s clamps params to its range', (type) => {
        for (const p of TOP_OPERATORS[type].params.filter((q) => !q.colour && !q.text)) {
            expect(resolveTopParams(type, { [p.name]: 1e9 })[p.name]).toBe(p.max)
            expect(resolveTopParams(type, { [p.name]: -1e9 })[p.name]).toBe(p.min)
            expect(resolveTopParams(type, { [p.name]: 'junk' })[p.name]).toBe(p.value)
        }
        expect(normalizeEffects([{ type, params: { amountX: 99, hue: 999, strength: 99 } }])).toHaveLength(1)
    })

    it.each(NEW)('%s on a layer adds exactly its operator and its mix node; works on master', (type) => {
        const plain = expand(playing())
        const deck = addEffect(playing(), 0, type)
        const id = deck.layers[0].effects[0].id
        const out = expand(deck)
        expect(out.nodes.length).toBe(plain.nodes.length + 2)
        expect(out.nodes.find((n) => n.id === layerEffectNodeId('D', 0, id)).type).toBe(type)
        expect(out.wires).toContainEqual({ from: layerEffectMixNodeId('D', 0, id), to: 'D::L0::blend', port: 'b' })
        const master = addEffect(playing(), 'master', type)
        expect(expand(master).nodes.find((n) => n.id === masterEffectNodeId('D', master.effects[0].id)).type).toBe(type)
    })

    it('Displace: amount 0 default (no change), three map sources, a real second input, animated', () => {
        const d = TOP_OPERATORS['top.displace']
        expect(d.inputs).toEqual(['a', 'b'])
        expect(d.animated).toBe(true)
        expect(d.params.find((p) => p.name === 'source').options).toEqual(['Picture', 'Noise', 'Input B'])
        const v = resolveTopParams('top.displace', {})
        expect([v.amountX, v.amountY]).toEqual([0, 0])
        expect(d.fragment).toContain('texture2D(b, uv)')
        expect(d.fragment).toContain('time * p_speed')
    })

    it('Colour shift defaults change nothing (hue 0, sat 1, value 1)', () => {
        expect(resolveTopParams('top.hsvadj', {})).toMatchObject({ hue: 0, sat: 1, value: 1 })
        expect(TOP_OPERATORS['top.hsvadj'].fragment).toContain('rgb2hsv')
    })

    it('Mirror: Off and no flip by default, six modes, one picture tap', () => {
        expect(resolveTopParams('top.mirror', {})).toMatchObject({ mode: 0, flipX: 0, flipY: 0 })
        const m = TOP_OPERATORS['top.mirror']
        expect(m.params.find((p) => p.name === 'mode').options).toHaveLength(6)
        expect(m.fragment.match(/texture2D/g)).toHaveLength(1)
    })

    it('Key keys to black (no alpha) and offers chroma and luma', () => {
        const k = TOP_OPERATORS['top.key']
        expect(k.params.find((p) => p.name === 'mode').options).toEqual(['Chroma', 'Luma'])
        expect(k.fragment).toMatch(/c \* keep/)
        expect(k.fragment).not.toMatch(/gl_FragColor = vec4\([^;]*,\s*keep\)/)
    })

    it('Grade at amount 0 is the picture; Emboss and Glow are single pass with fixed taps', () => {
        const g = TOP_OPERATORS['top.lookup']
        expect(g.fragment).toContain('mix(src, ramp, p_amount)')
        expect(TOP_OPERATORS['top.slope'].fragment.match(/texture2D/g)).toHaveLength(3)
        const glow = TOP_OPERATORS['top.glow'].fragment
        expect(glow).toContain('i < 12')
        expect(glow).toContain('/ 13.0')
    })

    it('blend modes keep their old order and append Subtract, Lighten, Darken, Overlay', () => {
        expect(BLEND_MODES.slice(0, 5)).toEqual(['Mix', 'Add', 'Screen', 'Multiply', 'Difference'])
        expect(BLEND_MODES.slice(5)).toEqual(['Subtract', 'Lighten', 'Darken', 'Overlay'])
        expect(TOP_OPERATORS['top.blend'].params.find((p) => p.name === 'mode').options).toEqual(BLEND_MODES)
        expect(setBlend(createDeck({ layers: 1 }), 0, '8').layers[0].blend).toBe('8')
        const frag = TOP_OPERATORS['top.blend'].fragment
        for (const needle of ['x - y', 'max(x, y)', 'min(x, y)', 'step(0.5, x)']) expect(frag).toContain(needle)
        expect(checkShader(frag)).toBeNull()
    })
})
