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

describe('APC40 mkII: the keys the controller toggles itself', () => {
    const stateful = (control) => control.kind === 'note' && (control.number === 48 || control.number === 49 || control.number === 66)
    const noteOff = (note, channel = 1) => ({ kind: 'noteOff', channel, note, velocity: 0 })

    it('solo and bypass follow the key state: note-on = on, note-off = off, so every press answers', () => {
        let deck = applyMidi(show(), noteOn(49, 2), map, { stateful })
        expect(deck.layers[1].solo).toBe(true)
        deck = applyMidi(deck, noteOn(49, 2), map, { stateful })          // said "on" again: stays on
        expect(deck.layers[1].solo).toBe(true)
        deck = applyMidi(deck, noteOff(49, 2), map, { stateful })
        expect(deck.layers[1].solo).toBe(false)
        deck = applyMidi(deck, noteOn(48, 3), map, { stateful })
        expect(deck.layers[2].bypass).toBe(true)
        expect(applyMidi(deck, noteOff(48, 3), map, { stateful }).layers[2].bypass).toBe(false)
    })

    it('without a stateful controller a key still toggles on its press and ignores the release (the K2 way)', () => {
        const on = applyMidi(show(), noteOn(49, 2), map)
        expect(on.layers[1].solo).toBe(true)
        expect(applyMidi(on, noteOff(49, 2), map)).toBe(on)
        expect(applyMidi(on, noteOn(49, 2), map).layers[1].solo).toBe(false)
    })

    it('a pad release is never an action, stateful or not', () => {
        const deck = show()
        expect(applyMidi(deck, noteOff(8 + 3), map, { stateful })).toBe(deck)
    })

    it('a track-select binding names the layer the effect knobs address; -1 is the master', () => {
        const picked = []
        const full = [...map, { match: { kind: 'note', number: 51, channel: 3 }, action: 'fxLayer', args: { layer: 2 } }, { match: { kind: 'note', number: 80, channel: 1 }, action: 'fxLayer', args: { layer: -1 } }]
        const deck = show()
        expect(applyMidi(deck, noteOn(51, 3), full, { onFxLayer: (i) => picked.push(i) })).toBe(deck)
        applyMidi(deck, noteOn(80, 1), full, { onFxLayer: (i) => picked.push(i) })
        expect(picked).toEqual([2, -1])
    })

    it('an A|B key that speaks in states sets the side: 1 = A, 2 = B, off = none', () => {
        const full = [...map, { match: { kind: 'note', number: 66, channel: 1 }, action: 'side', args: { layer: 0 } }]
        let deck = applyMidi(show(), { kind: 'noteOn', channel: 1, note: 66, velocity: 1 }, full, { stateful })
        expect(deck.layers[0].side).toBe('a')
        deck = applyMidi(deck, { kind: 'noteOn', channel: 1, note: 66, velocity: 2 }, full, { stateful })
        expect(deck.layers[0].side).toBe('b')
        expect(applyMidi(deck, noteOff(66, 1), full, { stateful }).layers[0].side).toBe('')
    })
})
