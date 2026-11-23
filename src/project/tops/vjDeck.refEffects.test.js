import { describe, expect, it } from 'vitest'
import { EFFECT_TYPE_IDS, addEffect, createDeck, effectMainParams, expandDeck, layerEffectMixNodeId, layerEffectNodeId, masterEffectNodeId, normalizeEffects, setClip, trigger } from './vjDeck.js'
import { TOP_OPERATORS, resolveTopParams } from './topOperators.js'
import { checkShader } from './topEngine.js'

const NEW = ['top.freeze', 'top.silhouette', 'top.lineart', 'top.glitch', 'top.pixelate']
const playing = () => trigger(setClip(createDeck({ layers: 1, columns: 1 }), 0, 0, { kind: 'asset', asset: 'a1' }), 0, 0)
const expand = (deck) => expandDeck({ id: 'D', type: 'vj.deck', values: { deck } }, [])

describe('Platina look effects', () => {
    it.each(NEW)('%s is offered by the deck, with main params that exist on the operator', (type) => {
        expect(EFFECT_TYPE_IDS).toContain(type)
        const main = effectMainParams(type)
        expect(main.length).toBeGreaterThan(0)
        expect(checkShader(TOP_OPERATORS[type].fragment), type).toBeNull()
    })

    it.each(NEW)('%s declares one uniform per param and keeps every default in range', (type) => {
        const operator = TOP_OPERATORS[type]
        const declared = [...operator.fragment.matchAll(/uniform\s+(?:float|vec3)\s+p_(\w+)\s*;/g)].map((m) => m[1]).sort()
        expect(declared).toEqual(operator.params.map((p) => p.name).sort())
        for (const p of operator.params) {
            const kind = p.colour ? 'vec3' : 'float'
            expect(new RegExp(`uniform\\s+${kind}\\s+p_${p.name}\\s*;`).test(operator.fragment), `${type}.${p.name}`).toBe(true)
            if (!p.colour) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max) }
        }
    })

    it.each(NEW)('%s clamps params to its range and refuses nothing it knows', (type) => {
        for (const p of TOP_OPERATORS[type].params.filter((q) => !q.colour && !q.text)) {
            expect(resolveTopParams(type, { [p.name]: 1e9 })[p.name]).toBe(p.max)
            expect(resolveTopParams(type, { [p.name]: -1e9 })[p.name]).toBe(p.min)
            expect(resolveTopParams(type, { [p.name]: 'junk' })[p.name]).toBe(p.value)
        }
        expect(normalizeEffects([{ type }])).toHaveLength(1)
    })

    it.each(NEW)('%s on a layer adds exactly its operator and its mix node; off adds nothing', (type) => {
        const plain = expand(playing())
        const deck = addEffect(playing(), 0, type)
        const id = deck.layers[0].effects[0].id
        const out = expand(deck)
        expect(out.nodes.length).toBe(plain.nodes.length + 2)
        expect(out.nodes.find((n) => n.id === layerEffectNodeId('D', 0, id)).type).toBe(type)
        expect(out.wires).toContainEqual({ from: layerEffectMixNodeId('D', 0, id), to: 'D::L0::blend', port: 'b' })
        const off = { ...deck, layers: [{ ...deck.layers[0], effects: deck.layers[0].effects.map((e) => ({ ...e, on: false })) }] }
        expect(expand(off).nodes).toEqual(plain.nodes)
        expect(expand(off).wires).toEqual(plain.wires)
    })

    it.each(NEW)('%s works on the master too', (type) => {
        const deck = addEffect(playing(), 'master', type)
        const id = deck.effects[0].id
        expect(expand(deck).nodes.find((n) => n.id === masterEffectNodeId('D', id)).type).toBe(type)
    })

    it('Freeze reads its own last frame (like Feedback) and treats an empty last frame as "nothing held yet"', () => {
        const f = TOP_OPERATORS['top.freeze']
        expect(f.fragment).toContain('uniform sampler2D self;')
        expect(f.fragment).toContain('held.a > 0.5')
        expect(resolveTopParams('top.freeze', {}).hold).toBe(1)
    })

    it('Glitch is animated and deterministic from time: no random source in the shader', () => {
        const g = TOP_OPERATORS['top.glitch']
        expect(g.animated).toBe(true)
        expect(g.fragment).toMatch(/floor\(time \* p_speed\)/)
        expect(g.fragment).not.toMatch(/rand|noise\(|Math/)
    })

    it('Silhouette and Line art default to black behind a coloured subject, never white behind', () => {
        for (const type of ['top.silhouette', 'top.lineart']) {
            expect(TOP_OPERATORS[type].params.find((p) => p.name === 'back').value).toBe('#000000')
            expect(TOP_OPERATORS[type].params.find((p) => p.name === 'colour').value).toMatch(/^#[0-9a-f]{6}$/i)
        }
    })
})
