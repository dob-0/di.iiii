import { describe, expect, it } from 'vitest'
import { createDeck, setClip } from '../../project/tops/vjDeck.js'
import { applyMidi } from './deckBinding.js'
import { consoleOf, defaultMap, pickInputId } from './xoneK2.js'
import { APC40_CONSOLE_ID, isApc40 } from './apc40.js'

// The Platina show mapping on the APC40 mkII: real note numbers (channel 1 is 1-based, as parseMidiMessage reports it).
const clip = (n) => ({ kind: 'asset', asset: `a${n}` })
const noteOn = (note, channel = 1) => ({ kind: 'noteOn', channel, note, velocity: 127 })
const cc = (number, value, channel = 1) => ({ kind: 'cc', channel, cc: number, value })

const show = () => {
    let deck = createDeck({ layers: 5, columns: 12 })
    for (let l = 0; l < 5; l += 1) for (let c = 0; c < 12; c += 1) deck = setClip(deck, l, c, clip(l * 12 + c))
    return deck
}
const map = defaultMap(APC40_CONSOLE_ID)

describe('APC40 mkII show mapping', () => {
    it('the console exists and K2 stays the default', () => {
        expect(consoleOf(APC40_CONSOLE_ID).id).toBe('apc40')
        expect(consoleOf(undefined).id).toBe('k2')
        expect(consoleOf('nonsense').id).toBe('k2')
    })

    it('top pad row (notes 32-39) launches the whole column 1-8', () => {
        for (let c = 0; c < 8; c += 1) {
            const next = applyMidi(show(), noteOn(32 + c), map)
            expect(next.layers.map((layer) => layer.active), `pad ${c + 1}`).toEqual([c, c, c, c, c])
        }
    })

    it('track-stop keys 1-4 (note 52, channels 1-4) launch columns 9-12', () => {
        for (let t = 0; t < 4; t += 1) {
            const next = applyMidi(show(), noteOn(52, t + 1), map)
            expect(next.layers.map((layer) => layer.active), `stop ${t + 1}`).toEqual([8 + t, 8 + t, 8 + t, 8 + t, 8 + t])
        }
    })

    it('the lower pad rows still play one clip on one layer', () => {
        const next = applyMidi(show(), noteOn(8 + 3), map)   // layer 2 (BODY), column 4
        expect(next.layers[1].active).toBe(3)
        expect(next.layers.filter((layer, index) => index !== 1).every((layer) => layer.active !== 3)).toBe(true)
    })

    it('faders 1-5 set layer opacity and the master fader sets the master', () => {
        let deck = show()
        for (let layer = 0; layer < 5; layer += 1) {
            const next = applyMidi(deck, cc(7, 0, layer + 1), map)
            expect(next.layers[layer].opacity, `fader ${layer + 1}`).toBe(0)
            deck = applyMidi(next, cc(7, 127, layer + 1), map)
            expect(deck.layers[layer].opacity).toBe(1)
        }
        expect(applyMidi(show(), cc(14, 0), map).master).toBe(0)
    })

    it('bypass and solo keys toggle their layer', () => {
        const bypassed = applyMidi(show(), noteOn(48, 2), map)
        expect(bypassed.layers[1].bypass).toBe(true)
        expect(applyMidi(show(), noteOn(49, 3), map).layers[2].solo).toBe(true)
    })

    it('an APC40 as the only input is picked, even when the console is k2', () => {
        const devices = [{ id: 'a', name: 'APC40 mkII' }]
        expect(isApc40(devices[0])).toBe(true)
        expect(pickInputId(devices, 'k2')).toBe('a')
        expect(pickInputId(devices, APC40_CONSOLE_ID)).toBe('a')
    })
})
