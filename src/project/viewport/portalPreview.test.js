import { describe, expect, it } from 'vitest'
import { coverCrop } from './portalPreview.js'

describe('coverCrop', () => {
    it('a wide picture in a round (square) door keeps its middle', () => {
        expect(coverCrop(16 / 9, 1)).toEqual({ repeat: [9 / 16, 1], offset: [(1 - 9 / 16) / 2, 0] })
    })
    it('a tall picture in a wide opening keeps its middle', () => {
        const c = coverCrop(0.5, 1)
        expect(c.repeat).toEqual([1, 0.5])
        expect(c.offset).toEqual([0, 0.25])
    })
    it('an unknown size is shown whole', () => {
        expect(coverCrop(0, 0)).toEqual({ repeat: [1, 1], offset: [0, 0] })
    })
})

describe('uprightTurn', async () => {
    const { uprightTurn } = await import('./portalPreview.js')
    it('no turn when the door is not spun', () => {
        expect(uprightTurn([0, 0, 1])).toBe(0)
    })
    it('a quarter turn back when the door has spun a quarter', () => {
        expect(uprightTurn([1, 0, 0])).toBeCloseTo(Math.PI / 2)
    })
    it('nothing to do for a door lying flat', () => {
        expect(uprightTurn([0, 1, 0])).toBeNull()
    })
})
