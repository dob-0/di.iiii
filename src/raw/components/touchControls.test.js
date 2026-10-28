import { describe, expect, it } from 'vitest'
import { formatControlNumber, padPointAt, sliderFraction, sliderValueAt } from './touchControls.js'

const rect = { left: 100, top: 50, width: 80, height: 200 }

describe('sliderValueAt', () => {
    it('vertical: top is Max, bottom is Min, the middle is half way', () => {
        expect(sliderValueAt(rect, 140, 50, { min: 0, max: 1 })).toBe(1)
        expect(sliderValueAt(rect, 140, 250, { min: 0, max: 1 })).toBe(0)
        expect(sliderValueAt(rect, 140, 150, { min: 0, max: 10 })).toBe(5)
    })

    it('horizontal: left is Min, right is Max', () => {
        expect(sliderValueAt(rect, 100, 0, { min: -1, max: 1, vertical: false })).toBe(-1)
        expect(sliderValueAt(rect, 160, 0, { min: 0, max: 8, vertical: false })).toBe(6)
    })

    it('a finger past the end pins to it; a zero-sized track answers Min', () => {
        expect(sliderValueAt(rect, 140, -500, { min: 0, max: 1 })).toBe(1)
        expect(sliderValueAt(rect, 140, 900, { min: 0, max: 1 })).toBe(0)
        expect(sliderValueAt({ left: 0, top: 0, width: 0, height: 0 }, 5, 5, { min: 3, max: 9 })).toBe(3)
    })

    it('a reversed range is read low..high', () => {
        expect(sliderValueAt(rect, 140, 50, { min: 1, max: 0 })).toBe(1)
        expect(sliderFraction(0.25, 1, 0)).toBe(0.25)
        expect(sliderFraction(5, 2, 2)).toBe(0)
    })
})

describe('padPointAt', () => {
    it('centre is 0,0; right and up are positive', () => {
        expect(padPointAt(rect, 140, 150)).toEqual({ x: 0, y: 0 })
        expect(padPointAt(rect, 180, 50)).toEqual({ x: 1, y: 1 })
        expect(padPointAt(rect, 100, 250)).toEqual({ x: -1, y: -1 })
    })

    it('pins to the edge, and a zero-sized pad is the centre', () => {
        expect(padPointAt(rect, 9999, -9999)).toEqual({ x: 1, y: 1 })
        expect(padPointAt({ left: 0, top: 0, width: 0, height: 10 }, 3, 3)).toEqual({ x: 0, y: 0 })
    })
})

describe('formatControlNumber', () => {
    it('two decimals for small numbers, none from 100', () => {
        expect(formatControlNumber(0.456)).toBe('0.46')
        expect(formatControlNumber(255.4)).toBe('255')
        expect(formatControlNumber('nope')).toBe('0.00')
    })
})
