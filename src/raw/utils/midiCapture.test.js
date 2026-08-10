import { describe, expect, it } from 'vitest'
import { matchesChannel, parseMidiMessage } from './midiCapture.js'

describe('parseMidiMessage', () => {
    it('reads a note on', () => {
        expect(parseMidiMessage([0x90, 60, 100]))
            .toEqual({ kind: 'noteOn', channel: 1, note: 60, velocity: 100 })
    })

    it('reads a note off', () => {
        expect(parseMidiMessage([0x80, 60, 0]))
            .toEqual({ kind: 'noteOff', channel: 1, note: 60, velocity: 0 })
    })

    it('treats note-on with zero velocity as a note OFF', () => {
        // Most keyboards release a key this way rather than sending 0x8. Read
        // as a press, every released note stays stuck on for ever.
        expect(parseMidiMessage([0x90, 60, 0]))
            .toEqual({ kind: 'noteOff', channel: 1, note: 60, velocity: 0 })
    })

    it('reads a control change', () => {
        expect(parseMidiMessage([0xb0, 74, 64]))
            .toEqual({ kind: 'cc', channel: 1, cc: 74, value: 64 })
    })

    it('reports channels as 1-16, not 0-15', () => {
        expect(parseMidiMessage([0x9f, 60, 100]).channel).toBe(16)
        expect(parseMidiMessage([0x90, 60, 100]).channel).toBe(1)
    })

    it('ignores system messages instead of reading them as channel 16', () => {
        // Clock (0xF8) and active sensing (0xFE) arrive constantly. Masking
        // their status byte for a channel nibble yields a plausible-looking
        // channel and would fire the node dozens of times a second.
        expect(parseMidiMessage([0xf8])).toBeNull()
        expect(parseMidiMessage([0xfe, 0, 0])).toBeNull()
        expect(parseMidiMessage([0xf0, 1, 2])).toBeNull()
    })

    it('ignores messages this node has no port for', () => {
        expect(parseMidiMessage([0xe0, 0, 64])).toBeNull()   // pitch bend
        expect(parseMidiMessage([0xa0, 60, 40])).toBeNull()  // aftertouch
    })

    it('survives short or missing data', () => {
        expect(parseMidiMessage([])).toBeNull()
        expect(parseMidiMessage(null)).toBeNull()
        expect(parseMidiMessage([0x90])).toBeNull()
    })

    it('accepts a Uint8Array, which is what the browser actually delivers', () => {
        expect(parseMidiMessage(new Uint8Array([0x90, 64, 80])))
            .toEqual({ kind: 'noteOn', channel: 1, note: 64, velocity: 80 })
    })
})

describe('matchesChannel', () => {
    const message = { kind: 'noteOn', channel: 3, note: 60, velocity: 100 }

    it('0 means every channel', () => {
        expect(matchesChannel(message, 0)).toBe(true)
        expect(matchesChannel(message, undefined)).toBe(true)
    })

    it('filters to one channel', () => {
        expect(matchesChannel(message, 3)).toBe(true)
        expect(matchesChannel(message, 4)).toBe(false)
    })

    it('is false for nothing', () => {
        expect(matchesChannel(null, 0)).toBe(false)
    })
})
