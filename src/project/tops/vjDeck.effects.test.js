import { describe, expect, it } from 'vitest'
import {
    EFFECT_TYPE_IDS,
    MAX_EFFECTS,
    addEffect,
    createDeck,
    expandDeck,
    layerEffectMixNodeId,
    layerEffectNodeId,
    masterEffectMixNodeId,
    masterEffectNodeId,
    moveEffect,
    normalizeDeck,
    normalizeEffects,
    removeEffect,
    setClip,
    setEffectMix,
    setEffectOn,
    setEffectParam,
    trigger
} from './vjDeck.js'
import { TOP_OPERATORS } from './topOperators.js'

const playing = () => {
    let deck = createDeck({ layers: 2, columns: 2 })
    deck = setClip(deck, 0, 0, { kind: 'asset', asset: 'a1' })
    deck = setClip(deck, 1, 0, { kind: 'asset', asset: 'a2' })
    return trigger(trigger(deck, 0, 0), 1, 0)
}
const expand = (deck) => expandDeck({ id: 'D', type: 'vj.deck', values: { deck } }, [])
const byId = (result, id) => result.nodes.find((node) => node.id === id)

describe('effect normalisation', () => {
    it('drops unknown types, clamps params to the operator ranges, caps the stack', () => {
        const stack = normalizeEffects([
            { type: 'nope' },
            { type: 'top.blur', params: { size: 999 }, mix: 7 },
            { type: 'top.send' },
            ...Array.from({ length: 12 }, () => ({ type: 'top.edge' }))
        ])
        expect(stack[0].type).toBe('top.blur')
        expect(stack[0].params.size).toBe(TOP_OPERATORS['top.blur'].params[0].max)
        expect(stack[0].mix).toBe(1)
        expect(stack).toHaveLength(MAX_EFFECTS)
        expect(stack.every((effect) => EFFECT_TYPE_IDS.includes(effect.type))).toBe(true)
    })
    it('gives every effect a unique stable id and keeps one it already has', () => {
        const stack = normalizeEffects([{ id: 'x', type: 'top.tint' }, { id: 'x', type: 'top.tint' }, { type: 'top.level', on: false }])
        expect(new Set(stack.map((e) => e.id)).size).toBe(3)
        expect(stack[0].id).toBe('x')
        expect(stack[2].on).toBe(false)
        expect(normalizeEffects(stack)).toEqual(stack)
    })
    it('an old deck without the fields loads with empty stacks', () => {
        const old = { bpm: 120, master: 1, layers: [{ id: 'layer-1', clips: [null] }] }
        const deck = normalizeDeck(old)
        expect(deck.effects).toEqual([])
        expect(deck.layers[0].effects).toEqual([])
        expect(normalizeEffects('junk')).toEqual([])
    })
    it('edits go through normalisation', () => {
        let deck = addEffect(createDeck(), 0, 'top.tint')
        const id = deck.layers[0].effects[0].id
        deck = setEffectParam(deck, 0, id, 'amount', 5)
        expect(deck.layers[0].effects[0].params.amount).toBe(1)
        deck = setEffectMix(deck, 0, id, 0.25)
        deck = setEffectOn(deck, 0, id, false)
        expect(deck.layers[0].effects[0]).toMatchObject({ mix: 0.25, on: false })
        expect(addEffect(deck, 0, 'top.nope').layers[0].effects).toHaveLength(1)
        expect(removeEffect(deck, 0, id).layers[0].effects).toEqual([])
        expect(addEffect(createDeck(), 'master', 'top.blur').effects).toHaveLength(1)
    })
    it('moves an effect one place and stops at the ends', () => {
        let deck = addEffect(addEffect(createDeck(), 0, 'top.tint'), 0, 'top.blur')
        const [a, b] = deck.layers[0].effects.map((e) => e.id)
        expect(moveEffect(deck, 0, a, -1).layers[0].effects.map((e) => e.id)).toEqual([a, b])
        deck = moveEffect(deck, 0, a, 1)
        expect(deck.layers[0].effects.map((e) => e.id)).toEqual([b, a])
    })
})

describe('effects in the expansion', () => {
    it('an empty or OFF stack adds no operators and the same wires', () => {
        const deck = playing()
        const plain = expand(deck)
        const off = expand({ ...deck, layers: [{ ...deck.layers[0], effects: normalizeEffects([{ type: 'top.tint', on: false }]) }, deck.layers[1]], effects: normalizeEffects([{ type: 'top.blur', on: false }]) })
        expect(off.nodes).toEqual(plain.nodes)
        expect(off.wires).toEqual(plain.wires)
    })
    it('runs a layer stack after the source and before the blend, in order', () => {
        let deck = playing()
        deck = addEffect(addEffect(deck, 0, 'top.tint'), 0, 'top.blur')
        const [t, b] = deck.layers[0].effects.map((e) => e.id)
        const out = expand(deck)
        const src = 'D::L0::clip'
        const chain = [
            { from: src, to: layerEffectNodeId('D', 0, t), port: 'a' },
            { from: src, to: layerEffectMixNodeId('D', 0, t), port: 'a' },
            { from: layerEffectNodeId('D', 0, t), to: layerEffectMixNodeId('D', 0, t), port: 'b' },
            { from: layerEffectMixNodeId('D', 0, t), to: layerEffectNodeId('D', 0, b), port: 'a' },
            { from: layerEffectMixNodeId('D', 0, b), to: 'D::L0::blend', port: 'b' }
        ]
        for (const wire of chain) expect(out.wires).toContainEqual(wire)
        expect(out.wires).not.toContainEqual({ from: src, to: 'D::L0::blend', port: 'b' })
        expect(byId(out, layerEffectNodeId('D', 0, t)).type).toBe('top.tint')
        expect(byId(out, layerEffectMixNodeId('D', 0, t))).toMatchObject({ type: 'top.blend', values: { mode: '0', mix: 1 } })
        // layer 1 is untouched
        expect(out.wires).toContainEqual({ from: 'D::L1::clip', to: 'D::L1::blend', port: 'b' })
    })
    it('runs the master stack after the last blend and before the master level', () => {
        const deck = addEffect(playing(), 'master', 'top.level')
        const id = deck.effects[0].id
        const out = expand(deck)
        expect(out.wires).toContainEqual({ from: 'D::L1::blend', to: masterEffectNodeId('D', id), port: 'a' })
        expect(out.wires).toContainEqual({ from: masterEffectMixNodeId('D', id), to: 'D::master', port: 'a' })
        expect(out.wires).not.toContainEqual({ from: 'D::L1::blend', to: 'D::master', port: 'a' })
    })
    it('mix is the Blend amount (dry/wet) and a param change keeps every node id', () => {
        let deck = addEffect(playing(), 0, 'top.blur')
        const id = deck.layers[0].effects[0].id
        const before = expand(deck)
        deck = setEffectMix(setEffectParam(deck, 0, id, 'size', 9), 0, id, 0.4)
        const after = expand(deck)
        expect(after.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id))
        expect(byId(after, layerEffectMixNodeId('D', 0, id)).values.mix).toBe(0.4)
        expect(byId(after, layerEffectNodeId('D', 0, id)).values.size).toBe(9)
    })
    it('a reorder changes wires only, not the id set', () => {
        let deck = addEffect(addEffect(playing(), 0, 'top.tint'), 0, 'top.blur')
        const ids = (d) => expand(d).nodes.map((n) => n.id).sort()
        const before = ids(deck)
        deck = moveEffect(deck, 0, deck.layers[0].effects[0].id, 1)
        expect(ids(deck)).toEqual(before)
    })
})
