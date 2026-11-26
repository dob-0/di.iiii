import { describe, expect, it } from 'vitest'
import { createDeck, setClip, triggerColumn } from '../../project/tops/vjDeck.js'
import { applyMidi, ledBytes } from './deckBinding.js'
import { defaultMap } from './xoneK2.js'
import { APC40_CONSOLE_ID, APC40_LED, apc40LedChanges, apc40LedClears, apc40Leds } from './apc40.js'

// The APC40 mkII LED picture: the values Resolume's APC40 mkII preset sends (empty 1, loaded 33, playing 52).
const clip = (n) => ({ kind: 'asset', asset: `a${n}` })
const noteOn = (note, channel = 1) => ({ kind: 'noteOn', channel, note, velocity: 127 })
const map = defaultMap(APC40_CONSOLE_ID)
const at = (leds, note, channel = 1) => leds.find((led) => led.note === note && led.channel === channel)?.velocity

// 5 layers x 12 columns, column 12 empty on every layer, layer 1 column 3 empty
const show = () => {
    let deck = createDeck({ layers: 5, columns: 12 })
    for (let l = 0; l < 5; l += 1) for (let c = 0; c < 11; c += 1) if (!(l === 0 && c === 2)) deck = setClip(deck, l, c, clip(l * 12 + c))
    return deck
}

describe('APC40 mkII LEDs', () => {
    it('clip pads: empty is dim, a loaded clip is 33, the playing clip is 52', () => {
        const deck = triggerColumn(show(), 1)
        const leds = apc40Leds(deck, map)
        expect(at(leds, 0)).toBe(APC40_LED.LOADED)   // layer 1, column 1: loaded
        expect(at(leds, 1)).toBe(APC40_LED.PLAYING)  // layer 1, column 2: playing
        expect(at(leds, 2)).toBe(APC40_LED.EMPTY)    // layer 1, column 3: no clip
        expect(at(leds, 8 + 1)).toBe(APC40_LED.PLAYING) // layer 2, column 2
    })

    it('top pad row: the playing column is 52, a column with clips is 33', () => {
        const leds = apc40Leds(triggerColumn(show(), 4), map)
        expect(at(leds, 32 + 4)).toBe(APC40_LED.PLAYING)
        expect(at(leds, 32 + 0)).toBe(APC40_LED.LOADED)
    })

    it('track stop 1-4 (columns 9-12): lit (1) only for the playing column; column 12 is empty', () => {
        const deck = triggerColumn(show(), 9)
        const leds = apc40Leds(deck, map)
        expect(at(leds, 52, 2)).toBe(APC40_LED.STOP_ON) // column 10
        expect(at(leds, 52, 1)).toBe(APC40_LED.OFF)
        expect(at(leds, 52, 4)).toBe(APC40_LED.OFF)     // column 12, empty
    })

    it('bypass and solo keys light on their own channel (note 48 / 49 on channels 1-5)', () => {
        let deck = applyMidi(show(), noteOn(48, 2), map)   // bypass layer 2
        deck = applyMidi(deck, noteOn(49, 4), map)          // solo layer 4
        const leds = apc40Leds(deck, map)
        expect(at(leds, 48, 2)).toBe(APC40_LED.ON)
        expect(at(leds, 48, 1)).toBe(APC40_LED.OFF)
        expect(at(leds, 49, 4)).toBe(APC40_LED.ON)
        expect(at(leds, 49, 3)).toBe(APC40_LED.OFF)
    })

    it('every bound note gets exactly one message, and the bytes are a note-on on the control channel', () => {
        const leds = apc40Leds(show(), map)
        const keys = leds.map((led) => `${led.channel}:${led.note}`)
        expect(new Set(keys).size).toBe(keys.length)
        expect(leds.filter((led) => led.note <= 39)).toHaveLength(40)
        expect(ledBytes({ channel: 3, note: 48, velocity: 127 })).toEqual([0x92, 48, 127])
    })

    it('only changes are resent, and a button whose binding went away goes dark once', () => {
        const sent = new Map()
        const first = apc40Leds(show(), map)
        expect(apc40LedChanges(first, sent)).toHaveLength(first.length)
        expect(apc40LedChanges(first, sent)).toHaveLength(0)
        const moved = apc40Leds(triggerColumn(show(), 0), map)
        const changed = apc40LedChanges(moved, sent)
        expect(changed.length).toBeGreaterThan(0)
        expect(changed.length).toBeLessThan(first.length)
        const fewer = moved.filter((led) => !(led.note === 49 && led.channel === 1))
        sent.set('1:49', 127)
        expect(apc40LedClears(fewer, sent)).toEqual([{ channel: 1, note: 49, velocity: 0 }])
        expect(apc40LedClears(fewer, sent)).toEqual([])
    })
})
