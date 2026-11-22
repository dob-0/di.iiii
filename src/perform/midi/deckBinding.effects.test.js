import { describe, expect, it } from 'vitest'
import { addEffect, createDeck } from '../../project/tops/vjDeck.js'
import { applyMidi, describeAction, isContinuousEntry, entryFor, ledColour, learnEntry, targetFromKey } from './deckBinding.js'
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

describe('fxSet (a toggle key on a master effect value)', () => {
    const args = { type: 'top.angles', param: 'screens', value: 3, label: 'Screens 3' }
    const map = [{ match: { kind: 'note', number: 5, channel: 15 }, action: 'fxSet', args }]
    const on = (note) => ({ kind: 'noteOn', channel: 15, note, velocity: 127 })
    const off = (note) => ({ kind: 'noteOff', channel: 15, note, velocity: 0 })
    const deck = () => addEffect(createDeck(), 'master', 'top.angles')

    it('press sets the value, a second press puts the default back, release changes nothing', () => {
        const start = deck()
        expect(start.effects[0].params.screens).toBe(1)
        const set = applyMidi(start, on(5), map)
        expect(set.effects[0].params.screens).toBe(3)
        expect(applyMidi(set, off(5), map)).toBe(set)
        expect(applyMidi(start, off(5), map)).toBe(start)
        const back = applyMidi(set, on(5), map)
        expect(back.effects[0].params.screens).toBe(1)
    })
    it('bad args or an effect not on the deck change nothing', () => {
        const start = deck()
        const run = (a, d = start) => applyMidi(d, on(5), [{ match: map[0].match, action: 'fxSet', args: a }])
        expect(run({ ...args, type: 7 })).toBe(start)
        expect(run({ ...args, param: null })).toBe(start)
        expect(run({ ...args, value: NaN })).toBe(start)
        expect(run({ ...args, value: '3' })).toBe(start)
        expect(run({ ...args, type: 'top.cuts' })).toBe(start)
        const bare = createDeck()
        expect(run(args, bare)).toBe(bare)
    })
    it('LED: green when equal, amber when another value, none when the effect is missing', () => {
        const start = deck()
        expect(ledColour(start, map[0])).toBe('amber')
        expect(ledColour(applyMidi(start, on(5), map), map[0])).toBe('green')
        expect(ledColour(createDeck(), map[0])).toBeNull()
    })
    it('describeAction uses the label, else says what it sets', () => {
        expect(describeAction(map[0])).toBe('Screens 3')
        expect(describeAction({ action: 'fxSet', args: { ...args, label: '' } })).toBe('Set screens 3')
        expect(describeAction({ action: 'fxSet', args: { type: args.type, param: 'screens', value: 2 } })).toBe('Set screens 2')
    })
})

describe('layerBlend: a key puts a layer on one blend mode', () => {
    const entry = { match: { kind: 'note', number: 83, channel: 1 }, action: 'layerBlend', args: { layer: 0, blend: 3, off: 2, label: 'Text: window' } }
    const press = { kind: 'noteOn', channel: 1, note: 83, velocity: 127 }
    const release = { kind: 'noteOff', channel: 1, note: 83, velocity: 0 }
    it('press sets the blend, a second press goes back to off, a release changes nothing', () => {
        const deck = createDeck()
        const on = applyMidi(deck, press, [entry])
        expect(on.layers[0].blend).toBe('3')
        expect(applyMidi(on, release, [entry])).toBe(on)
        expect(applyMidi(on, press, [entry]).layers[0].blend).toBe('2')
    })
    it('a blend that does not exist, or a layer that does not, changes nothing', () => {
        const deck = createDeck()
        expect(applyMidi(deck, press, [{ ...entry, args: { layer: 0, blend: 42 } }])).toBe(deck)
        expect(applyMidi(deck, press, [{ ...entry, args: { layer: 99, blend: 3 } }])).toBe(deck)
    })
    it('says its label', () => {
        expect(describeAction(entry)).toBe('Text: window')
    })
})

describe('layerOver: a key puts a layer under the master effects and back', () => {
    const entry = { match: { kind: 'note', number: 86, channel: 1 }, action: 'layerOver', args: { layer: 0, label: 'Text: in the look' } }
    it('each press flips it; a release changes nothing', () => {
        const deck = createDeck()
        expect(deck.layers[0].over).toBe(false)
        const on = applyMidi(deck, { kind: 'noteOn', channel: 1, note: 86, velocity: 127 }, [entry])
        expect(on.layers[0].over).toBe(true)
        expect(applyMidi(on, { kind: 'noteOff', channel: 1, note: 86, velocity: 0 }, [entry])).toBe(on)
        expect(applyMidi(on, { kind: 'noteOn', channel: 1, note: 86, velocity: 127 }, [entry]).layers[0].over).toBe(false)
        expect(describeAction(entry)).toBe('Text: in the look')
    })
})
