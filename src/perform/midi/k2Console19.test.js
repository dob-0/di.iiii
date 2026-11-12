import { describe, expect, it } from 'vitest'
import { applyMidi } from './deckBinding.js'
import { addEffect, createDeck } from '../../project/tops/vjDeck.js'
import { K2_CONSOLES, K2_CONSOLE_DEFAULT, XONE_K2_MAP, XONE_K2_19_MAP, XONE_K2_19_FREE, XONE_K2_FREE, consoleOf, defaultMap } from './xoneK2.js'

const byControl = (map, name) => map.find((entry) => entry.control === name)
const cc = (number, value) => ({ kind: 'cc', cc: number, channel: 15, value })
const sixLayers = () => { const deck = createDeck({ layers: 6, columns: 4 }); return { ...deck, layers: deck.layers.map((layer) => ({ ...layer, opacity: 0.5 })) } }

describe('the two Xone:K2 consoles', () => {
    it('are named K2 and K2 (1.9), with the ids k2 and k2-1.9', () => {
        expect(K2_CONSOLES.map((item) => [item.id, item.name])).toEqual([['k2', 'K2'], ['k2-1.9', 'K2 (1.9)']])
        expect(K2_CONSOLE_DEFAULT).toBe('k2')
        expect(consoleOf('k2-1.9').name).toBe('K2 (1.9)')
        expect(consoleOf('nope').id).toBe('k2')
        expect(consoleOf(undefined).id).toBe('k2')
    })

    it('T1 K2 (1.9) has 57 entries, none on fader 4, and its free list is exactly [fader 4]', () => {
        expect(XONE_K2_19_MAP).toHaveLength(57)
        expect(byControl(XONE_K2_19_MAP, 'fader 4')).toBeUndefined()
        expect(XONE_K2_19_FREE).toEqual(['fader 4'])
    })

    it('T2 pot 12 is opacity of layer index 3, not relative', () => {
        const entry = byControl(XONE_K2_19_MAP, 'pot 12')
        expect(entry.action).toBe('opacity')
        expect(entry.args).toEqual({ layer: 3 })
        expect(entry.relative).toBeFalsy()
    })

    it('T3 encoder 3 is fx param index 2, relative', () => {
        const entry = byControl(XONE_K2_19_MAP, 'encoder 3')
        expect(entry.action).toBe('fx')
        expect(entry.args).toEqual({ param: 2 })
        expect(entry.relative).toBe(true)
    })

    it('T4 the other 39 entries equal the K2 ones (the 16 matrix buttons run top-down, see k2ButtonRows.test.js), and K2 is unchanged (58 entries)', () => {
        const changed = ['fader 4', 'pot 12', 'encoder 3', ...'ABCDEFGHIJKLMNOP'.split('').map((letter) => `matrix ${letter}`)]
        const rest = XONE_K2_19_MAP.filter((entry) => !changed.includes(entry.control))
        expect(rest).toHaveLength(39)
        for (const entry of rest) expect(entry).toEqual(byControl(XONE_K2_MAP, entry.control))
        expect(XONE_K2_MAP).toHaveLength(58)
        expect(XONE_K2_FREE.length).toBe(0)
        expect(byControl(XONE_K2_MAP, 'fader 4')).toMatchObject({ action: 'opacity', args: { layer: 3 } })
        expect(byControl(XONE_K2_MAP, 'pot 12')).toMatchObject({ action: 'fx', args: { param: 2 } })
        expect(byControl(XONE_K2_MAP, 'encoder 3')).toMatchObject({ action: 'opacity', args: { layer: 5 }, relative: true })
    })

    it('T5 through applyMidi: on K2 (1.9) CC 15 sets layer 4 level, CC 19 changes nothing; on K2 CC 19 still moves layer 4', () => {
        const deck = sixLayers()
        const map19 = defaultMap('k2-1.9')
        expect(applyMidi(deck, cc(15, 127), map19).layers[3].opacity).toBe(1)
        expect(applyMidi(deck, cc(15, 0), map19).layers[3].opacity).toBe(0)
        for (const value of [0, 1, 64, 127]) expect(applyMidi(deck, cc(19, value), map19)).toEqual(deck)
        expect(applyMidi(deck, cc(19, 127), defaultMap('k2')).layers[3].opacity).toBe(1)
        expect(applyMidi(deck, cc(19, 127), defaultMap()).layers[3].opacity).toBe(1)
    })

    it('T3b through applyMidi: on K2 (1.9) one encoder 3 tick nudges the third knob of the picked effect by a fiftieth of its range and moves no level; on K2 the same tick is the level of layer 6', () => {
        // top.level: gain 0..20, brightness -1..1, gamma 0.1..4 (the third knob; range 3.9)
        const deck = addEffect(sixLayers(), 0, 'top.level')
        const ctx = { fx: { layer: 0, effect: 0 } }
        const gamma = (d) => d.layers[0].effects[0].params.gamma
        const levels = (d) => d.layers.map((layer) => layer.opacity)
        const map19 = defaultMap('k2-1.9')
        const up = applyMidi(deck, cc(2, 1), map19, ctx) // CC 2 = encoder 3, value 1 = one tick up
        const down = applyMidi(deck, cc(2, 127), map19, ctx) // 127 = one tick down
        expect(gamma(up) - gamma(deck)).toBeCloseTo(3.9 / 50, 3)
        expect(gamma(down) - gamma(deck)).toBeCloseTo(-3.9 / 50, 3)
        expect(levels(up)).toEqual(levels(deck))
        const k2 = applyMidi(deck, cc(2, 1), defaultMap('k2'), ctx)
        expect(k2.layers[5].opacity).toBeGreaterThan(0.5)
        expect(gamma(k2)).toBe(gamma(deck))
    })
})
