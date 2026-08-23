import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { encodeMessage, encodeString, assertAddress } = require('./osc.js')

// Byte-level, against the spec's own worked examples. A "does it not throw"
// test would pass on an encoder that emits the wrong endianness, and the
// receiving end of this is a laser.
describe('OSC string padding', () => {
    it('always writes at least one null, then pads to a 4-byte boundary', () => {
        // The rule people get wrong: a 4-character string is 8 bytes, not 4,
        // because the terminator cannot be skipped just because the length
        // already lands on the boundary.
        expect(encodeString('OSC').length).toBe(4)   // 3 + 1 null = 4
        expect(encodeString('data').length).toBe(8)  // 4 + 1 null -> pad to 8
        expect(encodeString('').length).toBe(4)
    })
})

describe('encodeMessage', () => {
    it('encodes the spec example /oscillator/4/frequency 440.0', () => {
        const bytes = encodeMessage('/oscillator/4/frequency', [440.0])
        expect(bytes.length % 4).toBe(0)
        expect(bytes.subarray(0, 23).toString()).toBe('/oscillator/4/frequency')
        // 440.0 as IEEE-754 big-endian
        expect(bytes.subarray(-4).toString('hex')).toBe('43dc0000')
    })

    // JS cannot tell 440.0 from 440, so inferring int from wholeness would send
    // `i` for every fader resting at 1.0 — and a desk expecting a float fader
    // ignores an int, which looks exactly like a light that will not come on.
    it('sends numbers as floats by default, whole or not', () => {
        expect(encodeMessage('/a', [3]).toString('binary')).toContain(',f')
        expect(encodeMessage('/a', [3.5]).toString('binary')).toContain(',f')
    })

    it('sends ints only when asked, and never rounds to do it', () => {
        expect(encodeMessage('/a', [3], { numberAs: 'int' }).toString('binary')).toContain(',i')
        // Fractional stays float even under numberAs:'int' — silently rounding
        // someone's number is worse than a type they did not ask for.
        expect(encodeMessage('/a', [3.5], { numberAs: 'int' }).toString('binary')).toContain(',f')
    })

    it('writes the type tag string for mixed arguments in order', () => {
        const bytes = encodeMessage('/control', [1, 2.5, 'hi', true], { numberAs: 'int' })
        expect(bytes.toString('binary')).toContain(',ifsT')
        expect(bytes.length).toBe(32)
    })

    it('carries T, F and N as type tags with no payload bytes', () => {
        const bytes = encodeMessage('/flags', [true, false, null])
        expect(bytes.toString('binary')).toContain(',TFN')
        // address 8 + tags 8, and nothing else
        expect(bytes.length).toBe(16)
    })

    it('accepts a bare argument as a one-element list', () => {
        expect(encodeMessage('/a', 5)).toEqual(encodeMessage('/a', [5]))
    })

    it('encodes an empty argument list as a bare comma', () => {
        const bytes = encodeMessage('/ping')
        expect(bytes.toString('binary')).toContain(',')
        expect(bytes.length).toBe(12) // '/ping' -> 8, ',' -> 4
    })
})

describe('assertAddress', () => {
    // Refusing beats sanitising: a rewritten address is a control message
    // delivered somewhere the author did not name.
    it('refuses an address that does not start with a slash', () => {
        expect(() => encodeMessage('control', [1])).toThrow(/must start with/)
    })

    it('refuses pattern characters and spaces', () => {
        for (const bad of ['/a b', '/a#b', '/a*b', '/a,b', '/a?b', '/a[b', '/a{b']) {
            expect(() => assertAddress(bad)).toThrow(/may not contain/)
        }
    })

    it('refuses a non-finite number rather than sending garbage', () => {
        expect(() => encodeMessage('/a', [Infinity])).toThrow()
        expect(() => encodeMessage('/a', [NaN])).toThrow()
    })
})
