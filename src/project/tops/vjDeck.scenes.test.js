import { describe, expect, it } from 'vitest'
import { createDeck, expandDeck, normalizeDeck, setColumnLook, triggerColumn } from './vjDeck.js'

const clip = (asset) => ({ kind: 'asset', asset })
const deckOf = (change) => {
    const deck = createDeck({ columns: 2, layers: 2 })
    deck.layers[0].clips = [clip('a'), clip('b')]
    deck.layers[1].clips = [clip('t'), clip('t')]
    deck.effects = [{ id: 'scan', type: 'top.depthscan', on: true, mix: 1, params: {} }]
    return normalizeDeck(change ? change(deck) : deck)
}

describe('a column look', () => {
    it('sets the named values of the master effects when the column is launched, and only those', () => {
        const deck = setColumnLook(deckOf(), 1, { 'top.depthscan': { mix: 0.5, params: { cut: 1, flash: 6 } }, 'top.blur': { mix: 1 } })
        const before = deck.effects[0]
        const after = triggerColumn(deck, 1).effects[0]
        expect(after.mix).toBe(0.5)
        expect(after.params.cut).toBe(1)
        expect(after.params.flash).toBe(6)
        expect(after.params.depth).toBe(before.params.depth)
        expect(after.on).toBe(true)
    })

    it('leaves the effects alone on a column without a look, and drops what is not a look', () => {
        const deck = setColumnLook(deckOf(), 0, { 'not.an.effect': { mix: 1 }, 'top.depthscan': { params: { cut: 'x' } } })
        expect(deck.columnLooks).toEqual([null, null])
        expect(triggerColumn(deck, 0).effects).toEqual(deck.effects)
    })
})

describe('a layer over the master', () => {
    const masterInputOf = (out, effectId) => out.wires.find((wire) => wire.to.includes(effectId) && wire.port === 'a')?.from

    it('is laid on after the master effects, so they never touch it', () => {
        const start = triggerColumn(deckOf((deck) => { deck.layers[1].over = true; return deck }), 0)
        const out = expandDeck({ id: 'deck', values: { deck: start } })
        const blends = out.nodes.filter((node) => node.type === 'top.blend').map((node) => node.id)
        const scanNode = out.nodes.find((node) => node.type === 'top.depthscan')
        // the Depth scan reads the first layer's blend, not the text layer's
        const fedBy = masterInputOf(out, scanNode.id)
        const textBlend = out.wires.find((wire) => wire.port === 'b' && out.nodes.find((node) => node.id === wire.from)?.values?.asset === 't')?.to
        expect(blends).toContain(textBlend)
        expect(fedBy).not.toBe(textBlend)
        // and the master level reads the text layer's blend: it is the last thing laid on
        const level = out.nodes.find((node) => node.type === 'top.level')
        expect(out.wires.find((wire) => wire.to === level.id)?.from).toBe(textBlend)
    })

    it('without the flag the text goes through the master effects as before', () => {
        const out = expandDeck({ id: 'deck', values: { deck: triggerColumn(deckOf(), 0) } })
        const scanNode = out.nodes.find((node) => node.type === 'top.depthscan')
        const textBlend = out.wires.find((wire) => wire.port === 'b' && out.nodes.find((node) => node.id === wire.from)?.values?.asset === 't')?.to
        expect(masterInputOf(out, scanNode.id)).toBe(textBlend)
    })
})
