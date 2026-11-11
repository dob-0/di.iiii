import { describe, expect, it } from 'vitest'
import { applyMidi } from './deckBinding.js'
import { createDeck } from '../../project/tops/vjDeck.js'
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

    it('T4 the other 55 entries equal the K2 ones, and K2 is unchanged (58 entries)', () => {
        const changed = ['fader 4', 'pot 12', 'encoder 3']
        const rest = XONE_K2_19_MAP.filter((entry) => !changed.includes(entry.control))
        expect(rest).toHaveLength(55)
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
})
