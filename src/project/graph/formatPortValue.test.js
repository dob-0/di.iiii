import { describe, expect, it } from 'vitest'
import { NOTHING, formatPortValue } from './formatPortValue.js'

describe('formatPortValue', () => {
    // The whole reason this module exists. Each of these renders as a blank
    // cell or as a wrong word under the obvious implementation, and each is a
    // different fact from the one next to it.
    it('never confuses an empty port with a falsy value', () => {
        expect(formatPortValue(undefined, 'number')).toEqual({ text: NOTHING, swatch: null, empty: true })
        expect(formatPortValue(null, 'number')).toEqual({ text: NOTHING, swatch: null, empty: true })
        expect(formatPortValue(0, 'number')).toEqual({ text: '0', swatch: null, empty: false })
        expect(formatPortValue('', 'string')).toEqual({ text: '""', swatch: null, empty: false })
        expect(formatPortValue(false, 'boolean')).toEqual({ text: 'no', swatch: null, empty: false })
    })

    it('writes numbers the way a person typed them', () => {
        expect(formatPortValue(2, 'number').text).toBe('2')
        expect(formatPortValue(0.35, 'number').text).toBe('0.35')
        expect(formatPortValue(1.5000000000000002, 'number').text).toBe('1.5')
    })

    it('writes a vector as its parts', () => {
        expect(formatPortValue([2, 2, 2], 'vec3').text).toBe('2, 2, 2')
        expect(formatPortValue([0, 1.6, 4], 'vec3').text).toBe('0, 1.6, 4')
        expect(formatPortValue([], 'vec3')).toEqual({ text: NOTHING, swatch: null, empty: true })
    })

    // The swatch follows the DECLARED type. A title is a string and so is a
    // colour; sniffing the value would put a colour chip beside somebody's text.
    it('takes the swatch from the port type, not from the value', () => {
        expect(formatPortValue('#5fa8ff', 'color')).toEqual({ text: '#5fa8ff', swatch: '#5fa8ff', empty: false })
        expect(formatPortValue('#5fa8ff', 'string')).toEqual({ text: '"#5fa8ff"', swatch: null, empty: false })
    })

    it('cuts a long string rather than flooding the row', () => {
        const long = 'x'.repeat(200)
        const out = formatPortValue(long, 'string')
        expect(out.text).toHaveLength(63) // 60 + the ellipsis + two quotes
        expect(out.text.endsWith('…"')).toBe(true)
    })

    it('describes a texture, and does not claim a size it has not got yet', () => {
        expect(formatPortValue({ isTexture: true, image: { width: 640, height: 480 } }, 'texture').text)
            .toBe('a picture, 640 × 480')
        expect(formatPortValue({ isTexture: true, image: { videoWidth: 1280, videoHeight: 720 } }, 'texture').text)
            .toBe('a picture, 1280 × 720')
        // A camera texture exists before its first frame. "0 × 0" would read as
        // a broken camera rather than one that has not started.
        expect(formatPortValue({ isTexture: true, image: {} }, 'texture').text).toBe('a picture')
        expect(formatPortValue({ isTexture: true }, 'texture').text).toBe('a picture')
    })

    it('admits when it cannot read a value instead of printing [object Object]', () => {
        expect(formatPortValue({ some: 'stream' }, 'any').text).toBe('something this sheet cannot read')
        expect(formatPortValue(new Map(), 'any').text).toBe('something this sheet cannot read')
    })
})
