import { describe, expect, it } from 'vitest'
import { addEffect, createDeck, setBpm, setCrossfade, setEffectMix, setEffectParam, setMaster, setOpacity, setClip, effectNumericParams, MASTER_STACK } from '../../project/tops/vjDeck.js'
import { bindingFor, describeMatch, effectiveMap, ledChanges, ledClears, ledsFor, normalizeOverrides, resetDeckValue, shortMatch, targetFromKey, withOverride, withoutOverride } from './deckBinding.js'
import { K2_CHANNEL, XONE_K2_LEDS, defaultMap } from './xoneK2.js'

const learned = (kind, number, action, args = {}) => ({ match: { kind, number, channel: 15 }, action, args })

describe('withoutOverride', () => {
    it('drops only the learned binding of that target; the others stay', () => {
        let stored = withOverride(null, learned('cc', 40, 'master'))
        stored = withOverride(stored, learned('cc', 41, 'opacity', { layer: 0 }))
        const next = withoutOverride(stored, targetFromKey('master'))
        expect(next.bindings.map((b) => b.action)).toEqual(['opacity'])
    })
    it('is a no-op on nothing stored, and the default returns', () => {
        expect(withoutOverride(null, targetFromKey('master'))).toEqual({ bindings: [] })
        const stored = withOverride(null, learned('cc', 40, 'master'))
        const defaults = defaultMap()
        const map = effectiveMap(defaults, normalizeOverrides(withoutOverride(stored, targetFromKey('master'))))
        expect(map.find((e) => e.action === 'master').match.number).toBe(defaults.find((e) => e.action === 'master').match.number)
    })
})

describe('bindingFor / describeMatch', () => {
    const defaults = defaultMap()
    it('a default binding is found and marked not learned', () => {
        const found = bindingFor(defaults, [], targetFromKey('crossfade'))
        expect(found.learned).toBe(false)
        expect(found.entry.action).toBe('crossfade')
    })
    it('a learned binding wins and is marked learned', () => {
        const overrides = normalizeOverrides(withOverride(null, learned('cc', 99, 'master')))
        const found = bindingFor(defaults, overrides, targetFromKey('master'))
        expect(found.learned).toBe(true)
        expect(found.entry.match.number).toBe(99)
    })
    it('a control with nothing is null', () => {
        expect(bindingFor(defaults, [], targetFromKey('blend:7'))).toBe(null)
        expect(bindingFor(defaults, [], null)).toBe(null)
    })
    it('says the binding in plain words', () => {
        expect(describeMatch({ kind: 'cc', number: 4, channel: 15 })).toBe('CC 4 · ch 15')
        expect(describeMatch({ kind: 'note', number: 36, channel: 15 })).toBe('Note 36 · ch 15')
        expect(describeMatch({ kind: 'cc', number: 4, channel: 0 })).toBe('CC 4 · any ch')
        expect(shortMatch({ kind: 'note', number: 36 })).toBe('N 36')
        expect(shortMatch({ kind: 'cc', number: 4 })).toBe('CC 4')
        expect(describeMatch(null)).toBe('')
    })
})

describe('resetDeckValue', () => {
    it('opacity, crossfade and master go back to their start', () => {
        let deck = createDeck({ layers: 2 })
        deck = setMaster(setCrossfade(setOpacity(deck, 1, 0.2), 0.9), 0.3)
        expect(resetDeckValue(deck, 'opacity:1').layers[1].opacity).toBe(1)
        expect(resetDeckValue(deck, 'crossfade').crossfade).toBe(0.5)
        expect(resetDeckValue(deck, 'master').master).toBe(1)
    })
    it('effect mix goes to 1 and a param to the operator default, layer and master stacks', () => {
        let deck = addEffect(addEffect(createDeck({ layers: 1 }), 0, 'top.blur'), MASTER_STACK, 'top.blur')
        const size = effectNumericParams('top.blur')[0]
        const layerFx = deck.layers[0].effects[0]
        deck = setEffectParam(setEffectMix(deck, 0, layerFx.id, 0.1), 0, layerFx.id, size.name, size.max)
        const masterFx = deck.effects[0]
        deck = setEffectParam(deck, MASTER_STACK, masterFx.id, size.name, size.max)
        expect(resetDeckValue(deck, 'fxmix:0:0').layers[0].effects[0].mix).toBe(1)
        expect(resetDeckValue(deck, 'fxp:0:0:0').layers[0].effects[0].params[size.name]).toBe(size.value)
        expect(resetDeckValue(deck, 'fxp:m:0:0').effects[0].params[size.name]).toBe(size.value)
    })
    it('answers null where there is no start value, or no such effect', () => {
        const deck = setClip(createDeck({ layers: 1 }), 0, 0, { kind: 'input', input: 'in1' })
        for (const key of ['tap', 'bpm', 'clip:0:0', 'bypass:0', 'solo:0', 'side:0', 'blend:0', 'column:0', 'clear:0', 'fxmix:0:5', 'fxp:0:5:0', 'nonsense', '']) {
            expect(resetDeckValue(deck, key), key).toBe(null)
        }
        expect(resetDeckValue(setBpm(deck, 100), 'bpm')).toBe(null)
    })
})

describe('ledClears', () => {
    const k2 = (deck, map) => ledsFor(deck, map, XONE_K2_LEDS, K2_CHANNEL)
    it('a lit button that lost its binding is switched off; lit ones that stay are not touched', () => {
        const deck = setClip(createDeck({ layers: 4, columns: 4 }), 0, 0, { kind: 'input', input: 'in1' })
        const full = defaultMap()
        const sent = new Map()
        ledChanges(k2(deck, full), sent)
        const lit = [...sent].filter(([, v]) => v > 0)
        expect(lit.length).toBeGreaterThan(0)
        // matrix A (note 36, clip 0:0) is unbound
        const without = full.filter((e) => !(e.match.kind === 'note' && e.match.number === 36))
        const off = ledClears(k2(deck, without), sent, K2_CHANNEL)
        const ofMatrixA = Object.values(XONE_K2_LEDS[36])
        expect(off.map((led) => led.note)).toEqual(lit.map(([note]) => note).filter((note) => ofMatrixA.includes(note)))
        expect(off.length).toBeGreaterThan(0)
        expect(off.length).toBeLessThan(lit.length + 1)
        expect(off.every((led) => led.velocity === 0 && led.channel === K2_CHANNEL)).toBe(true)
        expect(ledClears(k2(deck, without), sent, K2_CHANNEL)).toEqual([]) // once only
    })
    it('nothing to clear when the picture is unchanged', () => {
        const deck = createDeck({ layers: 4, columns: 4 })
        const sent = new Map()
        ledChanges(k2(deck, defaultMap()), sent)
        expect(ledClears(k2(deck, defaultMap()), sent, K2_CHANNEL)).toEqual([])
    })
})

describe('learned buttons get a light', () => {
    it('a learned note bound to a clip lights like the default one (amber, then green when playing)', () => {
        const deck = setClip(createDeck({ layers: 4, columns: 4 }), 0, 0, { kind: 'input', input: 'in1' })
        const overrides = normalizeOverrides(withOverride(null, learned('note', 37, 'clip', { layer: 0, column: 0 })))
        const leds = ledsFor(deck, effectiveMap(defaultMap(), overrides), XONE_K2_LEDS, K2_CHANNEL)
        const notes = XONE_K2_LEDS[37]
        expect(leds).toContainEqual({ channel: K2_CHANNEL, note: notes.amber, velocity: 127 })
    })
})
