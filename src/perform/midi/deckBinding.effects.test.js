import { describe, expect, it } from 'vitest'
import { addEffect, createDeck } from '../../project/tops/vjDeck.js'
import { applyMidi, isContinuousEntry, entryFor, learnEntry, targetFromKey } from './deckBinding.js'
import { XONE_K2_CONTROLS, defaultMap } from './xoneK2.js'

const cc = (number, value) => ({ kind: 'cc', channel: 15, cc: number, value })
const potNumber = (name) => XONE_K2_CONTROLS.find((c) => c.control === name).number
const withTint = () => addEffect(createDeck({ layers: 2 }), 1, 'top.tint')

describe('effect MIDI targets', () => {
    it('the K2 default: pots 9-12 drive mix and the first three params of the selected stack', () => {
        const map = defaultMap()
        const deck = addEffect(createDeck({ layers: 2 }), 1, 'top.level')
        const ctx = { fx: { layer: 1 } }
        const mix = applyMidi(deck, cc(potNumber('pot 9'), 64), map, ctx)
        expect(mix.layers[1].effects[0].mix).toBeCloseTo(64 / 127)
        const gain = applyMidi(deck, cc(potNumber('pot 10'), 127), map, ctx)
        expect(gain.layers[1].effects[0].params.gain).toBe(20)
        const gamma = applyMidi(deck, cc(potNumber('pot 12'), 0), map, ctx)
        expect(gamma.layers[1].effects[0].params.gamma).toBe(0.1)
        // another layer has no effect: nothing changes
        expect(applyMidi(deck, cc(potNumber('pot 9'), 64), map, { fx: { layer: 0 } })).toBe(deck)
        expect(applyMidi(deck, cc(potNumber('pot 9'), 64), map, {})).toBe(deck)
    })
    it('master is layer -1', () => {
        const deck = addEffect(createDeck(), 'master', 'top.blur')
        const next = applyMidi(deck, cc(1, 127), [{ match: { kind: 'cc', number: 1, channel: 15 }, action: 'fx', args: { param: 0 } }], { fx: { layer: -1 } })
        expect(next.effects[0].params.size).toBe(12)
    })
    it('a param the type does not have, or a colour, is ignored', () => {
        const deck = withTint() // tint: amount is numeric 0, 'bright' is a colour (not numeric)
        const map = [{ match: { kind: 'cc', number: 1, channel: 15 }, action: 'fx', args: { param: 1 } }]
        expect(applyMidi(deck, cc(1, 100), map, { fx: { layer: 1 } })).toBe(deck)
    })
    it('soft takeover: a pot far from the value does nothing until it arrives', () => {
        const deck = withTint()
        const map = [{ match: { kind: 'cc', number: 1, channel: 15 }, action: 'fx', args: { param: 'mix' } }]
        const pickup = new Map()
        const ctx = { fx: { layer: 1 }, pickup }
        expect(applyMidi(deck, cc(1, 10), map, ctx)).toBe(deck) // mix is 1, pot at 10/127
        const arrived = applyMidi(deck, cc(1, 127), map, ctx)
        expect(arrived.layers[1].effects[0].mix).toBe(1) // arrives at the value: no jump
        const moved = applyMidi(deck, cc(1, 60), map, ctx)
        expect(moved.layers[1].effects[0].mix).toBeCloseTo(60 / 127)
    })
    it('fx is a continuous action (coalesced) and learn keys resolve', () => {
        expect(isContinuousEntry(entryFor(cc(potNumber('pot 9'), 1), defaultMap()))).toBe(true)
        expect(targetFromKey('fxmix:1:0')).toEqual({ action: 'fx', args: { layer: 1, effect: 0, param: 'mix' } })
        expect(targetFromKey('fxp:m:2:1')).toEqual({ action: 'fx', args: { layer: -1, effect: 2, param: 1 } })
        expect(targetFromKey('fxp:1:0')).toBeNull()
        const target = targetFromKey('fxmix:1:0')
        const learned = learnEntry(target, cc(30, 5))
        const deck = withTint()
        expect(applyMidi(deck, cc(30, 127), [learned], {}).layers[1].effects[0].mix).toBe(1)
        const low = applyMidi(deck, cc(30, 0), [learned], {})
        expect(low.layers[1].effects[0].mix).toBe(0)
    })
})
