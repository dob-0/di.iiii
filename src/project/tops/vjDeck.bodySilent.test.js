import { describe, expect, it } from 'vitest'
import { matteWanted } from './topEngine.js'
import {
    MASTER_STACK,
    VJ_DECK_TYPE,
    addEffect,
    createDeck,
    expandDeck,
    setBypass,
    setClip,
    setCrossfade,
    setOpacity,
    setSide,
    setSolo,
    trigger
} from './vjDeck.js'

// Body runs a person-finding model on the layer's picture: about 14 ms a run on the show
// machine. With three Body layers and two faders down the deck still ran it three times a
// frame and the output fell to 17 frames a second (measured 2026-11-11, Platina deck). A
// silent layer must not pay for the model: the deck marks its Body nodes `unseen` and the
// engine keeps the mask it has instead of running the model.
const deckNode = (deck) => ({ id: 'deck', type: VJ_DECK_TYPE, values: { machine: '', deck } })
const clip = (asset) => ({ id: `c-${asset}`, kind: 'asset', asset, label: asset })
const threeBodies = () => {
    let deck = createDeck({ layers: 3 })
    for (let i = 0; i < 3; i += 1) {
        deck = trigger(setClip(deck, i, 0, clip(`c${i}`)), i, 0)
        deck = addEffect(addEffect(deck, i, 'top.matte'), i, 'top.blur')
    }
    return deck
}
const expanded = (deck) => expandDeck(deckNode(deck))
const bodies = (deck) => expanded(deck).nodes.filter((node) => node.type === 'top.matte')
const unseen = (deck) => bodies(deck).map((node) => node.values.unseen === true)

describe('a Body effect on a silent layer', () => {
    it('is seen while its layer has any level', () => {
        expect(unseen(threeBodies())).toEqual([false, false, false])
        expect(unseen(setOpacity(threeBodies(), 1, 0.01))).toEqual([false, false, false])
        // No key at all on a seen node: its values are the effect's parameters and nothing else.
        for (const node of bodies(threeBodies())) expect('unseen' in node.values).toBe(false)
    })

    it('is marked unseen with the fader down, and seen again when it comes back', () => {
        const down = setOpacity(setOpacity(threeBodies(), 1, 0), 2, 0)
        expect(unseen(down)).toEqual([false, true, true])
        expect(unseen(setOpacity(down, 1, 0.5))).toEqual([false, false, true])
    })

    it('is marked unseen by bypass, by another layer\'s solo and by the crossfader', () => {
        expect(unseen(setBypass(threeBodies(), 'layer-2', true))).toEqual([false, true, false])
        expect(unseen(setSolo(threeBodies(), 'layer-3', true))).toEqual([true, true, false])
        expect(unseen(setCrossfade(setSide(threeBodies(), 'layer-1', 'a'), 1))).toEqual([true, false, false])
    })

    it('keeps every node and wire when it goes silent (nothing restarts, the model stays loaded)', () => {
        const base = threeBodies()
        const down = setOpacity(base, 1, 0)
        expect(expanded(down).nodes.map((node) => node.id)).toEqual(expanded(base).nodes.map((node) => node.id))
        expect(JSON.stringify(expanded(down).wires)).toBe(JSON.stringify(expanded(base).wires))
    })

    it('marks only Body: the other effects of a silent layer and the master stack are untouched', () => {
        const down = addEffect(setOpacity(threeBodies(), 0, 0), MASTER_STACK, 'top.matte')
        const nodes = expanded(down).nodes
        expect(nodes.filter((node) => node.type === 'top.blur').some((node) => 'unseen' in node.values)).toBe(false)
        const master = nodes.filter((node) => node.type === 'top.matte' && !node.id.includes('::L'))
        expect(master).toHaveLength(1)
        expect('unseen' in master[0].values).toBe(false)
    })
})

describe('the engine and an unseen Body', () => {
    it('wants a fresh mask for a seen Body and none for an unseen one', () => {
        const [seen, hidden] = bodies(setOpacity(threeBodies(), 1, 0))
        expect(matteWanted(seen)).toBe(true)
        expect(matteWanted(hidden)).toBe(false)
    })

    it('wants a mask when nothing says otherwise (a Body outside a deck, a node without values)', () => {
        expect(matteWanted({ id: 'a', type: 'top.matte', values: {} })).toBe(true)
        expect(matteWanted({ id: 'a', type: 'top.matte' })).toBe(true)
        expect(matteWanted({ id: 'a', type: 'top.matte', values: { unseen: false } })).toBe(true)
        expect(matteWanted(null)).toBe(true)
    })
})
