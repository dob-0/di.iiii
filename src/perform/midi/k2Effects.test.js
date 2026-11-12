import { describe, expect, it } from 'vitest'
import { addEffect, createDeck, setClip, setEffectOn, setEffectParam, trigger } from '../../project/tops/vjDeck.js'
import { applyMidi, describeAction, effectiveMap, holdTargets, ledColour, ledsFor, nextFxIndex, nextFxLayer } from './deckBinding.js'
import { XONE_K2_CONTROLS, XONE_K2_LEDS, defaultMap } from './xoneK2.js'

const num = (name) => XONE_K2_CONTROLS.find((c) => c.control === name).number
const on = (name) => ({ kind: 'noteOn', channel: 15, note: num(name), velocity: 127 })
const off = (name) => ({ kind: 'noteOff', channel: 15, note: num(name), velocity: 0 })
const cc = (name, value) => ({ kind: 'cc', channel: 15, cc: num(name), value })
const map = defaultMap()
const clip = (n) => ({ id: `c${n}`, kind: 'input', input: 'in1' })
const withClips = (layers) => layers.reduce((deck, layer) => setClip(deck, layer, 0, clip(layer)), createDeck({ layers: 4, columns: 4 }))

describe('K2 effects: on/off, layer, effect, freeze', () => {
    it('the third pot switch row toggles effect 1-4 of the selected stack', () => {
        let deck = addEffect(addEffect(createDeck({ layers: 2 }), 1, 'top.level'), 1, 'top.blur')
        const ctx = { fx: { layer: 1, effect: 0 } }
        const next = applyMidi(deck, on('pot switch 10'), map, ctx)
        expect(next.layers[1].effects.map((e) => e.on)).toEqual([true, false])
        expect(applyMidi(next, on('pot switch 10'), map, ctx).layers[1].effects[1].on).toBe(true)
        expect(applyMidi(deck, off('pot switch 10'), map, ctx)).toBe(deck) // a release does nothing
        expect(applyMidi(deck, on('pot switch 11'), map, ctx)).toBe(deck) // no third effect
        deck = addEffect(deck, 'master', 'top.tint')
        expect(applyMidi(deck, on('pot switch 9'), map, { fx: { layer: -1 } }).effects[0].on).toBe(false)
    })
    it('their lights: green on, red off, dark with no effect', () => {
        const base = addEffect(addEffect(createDeck({ layers: 2 }), 1, 'top.level'), 1, 'top.blur')
        const deck = setEffectOn(base, 1, base.layers[1].effects[1].id, false)
        const entry = (n) => map.find((e) => e.match.number === num(`pot switch ${n}`))
        const ctx = { fx: { layer: 1 } }
        expect(ledColour(deck, entry(9), ctx)).toBe('green')
        expect(ledColour(deck, entry(10), ctx)).toBe('red')
        expect(ledColour(deck, entry(11), ctx)).toBe(null)
        const led = ledsFor(deck, map, XONE_K2_LEDS, 15, ctx).filter((l) => l.velocity)
        expect(led.map((l) => l.note)).toContain(XONE_K2_LEDS[num('pot switch 9')].green)
        expect(led.map((l) => l.note)).toContain(XONE_K2_LEDS[num('pot switch 10')].red)
    })
    it('LAYER picks the next layer with clips, skips empty ones, wraps', () => {
        const deck = withClips([0, 2])
        expect(nextFxLayer(deck, 0)).toBe(2)
        expect(nextFxLayer(deck, 2)).toBe(0)
        expect(nextFxLayer(deck, -1)).toBe(0)
        expect(nextFxLayer(createDeck({ layers: 3 }), 0)).toBe(null)
        const picked = []
        expect(applyMidi(deck, on('layer button'), map, { fx: { layer: 0 }, onFxLayer: (i) => picked.push(i) })).toBe(deck)
        expect(picked).toEqual([2])
    })
    it('encoder 6 push picks the next effect, and pots 9-12 turn that one', () => {
        const deck = addEffect(addEffect(createDeck({ layers: 1 }), 0, 'top.level'), 0, 'top.blur')
        expect(nextFxIndex(deck, 0, 0)).toBe(1)
        expect(nextFxIndex(deck, 0, 1)).toBe(0)
        expect(nextFxIndex(createDeck({ layers: 1 }), 0, 0)).toBe(null)
        const picked = []
        applyMidi(deck, on('encoder 6 push'), map, { fx: { layer: 0, effect: 0 }, onFxEffect: (i) => picked.push(i) })
        expect(picked).toEqual([1])
        // default effect 1 = today's behaviour; effect 2 after the push
        expect(applyMidi(deck, cc('pot 9', 64), map, { fx: { layer: 0 } }).layers[0].effects[0].mix).toBeCloseTo(64 / 127)
        const second = applyMidi(deck, cc('pot 9', 64), map, { fx: { layer: 0, effect: 1 } })
        expect(second.layers[0].effects[1].mix).toBeCloseTo(64 / 127)
        expect(second.layers[0].effects[0].mix).toBe(1)
    })
    it('EXIT SETUP holds every Freeze effect of the master and the selected layer, and lets go on release', () => {
        let deck = addEffect(addEffect(addEffect(createDeck({ layers: 2 }), 0, 'top.freeze'), 1, 'top.freeze'), 'master', 'top.freeze')
        deck = addEffect(deck, 0, 'top.blur')
        for (const [where, effect] of [['master', deck.effects[0]], [0, deck.layers[0].effects[0]], [1, deck.layers[1].effects[0]]]) deck = setEffectParam(deck, where, effect.id, 'hold', 0)
        const ctx = { fx: { layer: 0 } }
        const held = applyMidi(deck, on('exit setup button'), map, ctx)
        expect([held.effects[0].params.hold, held.layers[0].effects[0].params.hold, held.layers[1].effects[0].params.hold]).toEqual([1, 1, 0])
        const released = applyMidi(held, off('exit setup button'), map, ctx)
        expect([released.effects[0].params.hold, released.layers[0].effects[0].params.hold]).toEqual([0, 0])
        // amber while held
        const entry = map.find((e) => e.action === 'hold')
        expect(ledColour(held, entry, ctx)).toBe('amber')
        expect(ledColour(released, entry, ctx)).toBe(null)
        expect(XONE_K2_LEDS[num('exit setup button')].amber).toBeTypeOf('number')
    })
    it('no Freeze effect: nothing changes', () => {
        const deck = addEffect(createDeck({ layers: 1 }), 0, 'top.blur')
        expect(holdTargets(deck, 0)).toEqual([])
        expect(applyMidi(deck, on('exit setup button'), map, { fx: { layer: 0 } })).toBe(deck)
    })
    it('a learned override replaces a default and the labels say what each does', () => {
        const eff = effectiveMap(map, [{ match: { kind: 'note', number: 99, channel: 15 }, action: 'hold', args: {} }])
        expect(eff.filter((e) => e.action === 'hold')).toHaveLength(1)
        expect(describeAction({ action: 'fxToggle', args: { slot: 1 } })).toBe('FX 2 on/off')
        expect(describeAction({ action: 'fxLayerNext', args: {} })).toBe('Next FX layer')
        expect(describeAction({ action: 'fxNext', args: {} })).toBe('Next effect')
        expect(describeAction({ action: 'hold', args: {} })).toBe('Freeze (hold)')
        expect(describeAction({ action: 'fx', args: { param: 'mix' } }, { fxEffect: 1 })).toBe('FX 2 MIX')
        expect(describeAction({ action: 'fx', args: { param: 0 } }, { fxEffect: 1 })).toBe('FX 2 PARAM 1')
    })
    it('matrix A (slot index 0) is mapped; only an override that took its action or its note changes that', () => {
        const a = map.find((e) => e.match.number === num('matrix A'))
        expect(describeAction(a)).toBe('L1 clip 1')
        const moved = effectiveMap(map, [{ match: { kind: 'note', number: 99, channel: 15 }, action: 'clip', args: { layer: 0, column: 0 } }])
        expect(moved.find((e) => e.match.number === num('matrix A'))).toBeUndefined() // the default is dropped: its action is taken elsewhere
        const deck = trigger(withClips([0]), 0, 0)
        expect(applyMidi(deck, on('matrix A'), map, {}).layers[0].active).toBe(0)
    })
})
